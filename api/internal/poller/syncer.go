package poller

import (
	"context"
	"log/slog"

	"github.com/redis/go-redis/v9"

	"github.com/AbdullahJaswal/flightpath/api/internal/cache"
	"github.com/AbdullahJaswal/flightpath/api/internal/snapshot"
)

// Syncer loads snapshots published by the leader so every instance serves the same data.
type Syncer struct {
	instanceID string
	rdb        *redis.Client
	cache      *cache.Cache
	snaps      *snapshot.Store
	log        *slog.Logger
}

func NewSyncer(instanceID string, rdb *redis.Client, c *cache.Cache, snaps *snapshot.Store, log *slog.Logger) *Syncer {
	return &Syncer{instanceID: instanceID, rdb: rdb, cache: c, snaps: snaps, log: log}
}

func (s *Syncer) Run(ctx context.Context) error {
	s.Load(ctx)
	sub := s.rdb.Subscribe(ctx, snapshotChannel)
	defer func() { _ = sub.Close() }()
	ch := sub.Channel()
	for {
		select {
		case msg, ok := <-ch:
			if !ok {
				return nil
			}
			if msg.Payload != s.instanceID {
				s.Load(ctx)
			}
		case <-ctx.Done():
			return nil
		}
	}
}

// Load replaces the current snapshot with the shared one when that is newer.
func (s *Syncer) Load(ctx context.Context) {
	b, err := s.cache.GetRaw(ctx, snapshotKey)
	if err != nil || b == nil {
		return
	}
	snap, err := snapshot.Unmarshal(b)
	if err != nil {
		s.log.Warn("snapshot decode failed", "err", err)
		return
	}
	if cur := s.snaps.Current(); cur != nil && !snap.Time.After(cur.Time) {
		return
	}
	s.snaps.Set(snap)
}
