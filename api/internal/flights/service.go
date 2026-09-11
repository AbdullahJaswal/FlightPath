// Package flights assembles aircraft and flight details from the snapshot, the database and upstream lookups.
package flights

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/AbdullahJaswal/flightpath/api/internal/adsbdb"
	"github.com/AbdullahJaswal/flightpath/api/internal/aviationstack"
	"github.com/AbdullahJaswal/flightpath/api/internal/cache"
	"github.com/AbdullahJaswal/flightpath/api/internal/errs"
	"github.com/AbdullahJaswal/flightpath/api/internal/model"
	"github.com/AbdullahJaswal/flightpath/api/internal/opensky"
	"github.com/AbdullahJaswal/flightpath/api/internal/snapshot"
	"github.com/AbdullahJaswal/flightpath/api/internal/store"
)

type Config struct {
	AviationstackCap int
	TrailRetention   time.Duration
	TracksEnabled    bool
}

type Service struct {
	cfg   Config
	snaps *snapshot.Store
	store *store.Store
	cache *cache.Cache
	adsb  *adsbdb.Client
	avs   *aviationstack.Client
	osky  *opensky.Client
	log   *slog.Logger
	now   func() time.Time
}

// New wires the service. avs may be nil to disable schedule lookups.
func New(cfg Config, snaps *snapshot.Store, st *store.Store, c *cache.Cache, adsb *adsbdb.Client, avs *aviationstack.Client, osky *opensky.Client, log *slog.Logger) *Service {
	return &Service{cfg: cfg, snaps: snaps, store: st, cache: c, adsb: adsb, avs: avs, osky: osky, log: log, now: time.Now}
}

var (
	ttlAircraftInfo = cache.TTL{L1: time.Hour, L2: 24 * time.Hour, Negative: 5 * time.Minute}
	ttlAirport      = cache.TTL{L1: time.Hour, L2: 24 * time.Hour, Negative: 5 * time.Minute}
	ttlAirline      = cache.TTL{L1: time.Hour, L2: 24 * time.Hour, Negative: 5 * time.Minute}
	ttlRoute        = cache.TTL{L1: 10 * time.Minute, L2: 24 * time.Hour, Negative: 6 * time.Hour}
	ttlSchedule     = cache.TTL{L1: 10 * time.Minute, L2: 6 * time.Hour, Negative: 6 * time.Hour}
	ttlTrail        = cache.TTL{L1: 20 * time.Second, L2: 2 * time.Minute}
	ttlTrack        = cache.TTL{L1: 5 * time.Minute, L2: 5 * time.Minute, Negative: 5 * time.Minute}
)

func (s *Service) Aircraft(ctx context.Context, icao24 string) (*model.AircraftDetail, error) {
	icao24 = strings.ToLower(strings.TrimSpace(icao24))
	var state *model.Aircraft
	if snap := s.snaps.Current(); snap != nil {
		if a, ok := snap.Get(icao24); ok {
			state = &a
		}
	}
	info, err := s.aircraftInfo(ctx, icao24)
	if err != nil && !errors.Is(err, errs.ErrNotFound) {
		return nil, err
	}
	trail, src, err := s.trail(ctx, icao24)
	if err != nil {
		s.log.Warn("trail lookup failed", "icao24", icao24, "err", err)
	}
	if state == nil && info == nil && len(trail) == 0 {
		return nil, errs.ErrNotFound
	}
	if trail == nil {
		trail = []model.TrailPoint{}
	}
	return &model.AircraftDetail{ICAO24: icao24, State: state, Info: info, Trail: trail, TrailSource: src}, nil
}

