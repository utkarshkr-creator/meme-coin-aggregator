# Meme Coin Aggregator

Real-time service that unifies trending meme-coin data from multiple liquidity sources, enriches it, and exposes the result over REST and WebSocket interfaces.

## Architecture

- **HTTP API (Express)** – `src/app.ts` wires security middleware (Helmet, CORS), structured logging, health checks, and mounts `token.routes.ts` which offers list/detail/search endpoints under `/api/tokens`. Rate limiting and centralized error handling sit in `src/middlewares/`.
- **Token ingestion** – `TokenDataService` orchestrates concurrent fetches from the resilient API clients (`DexScreenerClient`, `JupiterClient`) that inherit retry/rate-limit logic from `BaseApiClient`. Responses become `Token` models defined in `src/types/`.
- **Aggregation layer** – `AggregatorService` deduplicates by token address, reconciles metrics according to configured source priority, filters/sorts results, and computes quality scores plus change detection used for alerts.
- **Caching & rate control** – `CacheService` wraps Redis for TTL-based caching, cursor pagination snapshots, and request-per-minute tracking that backs client rate limiting as well as API-level throttling.
- **Real-time updates** – `WebSocketService` (Socket.io) emits `token:update`, `tokens:refresh`, `price:alert`, and `volume:spike`. A schedulable `DataRefreshJob` (node-cron) can broadcast periodic updates and alerts using thresholds from `src/config`.

## Running The Project

**Prerequisites**
- Node.js 18+ and npm
- Redis 7 (use the included `docker-compose.yml` or your own instance)
- A `.env` file. Quick start: `cp .env.example .env` (or create manually) and adjust values like:

```dotenv
NODE_ENV=development
PORT=3000
REDIS_URL=redis://localhost:6379
CACHE_TTL_DEFAULT=30
CACHE_TTL_TOKEN_LIST=30
CACHE_TTL_TOKEN_DETAIL=60
DATA_REFRESH_INTERVAL=30000
WS_PRICE_CHANGE_THRESHOLD=5
WS_VOLUME_SPIKE_THRESHOLD=50
DEXSCREENER_BASE_URL=https://api.dexscreener.com/latest/dex
JUPITER_BASE_URL=https://lite-api.jup.ag
GECKOTERMINAL_BASE_URL=https://api.geckoterminal.com/api/v2
```

**Steps**
1. Install dependencies: `npm install`.
2. Start Redis (example): `docker compose up -d redis`.
3. Run the API + WebSocket server in watch mode: `npm run dev`.
4. For production builds: `npm run build` then `npm start`.
5. Optional quality gates: `npm test`, `npm run lint`, and `npm run format`.

Health: `GET /health`. REST under `/api/tokens`. WebSocket connects to the same host.

## API Quick Reference
- `GET /api/tokens?limit=20&sortBy=volume&period=24h&minVolume=0&minLiquidity=0` — list with cursor pagination (`pagination.nextCursor`).
- `GET /api/tokens/:address` — single token by address.
- `GET /api/tokens/search/:query` — search by ticker/name.

## WebSocket Events
- `token:update` — single token update payload `{ token, timestamp }`.
- `tokens:refresh` — batch refresh `{ tokens, count, timestamp }`.
- `price:alert` — `{ token, changePercent, timestamp }`.
- `volume:spike` — `{ token, spikePercent, timestamp }`.
- Client rooms: emit `subscribe:token` with a token address to receive scoped updates.
- Filtered streams: emit `subscribe:filters` with `{ sortBy, period, minVolume, minLiquidity, limit }` to receive filtered `tokens:refresh` snapshots over WS only (no extra HTTP calls). Use `unsubscribe:filters` to leave.

## Enable Periodic Refresh (optional)
Wire the job to broadcast periodic updates via WebSocket:
- Add import in `src/server.ts`: `import { DataRefreshJob } from './jobs/dataRefresh.job';` (src/server.ts:1).
- After `wsService.initialize()` call, add: `DataRefreshJob.getInstance().initialize(wsService);` (around src/server.ts:31).

## Testing & Tools
- Run tests: `npm test` (unit + integration + load).
- Postman collection: `postman/collection.json`.

## Deploy (example)
- Build: `npm run build` and run with `PORT` and `REDIS_URL` set.
- Platforms: Render/Railway/Fly. Use a managed Redis or the included Redis container.

## Notes
- 1h/24h metrics are populated; 7d depends on available source data.
- Jupiter search lacks direct price/liquidity; values may be 0 unless enriched.
