// Package poller fetches OpenSky snapshots on a credit-aware schedule.
package poller

import (
	"context"
	"errors"
	"log/slog"
	"math"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"

	"github.com/AbdullahJaswal/flightpath/api/internal/cache"
	"github.com/AbdullahJaswal/flightpath/api/internal/model"
	"github.com/AbdullahJaswal/flightpath/api/internal/opensky"
	"github.com/AbdullahJaswal/flightpath/api/internal/snapshot"
	"github.com/AbdullahJaswal/flightpath/api/internal/store"
)

const (
	pollCost         = 4
	anonymousCredits = 400
	snapshotKey      = "snapshot:latest"
	snapshotChannel  = "snapshot"
	leaderKey        = "poller:leader"
	creditsKey       = "opensky:credits"
	leaderTTL        = 90 * time.Second
	snapshotTTL      = 10 * time.Minute
	minStoreGap      = 5 * time.Minute
	headingDelta     = 10.0
	altitudeDelta    = 100.0
	retentionEvery   = 10 * time.Minute
	staleAfter       = time.Hour
)

type Config struct {
	InstanceID     string
	ActiveInterval time.Duration
	IdleInterval   time.Duration
	DailyCredits   int
	CreditReserve  int
	TrailRetention time.Duration
}

type Status struct {
	Mode             model.PollerMode
	Leader           bool
	Interval         time.Duration
	LastPoll         time.Time
	NextPoll         time.Time
	CreditsRemaining int
	CreditsUsedToday int
	AircraftCount    int
	LastError        string
}

type lastPos struct {
	stored  time.Time
	heading float64
	alt     float64
	seen    time.Time
}

type Poller struct {
	cfg    Config
	client *opensky.Client
	snaps  *snapshot.Store
	cache  *cache.Cache
	store  *store.Store
	rdb    *redis.Client
	log    *slog.Logger
	now    func() time.Time

	mu            sync.Mutex
	status        Status
	creditsDay    string
	last          map[string]lastPos
	lastRetention time.Time
}

