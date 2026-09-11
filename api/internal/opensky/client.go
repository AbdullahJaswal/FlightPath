// Package opensky is a minimal client for the OpenSky Network REST API.
package opensky

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/AbdullahJaswal/flightpath/api/internal/errs"
	"github.com/AbdullahJaswal/flightpath/api/internal/model"
)

const (
	DefaultBaseURL  = "https://opensky-network.org/api"
	DefaultTokenURL = "https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token"
)

// Config configures a Client. An empty ClientID selects anonymous access.
type Config struct {
	ClientID     string
	ClientSecret string
	BaseURL      string
	TokenURL     string
	HTTPClient   *http.Client
}

type Client struct {
	cfg  Config
	http *http.Client

	mu       sync.Mutex
	token    string
	tokenExp time.Time
}

// Quota is the credit information sent with every response.
type Quota struct {
	Remaining  int // -1 when the header is absent
	RetryAfter time.Duration
}

// States is one global snapshot of state vectors.
type States struct {
	Time     time.Time
	Aircraft []model.Aircraft
	Quota    Quota
}

// Waypoint is one point of a track.
type Waypoint struct {
	Time       time.Time
	Lat        float64
	Lon        float64
	BaroAltM   *float64
	HeadingDeg *float64
	OnGround   bool
}

// Track is the trajectory of one aircraft.
type Track struct {
	ICAO24   string
	Callsign string
	Start    time.Time
	End      time.Time
	Path     []Waypoint
}

// RateLimitError is returned when the daily credits are exhausted.
type RateLimitError struct {
	RetryAfter time.Duration
}

func (e *RateLimitError) Error() string {
	return fmt.Sprintf("opensky: rate limited, retry after %s", e.RetryAfter)
}

func New(cfg Config) *Client {
	if cfg.BaseURL == "" {
		cfg.BaseURL = DefaultBaseURL
	}
	if cfg.TokenURL == "" {
		cfg.TokenURL = DefaultTokenURL
	}
	hc := cfg.HTTPClient
	if hc == nil {
		hc = &http.Client{Timeout: 60 * time.Second}
	}
	return &Client{cfg: cfg, http: hc}
}

func (c *Client) Anonymous() bool { return c.cfg.ClientID == "" }

// States fetches every current state vector.
func (c *Client) States(ctx context.Context) (*States, error) {
	resp, err := c.get(ctx, "/states/all?extended=1")
	if err != nil {
		return nil, err
	}
	defer func() { _ = resp.Body.Close() }()
	quota := parseQuota(resp.Header)
	if err := checkStatus(resp, quota); err != nil {
		return nil, err
	}
	var raw struct {
		Time   int64   `json:"time"`
		States [][]any `json:"states"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return nil, fmt.Errorf("opensky: decode states: %w", err)
	}
	out := &States{Time: time.Unix(raw.Time, 0).UTC(), Aircraft: make([]model.Aircraft, 0, len(raw.States)), Quota: quota}
	for _, sv := range raw.States {
		if a, ok := parseState(sv); ok {
			out.Aircraft = append(out.Aircraft, a)
		}
	}
	return out, nil
}

// Track fetches the live trajectory of one aircraft.
func (c *Client) Track(ctx context.Context, icao24 string) (*Track, error) {
	resp, err := c.get(ctx, "/tracks/all?time=0&icao24="+url.QueryEscape(strings.ToLower(icao24)))
	if err != nil {
		return nil, err
	}
	defer func() { _ = resp.Body.Close() }()
	if err := checkStatus(resp, parseQuota(resp.Header)); err != nil {
		return nil, err
	}
	var raw struct {
		ICAO24    string  `json:"icao24"`
		Callsign  string  `json:"callsign"`
		StartTime float64 `json:"startTime"`
		EndTime   float64 `json:"endTime"`
		Path      [][]any `json:"path"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return nil, fmt.Errorf("opensky: decode track: %w", err)
	}
	t := &Track{
		ICAO24:   raw.ICAO24,
		Callsign: strings.TrimSpace(raw.Callsign),
		Start:    time.Unix(int64(raw.StartTime), 0).UTC(),
		End:      time.Unix(int64(raw.EndTime), 0).UTC(),
		Path:     make([]Waypoint, 0, len(raw.Path)),
	}
	for _, p := range raw.Path {
		if len(p) < 6 {
			continue
		}
		ts, okT := num(p[0])
		lat, okLat := num(p[1])
		lon, okLon := num(p[2])
		if !okT || !okLat || !okLon {
			continue
		}
		t.Path = append(t.Path, Waypoint{
			Time:       time.Unix(int64(ts), 0).UTC(),
			Lat:        lat,
			Lon:        lon,
			BaroAltM:   numPtr(p[3]),
			HeadingDeg: numPtr(p[4]),
			OnGround:   boolean(p[5]),
		})
	}
	return t, nil
}

func (c *Client) get(ctx context.Context, path string) (*http.Response, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.cfg.BaseURL+path, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")
	if !c.Anonymous() {
		tok, err := c.accessToken(ctx)
		if err != nil {
			return nil, err
		}
		req.Header.Set("Authorization", "Bearer "+tok)
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("opensky: %w", err)
	}
	if resp.StatusCode == http.StatusUnauthorized {
		c.mu.Lock()
		c.token = ""
		c.mu.Unlock()
	}
	return resp, nil
}

func (c *Client) accessToken(ctx context.Context) (string, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.token != "" && time.Until(c.tokenExp) > time.Minute {
		return c.token, nil
	}
	form := url.Values{
		"grant_type":    {"client_credentials"},
		"client_id":     {c.cfg.ClientID},
		"client_secret": {c.cfg.ClientSecret},
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.cfg.TokenURL, strings.NewReader(form.Encode()))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	resp, err := c.http.Do(req)
	if err != nil {
		return "", fmt.Errorf("opensky: token: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("opensky: token: status %d", resp.StatusCode)
	}
	var tok struct {
		AccessToken string `json:"access_token"`
		ExpiresIn   int    `json:"expires_in"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&tok); err != nil {
		return "", fmt.Errorf("opensky: token: %w", err)
	}
	if tok.AccessToken == "" {
		return "", fmt.Errorf("opensky: token: empty access token")
	}
	c.token = tok.AccessToken
	c.tokenExp = time.Now().Add(time.Duration(tok.ExpiresIn) * time.Second)
	return c.token, nil
}

func checkStatus(resp *http.Response, q Quota) error {
	switch resp.StatusCode {
	case http.StatusOK:
		return nil
	case http.StatusTooManyRequests:
		return &RateLimitError{RetryAfter: q.RetryAfter}
	case http.StatusNotFound:
		return errs.ErrNotFound
	}
	return fmt.Errorf("opensky: unexpected status %d", resp.StatusCode)
}

func parseQuota(h http.Header) Quota {
	q := Quota{Remaining: -1}
	if v, err := strconv.Atoi(strings.TrimSpace(h.Get("X-Rate-Limit-Remaining"))); err == nil {
		q.Remaining = v
	}
	if v, err := strconv.Atoi(strings.TrimSpace(h.Get("X-Rate-Limit-Retry-After-Seconds"))); err == nil {
		q.RetryAfter = time.Duration(v) * time.Second
	}
	return q
}
