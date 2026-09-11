package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/AbdullahJaswal/flightpath/api/internal/errs"
)

// testStore migrates into a throwaway schema so the test never touches existing tables.
func testStore(t *testing.T) *Store {
	t.Helper()
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL not set")
	}
	ctx := context.Background()
	schema := fmt.Sprintf("test_%d", time.Now().UnixNano())
	admin, err := sql.Open("pgx", dsn)
	require.NoError(t, err)
	_, err = admin.ExecContext(ctx, "CREATE SCHEMA "+schema)
	require.NoError(t, err)
	t.Cleanup(func() {
		_, _ = admin.ExecContext(context.Background(), "DROP SCHEMA "+schema+" CASCADE")
		_ = admin.Close()
	})
	sep := "?"
	if strings.Contains(dsn, "?") {
		sep = "&"
	}
	st, err := Open(ctx, dsn+sep+"search_path="+schema+",public")
	require.NoError(t, err)
	t.Cleanup(func() { _ = st.Close() })
	require.NoError(t, st.Migrate(ctx))
	return st
}

func TestUsageCap(t *testing.T) {
	st := testStore(t)
	ctx := context.Background()
	period := "p" + strconv.FormatInt(time.Now().UnixNano(), 36)

	for i := 1; i <= 2; i++ {
		n, ok, err := st.TryConsume(ctx, "avs", period, 2)
		require.NoError(t, err)
		require.True(t, ok)
		require.Equal(t, i, n)
	}
	n, ok, err := st.TryConsume(ctx, "avs", period, 2)
	require.NoError(t, err)
	require.False(t, ok)
	require.Equal(t, 2, n)

	require.NoError(t, st.AddUsage(ctx, "opensky", period, 4))
	require.NoError(t, st.AddUsage(ctx, "opensky", period, 4))
	used, err := st.Usage(ctx, "opensky", period)
	require.NoError(t, err)
	require.Equal(t, 8, used)
}

func TestAirports(t *testing.T) {
	st := testStore(t)
	ctx := context.Background()
	require.NoError(t, st.ReplaceAirports(ctx, []Airport{
		{ID: 1, Ident: "EDDF", Type: "large_airport", Name: "Frankfurt am Main Airport", Lat: 50.03, Lon: 8.57, IATACode: "FRA", ISOCountry: "DE", Municipality: "Frankfurt am Main"},
		{ID: 2, Ident: "EGLL", Type: "large_airport", Name: "London Heathrow Airport", Lat: 51.47, Lon: -0.46, IATACode: "LHR", ISOCountry: "GB", Municipality: "London"},
		{ID: 3, Ident: "EGLC", Type: "medium_airport", Name: "London City Airport", Lat: 51.5, Lon: 0.05, IATACode: "LCY", ISOCountry: "GB", Municipality: "London"},
	}))

	a, err := st.AirportByCode(ctx, "fra")
	require.NoError(t, err)
	require.Equal(t, "EDDF", a.Ident)

	_, err = st.AirportByCode(ctx, "ZZZZ")
	require.ErrorIs(t, err, errs.ErrNotFound)

	res, err := st.SearchAirports(ctx, "london", 5)
	require.NoError(t, err)
	require.Len(t, res, 2)
	require.Equal(t, "EGLL", res[0].Ident)

	byICAO, err := st.AirportsByICAO(ctx, []string{"EDDF", "EGLC"})
	require.NoError(t, err)
	require.Len(t, byICAO, 2)
}