func (s *Service) Flight(ctx context.Context, callsign string) (*model.FlightDetail, error) {
	cs := normalize(callsign)
	var live *model.Aircraft
	if snap := s.snaps.Current(); snap != nil {
		if a, ok := snap.ByCallsign(cs); ok {
			live = &a
		}
	}
	rec, err := s.route(ctx, cs)
	if err != nil && !errors.Is(err, errs.ErrNotFound) {
		s.log.Warn("route lookup failed", "callsign", cs, "err", err)
	}
	if live == nil && rec == nil {
		return nil, errs.ErrNotFound
	}
	out := &model.FlightDetail{Callsign: cs, Live: live}
	if rec != nil {
		out.Route = rec.Route
		out.Airline = rec.Airline
	}
	if out.Airline == nil && len(cs) > 3 {
		if al, err := s.airline(ctx, cs[:3]); err == nil {
			out.Airline = al
		}
	}
	if live != nil {
		if info, err := s.aircraftInfo(ctx, live.ICAO24); err == nil {
			out.Aircraft = info
		}
	}
	return out, nil
}

// Schedule fetches aviationstack data for a callsign, spending one request from the monthly cap on a miss.
func (s *Service) Schedule(ctx context.Context, callsign string) (*model.Schedule, error) {
	if s.avs == nil {
		return nil, errs.ErrDisabled
	}
	cs := normalize(callsign)
	return cache.GetOrLoad(ctx, s.cache, "schedule:"+cs, ttlSchedule, func(ctx context.Context) (*model.Schedule, error) {
		now := s.now()
		if m, err := s.store.FlightMeta(ctx, cs, string(model.MetaAviationstack)); err == nil && m.ExpiresAt.After(now) {
			if !m.Found {
				return nil, errs.ErrNotFound
			}
			var sch model.Schedule
			if err := json.Unmarshal(m.Payload, &sch); err == nil {
				return &sch, nil
			}
		}
		period := now.UTC().Format("2006-01")
		used, ok, err := s.store.TryConsume(ctx, string(model.MetaAviationstack), period, s.cfg.AviationstackCap)
		if err != nil {
			return nil, err
		}
		if !ok {
			return nil, fmt.Errorf("%w: aviationstack %d/%d used in %s", errs.ErrQuotaExceeded, used, s.cfg.AviationstackCap, period)
		}
		f, err := s.avs.FlightByICAO(ctx, cs)
		if errors.Is(err, errs.ErrNotFound) {
			s.persist(ctx, cs, model.MetaAviationstack, false, nil, now.Add(6*time.Hour))
			return nil, err
		}
		if err != nil {
			return nil, err
		}
		sch := toSchedule(cs, f, now)
		s.persist(ctx, cs, model.MetaAviationstack, true, sch, scheduleExpiry(sch, now))
		return sch, nil
	})
}

func (s *Service) Airport(ctx context.Context, code string) (*model.Airport, error) {
	return cache.GetOrLoad(ctx, s.cache, "airport:"+strings.ToUpper(strings.TrimSpace(code)), ttlAirport, func(ctx context.Context) (*model.Airport, error) {
		a, err := s.store.AirportByCode(ctx, code)
		if err != nil {
			return nil, err
		}
		return toAirport(a), nil
	})
}

func (s *Service) Search(ctx context.Context, q string) (*model.SearchResult, error) {
	q = strings.TrimSpace(q)
	out := &model.SearchResult{Aircraft: []model.Aircraft{}, Airports: []model.Airport{}, Airlines: []model.Airline{}}
	snap := s.snaps.Current()
	if snap != nil {
		if hits := snap.Search(q, 10); len(hits) > 0 {
			out.Aircraft = hits
		}
		if len(out.Aircraft) == 0 {
			if ac, err := s.store.AircraftByRegistration(ctx, q); err == nil {
				if a, ok := snap.Get(ac.ICAO24); ok {
					out.Aircraft = []model.Aircraft{a}
				}
			}
		}
	}
	airports, err := s.store.SearchAirports(ctx, q, 8)
	if err != nil {
		return nil, err
	}
	for i := range airports {
		out.Airports = append(out.Airports, *toAirport(&airports[i]))
	}
	airlines, err := s.store.SearchAirlines(ctx, q, 5)
	if err != nil {
		return nil, err
	}
	for i := range airlines {
		out.Airlines = append(out.Airlines, *toAirline(&airlines[i]))
	}
	return out, nil
}

type routeRecord struct {
	Route   *model.Route   `json:"route"`
	Airline *model.Airline `json:"airline,omitempty"`
}

