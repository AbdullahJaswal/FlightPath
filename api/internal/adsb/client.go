// Package adsb reads live positions from a readsb style aggregator such as adsb.fi or adsb.lol.
package adsb

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"time"

	"github.com/AbdullahJaswal/flightpath/api/internal/model"
)

const (
	DefaultBaseURL = "https://opendata.adsb.fi/api/v3"
	// MaxRadiusNM is the largest circle the aggregators accept.
	MaxRadiusNM = 250
	// maxAge drops positions the aggregator has not refreshed recently.
	maxAge   = 60 * time.Second
	maxBody  = 16 << 20
	dialWait = 20 * time.Second
)

type Config struct {
	BaseURL    string
	UserAgent  string
	HTTPClient *http.Client
}

type Client struct {
	base string
	ua   string
	http *http.Client
}

// Batch is the aircraft inside one circle query.
type Batch struct {
	Time     time.Time
	Aircraft []model.Aircraft
	// Total counts aircraft in the response before the ones without a usable position were dropped.
	Total int
}

// RateLimitError reports a 429 from the aggregator.
type RateLimitError struct {
	RetryAfter time.Duration
}

func (e *RateLimitError) Error() string {
	return fmt.Sprintf("adsb: rate limited, retry after %s", e.RetryAfter)
}

func New(cfg Config) *Client {
	if cfg.BaseURL == "" {
		cfg.BaseURL = DefaultBaseURL
	}
	if cfg.HTTPClient == nil {
		cfg.HTTPClient = &http.Client{Timeout: dialWait}
	}
	return &Client{base: cfg.BaseURL, ua: cfg.UserAgent, http: cfg.HTTPClient}
}

// Circle fetches every aircraft within radiusNM of a point.
func (c *Client) Circle(ctx context.Context, lat, lon float64, radiusNM int) (*Batch, error) {
	if radiusNM <= 0 || radiusNM > MaxRadiusNM {
		return nil, fmt.Errorf("adsb: radius %d nm out of range", radiusNM)
	}
	url := fmt.Sprintf("%s/lat/%.4f/lon/%.4f/dist/%d", c.base, lat, lon, radiusNM)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")
	if c.ua != "" {
		req.Header.Set("User-Agent", c.ua)
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer func() { _ = resp.Body.Close() }()
	switch {
	case resp.StatusCode == http.StatusTooManyRequests:
		return nil, &RateLimitError{RetryAfter: retryAfter(resp.Header)}
	case resp.StatusCode != http.StatusOK:
		return nil, fmt.Errorf("adsb: status %d", resp.StatusCode)
	}
	var body response
	if err := json.NewDecoder(io.LimitReader(resp.Body, maxBody)).Decode(&body); err != nil {
		return nil, fmt.Errorf("adsb: decode: %w", err)
	}
	now := time.UnixMilli(int64(body.Now)).UTC()
	if body.Now == 0 {
		now = time.Now().UTC()
	}
	out := &Batch{Time: now, Total: len(body.Aircraft)}
	for _, r := range body.Aircraft {
		if a, ok := parse(r, now, maxAge); ok {
			out.Aircraft = append(out.Aircraft, a)
		}
	}
	return out, nil
}

func retryAfter(h http.Header) time.Duration {
	if s, err := strconv.Atoi(h.Get("Retry-After")); err == nil && s > 0 {
		return time.Duration(s) * time.Second
	}
	return 0
}
