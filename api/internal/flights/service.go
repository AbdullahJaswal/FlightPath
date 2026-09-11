// Package flights assembles aircraft and flight details from the snapshot, the database and upstream lookups.
package flights

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"math"
	"slices"
	"strings"
	"time"

	"github.com/AbdullahJaswal/flightpath/api/internal/adsbdb"
	"github.com/AbdullahJaswal/flightpath/api/internal/aviationstack"
	"github.com/AbdullahJaswal/flightpath/api/internal/cache"
	"github.com/AbdullahJaswal/flightpath/api/internal/errs"
	"github.com/AbdullahJaswal/flightpath/api/internal/model"
	"github.com/AbdullahJaswal/flightpath/api/internal/planespotters"
	"github.com/AbdullahJaswal/flightpath/api/internal/snapshot"
	"github.com/AbdullahJaswal/flightpath/api/internal/store"
)

type Config struct {
	AviationstackCap int
	TrailRetention   time.Duration
}

type Service struct {
	cfg    Config
	snaps  *snapshot.Store
	store  *store.Store
	cache  *cache.Cache
	adsb   *adsbdb.Client
	avs    *aviationstack.Client
	photos *planespotters.Client
	log    *slog.Logger
	now    func() time.Time
}

// New wires the service. avs and photos may be nil to disable schedule and photo lookups.
func New(cfg Config, snaps *snapshot.Store, st *store.Store, c *cache.Cache, adsb *adsbdb.Client, avs *aviationstack.Client, photos *planespotters.Client, log *slog.Logger) *Service {
	return &Service{cfg: cfg, snaps: snaps, store: st, cache: c, adsb: adsb, avs: avs, photos: photos, log: log, now: time.Now}
}

// Cache key prefixes, shared with the poller and the seed command for invalidation.
const (
	PrefixAircraft = "aircraft:"
	PrefixAirport  = "airport:"
	PrefixAirports = "airports:"
	PrefixAirline  = "airline:"
	PrefixHistory  = "history:"
	PrefixPhoto    = "photo:"
	PrefixRoute    = "route:"
	PrefixSchedule = "schedule:"
	PrefixSearch   = "search:"
	PrefixTrail    = "trail:"
)

// smallAirportSpan is the box size in degrees under which small airports are listed too.
const smallAirportSpan = 4.0

var (
	ttlSearch       = cache.TTL{L1: time.Minute}
	ttlAircraftInfo = cache.TTL{L1: time.Hour, L2: 24 * time.Hour, Negative: 5 * time.Minute}
	ttlAirport      = cache.TTL{L1: time.Hour, L2: 24 * time.Hour, Negative: 5 * time.Minute}
	ttlAirports     = cache.TTL{L1: 5 * time.Minute, L2: time.Hour}
	ttlAirline      = cache.TTL{L1: time.Hour, L2: 24 * time.Hour, Negative: 5 * time.Minute}
	ttlHistory      = cache.TTL{L1: time.Minute, L2: 2 * time.Minute}
	ttlPhoto        = cache.TTL{L1: time.Hour, L2: 12 * time.Hour, Negative: 6 * time.Hour}
	ttlRoute        = cache.TTL{L1: 10 * time.Minute, L2: 24 * time.Hour, Negative: 6 * time.Hour}
	ttlSchedule     = cache.TTL{L1: 10 * time.Minute, L2: 6 * time.Hour, Negative: 6 * time.Hour}
	ttlTrail        = cache.TTL{L1: 20 * time.Second, L2: 2 * time.Minute}
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
	return cache.GetOrLoadFor(ctx, s.cache, PrefixSchedule+cs, ttlSchedule, func(ctx context.Context) (*model.Schedule, time.Duration, error) {
		now := s.now()
		if m, err := s.store.FlightMeta(ctx, cs, string(model.MetaAviationstack)); err == nil && m.ExpiresAt.After(now) {
			if !m.Found {
				return nil, 0, errs.ErrNotFound
			}
			var sch model.Schedule
			if err := json.Unmarshal(m.Payload, &sch); err == nil {
				return &sch, m.ExpiresAt.Sub(now), nil
			}
		}
		period := now.UTC().Format("2006-01")
		used, ok, err := s.store.TryConsume(ctx, string(model.MetaAviationstack), period, s.cfg.AviationstackCap)
		if err != nil {
			return nil, 0, err
		}
		if !ok {
			return nil, 0, fmt.Errorf("%w: aviationstack %d/%d used in %s", errs.ErrQuotaExceeded, used, s.cfg.AviationstackCap, period)
		}
		f, err := s.avs.FlightByICAO(ctx, cs)
		if errors.Is(err, errs.ErrNotFound) {
			s.persist(ctx, cs, model.MetaAviationstack, false, nil, now.Add(6*time.Hour))
			return nil, 0, err
		}
		if err != nil {
			return nil, 0, err
		}
		sch := toSchedule(cs, f, now)
		expires := scheduleExpiry(sch, now)
		s.persist(ctx, cs, model.MetaAviationstack, true, sch, expires)
		return sch, expires.Sub(now), nil
	})
}

