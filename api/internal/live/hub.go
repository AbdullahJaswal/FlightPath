// Package live streams viewport-filtered snapshots to browsers over WebSocket.
package live

import (
	"context"
	"encoding/json"
	"log/slog"
	"maps"
	"net/http"
	"slices"
	"strconv"
	"sync"
	"time"

	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"
	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"

	"github.com/AbdullahJaswal/flightpath/api/internal/model"
	"github.com/AbdullahJaswal/flightpath/api/internal/snapshot"
)

const (
	defaultLimit = 1500
	maxLimit     = 3000
	writeTimeout = 10 * time.Second
	pingEvery    = 30 * time.Second
	reportEvery  = 10 * time.Second
	reportTTL    = 30 * time.Second
)

type Config struct {
	InstanceID     string
	OriginPatterns []string
	MaxConnections int
	StaleAfter     time.Duration
	PollInterval   func() time.Duration
}

type Hub struct {
	cfg   Config
	snaps *snapshot.Store
	rdb   *redis.Client
	log   *slog.Logger

	mu      sync.Mutex
	clients map[*client]struct{}
}

type client struct {
	conn *websocket.Conn
	send chan []byte

	mu      sync.Mutex
	view    snapshot.Bounds
	limit   int
	hasView bool
}

type inbound struct {
	Type  string  `json:"type"`
	West  float64 `json:"west"`
	South float64 `json:"south"`
	East  float64 `json:"east"`
	North float64 `json:"north"`
	Limit int     `json:"limit"`
}

type hello struct {
	Type                string    `json:"type"`
	Instance            string    `json:"instance"`
	ServerTime          time.Time `json:"serverTime"`
	PollIntervalSeconds int       `json:"pollIntervalSeconds"`
}

type frame struct {
	Type string `json:"type"`
	model.AircraftList
}

func NewHub(cfg Config, snaps *snapshot.Store, rdb *redis.Client, log *slog.Logger) *Hub {
	if cfg.MaxConnections <= 0 {
		cfg.MaxConnections = 200
	}
	return &Hub{cfg: cfg, snaps: snaps, rdb: rdb, log: log, clients: make(map[*client]struct{})}
}

func (h *Hub) Viewers() int {
	h.mu.Lock()
	defer h.mu.Unlock()
	return len(h.clients)
}

// Run broadcasts new snapshots and reports the viewer count until ctx is cancelled.
func (h *Hub) Run(ctx context.Context) error {
	ch, unsubscribe := h.snaps.Subscribe()
	defer unsubscribe()
	ticker := time.NewTicker(reportEvery)
	defer ticker.Stop()
	h.report(ctx)
	for {
		select {
		case snap := <-ch:
			h.broadcast(snap)
		case <-ticker.C:
			h.report(ctx)
		case <-ctx.Done():
			h.closeAll()
			shutdownCtx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
			defer cancel()
			_ = h.rdb.Del(shutdownCtx, h.reportKey()).Err()
			return nil
		}
	}
}

// Handler upgrades the request and serves it until the client disconnects.
func (h *Hub) Handler() gin.HandlerFunc {
	return func(c *gin.Context) {
		if h.Viewers() >= h.cfg.MaxConnections {
			c.AbortWithStatusJSON(http.StatusServiceUnavailable, gin.H{"title": "Service Unavailable", "status": 503, "detail": "too many live connections"})
			return
		}
		conn, err := websocket.Accept(c.Writer, c.Request, &websocket.AcceptOptions{OriginPatterns: h.cfg.OriginPatterns})
		if err != nil {
			h.log.Debug("websocket accept failed", "err", err)
			return
		}
		h.serve(c.Request.Context(), conn)
	}
}

