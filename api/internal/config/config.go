// Package config loads settings from the environment.
package config

import (
	"time"

	"github.com/caarlos0/env/v11"
)

type Config struct {
	Port             int      `env:"PORT" envDefault:"8080"`
	LogLevel         string   `env:"LOG_LEVEL" envDefault:"info"`
	LogFormat        string   `env:"LOG_FORMAT" envDefault:"text"`
	CORSOrigins      []string `env:"CORS_ORIGINS" envSeparator:"," envDefault:"http://localhost:3000"`
	TrustedProxies   []string `env:"TRUSTED_PROXIES" envSeparator:"," envDefault:"127.0.0.1,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16"`
	RateLimitRPS     float64  `env:"RATE_LIMIT_RPS" envDefault:"10"`
	RateLimitBurst   int      `env:"RATE_LIMIT_BURST" envDefault:"30"`
	WSMaxConnections int      `env:"WS_MAX_CONNECTIONS" envDefault:"200"`

	DatabaseURL string `env:"DATABASE_URL,required"`
	RedisURL    string `env:"REDIS_URL,required"`

	PollerEnabled      bool          `env:"POLLER_ENABLED" envDefault:"true"`
	TrailRetention     time.Duration `env:"TRAIL_RETENTION" envDefault:"6h"`
	SnapshotStaleAfter time.Duration `env:"SNAPSHOT_STALE_AFTER" envDefault:"3m"`

	OpenSky       OpenSky       `envPrefix:"OPENSKY_"`
	Aviationstack Aviationstack `envPrefix:"AVIATIONSTACK_"`
	ADSBDB        ADSBDB        `envPrefix:"ADSBDB_"`
}

type OpenSky struct {
	ClientID       string        `env:"CLIENT_ID"`
	ClientSecret   string        `env:"CLIENT_SECRET"`
	DailyCredits   int           `env:"DAILY_CREDITS" envDefault:"4000"`
	CreditReserve  int           `env:"CREDIT_RESERVE" envDefault:"400"`
	ActiveInterval time.Duration `env:"ACTIVE_INTERVAL" envDefault:"15s"`
	IdleInterval   time.Duration `env:"IDLE_INTERVAL" envDefault:"15m"`
	TracksEnabled  bool          `env:"TRACKS_ENABLED" envDefault:"true"`
}

type Aviationstack struct {
	APIKey     string `env:"API_KEY"`
	BaseURL    string `env:"BASE_URL" envDefault:"https://api.aviationstack.com/v1"`
	MonthlyCap int    `env:"MONTHLY_CAP" envDefault:"95"`
}

type ADSBDB struct {
	BaseURL string `env:"BASE_URL" envDefault:"https://api.adsbdb.com/v0"`
}

func Load() (Config, error) {
	return env.ParseAs[Config]()
}