// Photo finds a Planespotters.net photo by address, then by registration.
func (s *Service) Photo(ctx context.Context, icao24 string) (*model.Photo, error) {
	if s.photos == nil {
		return nil, errs.ErrDisabled
	}
	icao24 = strings.ToLower(strings.TrimSpace(icao24))
	return cache.GetOrLoad(ctx, s.cache, PrefixPhoto+icao24, ttlPhoto, func(ctx context.Context) (*model.Photo, error) {
		p, err := s.photos.ByHex(ctx, icao24)
		if errors.Is(err, errs.ErrNotFound) {
			info, ierr := s.aircraftInfo(ctx, icao24)
			if ierr != nil && !errors.Is(ierr, errs.ErrNotFound) {
				return nil, ierr
			}
			if info == nil || info.Registration == "" {
				return nil, errs.ErrNotFound
			}
			p, err = s.photos.ByRegistration(ctx, info.Registration)
		}
		if err != nil {
			return nil, err
		}
		return toPhoto(p), nil
	})
}

func (s *Service) Airport(ctx context.Context, code string) (*model.Airport, error) {
	return cache.GetOrLoad(ctx, s.cache, PrefixAirport+strings.ToUpper(strings.TrimSpace(code)), ttlAirport, func(ctx context.Context) (*model.Airport, error) {
		a, err := s.store.AirportByCode(ctx, code)
		if err != nil {
			return nil, err
		}
		return toAirport(a), nil
	})
}

// Airports lists the airports inside the box, biggest first. The box is snapped to a hundredth of a degree so nearby requests share a cache entry.
func (s *Service) Airports(ctx context.Context, b snapshot.Bounds, limit int) (*model.AirportList, error) {
	b = roundBounds(b, 0.01)
	types := airportTypes(b)
	key := fmt.Sprintf("%s%.2f,%.2f,%.2f,%.2f:%d", PrefixAirports, b.West, b.South, b.East, b.North, limit)
	return cache.GetOrLoad(ctx, s.cache, key, ttlAirports, func(ctx context.Context) (*model.AirportList, error) {
		rows, err := s.store.AirportsInBounds(ctx, b.West, b.South, b.East, b.North, types, limit)
		if err != nil {
			return nil, err
		}
		out := &model.AirportList{Airports: make([]model.Airport, 0, len(rows))}
		for i := range rows {
			out.Airports = append(out.Airports, *toAirport(&rows[i]))
		}
		out.Count = len(out.Airports)
		return out, nil
	})
}

// Airline returns airline reference data by ICAO code.
func (s *Service) Airline(ctx context.Context, icao string) (*model.Airline, error) {
	return s.airline(ctx, strings.ToUpper(strings.TrimSpace(icao)))
}

