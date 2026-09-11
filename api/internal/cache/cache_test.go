package cache

import (
	"context"
	"io"
	"log/slog"
	"strconv"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/AbdullahJaswal/flightpath/api/internal/errs"
)

func testRedis(t *testing.T) *miniredis.Miniredis {
	t.Helper()
	mr, err := miniredis.Run()
	require.NoError(t, err)
	t.Cleanup(mr.Close)
	return mr
}

func testCache(t *testing.T, mr *miniredis.Miniredis) *Cache {
	t.Helper()
	rdb := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	t.Cleanup(func() { _ = rdb.Close() })
	return New(rdb, 100, slog.New(slog.NewTextHandler(io.Discard, nil)))
}

func TestGetOrLoadTiers(t *testing.T) {
	mr := testRedis(t)
	c := testCache(t, mr)
	ctx := context.Background()
	calls := 0
	load := func(context.Context) (string, error) {
		calls++
		return "v" + strconv.Itoa(calls), nil
	}
	ttl := TTL{L1: time.Minute, L2: time.Hour}

	v, err := GetOrLoad(ctx, c, "k", ttl, load)
	require.NoError(t, err)
	require.Equal(t, "v1", v)

	v, err = GetOrLoad(ctx, c, "k", ttl, load)
	require.NoError(t, err)
	require.Equal(t, "v1", v)
	require.Equal(t, 1, calls)

	c.l1.Invalidate("k")
	v, err = GetOrLoad(ctx, c, "k", ttl, load)
	require.NoError(t, err)
	require.Equal(t, "v1", v)
	require.Equal(t, 1, calls)
	require.True(t, mr.Exists("k"))

	c.Invalidate(ctx, "k")
	require.False(t, mr.Exists("k"))
	v, err = GetOrLoad(ctx, c, "k", ttl, load)
	require.NoError(t, err)
	require.Equal(t, "v2", v)
	require.Equal(t, 2, calls)

	s := c.Stats()
	require.Equal(t, int64(1), s.L1Hits)
	require.Equal(t, int64(1), s.L2Hits)
	require.Equal(t, int64(2), s.Misses)
}

func TestLocalTierNeverOutlivesRedis(t *testing.T) {
	mr := testRedis(t)
	c := testCache(t, mr)
	ctx := context.Background()

	_, err := GetOrLoad(ctx, c, "short", TTL{L1: time.Hour, L2: 2 * time.Second}, func(context.Context) (int, error) { return 1, nil })
	require.NoError(t, err)
	e, ok := c.l1.GetIfPresent("short")
	require.True(t, ok)
	require.Equal(t, 2*time.Second, e.ttl)

	c.l1.Invalidate("short")
	mr.SetTTL("short", 500*time.Millisecond)
	_, err = GetOrLoad(ctx, c, "short", TTL{L1: time.Hour, L2: 2 * time.Second}, func(context.Context) (int, error) { return 2, nil })
	require.NoError(t, err)
	e, ok = c.l1.GetIfPresent("short")
	require.True(t, ok)
	require.LessOrEqual(t, e.ttl, 500*time.Millisecond)
}

func TestValueLifetimeBoundsBothTiers(t *testing.T) {
	mr := testRedis(t)
	c := testCache(t, mr)
	ctx := context.Background()

	_, err := GetOrLoadFor(ctx, c, "life", TTL{L1: time.Hour, L2: time.Hour}, func(context.Context) (int, time.Duration, error) { return 1, 10 * time.Second, nil })
	require.NoError(t, err)
	e, _ := c.l1.GetIfPresent("life")
	require.Equal(t, 10*time.Second, e.ttl)
	require.Equal(t, 10*time.Second, mr.TTL("life"))

	_, err = GetOrLoadFor(ctx, c, "expired", TTL{L1: time.Hour, L2: time.Hour}, func(context.Context) (int, time.Duration, error) { return 1, -1, nil })
	require.NoError(t, err)
	_, ok := c.l1.GetIfPresent("expired")
	require.False(t, ok)
	require.False(t, mr.Exists("expired"))
}

func TestNegativeCache(t *testing.T) {
	c := testCache(t, testRedis(t))
	ctx := context.Background()
	calls := 0
	load := func(context.Context) (*string, error) {
		calls++
		return nil, errs.ErrNotFound
	}
	ttl := TTL{L1: time.Minute, L2: time.Minute, Negative: time.Minute}

	_, err := GetOrLoad(ctx, c, "missing", ttl, load)
	require.ErrorIs(t, err, errs.ErrNotFound)
	_, err = GetOrLoad(ctx, c, "missing", ttl, load)
	require.ErrorIs(t, err, errs.ErrNotFound)
	require.Equal(t, 1, calls)
}

func TestInvalidationFansOutToOtherInstances(t *testing.T) {
	mr := testRedis(t)
	a := testCache(t, mr)
	b := testCache(t, mr)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go func() { _ = b.Run(ctx) }()
	time.Sleep(50 * time.Millisecond)

	ttl := TTL{L1: time.Hour, L2: time.Hour}
	for _, key := range []string{"airport:FRA", "airport:LHR", "trail:abc123"} {
		_, err := GetOrLoad(ctx, b, key, ttl, func(context.Context) (string, error) { return "v", nil })
		require.NoError(t, err)
	}

	a.Invalidate(ctx, "trail:abc123")
	require.Eventually(t, func() bool {
		_, ok := b.l1.GetIfPresent("trail:abc123")
		return !ok
	}, 2*time.Second, 10*time.Millisecond)
	_, ok := b.l1.GetIfPresent("airport:FRA")
	require.True(t, ok)

	a.InvalidatePrefix(ctx, "airport:")
	require.Eventually(t, func() bool {
		_, fra := b.l1.GetIfPresent("airport:FRA")
		_, lhr := b.l1.GetIfPresent("airport:LHR")
		return !fra && !lhr
	}, 2*time.Second, 10*time.Millisecond)
	require.False(t, mr.Exists("airport:FRA"))
	require.False(t, mr.Exists("airport:LHR"))
}

func TestConcurrentMissesShareOneLoad(t *testing.T) {
	c := testCache(t, testRedis(t))
	ctx := context.Background()
	var calls atomic.Int32
	gate := make(chan struct{})
	load := func(context.Context) (int, error) {
		calls.Add(1)
		<-gate
		return 7, nil
	}

	var wg sync.WaitGroup
	for range 10 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			v, err := GetOrLoad(ctx, c, "sf", TTL{L1: time.Minute}, load)
			assert.NoError(t, err)
			assert.Equal(t, 7, v)
		}()
	}
	time.Sleep(50 * time.Millisecond)
	close(gate)
	wg.Wait()
	require.Equal(t, int32(1), calls.Load())
}
