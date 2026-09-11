// Package server builds the HTTP server: Gin for routing and middleware, Huma for typed operations and OpenAPI.
package server

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/danielgtaylor/huma/v2/adapters/humagin"
	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"

	"github.com/AbdullahJaswal/flightpath/api/internal/api"
	"github.com/AbdullahJaswal/flightpath/api/internal/config"
	"github.com/AbdullahJaswal/flightpath/api/internal/live"
)

const basePath = "/api/v1"

type Server struct {
	cfg    config.Config
	engine *gin.Engine
	log    *slog.Logger
}

// New assembles routes and middleware. ready reports whether dependencies are reachable.
func New(cfg config.Config, version string, deps api.Deps, hub *live.Hub, ready func(context.Context) error, log *slog.Logger) *Server {
	gin.SetMode(gin.ReleaseMode)
	e := gin.New()
	_ = e.SetTrustedProxies(cfg.TrustedProxies)
	e.Use(recovery(log), requestLog(log))
	e.Use(cors.New(cors.Config{
		AllowOrigins:  cfg.CORSOrigins,
		AllowMethods:  []string{http.MethodGet, http.MethodOptions},
		AllowHeaders:  []string{"Origin", "Content-Type", "Accept"},
		ExposeHeaders: []string{"Retry-After"},
		MaxAge:        12 * time.Hour,
	}))
	e.GET("/healthz", func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"status": "ok"}) })
	e.GET("/readyz", func(c *gin.Context) {
		if err := ready(c.Request.Context()); err != nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"status": "unavailable", "detail": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	g := e.Group(basePath)
	g.Use(rateLimit(cfg.RateLimitRPS, cfg.RateLimitBurst), etag())
	h := humagin.NewWithGroup(e, g, openAPIConfig(version))
	api.Register(h, deps)
	g.GET("/live", hub.Handler())

	return &Server{cfg: cfg, engine: e, log: log}
}

// Handler exposes the router for tests.
func (s *Server) Handler() http.Handler { return s.engine }

// Run serves until ctx is cancelled, then drains connections.
func (s *Server) Run(ctx context.Context) error {
	srv := &http.Server{
		Addr:              fmt.Sprintf(":%d", s.cfg.Port),
		Handler:           s.engine,
		ReadHeaderTimeout: 10 * time.Second,
	}
	errCh := make(chan error, 1)
	go func() {
		s.log.Info("listening", "addr", srv.Addr)
		errCh <- srv.ListenAndServe()
	}()
	select {
	case err := <-errCh:
		if errors.Is(err, http.ErrServerClosed) {
			return nil
		}
		return err
	case <-ctx.Done():
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		return srv.Shutdown(shutdownCtx)
	}
}

// OpenAPI builds the API description without any dependencies, for exporting the document.
func OpenAPI(version string) *huma.OpenAPI {
	gin.SetMode(gin.ReleaseMode)
	e := gin.New()
	h := humagin.NewWithGroup(e, e.Group(basePath), openAPIConfig(version))
	api.Register(h, api.Deps{})
	return h.OpenAPI()
}

func openAPIConfig(version string) huma.Config {
	cfg := huma.DefaultConfig("Flightpath API", version)
	cfg.CreateHooks = nil
	cfg.SchemasPath = ""
	cfg.Info.Description = "Live aircraft positions from the OpenSky Network with flight, airport and airline metadata."
	cfg.Servers = []*huma.Server{{URL: basePath}}
	cfg.Tags = []*huma.Tag{
		{Name: "aircraft", Description: "Live aircraft states and trails."},
		{Name: "flights", Description: "Flight routes and schedules by callsign."},
		{Name: "airports", Description: "Airport reference data."},
		{Name: "search", Description: "Free text search across aircraft, airports and airlines."},
		{Name: "stats", Description: "Service status and upstream budgets."},
	}
	return cfg
}
