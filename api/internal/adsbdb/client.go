// Package adsbdb looks up callsign routes on adsbdb.com.
package adsbdb

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

const DefaultBaseURL = "https://api.adsbdb.com/v0"

type Client struct {
	baseURL string
	http    *http.Client
}

type Route struct {
	Callsign     string
	CallsignIATA string
	Airline      *Airline
	Origin       *Airport
	Destination  *Airport
}

type Airline struct {
	Name       string
	ICAO       string
	IATA       string
	Country    string
	CountryISO string
	Callsign   string
}

type Airport struct {
	Name         string
	ICAO         string
	IATA         string
	Municipality string
	Country      string
	CountryISO   string
	Lat          float64
	Lon          float64
	ElevationFt  int
}

func New(baseURL string, hc *http.Client) *Client {
	if baseURL == "" {
		baseURL = DefaultBaseURL
	}
	if hc == nil {
		hc = &http.Client{Timeout: 15 * time.Second}
	}
	return &Client{baseURL: strings.TrimRight(baseURL, "/"), http: hc}
}

type rawAirport struct {
	Name         string  `json:"name"`
	ICAO         string  `json:"icao_code"`
	IATA         string  `json:"iata_code"`
	Municipality string  `json:"municipality"`
	Country      string  `json:"country_name"`
	CountryISO   string  `json:"country_iso_name"`
	Lat          float64 `json:"latitude"`
	Lon          float64 `json:"longitude"`
	Elevation    float64 `json:"elevation"`
}

type rawRoute struct {
	Callsign     string `json:"callsign"`
	CallsignIATA string `json:"callsign_iata"`
	Airline      *struct {
		Name       string `json:"name"`
		ICAO       string `json:"icao"`
		IATA       string `json:"iata"`
		Country    string `json:"country"`
		CountryISO string `json:"country_iso"`
		Callsign   string `json:"callsign"`
	} `json:"airline"`
	Origin      *rawAirport `json:"origin"`
	Destination *rawAirport `json:"destination"`
}

// Route returns the known route for a callsign, or errs.ErrNotFound.
func (c *Client) Route(ctx context.Context, callsign string) (*Route, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+"/callsign/"+url.PathEscape(callsign), nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("adsbdb: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()
	switch resp.StatusCode {
	case http.StatusOK:
	case http.StatusNotFound:
		return nil, errs.ErrNotFound
	default:
		return nil, fmt.Errorf("adsbdb: unexpected status %d", resp.StatusCode)
	}
	var envelope struct {
		Response json.RawMessage `json:"response"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&envelope); err != nil {
		return nil, fmt.Errorf("adsbdb: decode: %w", err)
	}
	var body struct {
		Flightroute *rawRoute `json:"flightroute"`
	}
	if err := json.Unmarshal(envelope.Response, &body); err != nil || body.Flightroute == nil {
		return nil, errs.ErrNotFound
	}
	return convert(body.Flightroute), nil
}

func convert(r *rawRoute) *Route {
	out := &Route{Callsign: r.Callsign, CallsignIATA: r.CallsignIATA, Origin: airport(r.Origin), Destination: airport(r.Destination)}
	if r.Airline != nil && r.Airline.ICAO != "" {
		out.Airline = &Airline{
			Name: r.Airline.Name, ICAO: r.Airline.ICAO, IATA: r.Airline.IATA,
			Country: r.Airline.Country, CountryISO: r.Airline.CountryISO, Callsign: r.Airline.Callsign,
		}
	}
	return out
}

func airport(a *rawAirport) *Airport {
	if a == nil || a.ICAO == "" {
		return nil
	}
	return &Airport{
		Name: a.Name, ICAO: a.ICAO, IATA: a.IATA, Municipality: a.Municipality,
		Country: a.Country, CountryISO: a.CountryISO, Lat: a.Lat, Lon: a.Lon, ElevationFt: int(a.Elevation),
	}
}
