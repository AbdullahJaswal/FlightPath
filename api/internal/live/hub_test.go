package live

import (
	"context"
	"io"
	"log/slog"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"
	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
	"github.com/stretchr/testify/require"

	"github.com/AbdullahJaswal/flightpath/api/internal/model"
	"github.com/AbdullahJaswal/flightpath/api/internal/snapshot"
)

func TestHubStreamsViewport(t *testing.T) {
	mr, err := miniredis.Run()
	require.NoError(t, err)
	defer mr.Close()
	rdb := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	defer func() { _ = rdb.Close() }()

	old := frameGap
	frameGap = 20 * time.Millisecond
	defer func() { frameGap = old }()

	snaps := snapshot.NewStore()
	hub := NewHub(Config{InstanceID: "test", MaxConnections: 5}, snaps, rdb, slog.New(slog.NewTextHandler(io.Discard, nil)))
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	go func() { _ = hub.Run(ctx) }()

	gin.SetMode(gin.TestMode)
	e := gin.New()
	e.GET("/live", hub.Handler())
	srv := httptest.NewServer(e)
	defer srv.Close()

	conn, _, err := websocket.Dial(ctx, "ws"+strings.TrimPrefix(srv.URL, "http")+"/live", nil) //nolint:bodyclose // handshake body is closed by the library
	require.NoError(t, err)
	defer func() { _ = conn.CloseNow() }()

	var greeting map[string]any
	require.NoError(t, wsjson.Read(ctx, conn, &greeting))
	require.Equal(t, "hello", greeting["type"])

	snaps.Set(snapshot.New(time.Now(), []model.Aircraft{{ICAO24: "abc123", Lat: 50, Lon: 8}, {ICAO24: "def456", Lat: -30, Lon: 150}}))
	require.NoError(t, wsjson.Write(ctx, conn, map[string]any{"type": "viewport", "west": 0, "south": 40, "east": 20, "north": 60}))

	var f struct {
		Type     string           `json:"type"`
		Total    int              `json:"total"`
		Aircraft []model.Aircraft `json:"aircraft"`
	}
	require.NoError(t, wsjson.Read(ctx, conn, &f))
	require.Equal(t, "snapshot", f.Type)
	require.Equal(t, 1, f.Total)
	require.Equal(t, "abc123", f.Aircraft[0].ICAO24)

	snaps.Set(snapshot.New(time.Now(), []model.Aircraft{{ICAO24: "abc123", Lat: 51, Lon: 9}}))
	// the first snapshot can arrive twice, once for the viewport and once from the broadcast
	for f.Aircraft[0].Lat != 51 {
		require.NoError(t, wsjson.Read(ctx, conn, &f))
		require.Equal(t, 1, f.Total)
	}
	require.Equal(t, 1, hub.Viewers())
}