func New(cfg Config, client *opensky.Client, snaps *snapshot.Store, c *cache.Cache, st *store.Store, rdb *redis.Client, log *slog.Logger) *Poller {
	credits := cfg.DailyCredits
	if client.Anonymous() && credits > anonymousCredits {
		credits = anonymousCredits
	}
	return &Poller{
		cfg:    cfg,
		client: client,
		snaps:  snaps,
		cache:  c,
		store:  st,
		rdb:    rdb,
		log:    log,
		now:    time.Now,
		status: Status{Mode: model.ModeIdle, CreditsRemaining: credits},
		last:   make(map[string]lastPos),
	}
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

// Run polls until ctx is cancelled. Only the instance holding the Redis leader lock polls.
func (p *Poller) Run(ctx context.Context) error {
	p.restoreCredits(ctx)
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
		interval, mode := p.pace(p.viewers(ctx), p.now())
		if mode == model.ModePaused {
			p.update(func(s *Status) {
				s.Mode = mode
				s.Leader = true
				s.Interval = interval
				s.NextPoll = p.now().Add(interval)
			})
			if !sleep(ctx, interval) {
				return nil
			}
			continue
		}
		if wait := p.fresh(interval); wait > 0 {
			p.update(func(s *Status) {
				s.Mode = mode
				s.Leader = true
				s.Interval = interval
				s.NextPoll = p.now().Add(wait)
			})
			if !sleep(ctx, wait) {
				return nil
			}
			continue
		}
		err := p.poll(ctx)
		var rl *opensky.RateLimitError
		switch {
		case errors.As(err, &rl):
			wait := rl.RetryAfter
			if wait <= 0 {
				wait = 15 * time.Minute
			}
			p.log.Warn("opensky rate limited", "retry_after", wait)
			p.update(func(s *Status) {
				s.Mode = model.ModePaused
				s.Leader = true
				s.CreditsRemaining = 0
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
			p.log.Warn("poll failed", "err", err)
			p.update(func(s *Status) {
				s.Leader = true
				s.LastError = err.Error()
				s.NextPoll = p.now().Add(30 * time.Second)
			})
			if !sleep(ctx, 30*time.Second) {
				return nil
			}
			continue
		}
		p.update(func(s *Status) {
			s.Mode = mode
			s.Leader = true
			s.Interval = interval
			s.NextPoll = p.now().Add(interval)
			s.LastError = ""
		})
		if !sleep(ctx, interval) {
			return nil
		}
	}
}

// pace picks the next interval from the remaining credits and whether anyone is watching.
func (p *Poller) pace(viewers int, now time.Time) (time.Duration, model.PollerMode) {
	s := p.Status()
	reset := untilReset(now)
	if s.CreditsRemaining < pollCost {
		return reset, model.ModePaused
	}
	usable := s.CreditsRemaining - p.cfg.CreditReserve
	if viewers <= 0 || usable < pollCost {
		return p.cfg.IdleInterval, model.ModeIdle
	}
	polls := usable / pollCost
	interval := time.Duration(math.Ceil(reset.Seconds()/float64(polls))) * time.Second
	if interval < p.cfg.ActiveInterval {
		interval = p.cfg.ActiveInterval
	}
	if interval > p.cfg.IdleInterval {
		interval = p.cfg.IdleInterval
	}
	return interval, model.ModeActive
}

// fresh returns how long to wait when the current snapshot, typically loaded from Redis after a restart, is younger than the interval.
func (p *Poller) fresh(interval time.Duration) time.Duration {
	cur := p.snaps.Current()
	if cur == nil {
		return 0
	}
	if age := p.now().Sub(cur.Time); age < interval {
		return interval - age
	}
	return 0
}

// untilReset is the time until the next UTC midnight, when OpenSky credits refresh.
func untilReset(now time.Time) time.Duration {
	u := now.UTC()
	next := time.Date(u.Year(), u.Month(), u.Day()+1, 0, 1, 0, 0, time.UTC)
	return next.Sub(u)
}

// rollover restores the daily budget once the UTC date changes.
func (p *Poller) rollover() {
	day := p.now().UTC().Format(time.DateOnly)
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.creditsDay == day {
		return
	}
	p.creditsDay = day
	p.status.CreditsUsedToday = 0
	credits := p.cfg.DailyCredits
	if p.client.Anonymous() && credits > anonymousCredits {
		credits = anonymousCredits
	}
	p.status.CreditsRemaining = credits
}

func (p *Poller) poll(ctx context.Context) error {
	states, err := p.client.States(ctx)
	if err != nil {
		return err
	}
	now := p.now()
	snap := snapshot.New(states.Time, states.Aircraft)
	p.snaps.Set(snap)
	if b, err := snapshot.Marshal(snap); err == nil {
		if err := p.cache.PutRaw(ctx, snapshotKey, b, snapshotTTL); err != nil {
			p.log.Warn("snapshot cache write failed", "err", err)
		} else if err := p.rdb.Publish(ctx, snapshotChannel, p.cfg.InstanceID).Err(); err != nil {
			p.log.Warn("snapshot publish failed", "err", err)
		}
	}
	if rows := p.downsample(states.Aircraft, now); len(rows) > 0 {
		if err := p.store.InsertPositions(ctx, rows); err != nil {
			p.log.Warn("position insert failed", "err", err, "rows", len(rows))
		}
	}
	p.retain(ctx, now)
	day := now.UTC().Format(time.DateOnly)
	if err := p.store.AddUsage(ctx, "opensky", day, pollCost); err != nil {
		p.log.Debug("usage write failed", "err", err)
	}
	p.update(func(s *Status) {
		s.LastPoll = now
		s.AircraftCount = len(states.Aircraft)
		s.CreditsUsedToday += pollCost
		if states.Quota.Remaining >= 0 {
			s.CreditsRemaining = states.Quota.Remaining
		} else {
			s.CreditsRemaining = max(0, s.CreditsRemaining-pollCost)
		}
	})
	remaining := p.Status().CreditsRemaining
	if err := p.rdb.Set(ctx, creditsKey, remaining, untilReset(now)).Err(); err != nil {
		p.log.Debug("credits write failed", "err", err)
	}
	p.log.Info("poll", "aircraft", len(states.Aircraft), "credits_remaining", remaining)
	return nil
}

// restoreCredits picks up the last known credit count so a restart does not reset the budget.
func (p *Poller) restoreCredits(ctx context.Context) {
	v, err := p.rdb.Get(ctx, creditsKey).Int()
	if err != nil {
		return
	}
	p.mu.Lock()
	p.creditsDay = p.now().UTC().Format(time.DateOnly)
	p.status.CreditsRemaining = v
	p.mu.Unlock()
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
			ICAO24: a.ICAO24, TS: a.PositionAt, Lat: a.Lat, Lon: a.Lon,
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
	iter := p.rdb.Scan(ctx, 0, "viewers:*", 100).Iterator()
	var keys []string
	for iter.Next(ctx) {
		keys = append(keys, iter.Val())
	}
	if len(keys) == 0 {
		return 0
	}
	vals, err := p.rdb.MGet(ctx, keys...).Result()
	if err != nil {
		return 0
	}
	total := 0
	for _, v := range vals {
		if s, ok := v.(string); ok {
			n := 0
			for _, ch := range s {
				if ch < '0' || ch > '9' {
					n = 0
					break
				}
				n = n*10 + int(ch-'0')
			}
			total += n
		}
	}
	return total
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
