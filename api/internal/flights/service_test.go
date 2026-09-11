package flights

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/AbdullahJaswal/flightpath/api/internal/snapshot"
	"github.com/AbdullahJaswal/flightpath/api/internal/store"
)

func TestGroupTracks(t *testing.T) {
	now := time.Unix(1700000000, 0).UTC()
	rows := []store.Position{
		{ICAO24: "aaa111", TS: now, Lat: 1, Lon: 1},
		{ICAO24: "bbb222", TS: now, Lat: 2, Lon: 2, Callsign: "DLH2AB"},
		{ICAO24: "bbb222", TS: now.Add(time.Minute), Lat: 2.1, Lon: 2.1},
		{ICAO24: "ccc333", TS: now, Lat: 3, Lon: 3},
		{ICAO24: "ccc333", TS: now.Add(time.Minute), Lat: 3.1, Lon: 3.1, Callsign: "BAW1"},
		{ICAO24: "ccc333", TS: now.Add(2 * time.Minute), Lat: 3.2, Lon: 3.2},
	}
	tracks := groupTracks(rows)
	require.Len(t, tracks, 2)
	require.Equal(t, "ccc333", tracks[0].ICAO24)
	require.Equal(t, "BAW1", tracks[0].Callsign)
	require.Len(t, tracks[0].Points, 3)
	require.Equal(t, now, tracks[0].Points[0].Time)
	require.Equal(t, "bbb222", tracks[1].ICAO24)
	require.Equal(t, "DLH2AB", tracks[1].Callsign)
	require.Empty(t, groupTracks(nil))
}

func TestAirportTypes(t *testing.T) {
	require.InDelta(t, 7, lonSpan(snapshot.Bounds{West: 5, East: 12}), 1e-9)
	require.InDelta(t, 20, lonSpan(snapshot.Bounds{West: 170, East: -170}), 1e-9)
	require.Len(t, airportTypes(snapshot.Bounds{West: 8, South: 49, East: 10, North: 51}), 3)
	require.Len(t, airportTypes(snapshot.Bounds{West: 5, South: 48, East: 12, North: 52}), 2)
	require.Len(t, airportTypes(snapshot.Bounds{West: 8, South: 40, East: 10, North: 52}), 2)
}
