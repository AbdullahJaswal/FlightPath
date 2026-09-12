package poller

import (
	"context"
	"io"
	"log/slog"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"
	"github.com/stretchr/testify/require"

	"github.com/AbdullahJaswal/flightpath/api/internal/adsb"
	"github.com/AbdullahJaswal/flightpath/api/internal/model"
	"github.com/AbdullahJaswal/flightpath/api/internal/snapshot"
)

func testPoller() *Poller {
	cfg := Config{RadiusNM: 250, MinInterval: time.Second, ActiveInterval: 10 * time.Second, IdleInterval: 5 * time.Second, MaxCells: 12, DailyRequests: 1000, WorldSweep: true}
	return New(cfg, nil, snapshot.NewStore(), nil, nil, nil, slog.New(slog.NewTextHandler(io.Discard, nil)))
}

func testRedis(t *testing.T) *redis.Client {
	t.Helper()
	mr, err := miniredis.Run()
	require.NoError(t, err)
	t.Cleanup(mr.Close)
	rdb := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	t.Cleanup(func() { _ = rdb.Close() })
	return rdb
}

func TestNextPrefersViewportThenSweep(t *testing.T) {
	p := testPoller()
	now := time.Date(2026, 9, 12, 12, 0, 0, 0, time.UTC)
	uae := snapshot.Bounds{West: 51, South: 22, East: 60, North: 27}
	viewCells := p.lattice.Cover(uae, p.cfg.MaxCells)

	// nothing fetched yet, so a viewport cell comes first
	c, ok := p.next(now, []snapshot.Bounds{uae})
	require.True(t, ok)
	require.Contains(t, keys(viewCells), c.Key)
	require.Equal(t, len(viewCells), p.Status().ViewCells)

	// with the viewport fresh the sweep gets the spare request
	for _, vc := range viewCells {
		p.fetched[vc.Key] = now
	}
	c, ok = p.next(now, []snapshot.Bounds{uae})
	require.True(t, ok)
	require.Equal(t, p.sweep[0].Key, c.Key)

	// everything fresh means nothing to do
	for _, sc := range p.sweep {
		p.fetched[sc.Key] = now
	}
	_, ok = p.next(now, []snapshot.Bounds{uae})
	require.False(t, ok)

	// once the active interval passes the viewport is due again, oldest first
	later := now.Add(11 * time.Second)
	p.fetched[viewCells[0].Key] = now.Add(-time.Minute)
	c, ok = p.next(later, []snapshot.Bounds{uae})
	require.True(t, ok)
	require.Equal(t, viewCells[0].Key, c.Key)

	// a cell that just failed waits its turn
	p.retryAt[viewCells[0].Key] = later.Add(time.Minute)
	c, ok = p.next(later, []snapshot.Bounds{uae})
	require.True(t, ok)
	require.NotEqual(t, viewCells[0].Key, c.Key)
}

func TestSweepPriority(t *testing.T) {
	p := testPoller()
	now := time.Date(2026, 9, 12, 12, 0, 0, 0, time.UTC)

	// nothing known: the first busy region cell goes first
	c, ok := p.next(now, nil)
	require.True(t, ok)
	require.Equal(t, p.sweep[0].Key, c.Key)

	// everything fetched an hour ago: the busiest cell is furthest past its own interval
	for _, sc := range p.sweep {
		p.fetched[sc.Key] = now.Add(-time.Hour)
	}
	busy := p.sweep[len(p.sweep)-1]
	p.density[busy.Key] = 300
	c, ok = p.next(now, nil)
	require.True(t, ok)
	require.Equal(t, busy.Key, c.Key)

	// relative lateness wins: a medium cell 20 minutes old outranks a busy cell 9 minutes old, and
	// an empty cell fetched an hour ago is not due at all
	for _, sc := range p.sweep {
		p.fetched[sc.Key] = now
	}
	medium := p.sweep[1]
	p.density[medium.Key] = 20
	p.fetched[medium.Key] = now.Add(-20 * time.Minute)
	p.fetched[busy.Key] = now.Add(-9 * time.Minute)
	empty := p.sweep[2]
	p.density[empty.Key] = 0
	p.fetched[empty.Key] = now.Add(-time.Hour)
	c, ok = p.next(now, nil)
	require.True(t, ok)
	require.Equal(t, medium.Key, c.Key)
	p.fetched[medium.Key] = now
	c, ok = p.next(now, nil)
	require.True(t, ok)
	require.Equal(t, busy.Key, c.Key)
	p.fetched[busy.Key] = now
	_, ok = p.next(now, nil)
	require.False(t, ok)
}