func TestAirportsInBounds(t *testing.T) {
	st := testStore(t)
	ctx := context.Background()
	require.NoError(t, st.ReplaceAirports(ctx, []Airport{
		{ID: 1, Ident: "EDDF", Type: "large_airport", Name: "Frankfurt am Main Airport", Lat: 50.03, Lon: 8.57},
		{ID: 2, Ident: "EDFE", Type: "small_airport", Name: "Frankfurt-Egelsbach Airport", Lat: 49.96, Lon: 8.64},
		{ID: 3, Ident: "EDLN", Type: "medium_airport", Name: "Moenchengladbach Airport", Lat: 51.23, Lon: 6.5},
		{ID: 4, Ident: "EGLL", Type: "large_airport", Name: "London Heathrow Airport", Lat: 51.47, Lon: -0.46},
		{ID: 5, Ident: "NFFN", Type: "large_airport", Name: "Nadi International Airport", Lat: -17.76, Lon: 177.44},
		{ID: 6, Ident: "NSTU", Type: "medium_airport", Name: "Pago Pago International Airport", Lat: -14.33, Lon: -170.71},
		{ID: 7, Ident: "NZAA", Type: "large_airport", Name: "Auckland International Airport", Lat: -37.01, Lon: 174.79},
	}))
	big := []string{"large_airport", "medium_airport"}

	rows, err := st.AirportsInBounds(ctx, 5, 48, 12, 52, big, 10)
	require.NoError(t, err)
	require.Len(t, rows, 2)
	require.Equal(t, "EDDF", rows[0].Ident)
	require.Equal(t, "EDLN", rows[1].Ident)

	rows, err = st.AirportsInBounds(ctx, 5, 48, 12, 52, append(big, "small_airport"), 10)
	require.NoError(t, err)
	require.Len(t, rows, 3)
	require.Equal(t, "EDFE", rows[2].Ident)

	rows, err = st.AirportsInBounds(ctx, 5, 48, 12, 52, big, 1)
	require.NoError(t, err)
	require.Len(t, rows, 1)

	rows, err = st.AirportsInBounds(ctx, 170, -20, -165, -10, big, 10)
	require.NoError(t, err)
	require.Len(t, rows, 2)
	require.Equal(t, "NFFN", rows[0].Ident)
	require.Equal(t, "NSTU", rows[1].Ident)
}

func TestPositionsInBounds(t *testing.T) {
	st := testStore(t)
	ctx := context.Background()
	now := time.Now().UTC().Truncate(time.Second)
	require.NoError(t, st.InsertPositions(ctx, []Position{
		{ICAO24: "bbb222", TS: now.Add(-10 * time.Minute), Lat: 50, Lon: 8, Callsign: "DLH2AB"},
		{ICAO24: "aaa111", TS: now.Add(-5 * time.Minute), Lat: 51, Lon: 9},
		{ICAO24: "aaa111", TS: now.Add(-2 * time.Hour), Lat: 51, Lon: 9},
		{ICAO24: "aaa111", TS: now.Add(-20 * time.Minute), Lat: 51.5, Lon: 9.5},
		{ICAO24: "ccc333", TS: now.Add(-5 * time.Minute), Lat: 20, Lon: 8},
		{ICAO24: "ddd444", TS: now.Add(-5 * time.Minute), Lat: 50, Lon: 179.5},
	}))

	rows, err := st.PositionsInBounds(ctx, now.Add(-time.Hour), 5, 48, 12, 52)
	require.NoError(t, err)
	require.Len(t, rows, 3)
	require.Equal(t, "aaa111", rows[0].ICAO24)
	require.True(t, rows[0].TS.Before(rows[1].TS))
	require.Equal(t, "bbb222", rows[2].ICAO24)
	require.Equal(t, "DLH2AB", rows[2].Callsign)
	require.Empty(t, rows[0].Callsign)

	rows, err = st.PositionsInBounds(ctx, now.Add(-time.Hour), 170, 40, -170, 60)
	require.NoError(t, err)
	require.Len(t, rows, 1)
	require.Equal(t, "ddd444", rows[0].ICAO24)
}

func TestPositionsAndMeta(t *testing.T) {
	st := testStore(t)
	ctx := context.Background()
	now := time.Now().UTC().Truncate(time.Second)
	rows := []Position{
		{ICAO24: "abc123", TS: now.Add(-time.Hour), Lat: 1, Lon: 1},
		{ICAO24: "abc123", TS: now, Lat: 2, Lon: 2},
	}
	require.NoError(t, st.InsertPositions(ctx, rows))
	require.NoError(t, st.InsertPositions(ctx, rows))

	trail, err := st.Trail(ctx, "abc123", now.Add(-2*time.Hour))
	require.NoError(t, err)
	require.Len(t, trail, 2)
	require.Equal(t, 1.0, trail[0].Lat)

	deleted, err := st.DeletePositionsBefore(ctx, now.Add(-30*time.Minute))
	require.NoError(t, err)
	require.Equal(t, int64(1), deleted)

	m := &FlightMeta{Callsign: "TEST123", Source: "adsbdb", Found: true, Payload: json.RawMessage(`{"a":1}`), FetchedAt: now, ExpiresAt: now.Add(time.Hour)}
	require.NoError(t, st.PutFlightMeta(ctx, m))
	m.Found = false
	m.Payload = nil
	require.NoError(t, st.PutFlightMeta(ctx, m))
	got, err := st.FlightMeta(ctx, "TEST123", "adsbdb")
	require.NoError(t, err)
	require.False(t, got.Found)
	_, err = st.FlightMeta(ctx, "TEST123", "aviationstack")
	require.ErrorIs(t, err, errs.ErrNotFound)
}
