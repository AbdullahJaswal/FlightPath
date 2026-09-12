# Flightpath

Live aircraft on a world map or a globe with flight, airport and airline details, altitude colours, day and night, weather radar, filters, insights, a replay of the last hour and a command palette. Positions come from adsb.fi, routes from adsbdb, schedules from aviationstack, photos from Planespotters.net, and reference data from OurAirports, OpenFlights and the OpenSky aircraft database. A personal, non-commercial project that runs on free tiers.

## Stack

- **api**: Go, Gin, Huma for typed handlers and OpenAPI 3.1, Bun ORM, PostgreSQL with PostGIS, Redis, WebSocket streaming
- **web**: TanStack Start, React, shadcn/ui, TanStack Query, react-simple-maps, Biome, API client generated from the OpenAPI document with orval
- **infra**: Docker Compose for the whole stack

## Layout

| Path | Contents |
|---|---|
| `api/cmd/api` | HTTP server and position poller |
| `api/cmd/seed` | Loads airport, airline and aircraft reference data |
| `api/internal` | Config, snapshot index, tiered cache, poller, upstream clients, store, API operations, live hub |
| `web/src/routes` | Map, about, terms and privacy pages plus the `/bff` server route |
| `web/src/lib/api` | Generated API client and zod schemas |
| `web/src/components` | Map and globe layers, flight and airport panels, search, palette, menus, shadcn/ui |
| `web/server.mjs` | Production server: static assets, SSR handler, WebSocket proxy |
| `infra` | Compose file for the web app, API, PostgreSQL and Redis |
| `.github/workflows` | Lint, tests, client drift check and image builds |

## How it works

- One poller instance fetches positions one 250 nm circle at a time: the areas viewers are looking at first, then a sweep of the whole globe that revisits each circle as often as its traffic warrants. Snapshots are shared with every instance through Redis.
- Browsers open a WebSocket, send their viewport and receive the aircraft inside it after every poll. The map draws them on a canvas and extrapolates positions between snapshots.
- The browser only talks to the web app. Its `/bff` route forwards API calls with cache headers and ETags intact, and the live stream is proxied to the API WebSocket.
- An in-process cache in front of Redis serves metadata. Invalidations fan out to all instances and expirations are bounded so nothing outlives its source.
- Routes, schedules and photos are fetched on demand and counted against the upstream budgets. Stored positions feed the trails and the replay.

## Run

```sh
cp .env.example .env
docker compose -f infra/docker-compose.yml up -d --build
docker compose -f infra/docker-compose.yml run --rm --entrypoint /seed api
```

Web app at `http://localhost:3000` as a production build. For live reload while working on it run `cd web && pnpm dev` with the stack up. API reference at `http://localhost:8080/api/v1/docs`, OpenAPI document at `http://localhost:8080/api/v1/openapi.json`. Settings are listed in `.env.example`.

```sh
cd api && go test ./...
cd web && pnpm api && pnpm lint && pnpm typecheck
```

`pnpm api` regenerates the client from the running API.

## Data sources

- adsb.fi, personal non-commercial use with attribution
- adsbdb
- aviationstack
- OurAirports
- OpenFlights
- Planespotters.net photos, non-commercial use with credit
- RainViewer weather radar, personal use
- NASA GIBS daily imagery and Esri basemap tiles
