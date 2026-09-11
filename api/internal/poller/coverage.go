package poller

import (
	"fmt"
	"math"
	"sort"

	"github.com/AbdullahJaswal/flightpath/api/internal/snapshot"
)

// The feed answers one circle per request, so the globe is tiled into a fixed lattice of circles.
// Fixed centres mean a viewport maps to the same cells while it stays put, which keeps the per
// cell freshness bookkeeping stable.

// Cell is one circle in the lattice.
type Cell struct {
	Key      string
	Lat, Lon float64
}

type latticeRow struct {
	lat     float64
	spacing float64
	cols    int
}

type Lattice struct {
	step float64
	rows []latticeRow
}

// tileMargin shrinks the circle used for tiling so the flat earth arithmetic below stays safe.
const tileMargin = 0.95

// NewLattice tiles the globe with circles of the given radius.
func NewLattice(radiusNM int) *Lattice {
	// a circle of radius r covers a square of side r*sqrt(2); one nautical mile is a minute of latitude
	side := float64(radiusNM) * tileMargin * math.Sqrt2 / 60
	n := int(math.Ceil(180 / side))
	l := &Lattice{step: 180 / float64(n)}
	for i := range n {
		lat := -90 + l.step*(float64(i)+0.5)
		// a row is widest in distance terms at its edge nearest the equator
		edge := math.Max(0, math.Abs(lat)-l.step/2)
		spacing := l.step / math.Cos(edge*math.Pi/180)
		cols := max(1, int(math.Ceil(360/spacing)))
		l.rows = append(l.rows, latticeRow{lat: lat, spacing: 360 / float64(cols), cols: cols})
	}
	return l
}

// Cells returns every cell whose square touches the bounds.
func (l *Lattice) Cells(b snapshot.Bounds) []Cell {
	var out []Cell
	for i, r := range l.rows {
		if r.lat+l.step/2 < b.South || r.lat-l.step/2 > b.North {
			continue
		}
		for j := range r.cols {
			lon := -180 + r.spacing*(float64(j)+0.5)
			if overlapsLon(b, lon-r.spacing/2, lon+r.spacing/2) {
				out = append(out, Cell{Key: fmt.Sprintf("%d:%d", i, j), Lat: r.lat, Lon: lon})
			}
		}
	}
	return out
}

// Cover returns at most limit cells for the bounds, keeping the ones nearest its centre when the
// view is too wide to refresh in full.
func (l *Lattice) Cover(b snapshot.Bounds, limit int) []Cell {
	cells := l.Cells(b)
	if limit <= 0 || len(cells) <= limit {
		return cells
	}
	lat, lon := centre(b)
	sort.SliceStable(cells, func(i, j int) bool {
		return distance(lat, lon, cells[i].Lat, cells[i].Lon) < distance(lat, lon, cells[j].Lat, cells[j].Lon)
	})
	return cells[:limit]
}

// Sweep returns the union of cells across the regions, in region order, without duplicates.
func (l *Lattice) Sweep(regions []snapshot.Bounds) []Cell {
	seen := map[string]bool{}
	var out []Cell
	for _, r := range regions {
		for _, c := range l.Cells(r) {
			if !seen[c.Key] {
				seen[c.Key] = true
				out = append(out, c)
			}
		}
	}
	return out
}

func overlapsLon(b snapshot.Bounds, lo, hi float64) bool {
	if b.West <= b.East {
		return hi >= b.West && lo <= b.East
	}
	return hi >= b.West || lo <= b.East
}

func centre(b snapshot.Bounds) (float64, float64) {
	lat := (b.South + b.North) / 2
	east := b.East
	if b.West > b.East {
		east += 360
	}
	lon := (b.West + east) / 2
	if lon > 180 {
		lon -= 360
	}
	return lat, lon
}

// distance is an equirectangular approximation in degrees, enough to rank cells.
func distance(lat1, lon1, lat2, lon2 float64) float64 {
	dlon := math.Abs(lon1 - lon2)
	if dlon > 180 {
		dlon = 360 - dlon
	}
	dlon *= math.Cos((lat1 + lat2) / 2 * math.Pi / 180)
	return math.Hypot(lat1-lat2, dlon)
}

// sweepRegions are the busiest patches of sky. They keep the zoomed out map populated and the
// history flowing without anyone looking at them.
var sweepRegions = []snapshot.Bounds{
	{West: -10, South: 36, East: 26, North: 56},    // Europe
	{West: -100, South: 25, East: -66, North: 46},  // North America, east
	{West: -125, South: 32, East: -114, North: 49}, // North America, west coast
	{West: 40, South: 20, East: 58, North: 32},     // Gulf
	{West: 68, South: 8, East: 88, North: 30},      // South Asia
	{West: 108, South: 21, East: 142, North: 41},   // East Asia
	{West: 98, South: -8, East: 122, North: 16},    // Southeast Asia
	{West: 143, South: -38, East: 154, North: -24}, // Australia, east coast
	{West: -65, South: -35, East: -40, North: -10}, // South America
	{West: 18, South: -35, East: 32, North: -24},   // Southern Africa
}
