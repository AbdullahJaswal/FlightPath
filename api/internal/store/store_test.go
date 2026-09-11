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
