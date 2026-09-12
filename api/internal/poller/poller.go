// Package poller keeps the live snapshot fresh from a radius limited ADS-B feed, one circle at a time.
package poller

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"math"
	"sort"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"

	"github.com/AbdullahJaswal/flightpath/api/internal/adsb"
	"github.com/AbdullahJaswal/flightpath/api/internal/cache"
	"github.com/AbdullahJaswal/flightpath/api/internal/flights"
	"github.com/AbdullahJaswal/flightpath/api/internal/model"
	"github.com/AbdullahJaswal/flightpath/api/internal/snapshot"
	"github.com/AbdullahJaswal/flightpath/api/internal/store"
)

const (
	snapshotKey     = "snapshot:latest"
	snapshotChannel = "snapshot"
	leaderKey       = "poller:leader"
	requestsKey     = "adsb:requests:"
	cellsKey        = "adsb:cells"
	leaderTTL       = 90 * time.Second
	minStoreGap     = 5 * time.Minute
	trailBatchLimit = 500
	headingDelta    = 10.0
	altitudeDelta   = 100.0
	retentionEvery  = 10 * time.Minute
	staleAfter      = time.Hour
	// keepFor bounds how long an aircraft stays in the snapshot without a fresh report. It outlasts
	// the slowest sweep interval below, so quiet corners of the map do not blink between visits.
	keepFor       = 45 * time.Minute
	publishEvery  = 10 * time.Second
	rateLimitWait = time.Minute
	errorWait     = 30 * time.Second
	errorStreak   = 3
	idleCheck     = time.Second
	// viewShare is how many viewport fetches may run back to back before a due sweep cell gets a turn.
	viewShare = 2
	// wideDivisor cuts the cells and the refresh rate of a viewport too wide to cover in full.
	wideDivisor = 3
)

// Source answers one circle query with every aircraft within the radius of a point.
type Source interface {
	Circle(ctx context.Context, lat, lon float64, radiusNM int) (*adsb.Batch, error)
}

type Config struct {
	InstanceID string
	RadiusNM   int
	// MinInterval is the gap between requests while someone is watching, IdleInterval otherwise.
	MinInterval  time.Duration
	IdleInterval time.Duration
	// ActiveInterval is how old a cell may get before it is fetched again.
	ActiveInterval time.Duration
	// MaxCells caps the circles spent on one viewport; wider views keep the middle live.
	MaxCells       int
	DailyRequests  int
	WorldSweep     bool
	TrailRetention time.Duration
}

type Status struct {
	Mode          model.PollerMode
	Leader        bool
	Interval      time.Duration
	LastPoll      time.Time
	NextPoll      time.Time
	RequestsToday int
	DailyCap      int
	ViewCells     int
	SweepCells    int
	AircraftCount int
	LastError     string
}

type lastPos struct {
	stored  time.Time
	heading float64
	alt     float64
	seen    time.Time
}

type Poller struct {
	cfg     Config
	source  Source
	lattice *Lattice
	sweep   []Cell
	snaps   *snapshot.Store
	cache   *cache.Cache
	store   *store.Store
	rdb     *redis.Client
	log     *slog.Logger
	now     func() time.Time

	mu            sync.Mutex
	status        Status
	requestsDay   string
	fetched       map[string]time.Time
	retryAt       map[string]time.Time
	density       map[string]int
	state         map[string]model.Aircraft
	last          map[string]lastPos
	lastRetention time.Time
	lastPublish   time.Time
	failures      int
	viewStreak    int
}

func New(cfg Config, source Source, snaps *snapshot.Store, c *cache.Cache, st *store.Store, rdb *redis.Client, log *slog.Logger) *Poller {
	p := &Poller{
		cfg:     cfg,
		source:  source,
		lattice: NewLattice(cfg.RadiusNM),
		snaps:   snaps,
		cache:   c,
		store:   st,
		rdb:     rdb,
		log:     log,
		now:     time.Now,
		fetched: make(map[string]time.Time),
		retryAt: make(map[string]time.Time),
		density: make(map[string]int),
		state:   make(map[string]model.Aircraft),
		last:    make(map[string]lastPos),
	}
	if cfg.WorldSweep {
		p.sweep = p.lattice.Sweep(sweepRegions)
	}
	p.status = Status{Mode: model.ModeIdle, Interval: cfg.ActiveInterval, DailyCap: cfg.DailyRequests, SweepCells: len(p.sweep)}
	return p
}

