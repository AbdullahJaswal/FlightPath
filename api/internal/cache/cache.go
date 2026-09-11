// Package cache is a two-tier cache: an in-process otter cache in front of Redis.
package cache

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"time"

	"github.com/maypok86/otter/v2"
	"github.com/redis/go-redis/v9"
	"golang.org/x/sync/singleflight"

	"github.com/AbdullahJaswal/flightpath/api/internal/errs"
)

// TTL sets how long a value lives in each tier. Negative caches errs.ErrNotFound results when non-zero.
type TTL struct {
	L1       time.Duration
	L2       time.Duration
	Negative time.Duration
}

type entry struct {
	data []byte
	ttl  time.Duration
}

var negative = []byte{0}

type Cache struct {
	l1  *otter.Cache[string, entry]
	rdb *redis.Client
	sf  singleflight.Group
	log *slog.Logger
}

func New(rdb *redis.Client, maxEntries int, log *slog.Logger) *Cache {
	l1 := otter.Must(&otter.Options[string, entry]{
		MaximumSize: maxEntries,
		ExpiryCalculator: otter.ExpiryCreatingFunc[string, entry](func(e otter.Entry[string, entry]) time.Duration {
			return e.Value.ttl
		}),
	})
	return &Cache{l1: l1, rdb: rdb, log: log}
}

// GetOrLoad returns the cached value for key, loading and storing it on a miss.
// Concurrent misses for the same key share one load.
func GetOrLoad[T any](ctx context.Context, c *Cache, key string, ttl TTL, load func(context.Context) (T, error)) (T, error) {
	var zero T
	if e, ok := c.l1.GetIfPresent(key); ok {
		return decode[T](e.data)
	}
	v, err, _ := c.sf.Do(key, func() (any, error) {
		if b := c.getL2(ctx, key); b != nil {
			c.l1.Set(key, entry{data: b, ttl: ttl.L1})
			return b, nil
		}
		val, err := load(ctx)
		if err != nil {
			if ttl.Negative > 0 && errors.Is(err, errs.ErrNotFound) {
				c.put(ctx, key, negative, ttl.Negative, ttl.Negative)
			}
			return nil, err
		}
		b, err := json.Marshal(val)
		if err != nil {
			return nil, err
		}
		c.put(ctx, key, b, ttl.L1, ttl.L2)
		return b, nil
	})
	if err != nil {
		return zero, err
	}
	return decode[T](v.([]byte))
}

// Set stores a value in both tiers.
func Set[T any](ctx context.Context, c *Cache, key string, ttl TTL, val T) error {
	b, err := json.Marshal(val)
	if err != nil {
		return err
	}
	c.put(ctx, key, b, ttl.L1, ttl.L2)
	return nil
}

func (c *Cache) Delete(ctx context.Context, key string) {
	c.l1.Invalidate(key)
	if err := c.rdb.Del(ctx, key).Err(); err != nil {
		c.log.Debug("cache: redis del", "key", key, "err", err)
	}
}

// PutRaw writes bytes to Redis only.
func (c *Cache) PutRaw(ctx context.Context, key string, b []byte, ttl time.Duration) error {
	return c.rdb.Set(ctx, key, b, ttl).Err()
}

// GetRaw reads bytes from Redis only. It returns nil when absent.
func (c *Cache) GetRaw(ctx context.Context, key string) ([]byte, error) {
	b, err := c.rdb.Get(ctx, key).Bytes()
	if errors.Is(err, redis.Nil) {
		return nil, nil
	}
	return b, err
}

func (c *Cache) getL2(ctx context.Context, key string) []byte {
	b, err := c.rdb.Get(ctx, key).Bytes()
	if err != nil {
		if !errors.Is(err, redis.Nil) {
			c.log.Debug("cache: redis get", "key", key, "err", err)
		}
		return nil
	}
	return b
}

func (c *Cache) put(ctx context.Context, key string, b []byte, l1, l2 time.Duration) {
	if l1 > 0 {
		c.l1.Set(key, entry{data: b, ttl: l1})
	}
	if l2 > 0 {
		if err := c.rdb.Set(ctx, key, b, l2).Err(); err != nil {
			c.log.Debug("cache: redis set", "key", key, "err", err)
		}
	}
}

func decode[T any](b []byte) (T, error) {
	var v T
	if bytes.Equal(b, negative) {
		return v, errs.ErrNotFound
	}
	if err := json.Unmarshal(b, &v); err != nil {
		return v, err
	}
	return v, nil
}