func (h *Hub) serve(ctx context.Context, conn *websocket.Conn) {
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()
	cl := &client{conn: conn, send: make(chan []byte, 8), limit: defaultLimit}
	h.add(cl)
	defer h.remove(cl)
	conn.SetReadLimit(4096)
	go h.writeLoop(ctx, cl, cancel)

	interval := 0
	if h.cfg.PollInterval != nil {
		interval = int(h.cfg.PollInterval().Seconds())
	}
	if b, err := json.Marshal(hello{Type: "hello", Instance: h.cfg.InstanceID, ServerTime: time.Now().UTC(), PollIntervalSeconds: interval}); err == nil {
		cl.push(b)
	}
	for {
		var m inbound
		if err := wsjson.Read(ctx, conn, &m); err != nil {
			break
		}
		if m.Type != "viewport" {
			continue
		}
		cl.setView(m)
		if snap := h.snaps.Current(); snap != nil {
			cl.push(h.encode(snap, cl))
		}
	}
	_ = conn.Close(websocket.StatusNormalClosure, "")
}

func (h *Hub) writeLoop(ctx context.Context, cl *client, cancel context.CancelFunc) {
	ticker := time.NewTicker(pingEvery)
	defer ticker.Stop()
	for {
		select {
		case msg := <-cl.send:
			wctx, done := context.WithTimeout(ctx, writeTimeout)
			err := cl.conn.Write(wctx, websocket.MessageText, msg)
			done()
			if err != nil {
				cancel()
				return
			}
		case <-ticker.C:
			pctx, done := context.WithTimeout(ctx, writeTimeout)
			err := cl.conn.Ping(pctx)
			done()
			if err != nil {
				cancel()
				return
			}
		case <-ctx.Done():
			return
		}
	}
}

func (h *Hub) broadcast(snap *snapshot.Snapshot) {
	h.mu.Lock()
	clients := slices.Collect(maps.Keys(h.clients))
	h.mu.Unlock()
	for _, cl := range clients {
		if !cl.viewSet() {
			continue
		}
		cl.push(h.encode(snap, cl))
	}
}

func (h *Hub) add(cl *client) {
	h.mu.Lock()
	h.clients[cl] = struct{}{}
	h.mu.Unlock()
}

func (h *Hub) remove(cl *client) {
	h.mu.Lock()
	delete(h.clients, cl)
	h.mu.Unlock()
}

func (h *Hub) closeAll() {
	h.mu.Lock()
	clients := slices.Collect(maps.Keys(h.clients))
	h.mu.Unlock()
	for _, cl := range clients {
		_ = cl.conn.Close(websocket.StatusGoingAway, "server shutting down")
	}
}

func (h *Hub) reportKey() string { return "viewers:" + h.cfg.InstanceID }

func (h *Hub) report(ctx context.Context) {
	if err := h.rdb.Set(ctx, h.reportKey(), strconv.Itoa(h.Viewers()), reportTTL).Err(); err != nil {
		h.log.Debug("viewer report failed", "err", err)
	}
}

func (cl *client) push(b []byte) {
	select {
	case cl.send <- b:
	default:
	}
}

func (cl *client) setView(m inbound) {
	cl.mu.Lock()
	defer cl.mu.Unlock()
	cl.view = snapshot.Bounds{West: m.West, South: m.South, East: m.East, North: m.North}
	cl.limit = m.Limit
	if cl.limit <= 0 {
		cl.limit = defaultLimit
	}
	if cl.limit > maxLimit {
		cl.limit = maxLimit
	}
	cl.hasView = true
}

func (cl *client) viewSet() bool {
	cl.mu.Lock()
	defer cl.mu.Unlock()
	return cl.hasView
}

func (h *Hub) encode(snap *snapshot.Snapshot, cl *client) []byte {
	cl.mu.Lock()
	view, limit := cl.view, cl.limit
	cl.mu.Unlock()
	b, _ := json.Marshal(frame{Type: "snapshot", AircraftList: snap.List(view, limit, time.Now(), h.cfg.StaleAfter)})
	return b
}
