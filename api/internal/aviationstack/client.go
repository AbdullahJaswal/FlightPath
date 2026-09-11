// Package aviationstack looks up flight schedules on aviationstack.
package aviationstack

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/AbdullahJaswal/flightpath/api/internal/errs"
	"github.com/AbdullahJaswal/flightpath/api/internal/model"
)

const DefaultBaseURL = "https://api.aviationstack.com/v1"

type Client struct {
	baseURL string
	key     string
	http    *http.Client
}

type Endpoint struct {
	Airport   string
	Timezone  string
	IATA      string
	ICAO      string
	Terminal  string
	Gate      string
	Delay     *int
	Scheduled *time.Time
	Estimated *time.Time
	Actual    *time.Time
}

type Flight struct {
	FlightDate   string
	Status       model.FlightStatus
	Departure    Endpoint
	Arrival      Endpoint
	AirlineName  string
	AirlineIATA  string
	AirlineICAO  string
	Number       string
	IATA         string
	ICAO         string
	Registration string
}

func New(baseURL, key string, hc *http.Client) *Client {
	if baseURL == "" {
		baseURL = DefaultBaseURL
	}
	if hc == nil {
		hc = &http.Client{Timeout: 20 * time.Second}
	}
	return &Client{baseURL: strings.TrimRight(baseURL, "/"), key: key, http: hc}
}

type rawEndpoint struct {
	Airport   string  `json:"airport"`
	Timezone  string  `json:"timezone"`
	IATA      string  `json:"iata"`
	ICAO      string  `json:"icao"`
	Terminal  string  `json:"terminal"`
	Gate      string  `json:"gate"`
	Delay     *int    `json:"delay"`
	Scheduled *string `json:"scheduled"`
	Estimated *string `json:"estimated"`
	Actual    *string `json:"actual"`
}

type rawFlight struct {
	FlightDate   string      `json:"flight_date"`
	FlightStatus string      `json:"flight_status"`
	Departure    rawEndpoint `json:"departure"`
	Arrival      rawEndpoint `json:"arrival"`
	Airline      struct {
		Name string `json:"name"`
		IATA string `json:"iata"`
		ICAO string `json:"icao"`
	} `json:"airline"`
	Flight struct {
		Number string `json:"number"`
		IATA   string `json:"iata"`
		ICAO   string `json:"icao"`
	} `json:"flight"`
	Aircraft *struct {
		Registration string `json:"registration"`
	} `json:"aircraft"`
}

// FlightByICAO looks up the latest flight for an ICAO flight number such as DLH2AB.
// Every call consumes one request from the monthly plan.
func (c *Client) FlightByICAO(ctx context.Context, callsign string) (*Flight, error) {
	q := url.Values{"flight_icao": {callsign}, "limit": {"1"}}
	apilayer := strings.Contains(c.baseURL, "apilayer.com")
	if !apilayer {
		q.Set("access_key", c.key)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+"/flights?"+q.Encode(), nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")
	if apilayer {
		req.Header.Set("apikey", c.key)
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("aviationstack: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return nil, fmt.Errorf("aviationstack: read: %w", err)
	}
	var raw struct {
		Error *struct {
			Code int    `json:"code"`
			Type string `json:"type"`
			Info string `json:"info"`
		} `json:"error"`
		Data []rawFlight `json:"data"`
	}
	if err := json.Unmarshal(body, &raw); err != nil {
		return nil, fmt.Errorf("aviationstack: decode (status %d): %w", resp.StatusCode, err)
	}
	if raw.Error != nil {
		if raw.Error.Type == "usage_limit_reached" || raw.Error.Code == 104 {
			return nil, fmt.Errorf("%w: aviationstack %s", errs.ErrQuotaExceeded, raw.Error.Type)
		}
		return nil, fmt.Errorf("aviationstack: %s: %s", raw.Error.Type, raw.Error.Info)
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("aviationstack: unexpected status %d", resp.StatusCode)
	}
	if len(raw.Data) == 0 {
		return nil, errs.ErrNotFound
	}
	return convert(raw.Data[0]), nil
}

func convert(r rawFlight) *Flight {
	f := &Flight{
		FlightDate:  r.FlightDate,
		Status:      model.ParseFlightStatus(r.FlightStatus),
		Departure:   endpoint(r.Departure),
		Arrival:     endpoint(r.Arrival),
		AirlineName: r.Airline.Name,
		AirlineIATA: r.Airline.IATA,
		AirlineICAO: r.Airline.ICAO,
		Number:      r.Flight.Number,
		IATA:        r.Flight.IATA,
		ICAO:        r.Flight.ICAO,
	}
	if r.Aircraft != nil {
		f.Registration = r.Aircraft.Registration
	}
	return f
}

func endpoint(r rawEndpoint) Endpoint {
	return Endpoint{
		Airport: r.Airport, Timezone: r.Timezone, IATA: r.IATA, ICAO: r.ICAO,
		Terminal: r.Terminal, Gate: r.Gate, Delay: r.Delay,
		Scheduled: parseTime(r.Scheduled), Estimated: parseTime(r.Estimated), Actual: parseTime(r.Actual),
	}
}

func parseTime(s *string) *time.Time {
	if s == nil || *s == "" {
		return nil
	}
	t, err := time.Parse(time.RFC3339, *s)
	if err != nil {
		return nil
	}
	t = t.UTC()
	return &t
}
