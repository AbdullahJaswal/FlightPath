# Flightpath

Live aircraft on a world map with flight, airport and airline details.

Positions come from the OpenSky Network. Routes come from adsbdb, schedules from aviationstack, and reference data from OurAirports, OpenFlights and the OpenSky aircraft database. The whole thing runs on free tiers and is a personal, non-commercial project.

## Stack

| Part | Choice |
|---|---|
| `api` | Go 1.27, Gin, Huma for typed handlers and OpenAPI 3.1, Bun ORM, PostgreSQL 18 with PostGIS, Redis 8, WebSocket streaming |
| `web` | TanStack Start, React, shadcn/ui, TanStack Query, client generated from the OpenAPI document with orval (in progress) |
| `infra` | Docker Compose for the whole stack |

## How it works

**Polling on a credit budget.** OpenSky grants a daily credit budget and a global query costs 4 credits. One poller instance, elected through a Redis lock, polls every 15 seconds while browsers are connected and every 15 minutes when nobody is watching. The interval stretches automatically as the day's credits run down, and a reserve keeps the idle heartbeat alive.

**Snapshots.** Each poll becomes an immutable in-memory snapshot indexed by address, callsign and one-degree grid cell. Bounding-box queries thin the result to a stable subset when a viewport holds more aircraft than the client asked for. The snapshot is also written to Redis and announced over pub/sub so every API instance serves the same data.

**Live stream.** Browsers open one WebSocket, send their viewport, and receive the aircraft inside it after every poll. The client interpolates movement between polls from speed and heading.

**Two cache tiers.** An in-process otter cache sits in front of Redis. Misses collapse through singleflight, Redis hits backfill the local tier, and not-found results are cached too.

**Metadata on demand.** Routes come from adsbdb and are kept for a week. Schedules come from aviationstack whose free plan allows 100 requests a month, so a schedule is fetched only when a user asks for it, counted against a hard cap in Postgres, and kept until the flight has landed.

**Trails.** Positions are stored only when five minutes passed, the heading turned by more than ten degrees or the altitude moved by more than a hundred metres. Six hours are retained. When the stored trail is too short the OpenSky track endpoint fills in the full path.

## Run locally

Requirements: Docker. Go 1.27 is only needed to run the tests on the host.

```sh
cp .env.example .env
docker compose -f infra/docker-compose.yml up -d --build
docker compose -f infra/docker-compose.yml run --rm --entrypoint /seed api
```

Everything runs in Compose. The API image is built from `api/`, migrations run on start, and port 8080 is published. The seed downloads about 110 MB of reference data and takes a couple of minutes. `docker compose -f infra/docker-compose.yml watch` rebuilds the API whenever a source file changes, and `logs -f api` follows its output.

| URL | Purpose |
|---|---|
| `http://localhost:8080/api/v1/docs` | Interactive API reference |
| `http://localhost:8080/api/v1/openapi.json` | OpenAPI 3.1 document, the input for the web client generator |
| `http://localhost:8080/healthz` and `/readyz` | Liveness and readiness |

Without OpenSky credentials the poller runs anonymously with 400 credits a day. Create an API client on your OpenSky account page and put the id and secret in `.env` for the 4,000 credit budget.

`docker compose -f infra/docker-compose.yml run --rm api openapi` prints the OpenAPI document without starting a server.

## API

All routes are under `/api/v1`, respond with JSON, and require no authentication. Errors use the RFC 9457 problem format.

| Operation | Route | Notes |
|---|---|---|
| `listAircraft` | `GET /aircraft?west&south&east&north&limit` | Positions inside a box, thinned to `limit` |
| `getAircraft` | `GET /aircraft/{icao24}` | Live state, registration data and recent trail |
| `getFlight` | `GET /flights/{callsign}` | Live state, airline, route and aircraft |
| `getFlightSchedule` | `GET /flights/{callsign}/schedule` | aviationstack schedule, spends monthly budget on a miss |
| `getAirport` | `GET /airports/{code}` | By ICAO ident or IATA code |
| `search` | `GET /search?q` | Aircraft, airports and airlines |
| `getStats` | `GET /stats` | Snapshot age, poller mode, credits and quotas |
| | `GET /live` | WebSocket stream |

The stream sends `{"type":"hello"}` on connect. The client sends `{"type":"viewport","west":..,"south":..,"east":..,"north":..,"limit":1500}` whenever the map moves and receives `{"type":"snapshot","time":..,"total":..,"count":..,"aircraft":[..]}` immediately and after every poll.

Requests are rate limited per client IP and CORS is restricted to the configured origins.

## Configuration

Settings are read from the environment. `.env.example` lists them all.

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL`, `REDIS_URL` | local compose values | Storage |
| `CORS_ORIGINS` | `http://localhost:3000` | Allowed browser origins, comma separated |
| `POLLER_ENABLED` | `true` | Run the OpenSky poller on this instance |
| `OPENSKY_CLIENT_ID`, `OPENSKY_CLIENT_SECRET` | empty | OAuth2 client, anonymous when empty |
| `OPENSKY_DAILY_CREDITS`, `OPENSKY_CREDIT_RESERVE` | `4000`, `400` | Credit budget and idle reserve |
| `OPENSKY_ACTIVE_INTERVAL`, `OPENSKY_IDLE_INTERVAL` | `15s`, `15m` | Poll intervals with and without viewers |
| `AVIATIONSTACK_API_KEY`, `AVIATIONSTACK_MONTHLY_CAP` | empty, `95` | Schedule lookups are disabled without a key |
| `TRAIL_RETENTION` | `6h` | How long stored positions are kept |
| `RATE_LIMIT_RPS`, `RATE_LIMIT_BURST` | `10`, `30` | Per-IP limits |

## Tests

```sh
cd api
go test ./...
TEST_DATABASE_URL=postgres://flightpath:flightpath@localhost:5432/flightpath?sslmode=disable go test ./...
```

The database tests migrate into a throwaway schema and drop it afterwards, so they are safe to run against the Compose database, which publishes port 5432 to the host.

## Data sources

- OpenSky Network for live positions, tracks and the aircraft database, non-commercial use
- adsbdb for callsign routes
- aviationstack for schedules
- OurAirports for airports, public domain
- OpenFlights for airlines
