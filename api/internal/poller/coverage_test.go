package poller

import (
	"math"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/AbdullahJaswal/flightpath/api/internal/snapshot"
)

func TestLatticeCovers(t *testing.T) {
	l := NewLattice(250)
	// every point on earth is within the radius of some cell centre
	for lat := -89.0; lat <= 89; lat += 7.3 {
		for lon := -180.0; lon < 180; lon += 11.7 {
			best := math.Inf(1)
			for _, c := range l.Cells(snapshot.Bounds{West: lon, South: lat, East: lon, North: lat}) {
				best = math.Min(best, greatCircleNM(lat, lon, c.Lat, c.Lon))
			}
			require.LessOrEqual(t, best, 250.0, "lat %v lon %v", lat, lon)
		}
	}
}

func TestCoverCapsAroundCentre(t *testing.T) {
	l := NewLattice(250)
	// Dubai to Muscat, a country sized view, needs only a handful of cells
	uae := snapshot.Bounds{West: 51, South: 22, East: 60, North: 27}
	require.LessOrEqual(t, len(l.Cells(uae)), 6)

	world := snapshot.World()
	all := l.Cells(world)
	capped := l.Cover(world, 12)
	require.Greater(t, len(all), 500)
	require.Len(t, capped, 12)
	for _, c := range capped {
		require.Less(t, math.Abs(c.Lat), 15.0)
	}
}

func TestCellsAcrossAntimeridian(t *testing.T) {
	l := NewLattice(250)
	fiji := snapshot.Bounds{West: 176, South: -20, East: -178, North: -16}
	cells := l.Cells(fiji)
	require.NotEmpty(t, cells)
	var east, west bool
	for _, c := range cells {
		if c.Lon > 0 {
			east = true
		} else {
			west = true
		}
	}
	require.True(t, east && west)
}

func TestSweepCoversGlobeBusyFirst(t *testing.T) {
	l := NewLattice(250)
	cells := l.Sweep(sweepRegions)
	seen := map[string]bool{}
	for _, c := range cells {
		require.False(t, seen[c.Key])
		seen[c.Key] = true
	}
	require.Len(t, cells, len(l.Cells(snapshot.World())))
	// the first cells are the busy regions, in their order
	require.Equal(t, l.Cells(sweepRegions[0])[0].Key, cells[0].Key)
	europe := len(l.Cells(sweepRegions[0]))
	require.Less(t, europe, 100)
	t.Logf("cells: %d, europe first: %d", len(cells), europe)
}

func greatCircleNM(lat1, lon1, lat2, lon2 float64) float64 {
	rad := math.Pi / 180
	dlat := (lat2 - lat1) * rad
	dlon := (lon2 - lon1) * rad
	a := math.Sin(dlat/2)*math.Sin(dlat/2) + math.Cos(lat1*rad)*math.Cos(lat2*rad)*math.Sin(dlon/2)*math.Sin(dlon/2)
	return 3440.065 * 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))
}