func TestCellStateSurvivesRestart(t *testing.T) {
	p := testPoller()
	p.rdb = testRedis(t)
	ctx := context.Background()
	at := time.Date(2026, 9, 12, 12, 0, 0, 0, time.UTC)
	p.saveCell(ctx, p.sweep[0], at, 42)
	p.saveCell(ctx, p.sweep[1], at.Add(time.Minute), 0)

	q := testPoller()
	q.rdb = p.rdb
	q.restoreCells(ctx)
	require.Equal(t, at, q.fetched[p.sweep[0].Key])
	require.Equal(t, 42, q.density[p.sweep[0].Key])
	require.Equal(t, 0, q.density[p.sweep[1].Key])
	_, known := q.fetched[p.sweep[1].Key]
	require.True(t, known)
}

func TestWideViewportLeavesRoomForSweep(t *testing.T) {
	p := testPoller()
	now := time.Date(2026, 9, 12, 12, 0, 0, 0, time.UTC)
	world := []snapshot.Bounds{snapshot.World()}
	// a world view is far wider than the cap, so it is served with a third of the cells
	viewKeys := map[string]bool{}
	for _, c := range p.lattice.Cover(snapshot.World(), p.cfg.MaxCells/3) {
		viewKeys[c.Key] = true
	}
	require.Len(t, viewKeys, 4)
	// with everything due, the viewport gets two turns and the sweep the third, and so on
	var kinds []bool
	for range 9 {
		c, ok := p.next(now, world)
		require.True(t, ok)
		kinds = append(kinds, viewKeys[c.Key])
		p.fetched[c.Key] = now.Add(-time.Hour)
		if !viewKeys[c.Key] {
			p.density[c.Key] = 50
		}
	}
	require.Equal(t, []bool{true, true, false, true, true, false, true, true, false}, kinds)
	require.Equal(t, 4, p.Status().ViewCells)

	// those sampled cells refresh three times slower than a view that fits
	for k := range viewKeys {
		p.fetched[k] = now.Add(-15 * time.Second)
	}
	for _, c := range p.sweep {
		p.fetched[c.Key] = now
		p.density[c.Key] = 0
	}
	_, ok := p.next(now, world)
	require.False(t, ok)
	for k := range viewKeys {
		p.fetched[k] = now.Add(-31 * time.Second)
	}
	c, ok := p.next(now, world)
	require.True(t, ok)
	require.True(t, viewKeys[c.Key])
}

func TestNextWithoutSweep(t *testing.T) {
	p := testPoller()
	p.sweep = nil
	_, ok := p.next(time.Now(), nil)
	require.False(t, ok)
}