// History groups the stored positions inside the box during the window into tracks, longest first.
// The box is snapped to a tenth of a degree so nearby requests share a cache entry.
func (s *Service) History(ctx context.Context, b snapshot.Bounds, minutes, limit int) (*model.History, error) {
	b = roundBounds(b, 0.1)
	key := fmt.Sprintf("%s%.1f,%.1f,%.1f,%.1f:%d:%d", PrefixHistory, b.West, b.South, b.East, b.North, minutes, limit)
	return cache.GetOrLoad(ctx, s.cache, key, ttlHistory, func(ctx context.Context) (*model.History, error) {
		to := s.now()
		window := time.Duration(minutes) * time.Minute
		if s.cfg.TrailRetention > 0 && window > s.cfg.TrailRetention {
			window = s.cfg.TrailRetention
		}
		from := to.Add(-window)
		rows, err := s.store.PositionsInBounds(ctx, from, b.West, b.South, b.East, b.North)
		if err != nil {
			return nil, err
		}
		tracks := groupTracks(rows)
		if len(tracks) > limit {
			tracks = tracks[:limit]
		}
		return &model.History{From: from, To: to, Count: len(tracks), Tracks: tracks}, nil
	})
}

type searchRecord struct {
	Airports []model.Airport `json:"airports"`
	Airlines []model.Airline `json:"airlines"`
	ICAO24   string          `json:"icao24,omitempty"`
}

func (s *Service) Search(ctx context.Context, q string) (*model.SearchResult, error) {
	q = strings.TrimSpace(q)
	out := &model.SearchResult{Aircraft: []model.Aircraft{}, Airports: []model.Airport{}, Airlines: []model.Airline{}}
	rec, err := cache.GetOrLoad(ctx, s.cache, PrefixSearch+strings.ToLower(q), ttlSearch, func(ctx context.Context) (*searchRecord, error) {
		rec := &searchRecord{Airports: []model.Airport{}, Airlines: []model.Airline{}}
		airports, err := s.store.SearchAirports(ctx, q, 8)
		if err != nil {
			return nil, err
		}
		for i := range airports {
			rec.Airports = append(rec.Airports, *toAirport(&airports[i]))
		}
		airlines, err := s.store.SearchAirlines(ctx, q, 5)
		if err != nil {
			return nil, err
		}
		for i := range airlines {
			rec.Airlines = append(rec.Airlines, *toAirline(&airlines[i]))
		}
		if ac, err := s.store.AircraftByRegistration(ctx, q); err == nil {
			rec.ICAO24 = ac.ICAO24
		}
		return rec, nil
	})
	if err != nil {
		return nil, err
	}
	if len(rec.Airports) > 0 {
		out.Airports = rec.Airports
	}
	if len(rec.Airlines) > 0 {
		out.Airlines = rec.Airlines
	}
	if snap := s.snaps.Current(); snap != nil {
		hits := snap.Search(q, 10)
		if len(hits) == 0 && rec.ICAO24 != "" {
			if a, ok := snap.Get(rec.ICAO24); ok {
				hits = []model.Aircraft{a}
			}
		}
		if len(hits) > 0 {
			out.Aircraft = hits
		}
	}
	return out, nil
}

type routeRecord struct {
	Route   *model.Route   `json:"route"`
	Airline *model.Airline `json:"airline,omitempty"`
}

