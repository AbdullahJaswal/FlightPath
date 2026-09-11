// Package store is the PostgreSQL persistence layer built on Bun.
package store

import (
	"context"
	"database/sql"
	"embed"
	"fmt"
	"io/fs"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/uptrace/bun"
	"github.com/uptrace/bun/dialect/pgdialect"
	"github.com/uptrace/bun/migrate"
)

//go:embed migrations/*.sql
var migrationFiles embed.FS

type Store struct {
	db *bun.DB
}

func Open(ctx context.Context, dsn string) (*Store, error) {
	sqldb, err := sql.Open("pgx", dsn)
	if err != nil {
		return nil, fmt.Errorf("store: open: %w", err)
	}
	sqldb.SetMaxOpenConns(8)
	sqldb.SetMaxIdleConns(4)
	sqldb.SetConnMaxLifetime(30 * time.Minute)
	db := bun.NewDB(sqldb, pgdialect.New())
	if err := db.PingContext(ctx); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("store: ping: %w", err)
	}
	return &Store{db: db}, nil
}

func (s *Store) Close() error { return s.db.Close() }

func (s *Store) Ping(ctx context.Context) error { return s.db.PingContext(ctx) }

// Migrate applies pending migrations under an advisory lock.
func (s *Store) Migrate(ctx context.Context) error {
	sub, err := fs.Sub(migrationFiles, "migrations")
	if err != nil {
		return err
	}
	migrations := migrate.NewMigrations()
	if err := migrations.Discover(sub); err != nil {
		return fmt.Errorf("store: discover migrations: %w", err)
	}
	m := migrate.NewMigrator(s.db, migrations)
	if err := m.Init(ctx); err != nil {
		return fmt.Errorf("store: init migrations: %w", err)
	}
	if err := m.Lock(ctx); err != nil {
		return fmt.Errorf("store: lock migrations: %w", err)
	}
	defer func() { _ = m.Unlock(ctx) }()
	if _, err := m.Migrate(ctx); err != nil {
		return fmt.Errorf("store: migrate: %w", err)
	}
	return nil
}
