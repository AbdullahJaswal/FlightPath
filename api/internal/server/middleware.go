package server

import (
	"log/slog"
	"net/http"
	"runtime/debug"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/maypok86/otter/v2"
	"golang.org/x/time/rate"
)

func requestLog(log *slog.Logger) gin.HandlerFunc {
	return func(c *gin.Context) {
		if c.Request.URL.Path == "/healthz" || c.Request.URL.Path == "/readyz" {
			c.Next()
			return
		}
		start := time.Now()
		c.Next()
		log.Info("request",
			"method", c.Request.Method,
			"path", c.Request.URL.Path,
			"status", c.Writer.Status(),
			"duration_ms", time.Since(start).Milliseconds(),
			"ip", c.ClientIP(),
		)
	}
}

func recovery(log *slog.Logger) gin.HandlerFunc {
	return func(c *gin.Context) {
		defer func() {
			if r := recover(); r != nil {
				log.Error("panic", "err", r, "stack", string(debug.Stack()))
				c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{"title": "Internal Server Error", "status": 500})
			}
		}()
		c.Next()
	}
}

// rateLimit applies a token bucket per client IP.
func rateLimit(rps float64, burst int) gin.HandlerFunc {
	limiters := otter.Must(&otter.Options[string, *rate.Limiter]{
		MaximumSize:      10000,
		ExpiryCalculator: otter.ExpiryAccessing[string, *rate.Limiter](10 * time.Minute),
	})
	return func(c *gin.Context) {
		ip := c.ClientIP()
		lim, ok := limiters.GetIfPresent(ip)
		if !ok {
			lim = rate.NewLimiter(rate.Limit(rps), burst)
			limiters.Set(ip, lim)
		}
		if !lim.Allow() {
			c.Header("Retry-After", "1")
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{"title": "Too Many Requests", "status": 429, "detail": "rate limit exceeded"})
			return
		}
		c.Next()
	}
}
