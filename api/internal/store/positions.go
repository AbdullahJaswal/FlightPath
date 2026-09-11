package store

import (
	"context"
	"slices"
	"time"
)

func (s *Store) InsertPositions(ctx context.Context, rows []Position) error {
	for chunk := range slices.Chunk(rows, insertChunk) {
		if _, err := s.db.NewInsert().Model(&chunk).On("CONFLICT DO NOTHING").Exec(ctx); err != nil {
			return err
		}
	}
	return nil
}

// Trail returns stored positions for an aircraft since the given time, oldest first.
func (s *Store) Trail(ctx context.Context, icao24 string, since time.Time) ([]Position, error) {
	var rows []Position
	err := s.db.NewSelect().Model(&rows).
		Where("icao24 = ?", icao24).Where("ts >= ?", since).
		Order("ts ASC").Scan(ctx)
	return rows, err
}

// PositionsInBounds returns stored positions inside the box since the given time, grouped by aircraft and oldest first.
func (s *Store) PositionsInBounds(ctx context.Context, since time.Time, west, south, east, north float64) ([]Position, error) {
	var rows []Position
	err := inBounds(s.db.NewSelect().Model(&rows).Where("ts >= ?", since), west, south, east, north).
		Order("icao24 ASC", "ts ASC").Scan(ctx)
	return rows, err
}

func (s *Store) DeletePositionsBefore(ctx context.Context, t time.Time) (int64, error) {
	res, err := s.db.NewDelete().Model((*Position)(nil)).Where("ts < ?", t).Exec(ctx)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}
