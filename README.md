Absolutely! Here's a comprehensive, professional README for your project:

# 🚀 Meme Coin Aggregator

A high-performance, real-time cryptocurrency data aggregator built with Node.js, TypeScript, and Socket.io. Aggregates meme coin data from multiple sources (DexScreener, Jupiter) with intelligent caching, WebSocket streaming, and advanced filtering capabilities.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![Test Coverage](https://img.shields.io/badge/coverage-82%25-brightgreen.svg)](https://github.com/utkarshkr-creator/meme-coin-aggregator)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
## 🌐 Live API / Base URL


The backend service is deployed on Railway:

**Base URL:** meme-coin-aggregator-production-0925.up.railway.app

## 🎥 Demo Video

[![Meme Coin Aggregator Demo](https://img.youtube.com/vi/SY-RB_vXEQ8/hqdefault.jpg)](https://www.youtube.com/watch?v=SY-RB_vXEQ8)

> 🔗 Click the thumbnail to watch the demo on YouTube.

## 🖥️ Frontend (UI Review)

For reviewing the UI and frontend implementation, refer to the separate frontend repository:

🔗 **Frontend Repo:** https://github.com/utkarshkr-creator/meme-coin-tracker.git

## ✨ Features

### 🔥 Core Features
- **Multi-Source Aggregation** - Combines data from DexScreener and Jupiter APIs
- **Real-Time WebSocket Streaming** - Live token updates, price alerts, and volume spikes
- **Intelligent Caching** - Redis-based caching with pattern-based invalidation
- **Advanced Filtering** - Filter by volume, liquidity, price changes, and more
- **Smart Deduplication** - Merges duplicate tokens across sources
- **Quality Scoring** - Ranks tokens based on liquidity, volume, and data completeness

### 🎯 Real-Time Capabilities
- **Live Token Updates** - Automatic refresh every 30 seconds
- **Price Change Alerts** - Notifications for significant price movements (>5%)
- **Volume Spike Detection** - Alerts for unusual volume increases (>200%)
- **Filtered Subscriptions** - Subscribe to specific token criteria via WebSocket

### ⚡ Performance
- **Rate Limiting** - Configurable per-IP rate limits
- **Connection Pooling** - Efficient HTTP connections with Keep-Alive
- **Exponential Backoff** - Automatic retry with intelligent backoff
- **Concurrent Load Handling** - Tested with 50+ concurrent requests

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Client Layer                             │
│  (REST API Clients + WebSocket Clients)                          │
└────────────────────┬────────────────────────────────────────────┘
                     │
┌────────────────────┴────────────────────────────────────────────┐
│                      Express API Server                          │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Controllers  │  Middleware  │  Routes  │  Error Handler  │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────┬────────────────────────────────────────────┘
                     │
┌────────────────────┴────────────────────────────────────────────┐
│                       Service Layer                              │
│  ┌──────────────┬─────────────────┬────────────┬─────────────┐ │
│  │TokenService  │WebSocketService │CacheService│AggregatorSvc│ │
│  └──────────────┴─────────────────┴────────────┴─────────────┘ │
└────────────────────┬────────────────────────────────────────────┘
                     │
┌────────────────────┴────────────────────────────────────────────┐
│                      External APIs Layer                         │
│  ┌────────────────────────┬─────────────────────────────────┐  │
│  │  DexScreener Client    │    Jupiter Client               │  │
│  │  (Token Search/Pairs)  │    (Token Metadata)             │  │
│  └────────────────────────┴─────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
                     │
┌────────────────────┴────────────────────────────────────────────┐
│                         Data Layer                               │
│  ┌────────────────────┬─────────────────────────────────────┐  │
│  │  Redis Cache       │    In-Memory State                  │  │
│  │  (Token Data, RL)  │    (Previous Snapshots)             │  │
│  └────────────────────┴─────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

## 🛠️ Tech Stack

**Backend Framework**
- Node.js 18+ / Express.js
- TypeScript 5.0

**Real-Time Communication**
- Socket.io (WebSocket)
- Server-Sent Events support

**Caching & Storage**
- Redis 7.x
- In-memory state management

**Testing**
- Jest (Unit, Integration, Load tests)
- Supertest (HTTP testing)
- Socket.io-client (WebSocket testing)

**Code Quality**
- ESLint + Prettier
- Husky (Git hooks)
- Winston (Logging)

## 📋 Prerequisites

- **Node.js** >= 18.0.0
- **Redis** >= 7.0.0
- **npm** or **yarn**

## 🚀 Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/utkarshkr-creator/meme-coin-aggregator.git
cd meme-coin-aggregator
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Set Up Environment Variables

```bash
cp .env.example .env
```

Edit `.env` with your configuration:

```env
# Server Configuration
PORT=3000
NODE_ENV=development

# Redis Configuration
REDIS_URL=redis://localhost:6379

# API Configuration
DEXSCREENER_BASE_URL=https://api.dexscreener.com/latest
JUPITER_BASE_URL=https://token.jup.ag

# Rate Limiting
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100

# Caching
CACHE_TTL_TOKENS=300
CACHE_TTL_SEARCH=600

# WebSocket
WS_PRICE_CHANGE_THRESHOLD=5
WS_VOLUME_SPIKE_THRESHOLD=200

# Jobs
DATA_REFRESH_INTERVAL=30000
```

### 4. Start Redis

```bash
# Using Docker
docker run -d -p 6379:6379 redis:7-alpine

# Or using local Redis
redis-server
```

### 5. Run the Application

```bash
# Development mode (with hot reload)
npm run dev

# Production mode
npm run build
npm start
```

The server will start at `http://localhost:3000`

## 📡 API Documentation

### REST Endpoints

#### Get Token List

```http
GET /api/tokens?limit=50&sortBy=volume&period=24h
```

**Query Parameters:**
- `limit` (optional): Number of tokens (default: 50, max: 100)
- `sortBy` (optional): `volume` | `priceChange` | `liquidity` (default: volume)
- `period` (optional): `24h` | `7d` (default: 24h)
- `minVolume` (optional): Minimum volume filter
- `minLiquidity` (optional): Minimum liquidity filter
- `cursor` (optional): Pagination cursor

**Response:**
```json
{
  "data": [
    {
      "token_address": "0x123...",
      "name": "Bonk",
      "ticker": "BONK",
      "price_sol": 0.000123,
      "price_usd": 0.0145,
      "volume_24h_sol": 125000,
      "volume_24h_usd": 15000000,
      "liquidity_sol": 50000,
      "liquidity_usd": 6000000,
      "price_change_24h": 15.5,
      "price_change_7d": 45.2,
      "market_cap_usd": 145000000,
      "quality_score": 95,
      "sources": ["dexscreener", "jupiter"]
    }
  ],
  "meta": {
    "total": 150,
    "limit": 50,
    "cursor": "eyJ0b2tlbl9hZGRyZXNzIjoiMHgxMjMifQ=="
  }
}
```

#### Search Tokens

```http
GET /api/tokens/search/:query
```

**Example:**
```bash
curl http://localhost:3000/api/tokens/search/bonk
```

#### Get Single Token

```http
GET /api/tokens/:address
```

**Example:**
```bash
curl http://localhost:3000/api/tokens/0x123...
```

#### Health Check

```http
GET /health
```

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00Z",
  "uptime": 3600,
  "redis": "connected",
  "memory": {
    "heapUsed": 45.2,
    "heapTotal": 128
  }
}
```

### WebSocket Events

#### Connect to WebSocket

```javascript
import io from 'socket.io-client';

const socket = io('http://localhost:3000');
```

#### Subscribe to All Token Updates

```javascript
socket.on('tokens:refresh', (tokens) => {
  console.log('Received token update:', tokens);
});
```

#### Subscribe to Specific Token

```javascript
socket.emit('subscribe:token', { tokenAddress: '0x123...' });

socket.on('token:update', (token) => {
  console.log('Token update:', token);
});
```

#### Subscribe to Filtered Updates

```javascript
socket.emit('subscribe:filters', {
  sortBy: 'volume',
  period: '24h',
  minVolume: 10000,
  minLiquidity: 50000,
  limit: 10
});

socket.on('tokens:filtered:refresh', (tokens) => {
  console.log('Filtered tokens:', tokens);
});
```

#### Price Alerts

```javascript
socket.on('price:alert', (data) => {
  console.log(`Price alert: ${data.ticker} changed by ${data.changePercent}%`);
});
```

#### Volume Spikes

```javascript
socket.on('volume:spike', (data) => {
  console.log(`Volume spike: ${data.ticker} increased by ${data.spikePercent}%`);
});
```

#### Unsubscribe

```javascript
socket.emit('unsubscribe:token', { tokenAddress: '0x123...' });
socket.emit('unsubscribe:filters');
```

## 🧪 Testing

### Run All Tests

```bash
npm test
```

### Run with Coverage

```bash
npm run test:coverage
```

### Run Specific Test Suites

```bash
# Unit tests only
npm test -- tests/unit

# Integration tests
npm test -- tests/integration

# Load tests
npm test -- tests/load
```

### Test Coverage

Current coverage: **82.4%**

```
-------------------|---------|----------|---------|---------|
File               | % Stmts | % Branch | % Funcs | % Lines |
-------------------|---------|----------|---------|---------|
All files          |   82.4  |   75.43  |  80.67  |  82.56  |
 controllers       |   88.88 |   81.81  |   100   |  88.88  |
 services          |   82.94 |   71.79  |  84.37  |  83.23  |
 clients           |   77.14 |   78.04  |  70.96  |  77.66  |
-------------------|---------|----------|---------|---------|
```

## 🐳 Docker Deployment

### Using Docker Compose

```bash
docker-compose up -d
```

**docker-compose.yml:**
```yaml
version: '3.8'

services:
  api:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - REDIS_URL=redis://redis:6379
    depends_on:
      - redis
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data
    restart: unless-stopped

volumes:
  redis-data:
```

### Manual Docker Build

```bash
# Build image
docker build -t meme-coin-aggregator .

# Run container
docker run -d \
  -p 3000:3000 \
  -e REDIS_URL=redis://host.docker.internal:6379 \
  --name meme-coin-api \
  meme-coin-aggregator
```

## 📊 Performance Benchmarks

### Load Test Results

```
✓ 50 concurrent health checks: 29ms (0.58ms avg)
✓ 30 concurrent API requests: 815ms (27ms avg)
✓ Burst traffic (5x10 requests): 550ms (100% success)
✓ Sustained load (5s): 49 requests (100% success)
✓ p95 response time: 4ms
✓ p99 response time: 4ms
```

### Cache Performance

```
✓ 100 concurrent cache operations: <5s
✓ Pattern deletion (50 keys): <2s
✓ Cache hit rate: >90%
```

## 🔧 Configuration

### Rate Limiting

Configure in `.env`:
```env
RATE_LIMIT_WINDOW_MS=60000    # 1 minute
RATE_LIMIT_MAX_REQUESTS=100   # 100 requests per window
```

### Caching Strategy

```env
CACHE_TTL_TOKENS=300          # 5 minutes
CACHE_TTL_SEARCH=600          # 10 minutes
CACHE_TTL_SINGLE=180          # 3 minutes
```

### WebSocket Thresholds

```env
WS_PRICE_CHANGE_THRESHOLD=5   # 5% price change alerts
WS_VOLUME_SPIKE_THRESHOLD=200 # 200% volume spike alerts
```

## 🛡️ Security Considerations

### Implemented
- ✅ Rate limiting per IP
- ✅ Input validation
- ✅ Error message sanitization
- ✅ CORS configuration


## 📈 Monitoring

### Health Check

```bash
curl http://localhost:3000/health
```

### Logs

Logs are written to:
- **Console** (development)
- **File** (production): `logs/app.log`, `logs/error.log`


## 🙏 Acknowledgments

- [DexScreener](https://dexscreener.com) - Token pair data
- [Jupiter Aggregator](https://jup.ag) - Token metadata
- Socket.io team for excellent WebSocket library
- The open-source community




**Made with ❤️ and TypeScript**