func (s *Service) route(ctx context.Context, cs string) (*routeRecord, error) {
	return cache.GetOrLoad(ctx, s.cache, "route:"+cs, ttlRoute, func(ctx context.Context) (*routeRecord, error) {
		now := s.now()
		if m, err := s.store.FlightMeta(ctx, cs, string(model.MetaADSBDB)); err == nil && m.ExpiresAt.After(now) {
			if !m.Found {
				return nil, errs.ErrNotFound
			}
			var rec routeRecord
			if err := json.Unmarshal(m.Payload, &rec); err == nil {
				return &rec, nil
			}
		}
		r, err := s.adsb.Route(ctx, cs)
		if errors.Is(err, errs.ErrNotFound) {
			s.persist(ctx, cs, model.MetaADSBDB, false, nil, now.Add(6*time.Hour))
			return nil, err
		}
		if err != nil {
			return nil, err
		}
		rec := &routeRecord{Route: &model.Route{Origin: fromADSBAirport(r.Origin), Destination: fromADSBAirport(r.Destination), Source: model.MetaADSBDB}}
		if r.Airline != nil {
			rec.Airline = &model.Airline{ICAO: r.Airline.ICAO, IATA: r.Airline.IATA, Name: r.Airline.Name, Callsign: r.Airline.Callsign, Country: r.Airline.Country}
		}
		s.persist(ctx, cs, model.MetaADSBDB, true, rec, now.Add(7*24*time.Hour))
		return rec, nil
	})
}

func (s *Service) persist(ctx context.Context, cs string, source model.MetaSource, found bool, payload any, expires time.Time) {
	m := &store.FlightMeta{Callsign: cs, Source: string(source), Found: found, FetchedAt: s.now(), ExpiresAt: expires}
	if payload != nil {
		b, err := json.Marshal(payload)
		if err != nil {
			return
		}
		m.Payload = b
	}
	if err := s.store.PutFlightMeta(ctx, m); err != nil {
		s.log.Warn("flight meta write failed", "callsign", cs, "source", source, "err", err)
	}
}

func (s *Service) aircraftInfo(ctx context.Context, icao24 string) (*model.AircraftInfo, error) {
	return cache.GetOrLoad(ctx, s.cache, "aircraft:"+icao24, ttlAircraftInfo, func(ctx context.Context) (*model.AircraftInfo, error) {
		a, err := s.store.AircraftByICAO24(ctx, icao24)
		if err != nil {
			return nil, err
		}
		return &model.AircraftInfo{
			ICAO24: a.ICAO24, Registration: a.Registration, TypeCode: a.TypeCode, Model: a.Model,
			Manufacturer: a.Manufacturer, Operator: a.Operator, OperatorICAO: a.OperatorICAO, Owner: a.Owner,
		}, nil
	})
}

func (s *Service) airline(ctx context.Context, icao string) (*model.Airline, error) {
	return cache.GetOrLoad(ctx, s.cache, "airline:"+icao, ttlAirline, func(ctx context.Context) (*model.Airline, error) {
		a, err := s.store.AirlineByICAO(ctx, icao)
		if err != nil {
			return nil, err
		}
		return toAirline(a), nil
	})
}

