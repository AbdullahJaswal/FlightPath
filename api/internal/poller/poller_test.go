package poller

import (
	"context"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"
	"github.com/stretchr/testify/require"

	"github.com/AbdullahJaswal/flightpath/api/internal/model"
	"github.com/AbdullahJaswal/flightpath/api/internal/opensky"
	"github.com/AbdullahJaswal/flightpath/api/internal/snapshot"
)

func testPoller(credits int) *Poller {
	return &Poller{
		cfg:    Config{ActiveInterval: 15 * time.Second, IdleInterval: 15 * time.Minute, DailyCredits: 4000, CreditReserve: 400},
		client: opensky.New(opensky.Config{ClientID: "id"}),
		status: Status{CreditsRemaining: credits},
		last:   map[string]lastPos{},
		now:    time.Now,
	}
}

func TestPace(t *testing.T) {
	now := time.Date(2026, 9, 11, 12, 0, 0, 0, time.UTC)

	p := testPoller(4000)
	d, mode := p.pace(0, now)
	require.Equal(t, model.ModeIdle, mode)
	require.Equal(t, 15*time.Minute, d)

	// 3600 usable credits buy 900 polls spread over the 12h01m until reset
	d, mode = p.pace(3, now)
	require.Equal(t, model.ModeActive, mode)
	require.Equal(t, 49*time.Second, d)

	p = testPoller(1_000_000)
	d, _ = p.pace(1, now)
	require.Equal(t, 15*time.Second, d)

	p = testPoller(404)
	d, mode = p.pace(3, now)
	require.Equal(t, model.ModeActive, mode)
	require.Equal(t, 15*time.Minute, d)

	p = testPoller(400)
	_, mode = p.pace(3, now)
	require.Equal(t, model.ModeIdle, mode)

	p = testPoller(3)
	d, mode = p.pace(3, now)
	require.Equal(t, model.ModePaused, mode)
	require.Equal(t, untilReset(now), d)

	// anonymous access keeps a tenth of its 400 credits back, so 360 buy 90 polls until reset
	p = testPoller(400)
	p.client = opensky.New(opensky.Config{})
	d, mode = p.pace(3, now)
	require.Equal(t, model.ModeActive, mode)
	require.Equal(t, 481*time.Second, d)
}

func TestDownsample(t *testing.T) {
	p := testPoller(4000)
	base := time.Unix(1700000000, 0).UTC()
	heading, alt := 90.0, 1000.0
	a := model.Aircraft{ICAO24: "abc123", Lat: 1, Lon: 1, HeadingDeg: &heading, BaroAltM: &alt, PositionAt: base}

	require.Len(t, p.downsample([]model.Aircraft{a}, base), 1)

	a.PositionAt = base.Add(time.Minute)
	require.Empty(t, p.downsample([]model.Aircraft{a}, a.PositionAt))

	turned := 105.0
	a.HeadingDeg = &turned
	require.Len(t, p.downsample([]model.Aircraft{a}, a.PositionAt), 1)

	a.PositionAt = base.Add(7 * time.Minute)
	require.Len(t, p.downsample([]model.Aircraft{a}, a.PositionAt), 1)

	ground := a
	ground.OnGround = true
	ground.PositionAt = base.Add(20 * time.Minute)
	require.Empty(t, p.downsample([]model.Aircraft{ground}, ground.PositionAt))
}

func TestFreshSnapshotDelaysPoll(t *testing.T) {
	p := testPoller(4000)
	p.snaps = snapshot.NewStore()
	now := time.Now()
	p.now = func() time.Time { return now }
	require.Equal(t, time.Duration(0), p.fresh(15*time.Second))

	p.snaps.Set(snapshot.New(now.Add(-5*time.Second), nil))
	require.Equal(t, 10*time.Second, p.fresh(15*time.Second))

	p.snaps.Set(snapshot.New(now.Add(-time.Minute), nil))
	require.Equal(t, time.Duration(0), p.fresh(15*time.Second))
}

func TestIdleWaitWakesForViewers(t *testing.T) {
	mr, err := miniredis.Run()
	require.NoError(t, err)
	defer mr.Close()
	rdb := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	defer func() { _ = rdb.Close() }()

	old := wakeCheckEvery
	wakeCheckEvery = 20 * time.Millisecond
	defer func() { wakeCheckEvery = old }()

	p := testPoller(4000)
	p.rdb = rdb
	p.status.LastPoll = time.Now().Add(-time.Minute)

	start := time.Now()
	require.True(t, p.wait(context.Background(), 200*time.Millisecond, model.ModeIdle))
	require.GreaterOrEqual(t, time.Since(start), 200*time.Millisecond)

	require.NoError(t, mr.Set("viewers:a", "2"))
	start = time.Now()
	require.True(t, p.wait(context.Background(), 10*time.Second, model.ModeIdle))
	require.Less(t, time.Since(start), 2*time.Second)

	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	require.False(t, p.wait(ctx, time.Second, model.ModeActive))
}

func TestAngleDiff(t *testing.T) {
	require.Equal(t, 20.0, angleDiff(350, 10))
	require.Equal(t, 180.0, angleDiff(0, 180))
	require.Equal(t, 0.0, angleDiff(45, 45))
}
