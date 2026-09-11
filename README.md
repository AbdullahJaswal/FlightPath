# Flightpath

Live aircraft on a world map with flight, airport and airline details. Positions come from the OpenSky Network, routes from adsbdb, schedules from aviationstack, and reference data from OurAirports, OpenFlights and the OpenSky aircraft database. A personal, non-commercial project that runs on free tiers.

## Stack

- **api**: Go, Gin, Huma for typed handlers and OpenAPI 3.1, Bun ORM, PostgreSQL with PostGIS, Redis, WebSocket streaming
- **web**: TanStack Start, React, shadcn/ui, TanStack Query, client generated from the OpenAPI document with orval (in progress)
- **infra**: Docker Compose for the whole stack

## Layout

| Path | Contents |
|---|---|
| `api/cmd/api` | HTTP server and OpenSky poller |
| `api/cmd/seed` | Loads airport, airline and aircraft reference data |
| `api/internal` | Config, snapshot index, tiered cache, poller, upstream clients, store, API operations, live hub |
| `infra` | Compose file for the API, PostgreSQL and Redis |
| `.github/workflows` | Lint, tests and image build |

## How it works

- One poller instance fetches global positions from OpenSky on a credit-aware schedule and shares each snapshot with every instance through Redis.
- Browsers open a WebSocket, send their viewport and receive the aircraft inside it after every poll.
- An in-process cache in front of Redis serves metadata. Invalidations fan out to all instances and expirations are bounded so nothing outlives its source.
- Routes and schedules are fetched on demand and counted against the upstream budgets.

## Run

```sh
cp .env.example .env
docker compose -f infra/docker-compose.yml up -d --build
docker compose -f infra/docker-compose.yml run --rm --entrypoint /seed api
```

API reference at `http://localhost:8080/api/v1/docs`, OpenAPI document at `http://localhost:8080/api/v1/openapi.json`. Settings are listed in `.env.example`.

```sh
cd api && go test ./...
```

## Data sources

- OpenSky Network, non-commercial use
- adsbdb
- aviationstack
- OurAirports
- OpenFlights