func (s *Service) trail(ctx context.Context, icao24 string) ([]model.TrailPoint, model.TrailSource, error) {
	points, err := cache.GetOrLoad(ctx, s.cache, "trail:"+icao24, ttlTrail, func(ctx context.Context) ([]model.TrailPoint, error) {
		rows, err := s.store.Trail(ctx, icao24, s.now().Add(-s.cfg.TrailRetention))
		if err != nil {
			return nil, err
		}
		out := make([]model.TrailPoint, 0, len(rows))
		for _, r := range rows {
			out = append(out, model.TrailPoint{Time: r.TS, Lat: r.Lat, Lon: r.Lon, BaroAltM: r.BaroAltM, HeadingDeg: r.HeadingDeg, OnGround: r.OnGround})
		}
		return out, nil
	})
	if err != nil {
		return nil, model.TrailNone, err
	}
	if len(points) >= 2 || !s.cfg.TracksEnabled || s.osky == nil {
		if len(points) == 0 {
			return points, model.TrailNone, nil
		}
		return points, model.TrailStored, nil
	}
	track, err := cache.GetOrLoad(ctx, s.cache, "track:"+icao24, ttlTrack, func(ctx context.Context) ([]model.TrailPoint, error) {
		t, err := s.osky.Track(ctx, icao24)
		if err != nil {
			return nil, err
		}
		out := make([]model.TrailPoint, 0, len(t.Path))
		for _, w := range t.Path {
			out = append(out, model.TrailPoint{Time: w.Time, Lat: w.Lat, Lon: w.Lon, BaroAltM: w.BaroAltM, HeadingDeg: w.HeadingDeg, OnGround: w.OnGround})
		}
		return out, nil
	})
	if err != nil {
		if errors.Is(err, errs.ErrNotFound) {
			err = nil
		}
		if len(points) == 0 {
			return points, model.TrailNone, err
		}
		return points, model.TrailStored, err
	}
	if len(track) > len(points) {
		return track, model.TrailOpenSky, nil
	}
	if len(points) == 0 {
		return points, model.TrailNone, nil
	}
	return points, model.TrailStored, nil
}

func normalize(callsign string) string {
	return strings.ToUpper(strings.TrimSpace(callsign))
}

func toAirport(a *store.Airport) *model.Airport {
	return &model.Airport{
		ICAO: a.Ident, IATA: a.IATACode, Name: a.Name, Type: a.Type, Municipality: a.Municipality,
		Country: a.ISOCountry, Lat: a.Lat, Lon: a.Lon, ElevationFt: a.ElevationFt,
	}
}

func toAirline(a *store.Airline) *model.Airline {
	return &model.Airline{ICAO: a.ICAO, IATA: a.IATA, Name: a.Name, Callsign: a.Callsign, Country: a.Country}
}

func fromADSBAirport(a *adsbdb.Airport) *model.Airport {
	if a == nil {
		return nil
	}
	elev := a.ElevationFt
	return &model.Airport{ICAO: a.ICAO, IATA: a.IATA, Name: a.Name, Municipality: a.Municipality, Country: a.CountryISO, Lat: a.Lat, Lon: a.Lon, ElevationFt: &elev}
}

func toSchedule(cs string, f *aviationstack.Flight, now time.Time) *model.Schedule {
	sch := &model.Schedule{
		Callsign:     cs,
		FlightDate:   f.FlightDate,
		Status:       f.Status,
		FlightIATA:   f.IATA,
		FlightICAO:   f.ICAO,
		Departure:    toEndpoint(f.Departure),
		Arrival:      toEndpoint(f.Arrival),
		Registration: f.Registration,
		FetchedAt:    now,
		Source:       model.MetaAviationstack,
	}
	if f.AirlineICAO != "" || f.AirlineName != "" {
		sch.Airline = &model.Airline{ICAO: f.AirlineICAO, IATA: f.AirlineIATA, Name: f.AirlineName}
	}
	return sch
}

func toEndpoint(e aviationstack.Endpoint) model.ScheduleEndpoint {
	return model.ScheduleEndpoint{
		Airport: e.Airport, IATA: e.IATA, ICAO: e.ICAO, Terminal: e.Terminal, Gate: e.Gate, Timezone: e.Timezone,
		DelayMin: e.Delay, Scheduled: e.Scheduled, Estimated: e.Estimated, Actual: e.Actual,
	}
}

// scheduleExpiry keeps a schedule until two hours after arrival, bounded to between one and twelve hours.
func scheduleExpiry(sch *model.Schedule, now time.Time) time.Time {
	arrival := sch.Arrival.Estimated
	if arrival == nil {
		arrival = sch.Arrival.Scheduled
	}
	exp := now.Add(6 * time.Hour)
	if arrival != nil {
		exp = arrival.Add(2 * time.Hour)
	}
	if exp.Before(now.Add(time.Hour)) {
		exp = now.Add(time.Hour)
	}
	if exp.After(now.Add(12 * time.Hour)) {
		exp = now.Add(12 * time.Hour)
	}
	return exp
}
