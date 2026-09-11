// Package api declares the HTTP operations and their OpenAPI description.
package api

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"time"

	"github.com/danielgtaylor/huma/v2"

	"github.com/AbdullahJaswal/flightpath/api/internal/errs"
	"github.com/AbdullahJaswal/flightpath/api/internal/flights"
	"github.com/AbdullahJaswal/flightpath/api/internal/model"
	"github.com/AbdullahJaswal/flightpath/api/internal/snapshot"
)

// Deps are the services behind the operations.
type Deps struct {
	Flights    *flights.Service
	Snaps      *snapshot.Store
	Stats      func(context.Context) (*model.Stats, error)
	StaleAfter time.Duration
	Log        *slog.Logger
}

// Cache-Control per kind of data. Live data is always revalidated, which the ETag middleware makes cheap.
const (
	ccLive      = "private, no-cache"
	ccFlight    = "private, max-age=30, stale-while-revalidate=30"
	ccSchedule  = "private, max-age=300"
	ccReference = "public, max-age=3600"
	ccNoStore   = "no-store"
)

// Register adds every operation to the API.
func Register(h huma.API, d Deps) {
	huma.Register(h, huma.Operation{
		OperationID: "listAircraft",
		Method:      http.MethodGet,
		Path:        "/aircraft",
		Summary:     "List aircraft in a bounding box",
		Description: "Current positions from the latest snapshot. When more than limit aircraft are inside the box the result is thinned to a stable subset.",
		Tags:        []string{"aircraft"},
		Errors:      []int{http.StatusUnprocessableEntity},
	}, d.listAircraft)

	huma.Register(h, huma.Operation{
		OperationID: "getAircraft",
		Method:      http.MethodGet,
		Path:        "/aircraft/{icao24}",
		Summary:     "Get one aircraft with its recent trail",
		Tags:        []string{"aircraft"},
		Errors:      []int{http.StatusNotFound, http.StatusUnprocessableEntity},
	}, d.getAircraft)

	huma.Register(h, huma.Operation{
		OperationID: "getFlight",
		Method:      http.MethodGet,
		Path:        "/flights/{callsign}",
		Summary:     "Get a flight by callsign",
		Description: "Live state, airline, route and aircraft for a callsign. Route data comes from adsbdb.",
		Tags:        []string{"flights"},
		Errors:      []int{http.StatusNotFound, http.StatusUnprocessableEntity},
	}, d.getFlight)

	huma.Register(h, huma.Operation{
		OperationID: "getFlightSchedule",
		Method:      http.MethodGet,
		Path:        "/flights/{callsign}/schedule",
		Summary:     "Get the schedule of a flight",
		Description: "Departure and arrival times from aviationstack. A cache miss spends one request from a small monthly budget, so call it only on demand.",
		Tags:        []string{"flights"},
		Errors:      []int{http.StatusNotFound, http.StatusUnprocessableEntity, http.StatusTooManyRequests, http.StatusServiceUnavailable},
	}, d.getFlightSchedule)

	huma.Register(h, huma.Operation{
		OperationID: "getAirport",
		Method:      http.MethodGet,
		Path:        "/airports/{code}",
		Summary:     "Get an airport by ICAO or IATA code",
		Tags:        []string{"airports"},
		Errors:      []int{http.StatusNotFound, http.StatusUnprocessableEntity},
	}, d.getAirport)

	huma.Register(h, huma.Operation{
		OperationID: "search",
		Method:      http.MethodGet,
		Path:        "/search",
		Summary:     "Search aircraft, airports and airlines",
		Tags:        []string{"search"},
		Errors:      []int{http.StatusUnprocessableEntity},
	}, d.search)

	huma.Register(h, huma.Operation{
		OperationID: "getStats",
		Method:      http.MethodGet,
		Path:        "/stats",
		Summary:     "Get service status and upstream budgets",
		Tags:        []string{"stats"},
	}, d.getStats)
}

type listAircraftInput struct {
	West  float64 `query:"west" default:"-180" minimum:"-180" maximum:"180" doc:"Western edge in degrees. Greater than east when the box crosses the antimeridian."`
	South float64 `query:"south" default:"-90" minimum:"-90" maximum:"90" doc:"Southern edge in degrees."`
	East  float64 `query:"east" default:"180" minimum:"-180" maximum:"180" doc:"Eastern edge in degrees."`
	North float64 `query:"north" default:"90" minimum:"-90" maximum:"90" doc:"Northern edge in degrees."`
	Limit int     `query:"limit" default:"1500" minimum:"1" maximum:"3000" doc:"Maximum aircraft to return."`
}

