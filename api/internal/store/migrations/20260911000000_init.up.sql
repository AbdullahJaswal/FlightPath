CREATE EXTENSION IF NOT EXISTS postgis;

--bun:split

CREATE EXTENSION IF NOT EXISTS pg_trgm;

--bun:split

CREATE TABLE airports (
    id           bigint PRIMARY KEY,
    ident        text NOT NULL UNIQUE,
    type         text NOT NULL,
    name         text NOT NULL,
    lat          double precision NOT NULL,
    lon          double precision NOT NULL,
    elevation_ft integer,
    continent    text,
    iso_country  text,
    iso_region   text,
    municipality text,
    gps_code     text,
    iata_code    text,
    local_code   text,
    geom         geography(Point, 4326) GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(lon, lat), 4326)::geography) STORED
);

--bun:split

CREATE INDEX airports_geom_idx ON airports USING gist (geom);

--bun:split

CREATE INDEX airports_iata_idx ON airports (iata_code) WHERE iata_code IS NOT NULL;

--bun:split

CREATE INDEX airports_name_trgm_idx ON airports USING gin (name gin_trgm_ops);

--bun:split

CREATE TABLE airlines (
    icao     text PRIMARY KEY,
    iata     text,
    name     text NOT NULL,
    callsign text,
    country  text
);

--bun:split

CREATE TABLE aircraft (
    icao24        text PRIMARY KEY,
    registration  text,
    type_code     text,
    model         text,
    manufacturer  text,
    operator      text,
    operator_icao text,
    owner         text
);

--bun:split

CREATE INDEX aircraft_registration_idx ON aircraft (registration) WHERE registration IS NOT NULL;

--bun:split

CREATE TABLE flight_meta (
    callsign   text NOT NULL,
    source     text NOT NULL,
    found      boolean NOT NULL,
    payload    jsonb,
    fetched_at timestamptz NOT NULL,
    expires_at timestamptz NOT NULL,
    PRIMARY KEY (callsign, source)
);

--bun:split

CREATE TABLE positions (
    icao24       text NOT NULL,
    ts           timestamptz NOT NULL,
    lat          double precision NOT NULL,
    lon          double precision NOT NULL,
    baro_alt_m   double precision,
    velocity_ms  double precision,
    heading_deg  double precision,
    vert_rate_ms double precision,
    on_ground    boolean NOT NULL DEFAULT false,
    PRIMARY KEY (icao24, ts)
);

--bun:split

CREATE INDEX positions_ts_brin_idx ON positions USING brin (ts);

--bun:split

CREATE TABLE api_usage (
    provider   text NOT NULL,
    period     text NOT NULL,
    count      integer NOT NULL DEFAULT 0,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (provider, period)
);
