package store

import (
	"context"
	"database/sql"
	"errors"
)

func (s *Store) FlightMeta(ctx context.Context, callsign, source string) (*FlightMeta, error) {
	var m FlightMeta
	err := s.db.NewSelect().Model(&m).Where("callsign = ?", callsign).Where("source = ?", source).Scan(ctx)
	if err != nil {
		return nil, notFound(err)
	}
	return &m, nil
}

func (s *Store) PutFlightMeta(ctx context.Context, m *FlightMeta) error {
	_, err := s.db.NewInsert().Model(m).
		On("CONFLICT (callsign, source) DO UPDATE").
		Set("found = EXCLUDED.found, payload = EXCLUDED.payload, fetched_at = EXCLUDED.fetched_at, expires_at = EXCLUDED.expires_at").
		Exec(ctx)
	return err
}

// TryConsume increments the usage counter unless the cap is reached. It returns the current count and whether a unit was consumed.
func (s *Store) TryConsume(ctx context.Context, provider, period string, limit int) (int, bool, error) {
	var count int
	err := s.db.NewRaw(`
INSERT INTO api_usage (provider, period, count, updated_at) VALUES (?, ?, 1, now())
ON CONFLICT (provider, period) DO UPDATE
SET count = api_usage.count + 1, updated_at = now()
WHERE api_usage.count < ?
RETURNING count`, provider, period, limit).Scan(ctx, &count)
	if errors.Is(err, sql.ErrNoRows) {
		used, uerr := s.Usage(ctx, provider, period)
		return used, false, uerr
	}
	if err != nil {
		return 0, false, err
	}
	return count, true, nil
}

func (s *Store) AddUsage(ctx context.Context, provider, period string, n int) error {
	_, err := s.db.NewRaw(`
INSERT INTO api_usage (provider, period, count, updated_at) VALUES (?, ?, ?, now())
ON CONFLICT (provider, period) DO UPDATE
SET count = api_usage.count + EXCLUDED.count, updated_at = now()`, provider, period, n).Exec(ctx)
	return err
}

func (s *Store) Usage(ctx context.Context, provider, period string) (int, error) {
	var count int
	err := s.db.NewSelect().Model((*APIUsage)(nil)).Column("count").
		Where("provider = ?", provider).Where("period = ?", period).Scan(ctx, &count)
	if errors.Is(err, sql.ErrNoRows) {
		return 0, nil
	}
	return count, err
}
