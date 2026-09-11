// Package planespotters looks up aircraft photos on Planespotters.net.
package planespotters

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/AbdullahJaswal/flightpath/api/internal/errs"
)

const DefaultBaseURL = "https://api.planespotters.net/pub"

type Client struct {
	baseURL   string
	userAgent string
	http      *http.Client
}

type Image struct {
	Src    string
	Width  int
	Height int
}

type Photo struct {
	ID           string
	Thumbnail    Image
	Large        Image
	Link         string
	Photographer string
}

// New wires a client. The API requires a user agent that names a contact URL or email.
func New(baseURL, userAgent string, hc *http.Client) *Client {
	if baseURL == "" {
		baseURL = DefaultBaseURL
	}
	if hc == nil {
		hc = &http.Client{Timeout: 15 * time.Second}
	}
	return &Client{baseURL: strings.TrimRight(baseURL, "/"), userAgent: userAgent, http: hc}
}

type rawImage struct {
	Src  string `json:"src"`
	Size struct {
		Width  int `json:"width"`
		Height int `json:"height"`
	} `json:"size"`
}

type rawPhoto struct {
	ID           string   `json:"id"`
	Thumbnail    rawImage `json:"thumbnail"`
	Large        rawImage `json:"thumbnail_large"`
	Link         string   `json:"link"`
	Photographer string   `json:"photographer"`
}

// ByHex returns the first photo of the aircraft with the Mode S address, or errs.ErrNotFound.
func (c *Client) ByHex(ctx context.Context, hex string) (*Photo, error) {
	return c.first(ctx, "/photos/hex/"+url.PathEscape(strings.ToLower(strings.TrimSpace(hex))))
}

// ByRegistration returns the first photo of the aircraft with the registration, or errs.ErrNotFound.
func (c *Client) ByRegistration(ctx context.Context, reg string) (*Photo, error) {
	return c.first(ctx, "/photos/reg/"+url.PathEscape(strings.ToUpper(strings.TrimSpace(reg))))
}

func (c *Client) first(ctx context.Context, path string) (*Photo, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+path, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", c.userAgent)
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("planespotters: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()
	switch resp.StatusCode {
	case http.StatusOK:
	case http.StatusNotFound:
		return nil, errs.ErrNotFound
	default:
		return nil, fmt.Errorf("planespotters: unexpected status %d", resp.StatusCode)
	}
	var body struct {
		Photos []rawPhoto `json:"photos"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return nil, fmt.Errorf("planespotters: decode: %w", err)
	}
	if len(body.Photos) == 0 {
		return nil, errs.ErrNotFound
	}
	return convert(&body.Photos[0]), nil
}

func convert(p *rawPhoto) *Photo {
	return &Photo{
		ID:           p.ID,
		Thumbnail:    Image{Src: p.Thumbnail.Src, Width: p.Thumbnail.Size.Width, Height: p.Thumbnail.Size.Height},
		Large:        Image{Src: p.Large.Src, Width: p.Large.Size.Width, Height: p.Large.Size.Height},
		Link:         p.Link,
		Photographer: p.Photographer,
	}
}