func (s *Service) route(ctx context.Context, cs string) (*routeRecord, error) {
	return cache.GetOrLoadFor(ctx, s.cache, PrefixRoute+cs, ttlRoute, func(ctx context.Context) (*routeRecord, time.Duration, error) {
		now := s.now()
		if m, err := s.store.FlightMeta(ctx, cs, string(model.MetaADSBDB)); err == nil && m.ExpiresAt.After(now) {
			if !m.Found {
				return nil, 0, errs.ErrNotFound
			}
			var rec routeRecord
			if err := json.Unmarshal(m.Payload, &rec); err == nil {
				return &rec, m.ExpiresAt.Sub(now), nil
			}
		}
		r, err := s.adsb.Route(ctx, cs)
		if errors.Is(err, errs.ErrNotFound) {
			s.persist(ctx, cs, model.MetaADSBDB, false, nil, now.Add(6*time.Hour))
			return nil, 0, err
		}
		if err != nil {
			return nil, 0, err
		}
		rec := &routeRecord{Route: &model.Route{Origin: fromADSBAirport(r.Origin), Destination: fromADSBAirport(r.Destination), Source: model.MetaADSBDB}}
		if r.Airline != nil {
			rec.Airline = &model.Airline{ICAO: r.Airline.ICAO, IATA: r.Airline.IATA, Name: r.Airline.Name, Callsign: r.Airline.Callsign, Country: r.Airline.Country}
		}
		expires := now.Add(7 * 24 * time.Hour)
		s.persist(ctx, cs, model.MetaADSBDB, true, rec, expires)
		return rec, expires.Sub(now), nil
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
	return cache.GetOrLoad(ctx, s.cache, PrefixAircraft+icao24, ttlAircraftInfo, func(ctx context.Context) (*model.AircraftInfo, error) {
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
	return cache.GetOrLoad(ctx, s.cache, PrefixAirline+icao, ttlAirline, func(ctx context.Context) (*model.Airline, error) {
		a, err := s.store.AirlineByICAO(ctx, icao)
		if err != nil {
			return nil, err
		}
		return toAirline(a), nil
	})
}

func (s *Service) trail(ctx context.Context, icao24 string) ([]model.TrailPoint, model.TrailSource, error) {
	points, err := cache.GetOrLoad(ctx, s.cache, PrefixTrail+icao24, ttlTrail, func(ctx context.Context) ([]model.TrailPoint, error) {
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
	if len(points) == 0 {
		return points, model.TrailNone, nil
	}
	return points, model.TrailStored, nil
}

// groupTracks turns rows ordered by aircraft and time into tracks of at least two points, most points first.
func groupTracks(rows []store.Position) []model.Track {
	tracks := []model.Track{}
	for i := range rows {
		r := &rows[i]
		if n := len(tracks); n == 0 || tracks[n-1].ICAO24 != r.ICAO24 {
			tracks = append(tracks, model.Track{ICAO24: r.ICAO24, Points: []model.TrailPoint{}})
		}
		t := &tracks[len(tracks)-1]
		if r.Callsign != "" {
			t.Callsign = r.Callsign
		}
		t.Points = append(t.Points, model.TrailPoint{Time: r.TS, Lat: r.Lat, Lon: r.Lon, BaroAltM: r.BaroAltM, HeadingDeg: r.HeadingDeg, OnGround: r.OnGround})
	}
	tracks = slices.DeleteFunc(tracks, func(t model.Track) bool { return len(t.Points) < 2 })
	slices.SortFunc(tracks, func(a, b model.Track) int {
		if n := len(b.Points) - len(a.Points); n != 0 {
			return n
		}
		return strings.Compare(a.ICAO24, b.ICAO24)
	})
	return tracks
}

// airportTypes adds small airports only when the box is under smallAirportSpan degrees on each side.
func airportTypes(b snapshot.Bounds) []string {
	types := []string{"large_airport", "medium_airport"}
	if lonSpan(b) < smallAirportSpan && b.North-b.South < smallAirportSpan {
		types = append(types, "small_airport")
	}
	return types
}

// lonSpan is the width of the box in degrees, wrapping across the antimeridian.
func lonSpan(b snapshot.Bounds) float64 {
	if b.West <= b.East {
		return b.East - b.West
	}
	return 360 - b.West + b.East
}

// roundBounds snaps the box edges to a grid of the given step.
func roundBounds(b snapshot.Bounds, step float64) snapshot.Bounds {
	return snapshot.Bounds{
		West:  math.Round(b.West/step) * step,
		South: math.Round(b.South/step) * step,
		East:  math.Round(b.East/step) * step,
		North: math.Round(b.North/step) * step,
	}
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

func toPhoto(p *planespotters.Photo) *model.Photo {
	return &model.Photo{
		ID:           p.ID,
		Thumbnail:    model.PhotoImage{Src: p.Thumbnail.Src, Width: p.Thumbnail.Width, Height: p.Thumbnail.Height},
		Large:        model.PhotoImage{Src: p.Large.Src, Width: p.Large.Width, Height: p.Large.Height},
		Link:         p.Link,
		Photographer: p.Photographer,
		Source:       model.PhotoPlanespotters,
	}
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