func (p *Poller) Status() Status {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.status
}

func (p *Poller) update(fn func(*Status)) {
	p.mu.Lock()
	fn(&p.status)
	p.mu.Unlock()
}

// Run fetches until ctx is cancelled. Only the instance holding the Redis leader lock fetches.
func (p *Poller) Run(ctx context.Context) error {
	p.restoreRequests(ctx)
	p.restoreCells(ctx)
	p.seed()
	defer p.releaseLeader()
	for {
		if !p.acquireLeader(ctx) {
			p.update(func(s *Status) { s.Mode = model.ModeFollower; s.Leader = false })
			if !sleep(ctx, 10*time.Second) {
				return nil
			}
			continue
		}
		p.rollover()
		now := p.now()
		if p.Status().RequestsToday >= p.cfg.DailyRequests {
			wait := min(untilReset(now), time.Minute)
			p.update(func(s *Status) {
				s.Mode = model.ModePaused
				s.Leader = true
				s.NextPoll = now.Add(wait)
			})
			if !sleep(ctx, wait) {
				return nil
			}
			continue
		}
		mode, gap := model.ModeIdle, p.cfg.IdleInterval
		if p.viewers(ctx) > 0 {
			mode, gap = model.ModeActive, p.cfg.MinInterval
		}
		cell, ok := p.next(now, p.views(ctx))
		if !ok {
			p.update(func(s *Status) {
				s.Mode = mode
				s.Leader = true
				s.NextPoll = now.Add(idleCheck)
			})
			if !sleep(ctx, idleCheck) {
				return nil
			}
			continue
		}
		err := p.fetch(ctx, cell)
		var rl *adsb.RateLimitError
		switch {
		case errors.As(err, &rl):
			wait := rl.RetryAfter
			if wait <= 0 {
				wait = rateLimitWait
			}
			p.log.Warn("adsb rate limited", "retry_after", wait)
			p.update(func(s *Status) {
				s.Mode = model.ModePaused
				s.Leader = true
				s.LastError = err.Error()
				s.NextPoll = p.now().Add(wait)
			})
			if !sleep(ctx, wait) {
				return nil
			}
			continue
		case err != nil:
			if ctx.Err() != nil {
				return nil
			}
			p.log.Warn("adsb fetch failed", "cell", cell.Key, "err", err)
			p.update(func(s *Status) {
				s.Mode = mode
				s.Leader = true
				s.LastError = err.Error()
			})
			// one bad cell moves on, an upstream outage slows the whole loop down
			p.mu.Lock()
			if p.failures >= errorStreak {
				gap = errorWait
			}
			p.mu.Unlock()
		default:
			p.update(func(s *Status) {
				s.Mode = mode
				s.Leader = true
				s.LastError = ""
			})
		}
		p.update(func(s *Status) {
			s.Interval = p.cfg.ActiveInterval
			s.NextPoll = p.now().Add(gap)
		})
		if !sleep(ctx, gap) {
			return nil
		}
	}
}

