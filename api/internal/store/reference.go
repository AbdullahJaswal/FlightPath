package store

import (
	"context"
	"database/sql"
	"errors"
	"slices"
	"strings"

	"github.com/uptrace/bun"

	"github.com/AbdullahJaswal/flightpath/api/internal/errs"
)

const insertChunk = 1000

func notFound(err error) error {
	if errors.Is(err, sql.ErrNoRows) {
		return errs.ErrNotFound
	}
	return err
}

func replace[T any](ctx context.Context, db *bun.DB, rows []T) error {
	return db.RunInTx(ctx, nil, func(ctx context.Context, tx bun.Tx) error {
		if _, err := tx.NewTruncateTable().Model((*T)(nil)).Exec(ctx); err != nil {
			return err
		}
		for chunk := range slices.Chunk(rows, insertChunk) {
			if _, err := tx.NewInsert().Model(&chunk).Exec(ctx); err != nil {
				return err
			}
		}
		return nil
	})
}

func (s *Store) ReplaceAirports(ctx context.Context, rows []Airport) error {
	return replace(ctx, s.db, rows)
}

func (s *Store) ReplaceAirlines(ctx context.Context, rows []Airline) error {
	return replace(ctx, s.db, rows)
}

func (s *Store) ReplaceAircraft(ctx context.Context, rows []Aircraft) error {
	return replace(ctx, s.db, rows)
}

// AirportByCode finds an airport by ICAO ident or IATA code.
func (s *Store) AirportByCode(ctx context.Context, code string) (*Airport, error) {
	code = strings.ToUpper(strings.TrimSpace(code))
	var a Airport
	err := s.db.NewSelect().Model(&a).
		Where("ident = ?", code).WhereOr("iata_code = ?", code).
		OrderExpr("(ident = ?) DESC", code).
		Limit(1).Scan(ctx)
	if err != nil {
		return nil, notFound(err)
	}
	return &a, nil
}

// AirportsByICAO returns the airports for the given idents, keyed by ident.
func (s *Store) AirportsByICAO(ctx context.Context, idents []string) (map[string]Airport, error) {
	out := make(map[string]Airport, len(idents))
	if len(idents) == 0 {
		return out, nil
	}
	var rows []Airport
	if err := s.db.NewSelect().Model(&rows).Where("ident IN (?)", bun.List(idents)).Scan(ctx); err != nil {
		return nil, err
	}
	for _, r := range rows {
		out[r.Ident] = r
	}
	return out, nil
}

// SearchAirports matches codes exactly and names or cities by substring.
func (s *Store) SearchAirports(ctx context.Context, q string, limit int) ([]Airport, error) {
	q = strings.TrimSpace(q)
	code := strings.ToUpper(q)
	pattern := "%" + q + "%"
	var rows []Airport
	err := s.db.NewSelect().Model(&rows).
		Where("type <> 'closed'").
		WhereGroup(" AND ", func(sq *bun.SelectQuery) *bun.SelectQuery {
			return sq.WhereOr("iata_code = ?", code).
				WhereOr("ident = ?", code).
				WhereOr("name ILIKE ?", pattern).
				WhereOr("municipality ILIKE ?", pattern)
		}).
		OrderExpr("(iata_code = ?) DESC NULLS LAST, (ident = ?) DESC", code, code).
		OrderExpr("CASE type WHEN 'large_airport' THEN 0 WHEN 'medium_airport' THEN 1 ELSE 2 END").
		Order("name ASC").
		Limit(limit).Scan(ctx)
	return rows, err
}

// AirportsInBounds returns airports of the given types inside the box, biggest first.
func (s *Store) AirportsInBounds(ctx context.Context, west, south, east, north float64, types []string, limit int) ([]Airport, error) {
	var rows []Airport
	err := inBounds(s.db.NewSelect().Model(&rows), west, south, east, north).
		Where("type IN (?)", bun.List(types)).
		OrderExpr("CASE type WHEN 'large_airport' THEN 0 WHEN 'medium_airport' THEN 1 ELSE 2 END").
		Order("name ASC").
		Limit(limit).Scan(ctx)
	return rows, err
}

// inBounds filters on the lat and lon columns. West exceeds east when the box crosses the antimeridian.
func inBounds(q *bun.SelectQuery, west, south, east, north float64) *bun.SelectQuery {
	q = q.Where("lat BETWEEN ? AND ?", south, north)
	if west <= east {
		return q.Where("lon BETWEEN ? AND ?", west, east)
	}
	return q.WhereGroup(" AND ", func(sq *bun.SelectQuery) *bun.SelectQuery {
		return sq.WhereOr("lon >= ?", west).WhereOr("lon <= ?", east)
	})
}

func (s *Store) AirlineByICAO(ctx context.Context, icao string) (*Airline, error) {
	var a Airline
	err := s.db.NewSelect().Model(&a).Where("icao = ?", strings.ToUpper(icao)).Limit(1).Scan(ctx)
	if err != nil {
		return nil, notFound(err)
	}
	return &a, nil
}

func (s *Store) SearchAirlines(ctx context.Context, q string, limit int) ([]Airline, error) {
	q = strings.TrimSpace(q)
	code := strings.ToUpper(q)
	var rows []Airline
	err := s.db.NewSelect().Model(&rows).
		Where("icao = ?", code).WhereOr("iata = ?", code).WhereOr("name ILIKE ?", "%"+q+"%").
		OrderExpr("(icao = ?) DESC, (iata = ?) DESC NULLS LAST", code, code).
		Order("name ASC").
		Limit(limit).Scan(ctx)
	return rows, err
}

func (s *Store) AircraftByICAO24(ctx context.Context, icao24 string) (*Aircraft, error) {
	var a Aircraft
	err := s.db.NewSelect().Model(&a).Where("icao24 = ?", strings.ToLower(icao24)).Limit(1).Scan(ctx)
	if err != nil {
		return nil, notFound(err)
	}
	return &a, nil
}

func (s *Store) AircraftByRegistration(ctx context.Context, registration string) (*Aircraft, error) {
	var a Aircraft
	err := s.db.NewSelect().Model(&a).Where("registration = ?", strings.ToUpper(strings.TrimSpace(registration))).Limit(1).Scan(ctx)
	if err != nil {
		return nil, notFound(err)
	}
	return &a, nil
}