func TestMergeKeepsNewestAndEvicts(t *testing.T) {
	p := testPoller()
	now := time.Date(2026, 9, 12, 12, 0, 0, 0, time.UTC)
	fresh := model.Aircraft{ICAO24: "abc123", Lat: 1, Lon: 1, PositionAt: now, LastContact: now}
	older := fresh
	older.Lat = 2
	older.PositionAt = now.Add(-5 * time.Second)
	older.LastContact = older.PositionAt
	other := model.Aircraft{ICAO24: "def456", Lat: 3, Lon: 3, PositionAt: now.Add(-time.Minute), LastContact: now.Add(-time.Minute)}

	snap := p.merge(&adsb.Batch{Time: now, Aircraft: []model.Aircraft{fresh, other}}, now)
	require.Equal(t, 2, snap.Len())

	// an overlapping circle reporting an older position does not win
	snap = p.merge(&adsb.Batch{Time: now, Aircraft: []model.Aircraft{older}}, now.Add(time.Second))
	a, ok := snap.Get("abc123")
	require.True(t, ok)
	require.Equal(t, 1.0, a.Lat)

	// aircraft nobody has reported for keepFor drop out
	snap = p.merge(&adsb.Batch{Time: now}, now.Add(keepFor).Add(-30*time.Second))
	require.Equal(t, 1, snap.Len())
	_, ok = snap.Get("def456")
	require.False(t, ok)
}

func TestSeedFromRestoredSnapshot(t *testing.T) {
	p := testPoller()
	now := time.Date(2026, 9, 12, 12, 0, 0, 0, time.UTC)
	restored := []model.Aircraft{
		{ICAO24: "abc123", Lat: 1, Lon: 1, PositionAt: now.Add(-time.Minute), LastContact: now.Add(-time.Minute)},
		{ICAO24: "def456", Lat: 2, Lon: 2, PositionAt: now.Add(-time.Minute), LastContact: now.Add(-time.Minute)},
	}
	p.snaps.Set(snapshot.New(now, restored))
	p.seed()

	fresh := model.Aircraft{ICAO24: "abc123", Lat: 1.5, Lon: 1, PositionAt: now, LastContact: now}
	snap := p.merge(&adsb.Batch{Time: now, Aircraft: []model.Aircraft{fresh}}, now)
	require.Equal(t, 2, snap.Len())
	a, ok := snap.Get("abc123")
	require.True(t, ok)
	require.Equal(t, 1.5, a.Lat)
}

func TestDownsample(t *testing.T) {
	p := testPoller()
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

func TestReportsFromRedis(t *testing.T) {
	p := testPoller()
	p.rdb = testRedis(t)
	ctx := context.Background()
	require.Equal(t, 0, p.viewers(ctx))
	require.Empty(t, p.views(ctx))

	require.NoError(t, p.rdb.Set(ctx, "viewers:a", "2", 0).Err())
	require.NoError(t, p.rdb.Set(ctx, "viewers:b", "1", 0).Err())
	require.NoError(t, p.rdb.Set(ctx, "views:a", `[{"West":51,"South":22,"East":60,"North":27}]`, 0).Err())
	require.NoError(t, p.rdb.Set(ctx, "views:b", `not json`, 0).Err())
	require.Equal(t, 3, p.viewers(ctx))
	require.Equal(t, []snapshot.Bounds{{West: 51, South: 22, East: 60, North: 27}}, p.views(ctx))
}

func TestRequestCountSurvivesRestart(t *testing.T) {
	p := testPoller()
	p.rdb = testRedis(t)
	now := time.Date(2026, 9, 12, 12, 0, 0, 0, time.UTC)
	p.now = func() time.Time { return now }
	ctx := context.Background()

	p.count(ctx, now)
	p.count(ctx, now)
	require.Equal(t, 2, p.Status().RequestsToday)

	q := testPoller()
	q.rdb = p.rdb
	q.now = p.now
	q.restoreRequests(ctx)
	require.Equal(t, 2, q.Status().RequestsToday)

	// the count resets with the UTC date
	q.now = func() time.Time { return now.Add(24 * time.Hour) }
	q.rollover()
	require.Equal(t, 0, q.Status().RequestsToday)
}

func TestAngleDiff(t *testing.T) {
	require.Equal(t, 20.0, angleDiff(350, 10))
	require.Equal(t, 180.0, angleDiff(0, 180))
	require.Equal(t, 0.0, angleDiff(45, 45))
}

func keys(cells []Cell) []string {
	out := make([]string, 0, len(cells))
	for _, c := range cells {
		out = append(out, c.Key)
	}
	return out
}
