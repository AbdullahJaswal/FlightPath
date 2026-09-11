// Command api serves the Flightpath HTTP API and runs the OpenSky poller.
package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/joho/godotenv"
	"github.com/redis/go-redis/v9"
	"golang.org/x/sync/errgroup"

	"github.com/AbdullahJaswal/flightpath/api/internal/adsbdb"
	"github.com/AbdullahJaswal/flightpath/api/internal/api"
	"github.com/AbdullahJaswal/flightpath/api/internal/aviationstack"
	"github.com/AbdullahJaswal/flightpath/api/internal/cache"
	"github.com/AbdullahJaswal/flightpath/api/internal/config"
	"github.com/AbdullahJaswal/flightpath/api/internal/flights"
	"github.com/AbdullahJaswal/flightpath/api/internal/live"
	"github.com/AbdullahJaswal/flightpath/api/internal/model"
	"github.com/AbdullahJaswal/flightpath/api/internal/opensky"
	"github.com/AbdullahJaswal/flightpath/api/internal/poller"
	"github.com/AbdullahJaswal/flightpath/api/internal/server"
	"github.com/AbdullahJaswal/flightpath/api/internal/snapshot"
	"github.com/AbdullahJaswal/flightpath/api/internal/store"
)

var version = "dev"

func main() {
	if len(os.Args) > 1 {
		switch os.Args[1] {
		case "openapi":
			if err := printOpenAPI(); err != nil {
				fmt.Fprintln(os.Stderr, err)
				os.Exit(1)
			}
			return
		case "healthcheck":
			os.Exit(healthcheck())
		}
	}
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func run() error {
	loadDotenv()
	cfg, err := config.Load()
	if err != nil {
		return fmt.Errorf("config: %w", err)
	}
	log := newLogger(cfg.LogLevel, cfg.LogFormat)
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	st, err := store.Open(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer func() { _ = st.Close() }()
	if err := st.Migrate(ctx); err != nil {
		return err
	}

	ropts, err := redis.ParseURL(cfg.RedisURL)
	if err != nil {
		return fmt.Errorf("redis url: %w", err)
	}
	rdb := redis.NewClient(ropts)
	defer func() { _ = rdb.Close() }()
	if err := rdb.Ping(ctx).Err(); err != nil {
		return fmt.Errorf("redis: %w", err)
	}

	instance := instanceID()
	c := cache.New(rdb, 20000, log)
	snaps := snapshot.NewStore()
	osky := opensky.New(opensky.Config{ClientID: cfg.OpenSky.ClientID, ClientSecret: cfg.OpenSky.ClientSecret})
	adsb := adsbdb.New(cfg.ADSBDB.BaseURL, nil)
	var avs *aviationstack.Client
	if cfg.Aviationstack.APIKey != "" {
		avs = aviationstack.New(cfg.Aviationstack.BaseURL, cfg.Aviationstack.APIKey, nil)
	}
	svc := flights.New(flights.Config{
		AviationstackCap: cfg.Aviationstack.MonthlyCap,
		TrailRetention:   cfg.TrailRetention,
		TracksEnabled:    cfg.OpenSky.TracksEnabled,
	}, snaps, st, c, adsb, avs, osky, log)

	var pl *poller.Poller
	if cfg.PollerEnabled {
		pl = poller.New(poller.Config{
			InstanceID:     instance,
			ActiveInterval: cfg.OpenSky.ActiveInterval,
			IdleInterval:   cfg.OpenSky.IdleInterval,
			DailyCredits:   cfg.OpenSky.DailyCredits,
			CreditReserve:  cfg.OpenSky.CreditReserve,
			TrailRetention: cfg.TrailRetention,
		}, osky, snaps, c, st, rdb, log)
	}
	hub := live.NewHub(live.Config{
		InstanceID:     instance,
		OriginPatterns: originHosts(cfg.CORSOrigins),
		MaxConnections: cfg.WSMaxConnections,
		StaleAfter:     cfg.SnapshotStaleAfter,
		PollInterval: func() time.Duration {
			if pl == nil {
				return 0
			}
			return pl.Status().Interval
		},
	}, snaps, rdb, log)

	deps := api.Deps{
		Flights:    svc,
		Snaps:      snaps,
		StaleAfter: cfg.SnapshotStaleAfter,
		Log:        log,
		Stats: func(ctx context.Context) (*model.Stats, error) {
			return stats(ctx, snaps, pl, hub, st, c, cfg, avs != nil)
		},
	}
	ready := func(ctx context.Context) error {
		if err := st.Ping(ctx); err != nil {
			return err
		}
		return rdb.Ping(ctx).Err()
	}
	srv := server.New(cfg, version, deps, hub, ready, log)

	log.Info("starting", "version", version, "instance", instance, "poller", cfg.PollerEnabled, "opensky_anonymous", osky.Anonymous(), "aviationstack", avs != nil)
	syncer := poller.NewSyncer(instance, rdb, c, snaps, log)
	syncer.Load(ctx)
	g, gctx := errgroup.WithContext(ctx)
	g.Go(func() error { return hub.Run(gctx) })
	g.Go(func() error { return syncer.Run(gctx) })
	g.Go(func() error { return c.Run(gctx) })
	if pl != nil {
		g.Go(func() error { return pl.Run(gctx) })
	}
	g.Go(func() error { return srv.Run(gctx) })
	return g.Wait()
}

func stats(ctx context.Context, snaps *snapshot.Store, pl *poller.Poller, hub *live.Hub, st *store.Store, c *cache.Cache, cfg config.Config, avsEnabled bool) (*model.Stats, error) {
	s := &model.Stats{Version: version, Viewers: hub.Viewers(), Stale: true}
	if snap := snaps.Current(); snap != nil {
		t := snap.Time
		age := snap.Age(time.Now())
		s.SnapshotTime = &t
		s.SnapshotAgeSeconds = int(age.Seconds())
		s.Stale = age > cfg.SnapshotStaleAfter
		s.AircraftCount = snap.Len()
	}
	cs := c.Stats()
	s.Cache = model.CacheStats{L1Hits: cs.L1Hits, L2Hits: cs.L2Hits, Misses: cs.Misses, L1Entries: cs.L1Entries}
	s.Poller.Mode = model.ModeDisabled
	if pl != nil {
		ps := pl.Status()
		s.Poller = model.PollerStatus{
			Mode:             ps.Mode,
			Leader:           ps.Leader,
			IntervalSeconds:  int(ps.Interval.Seconds()),
			CreditsRemaining: ps.CreditsRemaining,
			CreditsUsedToday: ps.CreditsUsedToday,
			LastError:        ps.LastError,
		}
		if !ps.LastPoll.IsZero() {
			t := ps.LastPoll
			s.Poller.LastPoll = &t
		}
		if !ps.NextPoll.IsZero() {
			t := ps.NextPoll
			s.Poller.NextPoll = &t
		}
	}
	period := time.Now().UTC().Format("2006-01")
	used, err := st.Usage(ctx, string(model.MetaAviationstack), period)
	if err != nil {
		return nil, err
	}
	s.Aviationstack = model.QuotaStatus{Enabled: avsEnabled, Used: used, Cap: cfg.Aviationstack.MonthlyCap, Period: period}
	return s, nil
}

func printOpenAPI() error {
	b, err := server.OpenAPI(version).MarshalJSON()
	if err != nil {
		return err
	}
	var buf strings.Builder
	enc := json.NewEncoder(&buf)
	enc.SetIndent("", "  ")
	var v any
	if err := json.Unmarshal(b, &v); err != nil {
		return err
	}
	if err := enc.Encode(v); err != nil {
		return err
	}
	_, err = os.Stdout.WriteString(buf.String())
	return err
}

// healthcheck probes the local readiness endpoint, for container health checks.
func healthcheck() int {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "http://127.0.0.1:"+port+"/readyz", nil)
	if err != nil {
		return 1
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return 1
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		return 1
	}
	return 0
}

func loadDotenv() {
	for _, p := range []string{".env", "../.env"} {
		if err := godotenv.Load(p); err == nil {
			return
		}
	}
}

func newLogger(level, format string) *slog.Logger {
	var lvl slog.Level
	if err := lvl.UnmarshalText([]byte(level)); err != nil {
		lvl = slog.LevelInfo
	}
	opts := &slog.HandlerOptions{Level: lvl}
	if format == "json" {
		return slog.New(slog.NewJSONHandler(os.Stdout, opts))
	}
	return slog.New(slog.NewTextHandler(os.Stdout, opts))
}

func instanceID() string {
	host, _ := os.Hostname()
	b := make([]byte, 3)
	_, _ = rand.Read(b)
	return host + "-" + hex.EncodeToString(b)
}

// originHosts converts CORS origins into the host patterns the WebSocket library expects.
func originHosts(origins []string) []string {
	hosts := make([]string, 0, len(origins))
	for _, o := range origins {
		if u, err := url.Parse(o); err == nil && u.Host != "" {
			hosts = append(hosts, u.Host)
			continue
		}
		hosts = append(hosts, o)
	}
	return hosts
}