// next picks the most overdue cell under a viewport, then the most overdue sweep cell, and nothing
// when everything is fresh. A wide viewport can want more than the whole request budget, so after
// two viewport fetches in a row a due sweep cell takes the next turn, and the world keeps filling.
func (p *Poller) next(now time.Time, views []snapshot.Bounds) (Cell, bool) {
	// a view wider than its cell cap is a sample of the world at best, so it gets fewer cells and
	// a slower refresh, and the sweep does the real work
	want, wide := map[string]Cell{}, map[string]bool{}
	for _, v := range views {
		cells := p.lattice.Cells(v)
		if len(cells) > p.cfg.MaxCells {
			for _, c := range p.lattice.Cover(v, max(1, p.cfg.MaxCells/wideDivisor)) {
				want[c.Key] = c
				wide[c.Key] = true
			}
			continue
		}
		for _, c := range cells {
			want[c.Key] = c
		}
	}
	keys := make([]string, 0, len(want))
	for k := range want {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	view := make([]Cell, 0, len(keys))
	for _, k := range keys {
		view = append(view, want[k])
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	p.status.ViewCells = len(view)
	sweepDue := func() (Cell, bool) {
		return p.overdue(now, p.sweep, func(c Cell) time.Duration {
			_, known := p.fetched[c.Key]
			return sweepInterval(p.density[c.Key], known)
		})
	}
	if p.viewStreak >= viewShare {
		if c, ok := sweepDue(); ok {
			p.viewStreak = 0
			return c, true
		}
	}
	viewInterval := func(c Cell) time.Duration {
		if wide[c.Key] {
			return p.cfg.ActiveInterval * wideDivisor
		}
		return p.cfg.ActiveInterval
	}
	if c, ok := p.overdue(now, view, viewInterval); ok {
		p.viewStreak++
		return c, true
	}
	p.viewStreak = 0
	return sweepDue()
}

// sweepInterval is how often a background cell is worth a request, judged by what it reported
// last time. Busy sky stays fresh, empty ocean is checked rarely, unknown cells go straight away.
func sweepInterval(density int, known bool) time.Duration {
	switch {
	case !known:
		return 0
	case density >= 40:
		return 8 * time.Minute
	case density >= 10:
		return 15 * time.Minute
	case density >= 1:
		return 30 * time.Minute
	}
	return 2 * time.Hour
}

// overdue returns the cell furthest past its own interval, measured as a ratio so a busy cell that
// is a few minutes late outranks an empty one that is an hour late. Unknown cells tie at the top
// and go in list order, which is busiest region first.
func (p *Poller) overdue(now time.Time, cells []Cell, interval func(Cell) time.Duration) (Cell, bool) {
	var best Cell
	bestScore, bestDensity := -1.0, -1
	for _, c := range cells {
		if p.retryAt[c.Key].After(now) {
			continue
		}
		score := math.Inf(1)
		if last, known := p.fetched[c.Key]; known {
			score = now.Sub(last).Seconds() / interval(c).Seconds()
		}
		if score < 1 {
			continue
		}
		density := p.density[c.Key]
		if score > bestScore || (score == bestScore && density > bestDensity) {
			best, bestScore, bestDensity = c, score, density
		}
	}
	return best, bestScore >= 1
}

func (p *Poller) fetch(ctx context.Context, cell Cell) error {
	batch, err := p.source.Circle(ctx, cell.Lat, cell.Lon, p.cfg.RadiusNM)
	now := p.now()
	// failed requests count too, the upstream still served them
	p.count(ctx, now)
	if err != nil {
		p.mu.Lock()
		p.retryAt[cell.Key] = now.Add(errorWait)
		p.failures++
		p.mu.Unlock()
		return err
	}
	p.mu.Lock()
	p.fetched[cell.Key] = now
	p.density[cell.Key] = len(batch.Aircraft)
	p.failures = 0
	p.mu.Unlock()
	p.saveCell(ctx, cell, now, len(batch.Aircraft))
	snap := p.merge(batch, now)
	p.publish(ctx, snap, now)
	if rows := p.downsample(batch.Aircraft, now); len(rows) > 0 {
		if err := p.store.InsertPositions(ctx, rows); err != nil {
			p.log.Warn("position insert failed", "err", err, "rows", len(rows))
		} else {
			p.invalidateTrails(ctx, rows)
		}
	}
	p.retain(ctx, now)
	p.update(func(s *Status) {
		s.LastPoll = now
		s.AircraftCount = snap.Len()
	})
	p.log.Debug("fetched", "cell", cell.Key, "aircraft", len(batch.Aircraft), "tracked", snap.Len())
	return nil
}

// merge folds a circle into the tracked aircraft and publishes a new snapshot. Circles overlap, so
// a report only replaces an older one, and aircraft nobody has reported for a while drop out.
func (p *Poller) merge(b *adsb.Batch, now time.Time) *snapshot.Snapshot {
	p.mu.Lock()
	for _, a := range b.Aircraft {
		if prev, ok := p.state[a.ICAO24]; ok && prev.PositionAt.After(a.PositionAt) {
			continue
		}
		p.state[a.ICAO24] = a
	}
	list := make([]model.Aircraft, 0, len(p.state))
	for k, a := range p.state {
		if now.Sub(a.LastContact) > keepFor {
			delete(p.state, k)
			continue
		}
		list = append(list, a)
	}
	p.mu.Unlock()
	snap := snapshot.New(now, list)
	p.snaps.Set(snap)
	return snap
}

// publish shares the snapshot through Redis for restarts and other instances, a few seconds apart
// rather than after every circle.
func (p *Poller) publish(ctx context.Context, snap *snapshot.Snapshot, now time.Time) {
	p.mu.Lock()
	due := now.Sub(p.lastPublish) >= publishEvery
	if due {
		p.lastPublish = now
	}
	p.mu.Unlock()
	if !due {
		return
	}
	b, err := snapshot.Marshal(snap)
	if err != nil {
		return
	}
	if err := p.cache.PutRaw(ctx, snapshotKey, b, keepFor+5*time.Minute); err != nil {
		p.log.Warn("snapshot cache write failed", "err", err)
		return
	}
	if err := p.rdb.Publish(ctx, snapshotChannel, p.cfg.InstanceID).Err(); err != nil {
		p.log.Warn("snapshot publish failed", "err", err)
	}
}

func (p *Poller) count(ctx context.Context, now time.Time) {
	p.update(func(s *Status) { s.RequestsToday++ })
	key := requestsKey + now.UTC().Format(time.DateOnly)
	pipe := p.rdb.TxPipeline()
	pipe.Incr(ctx, key)
	pipe.Expire(ctx, key, 48*time.Hour)
	if _, err := pipe.Exec(ctx); err != nil {
		p.log.Debug("request count write failed", "err", err)
	}
}

// seed starts the tracked aircraft from the snapshot restored out of Redis, so a restart carries
// the whole picture forward instead of showing only the first circle it fetches.
func (p *Poller) seed() {
	snap := p.snaps.Current()
	if snap == nil {
		return
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	for _, a := range snap.All() {
		if _, ok := p.state[a.ICAO24]; !ok {
			p.state[a.ICAO24] = a
		}
	}
}

// saveCell records when a cell was last fetched and what it held, so a restart carries on where
// the sweep left off instead of rediscovering every empty stretch of ocean.
func (p *Poller) saveCell(ctx context.Context, cell Cell, at time.Time, density int) {
	pipe := p.rdb.TxPipeline()
	pipe.HSet(ctx, cellsKey, cell.Key, fmt.Sprintf("%d,%d", at.Unix(), density))
	pipe.Expire(ctx, cellsKey, 24*time.Hour)
	if _, err := pipe.Exec(ctx); err != nil {
		p.log.Debug("cell state write failed", "err", err)
	}
}

func (p *Poller) restoreCells(ctx context.Context) {
	vals, err := p.rdb.HGetAll(ctx, cellsKey).Result()
	if err != nil {
		return
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	for key, v := range vals {
		var at int64
		var density int
		if _, err := fmt.Sscanf(v, "%d,%d", &at, &density); err != nil {
			continue
		}
		p.fetched[key] = time.Unix(at, 0).UTC()
		p.density[key] = density
	}
}

// restoreRequests picks up today's count so a restart does not forget the budget already spent.
func (p *Poller) restoreRequests(ctx context.Context) {
	day := p.now().UTC().Format(time.DateOnly)
	n, err := p.rdb.Get(ctx, requestsKey+day).Int()
	p.mu.Lock()
	defer p.mu.Unlock()
	p.requestsDay = day
	if err == nil {
		p.status.RequestsToday = n
	}
}

// rollover resets the daily count once the UTC date changes.
func (p *Poller) rollover() {
	day := p.now().UTC().Format(time.DateOnly)
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.requestsDay == day {
		return
	}
	p.requestsDay = day
	p.status.RequestsToday = 0
}

// untilReset is the time until the daily request cap refreshes at UTC midnight.
func untilReset(now time.Time) time.Duration {
	u := now.UTC()
	next := time.Date(u.Year(), u.Month(), u.Day()+1, 0, 1, 0, 0, time.UTC)
	return next.Sub(u)
}

// downsample keeps a position when enough time passed or the aircraft turned or changed altitude.
func (p *Poller) downsample(aircraft []model.Aircraft, now time.Time) []store.Position {
	p.mu.Lock()
	defer p.mu.Unlock()
	var rows []store.Position
	for _, a := range aircraft {
		if a.OnGround || a.PositionAt.IsZero() {
			continue
		}
		heading, alt := deref(a.HeadingDeg), deref(a.BaroAltM)
		prev, seen := p.last[a.ICAO24]
		keep := !seen ||
			a.PositionAt.Sub(prev.stored) >= minStoreGap ||
			angleDiff(heading, prev.heading) >= headingDelta ||
			math.Abs(alt-prev.alt) >= altitudeDelta
		if !keep {
			prev.seen = now
			p.last[a.ICAO24] = prev
			continue
		}
		p.last[a.ICAO24] = lastPos{stored: a.PositionAt, heading: heading, alt: alt, seen: now}
		rows = append(rows, store.Position{
			ICAO24: a.ICAO24, TS: a.PositionAt, Callsign: a.Callsign, Lat: a.Lat, Lon: a.Lon,
			BaroAltM: a.BaroAltM, VelocityMS: a.VelocityMS, HeadingDeg: a.HeadingDeg, VertRateMS: a.VertRateMS,
			OnGround: a.OnGround,
		})
	}
	for k, v := range p.last {
		if now.Sub(v.seen) > staleAfter {
			delete(p.last, k)
		}
	}
	return rows
}

// invalidateTrails drops cached trails of aircraft that just gained a stored point.
func (p *Poller) invalidateTrails(ctx context.Context, rows []store.Position) {
	if len(rows) > trailBatchLimit {
		p.cache.InvalidatePrefix(ctx, flights.PrefixTrail)
		return
	}
	keys := make([]string, 0, len(rows))
	for _, r := range rows {
		keys = append(keys, flights.PrefixTrail+r.ICAO24)
	}
	p.cache.Invalidate(ctx, keys...)
}

func (p *Poller) retain(ctx context.Context, now time.Time) {
	if now.Sub(p.lastRetention) < retentionEvery {
		return
	}
	p.lastRetention = now
	n, err := p.store.DeletePositionsBefore(ctx, now.Add(-p.cfg.TrailRetention))
	if err != nil {
		p.log.Warn("position retention failed", "err", err)
		return
	}
	if n > 0 {
		p.log.Info("positions pruned", "rows", n)
	}
}

func (p *Poller) acquireLeader(ctx context.Context) bool {
	ok, err := p.rdb.SetNX(ctx, leaderKey, p.cfg.InstanceID, leaderTTL).Result()
	if err != nil {
		p.log.Warn("leader lock failed", "err", err)
		return false
	}
	if ok {
		return true
	}
	holder, err := p.rdb.Get(ctx, leaderKey).Result()
	if err != nil || holder != p.cfg.InstanceID {
		return false
	}
	return p.rdb.Expire(ctx, leaderKey, leaderTTL).Err() == nil
}

// releaseLeader drops the lock on shutdown so a replacement instance can take over at once.
func (p *Poller) releaseLeader() {
	if !p.Status().Leader {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	if holder, err := p.rdb.Get(ctx, leaderKey).Result(); err == nil && holder == p.cfg.InstanceID {
		_ = p.rdb.Del(ctx, leaderKey).Err()
	}
}

// viewers sums the live connection counts every instance reports to Redis.
func (p *Poller) viewers(ctx context.Context) int {
	total := 0
	for _, v := range p.reports(ctx, "viewers:*") {
		n := 0
		for _, ch := range v {
			if ch < '0' || ch > '9' {
				n = 0
				break
			}
			n = n*10 + int(ch-'0')
		}
		total += n
	}
	return total
}

// views gathers the viewports every instance reports to Redis.
func (p *Poller) views(ctx context.Context) []snapshot.Bounds {
	var out []snapshot.Bounds
	for _, v := range p.reports(ctx, "views:*") {
		var b []snapshot.Bounds
		if err := json.Unmarshal([]byte(v), &b); err == nil {
			out = append(out, b...)
		}
	}
	return out
}

func (p *Poller) reports(ctx context.Context, pattern string) []string {
	iter := p.rdb.Scan(ctx, 0, pattern, 100).Iterator()
	var keys []string
	for iter.Next(ctx) {
		keys = append(keys, iter.Val())
	}
	if len(keys) == 0 {
		return nil
	}
	vals, err := p.rdb.MGet(ctx, keys...).Result()
	if err != nil {
		return nil
	}
	out := make([]string, 0, len(vals))
	for _, v := range vals {
		if s, ok := v.(string); ok {
			out = append(out, s)
		}
	}
	return out
}

func sleep(ctx context.Context, d time.Duration) bool {
	t := time.NewTimer(d)
	defer t.Stop()
	select {
	case <-ctx.Done():
		return false
	case <-t.C:
		return true
	}
}

func deref(f *float64) float64 {
	if f == nil {
		return 0
	}
	return *f
}

func angleDiff(a, b float64) float64 {
	d := math.Mod(math.Abs(a-b), 360)
	if d > 180 {
		d = 360 - d
	}
	return d
}
