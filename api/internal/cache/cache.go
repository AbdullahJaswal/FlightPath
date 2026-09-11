// Package cache is a two-tier cache: an in-process otter cache in front of Redis.
// A value never outlives its Redis copy in the local tier, concurrent misses share one load,
// and invalidations fan out to every instance over a Redis channel.
package cache

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"slices"
	"strings"
	"sync/atomic"
	"time"

	"github.com/maypok86/otter/v2"
	"github.com/redis/go-redis/v9"
	"golang.org/x/sync/singleflight"

	"github.com/AbdullahJaswal/flightpath/api/internal/errs"
)

const (
	invalidateChannel = "cache:invalidate"
	unlinkChunk       = 500
)

// TTL sets how long a value lives in each tier. A zero tier is skipped.
// Negative caches errs.ErrNotFound results when non-zero.
type TTL struct {
	L1       time.Duration
	L2       time.Duration
	Negative time.Duration
}

// Stats counts lookups per tier since start.
type Stats struct {
	L1Hits    int64
	L2Hits    int64
	Misses    int64
	L1Entries int
}

type entry struct {
	data []byte
	ttl  time.Duration
}

type invalidation struct {
	Keys     []string `json:"keys,omitempty"`
	Prefixes []string `json:"prefixes,omitempty"`
}

var negative = []byte{0}

type Cache struct {
	l1  *otter.Cache[string, entry]
	rdb *redis.Client
	sf  singleflight.Group
	log *slog.Logger

	l1Hits atomic.Int64
	l2Hits atomic.Int64
	misses atomic.Int64
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

func (c *Cache) Stats() Stats {
	return Stats{L1Hits: c.l1Hits.Load(), L2Hits: c.l2Hits.Load(), Misses: c.misses.Load(), L1Entries: c.l1.EstimatedSize()}
}

// GetOrLoad returns the cached value for key, loading and storing it on a miss.
func GetOrLoad[T any](ctx context.Context, c *Cache, key string, ttl TTL, load func(context.Context) (T, error)) (T, error) {
	return GetOrLoadFor(ctx, c, key, ttl, func(ctx context.Context) (T, time.Duration, error) {
		v, err := load(ctx)
		return v, 0, err
	})
}

// GetOrLoadFor is GetOrLoad for values with a lifetime of their own. The loader returns how long
// the value stays valid and neither tier keeps it longer. Zero means no limit, negative means do not cache.
func GetOrLoadFor[T any](ctx context.Context, c *Cache, key string, ttl TTL, load func(context.Context) (T, time.Duration, error)) (T, error) {
	var zero T
	if e, ok := c.l1.GetIfPresent(key); ok {
		c.l1Hits.Add(1)
		return decode[T](e.data)
	}
	v, err, _ := c.sf.Do(key, func() (any, error) {
		if b, remaining := c.getL2(ctx, key); b != nil {
			c.l2Hits.Add(1)
			c.setL1(key, b, bound(ttl.L1, remaining))
			return b, nil
		}
		c.misses.Add(1)
		val, life, err := load(ctx)
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
		if life >= 0 {
			c.put(ctx, key, b, bound(ttl.L1, life), bound(ttl.L2, life))
		}
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

// Invalidate drops keys from both tiers on every instance.
func (c *Cache) Invalidate(ctx context.Context, keys ...string) {
	if len(keys) == 0 {
		return
	}
	inv := invalidation{Keys: keys}
	c.apply(inv)
	for chunk := range slices.Chunk(keys, unlinkChunk) {
		if err := c.rdb.Unlink(ctx, chunk...).Err(); err != nil {
			c.log.Debug("cache: redis unlink", "err", err)
		}
	}
	c.publish(ctx, inv)
}

// InvalidatePrefix drops every key starting with prefix from both tiers on every instance.
func (c *Cache) InvalidatePrefix(ctx context.Context, prefix string) {
	inv := invalidation{Prefixes: []string{prefix}}
	c.apply(inv)
	iter := c.rdb.Scan(ctx, 0, prefix+"*", 1000).Iterator()
	var batch []string
	for iter.Next(ctx) {
		batch = append(batch, iter.Val())
		if len(batch) >= unlinkChunk {
			c.unlink(ctx, batch)
			batch = batch[:0]
		}
	}
	c.unlink(ctx, batch)
	c.publish(ctx, inv)
}

// Run applies invalidations published by other instances until ctx is cancelled.
func (c *Cache) Run(ctx context.Context) error {
	sub := c.rdb.Subscribe(ctx, invalidateChannel)
	defer func() { _ = sub.Close() }()
	ch := sub.Channel()
	for {
		select {
		case msg, ok := <-ch:
			if !ok {
				return nil
			}
			var inv invalidation
			if err := json.Unmarshal([]byte(msg.Payload), &inv); err == nil {
				c.apply(inv)
			}
		case <-ctx.Done():
			return nil
		}
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

func (c *Cache) apply(inv invalidation) {
	for _, k := range inv.Keys {
		c.l1.Invalidate(k)
	}
	for _, p := range inv.Prefixes {
		for k := range c.l1.Keys() {
			if strings.HasPrefix(k, p) {
				c.l1.Invalidate(k)
			}
		}
	}
}

func (c *Cache) publish(ctx context.Context, inv invalidation) {
	b, err := json.Marshal(inv)
	if err != nil {
		return
	}
	if err := c.rdb.Publish(ctx, invalidateChannel, b).Err(); err != nil {
		c.log.Debug("cache: publish invalidation", "err", err)
	}
}

func (c *Cache) unlink(ctx context.Context, keys []string) {
	if len(keys) == 0 {
		return
	}
	if err := c.rdb.Unlink(ctx, keys...).Err(); err != nil {
		c.log.Debug("cache: redis unlink", "err", err)
	}
}

// getL2 reads a value and its remaining lifetime from Redis. Zero lifetime means no expiry.
func (c *Cache) getL2(ctx context.Context, key string) ([]byte, time.Duration) {
	pipe := c.rdb.Pipeline()
	get := pipe.Get(ctx, key)
	pttl := pipe.PTTL(ctx, key)
	if _, err := pipe.Exec(ctx); err != nil && !errors.Is(err, redis.Nil) {
		c.log.Debug("cache: redis get", "key", key, "err", err)
		return nil, 0
	}
	b, err := get.Bytes()
	if err != nil {
		return nil, 0
	}
	remaining := pttl.Val()
	if remaining < 0 {
		remaining = 0
	}
	return b, remaining
}

func (c *Cache) setL1(key string, b []byte, ttl time.Duration) {
	if ttl > 0 {
		c.l1.Set(key, entry{data: b, ttl: ttl})
	}
}

// put writes both tiers. The local entry never outlives the Redis entry.
func (c *Cache) put(ctx context.Context, key string, b []byte, l1, l2 time.Duration) {
	c.setL1(key, b, bound(l1, l2))
	if l2 > 0 {
		if err := c.rdb.Set(ctx, key, b, l2).Err(); err != nil {
			c.log.Debug("cache: redis set", "key", key, "err", err)
		}
	}
}

// bound caps d by limit when limit is set.
func bound(d, limit time.Duration) time.Duration {
	if limit > 0 && d > limit {
		return limit
	}
	return d
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
