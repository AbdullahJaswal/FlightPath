// Package snapshot holds the latest global set of aircraft states with spatial and key lookups.
package snapshot

import (
	"hash/fnv"
	"math"
	"sort"
	"strings"
	"time"

	"github.com/AbdullahJaswal/flightpath/api/internal/model"
)

// Bounds is a geographic box. West may exceed East when the box crosses the antimeridian.
type Bounds struct {
	West, South, East, North float64
}

// World covers the whole globe.
func World() Bounds { return Bounds{West: -180, South: -90, East: 180, North: 90} }

// Contains reports whether the point lies inside the box.
func (b Bounds) Contains(lat, lon float64) bool {
	if lat < b.South || lat > b.North {
		return false
	}
	if b.West <= b.East {
		return lon >= b.West && lon <= b.East
	}
	return lon >= b.West || lon <= b.East
}

type cell struct{ x, y int }

func cellOf(lat, lon float64) cell {
	return cell{x: clamp(int(math.Floor(lon))+180, 0, 359), y: clamp(int(math.Floor(lat))+90, 0, 179)}
}

func clamp(v, lo, hi int) int {
	if v < lo {
		return lo
	}
	if v > hi {
		return hi
	}
	return v
}

// Snapshot is an immutable set of aircraft indexed by address, callsign and one-degree cell.
type Snapshot struct {
	Time       time.Time
	aircraft   []model.Aircraft
	byICAO     map[string]int
	byCallsign map[string]int
	cells      map[cell][]int
	hashes     []uint32
}

// New indexes the given aircraft. The slice is retained and must not be modified.
func New(t time.Time, aircraft []model.Aircraft) *Snapshot {
	s := &Snapshot{
		Time:       t,
		aircraft:   aircraft,
		byICAO:     make(map[string]int, len(aircraft)),
		byCallsign: make(map[string]int, len(aircraft)),
		cells:      make(map[cell][]int),
		hashes:     make([]uint32, len(aircraft)),
	}
	for i, a := range aircraft {
		s.hashes[i] = hash(a.ICAO24)
		s.byICAO[a.ICAO24] = i
		if a.Callsign != "" {
			s.byCallsign[a.Callsign] = i
		}
		c := cellOf(a.Lat, a.Lon)
		s.cells[c] = append(s.cells[c], i)
	}
	return s
}

func (s *Snapshot) Len() int { return len(s.aircraft) }

// All returns every aircraft. The slice must not be modified.
func (s *Snapshot) All() []model.Aircraft { return s.aircraft }

func (s *Snapshot) Get(icao24 string) (model.Aircraft, bool) {
	i, ok := s.byICAO[icao24]
	if !ok {
		return model.Aircraft{}, false
	}
	return s.aircraft[i], true
}

func (s *Snapshot) ByCallsign(callsign string) (model.Aircraft, bool) {
	i, ok := s.byCallsign[callsign]
	if !ok {
		return model.Aircraft{}, false
	}
	return s.aircraft[i], true
}

// Query returns the aircraft inside b, thinned to at most limit, and the count before thinning.
// Thinning ranks aircraft by address hash so the chosen subset stays stable between polls.
func (s *Snapshot) Query(b Bounds, limit int) ([]model.Aircraft, int) {
	var idx []int
	s.eachCell(b, func(c cell) {
		for _, i := range s.cells[c] {
			a := &s.aircraft[i]
			if b.Contains(a.Lat, a.Lon) {
				idx = append(idx, i)
			}
		}
	})
	total := len(idx)
	if limit > 0 && total > limit {
		sort.Slice(idx, func(x, y int) bool { return s.hashes[idx[x]] < s.hashes[idx[y]] })
		idx = idx[:limit]
	}
	out := make([]model.Aircraft, len(idx))
	for j, i := range idx {
		out[j] = s.aircraft[i]
	}
	return out, total
}

// Age is how old the snapshot is at the given time.
func (s *Snapshot) Age(now time.Time) time.Duration {
	if age := now.Sub(s.Time); age > 0 {
		return age
	}
	return 0
}

// List builds a response for a bounding box, including freshness information.
func (s *Snapshot) List(b Bounds, limit int, now time.Time, staleAfter time.Duration) model.AircraftList {
	aircraft, total := s.Query(b, limit)
	age := s.Age(now)
	return model.AircraftList{
		Time:       s.Time,
		AgeSeconds: int(age.Seconds()),
		Stale:      staleAfter > 0 && age > staleAfter,
		Total:      total,
		Count:      len(aircraft),
		Aircraft:   aircraft,
	}
}

// Search returns airborne aircraft whose callsign or address starts with prefix.
func (s *Snapshot) Search(prefix string, limit int) []model.Aircraft {
	prefix = strings.ToUpper(prefix)
	lower := strings.ToLower(prefix)
	var out []model.Aircraft
	for _, a := range s.aircraft {
		if strings.HasPrefix(a.Callsign, prefix) || strings.HasPrefix(a.ICAO24, lower) {
			out = append(out, a)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Callsign < out[j].Callsign })
	if limit > 0 && len(out) > limit {
		out = out[:limit]
	}
	return out
}

func (s *Snapshot) eachCell(b Bounds, fn func(cell)) {
	y0 := clamp(int(math.Floor(b.South))+90, 0, 179)
	y1 := clamp(int(math.Floor(b.North))+90, 0, 179)
	x0 := clamp(int(math.Floor(b.West))+180, 0, 359)
	x1 := clamp(int(math.Floor(b.East))+180, 0, 359)
	for y := y0; y <= y1; y++ {
		if b.West <= b.East {
			for x := x0; x <= x1; x++ {
				fn(cell{x, y})
			}
			continue
		}
		for x := x0; x <= 359; x++ {
			fn(cell{x, y})
		}
		for x := 0; x <= x1; x++ {
			fn(cell{x, y})
		}
	}
}

func hash(s string) uint32 {
	h := fnv.New32a()
	_, _ = h.Write([]byte(s))
	return h.Sum32()
}
