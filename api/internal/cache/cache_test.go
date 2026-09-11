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

func testCache(t *testing.T) (*Cache, *miniredis.Miniredis) {
	t.Helper()
	mr, err := miniredis.Run()
	require.NoError(t, err)
	t.Cleanup(mr.Close)
	rdb := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	t.Cleanup(func() { _ = rdb.Close() })
	return New(rdb, 100, slog.New(slog.NewTextHandler(io.Discard, nil))), mr
}

func TestGetOrLoadTiers(t *testing.T) {
	c, mr := testCache(t)
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

	c.Delete(ctx, "k")
	v, err = GetOrLoad(ctx, c, "k", ttl, load)
	require.NoError(t, err)
	require.Equal(t, "v2", v)
	require.Equal(t, 2, calls)
}

func TestNegativeCache(t *testing.T) {
	c, _ := testCache(t)
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

func TestConcurrentMissesShareOneLoad(t *testing.T) {
	c, _ := testCache(t)
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