type listAircraftOutput struct {
	CacheControl string `header:"Cache-Control"`
	Body         model.AircraftList
}

func (d Deps) listAircraft(_ context.Context, in *listAircraftInput) (*listAircraftOutput, error) {
	if in.South > in.North {
		return nil, huma.Error422UnprocessableEntity("south must not exceed north")
	}
	out := &listAircraftOutput{CacheControl: ccLive, Body: model.AircraftList{Stale: true, Aircraft: []model.Aircraft{}}}
	snap := d.Snaps.Current()
	if snap == nil {
		return out, nil
	}
	b := snapshot.Bounds{West: in.West, South: in.South, East: in.East, North: in.North}
	out.Body = snap.List(b, in.Limit, time.Now(), d.StaleAfter)
	return out, nil
}

type icao24Input struct {
	ICAO24 string `path:"icao24" pattern:"^[0-9a-fA-F]{6}$" doc:"Mode S address as six hex digits." example:"3c6444"`
}

type aircraftOutput struct {
	CacheControl string `header:"Cache-Control"`
	Body         *model.AircraftDetail
}

func (d Deps) getAircraft(ctx context.Context, in *icao24Input) (*aircraftOutput, error) {
	detail, err := d.Flights.Aircraft(ctx, in.ICAO24)
	if err != nil {
		return nil, d.fail(err)
	}
	return &aircraftOutput{CacheControl: ccLive, Body: detail}, nil
}

type callsignInput struct {
	Callsign string `path:"callsign" pattern:"^[A-Za-z0-9]{2,8}$" doc:"ICAO callsign such as DLH2AB." example:"DLH2AB"`
}

type flightOutput struct {
	CacheControl string `header:"Cache-Control"`
	Body         *model.FlightDetail
}

func (d Deps) getFlight(ctx context.Context, in *callsignInput) (*flightOutput, error) {
	f, err := d.Flights.Flight(ctx, in.Callsign)
	if err != nil {
		return nil, d.fail(err)
	}
	return &flightOutput{CacheControl: ccFlight, Body: f}, nil
}

type scheduleOutput struct {
	CacheControl string `header:"Cache-Control"`
	Body         *model.Schedule
}

func (d Deps) getFlightSchedule(ctx context.Context, in *callsignInput) (*scheduleOutput, error) {
	s, err := d.Flights.Schedule(ctx, in.Callsign)
	if err != nil {
		return nil, d.fail(err)
	}
	return &scheduleOutput{CacheControl: ccSchedule, Body: s}, nil
}

type airportInput struct {
	Code string `path:"code" pattern:"^[A-Za-z0-9]{3,4}$" doc:"ICAO ident or IATA code." example:"FRA"`
}

type airportOutput struct {
	CacheControl string `header:"Cache-Control"`
	Body         *model.Airport
}

func (d Deps) getAirport(ctx context.Context, in *airportInput) (*airportOutput, error) {
	a, err := d.Flights.Airport(ctx, in.Code)
	if err != nil {
		return nil, d.fail(err)
	}
	return &airportOutput{CacheControl: ccReference, Body: a}, nil
}

type searchInput struct {
	Q string `query:"q" required:"true" minLength:"2" maxLength:"40" doc:"Callsign, address, registration, airport or airline text." example:"DLH"`
}

type searchOutput struct {
	CacheControl string `header:"Cache-Control"`
	Body         *model.SearchResult
}

func (d Deps) search(ctx context.Context, in *searchInput) (*searchOutput, error) {
	r, err := d.Flights.Search(ctx, in.Q)
	if err != nil {
		return nil, d.fail(err)
	}
	return &searchOutput{CacheControl: ccLive, Body: r}, nil
}

type statsOutput struct {
	CacheControl string `header:"Cache-Control"`
	Body         *model.Stats
}

func (d Deps) getStats(ctx context.Context, _ *struct{}) (*statsOutput, error) {
	s, err := d.Stats(ctx)
	if err != nil {
		return nil, d.fail(err)
	}
	return &statsOutput{CacheControl: ccNoStore, Body: s}, nil
}

func (d Deps) fail(err error) error {
	switch {
	case errors.Is(err, errs.ErrNotFound):
		return huma.Error404NotFound("not found")
	case errors.Is(err, errs.ErrQuotaExceeded):
		return huma.Error429TooManyRequests(err.Error())
	case errors.Is(err, errs.ErrDisabled):
		return huma.Error503ServiceUnavailable("lookup disabled on this deployment")
	}
	if d.Log != nil {
		d.Log.Error("request failed", "err", err)
	}
	return huma.Error500InternalServerError("internal error")
}
