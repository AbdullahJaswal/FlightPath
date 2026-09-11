package adsb

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/AbdullahJaswal/flightpath/api/internal/model"
)

func serve(t *testing.T, status int, body []byte, gotPath *string, gotUA *string) *Client {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		*gotPath = r.URL.Path
		*gotUA = r.Header.Get("User-Agent")
		if status == http.StatusTooManyRequests {
			w.Header().Set("Retry-After", "30")
		}
		w.WriteHeader(status)
		_, _ = w.Write(body)
	}))
	t.Cleanup(srv.Close)
	return New(Config{BaseURL: srv.URL + "/api/v3", UserAgent: "test/1.0"})
}

func TestCircle(t *testing.T) {
	fixture, err := os.ReadFile("testdata/circle.json")
	require.NoError(t, err)
	var path, ua string
	c := serve(t, http.StatusOK, fixture, &path, &ua)

	b, err := c.Circle(context.Background(), 25.25, 55.36, 250)
	require.NoError(t, err)
	require.Equal(t, "/api/v3/lat/25.2500/lon/55.3600/dist/250", path)
	require.Equal(t, "test/1.0", ua)
	require.Equal(t, time.UnixMilli(1757632470123).UTC(), b.Time)
	require.Equal(t, 6, b.Total)
	// the non ICAO address, the entry without a position and the stale one are dropped
	require.Len(t, b.Aircraft, 3)

	a := b.Aircraft[0]
	require.Equal(t, "a98ac6", a.ICAO24)
	require.Equal(t, "UNIDENT", a.Callsign)
	require.Equal(t, "United States", a.Country)
	require.InDelta(t, 4267.2, *a.BaroAltM, 0.01)
	require.InDelta(t, 4511.04, *a.GeoAltM, 0.01)
	require.InDelta(t, 60.756, *a.VelocityMS, 0.001)
	require.InDelta(t, 134.66, *a.HeadingDeg, 0.001)
	require.InDelta(t, -3.2512, *a.VertRateMS, 0.0001)
	require.Equal(t, "4677", a.Squawk)
	require.Equal(t, model.SourceADSB, a.Source)
	require.Equal(t, model.CategoryLight, a.Category)
	require.False(t, a.OnGround)
	require.Equal(t, b.Time.Add(-100*time.Millisecond), a.PositionAt)
	require.Equal(t, b.Time.Add(-100*time.Millisecond), a.LastContact)

	ground := b.Aircraft[1]
	require.True(t, ground.OnGround)
	require.Nil(t, ground.BaroAltM)
	require.Equal(t, model.CategoryHeavy, ground.Category)
	require.Equal(t, "United Arab Emirates", ground.Country)

	mlat := b.Aircraft[2]
	require.Equal(t, "4b1805", mlat.ICAO24)
	require.Equal(t, model.SourceMLAT, mlat.Source)
	require.InDelta(t, 6.096, *mlat.VertRateMS, 0.0001)
	require.Equal(t, "Switzerland", mlat.Country)
	require.Equal(t, b.Time.Add(-1500*time.Millisecond), mlat.PositionAt)
	require.Equal(t, b.Time.Add(-1200*time.Millisecond), mlat.LastContact)
}

func TestCircleRateLimited(t *testing.T) {
	var path, ua string
	c := serve(t, http.StatusTooManyRequests, nil, &path, &ua)
	_, err := c.Circle(context.Background(), 0, 0, 100)
	var rl *RateLimitError
	require.True(t, errors.As(err, &rl))
	require.Equal(t, 30*time.Second, rl.RetryAfter)
}

func TestCircleRadius(t *testing.T) {
	c := New(Config{})
	_, err := c.Circle(context.Background(), 0, 0, MaxRadiusNM+1)
	require.Error(t, err)
}
