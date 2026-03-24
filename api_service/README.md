# Zenit API

> Real-time cryptocurrency trading intelligence platform, powered by Hedera.

---

## What is Zenit?

Zenit is a **crypto market intelligence API** that delivers live trading signals, vault performance data, and AI-powered market analysis — all in one unified backend.

Think of it as the brain behind a crypto app: it watches the markets 24/7, detects trading opportunities, tracks on-chain vault performance, and answers user questions about the market through an AI assistant.

---

## What Can It Do?

### Real-Time Market Signals

Zenit continuously monitors cryptocurrency prices and generates actionable trading signals using proven technical indicators:

| Indicator | What It Measures |
|---|---|
| **RSI** (Relative Strength Index) | Overbought / oversold conditions |
| **ADX** (Average Directional Index) | Trend strength |
| **PSAR** (Parabolic SAR) | Trend reversal points |

Signals are pushed to users via **Firebase Cloud Messaging** (push notifications) and stored for historical review.

### Trading Vaults

Zenit powers a **vault-based trading system** where:

- Users deposit funds into on-chain vaults managed by automated strategies
- Each vault tracks live performance: ROI, win rate, total trades, TVL
- Users can view open/closed positions, contribution history, and earnings
- Vaults are scoped across multiple blockchains (Hedera, EVM chains, Solana, Aptos, Cardano, BNB)

### AI Market Assistant

Users can ask Zenit questions in natural language — e.g. *"Should I buy Bitcoin now?"* or *"How is the market today?"* — and receive **technical analysis** backed by real OHLCV data, RSI readings, and support/resistance levels.

Powered by **GPT-4o-mini** with live market data injection.

### Multi-Chain Support

| Chain | Status |
|---|---|
| Hedera | Primary |
| Ethereum / EVM chains | Supported |
| Solana | Supported |
| Aptos | Supported |
| Cardano | Supported |
| BNB Chain | Supported |

### Real-Time Data Streaming

WebSocket connection delivers **live price snapshots** to connected clients every ~60 seconds, including OHLCV candles across 5 timeframes and pre-computed indicators.

---

## Who Is This For?

- **Mobile app developers** building crypto trading apps on top of Zenit's API
- **Trading platform operators** needing signal generation and vault management infrastructure
- **Analytics teams** pulling historical OHLCV data and technical indicators

---

## Architecture at a Glance

```
Client App (Mobile / Web)
         │
         ▼
    Zenit API (FastAPI)
    ├── Auth          → Firebase / Telegram / JWT
    ├── Signals       → RSI / ADX / PSAR detection engine
    ├── Vaults        → On-chain vault data & user earnings
    ├── AI Assistant  → GPT-4o-mini + live market data
    └── WebSocket     → Real-time OHLCV + indicator streaming
         │
         ▼
   PostgreSQL  +  Redis Cache
```

---

## Getting Started

### 1. Prerequisites

- Python 3.11+
- PostgreSQL database
- (Optional) Redis for caching

### 2. Install

```bash
pip install -r requirements-core.txt
```

### 3. Configure

Copy the example environment file and fill in your secrets:

```bash
cp .env.example .env
```

Key settings to configure:

| Setting | Description |
|---|---|
| `DATABASE_URL` | Your PostgreSQL connection string |
| `SCHEMA_1` | Database schema name (e.g. `production`) |
| `REDIS_HOST` | Redis server for caching (optional) |
| `ENCODE_KEY` | Secret key for JWT token signing |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Firebase project credentials |
| `BOT_TOKEN` | Telegram Bot token (for Mini App login) |
| `GPT_KEY` | OpenAI API key (for AI Assistant) |
| `DOC_PASSWORD` | Password to access API documentation |

### 4. Run

```bash
uvicorn app.main:app --reload --port 8000
```

API documentation will be available at `http://localhost:8000/docs` (enter your `DOC_PASSWORD` to access).

---

## API Summary

| Feature | Endpoint | Auth |
|---|---|---|
| User login (Firebase) | `POST /auth/firebase/login` | No |
| User login (Telegram) | `POST /auth/telegram/login` | No |
| Refresh session | `POST /auth/refresh` | No |
| Revoke session | `POST /auth/logout` | No |
| List vaults | `GET /vaults` | No |
| Vault details | `GET /vaults/{id}/info` | No |
| Vault statistics | `GET /vaults/{id}/stats` | No |
| Vault positions | `GET /vaults/{id}/positions` | No |
| User vault earnings | `GET /user/vaults/earnings` | No |
| List tokens | `GET /tokens` | No |
| Token details | `GET /tokens/{symbol}` | No |
| Price history | `GET /prices/history` | No |
| RSI indicator | `GET /signal-tools/rsi_heatmap` | No |
| ADX indicator | `GET /signal-tools/adx` | No |
| PSAR indicator | `GET /signal-tools/psar` | No |
| All signals (RSI) | `GET /signal-tools/rsi_heatmap/latest` | No |
| AI chat | `POST /ai-assistant/chat` | No |
| Signal notifications | `GET /notifications` | No |
| Favorite tokens | `GET /favorites`, `POST /favorites`, `DELETE /favorites` | JWT |
| User swap history | `GET /user/swaps`, `POST /user/swaps` | No |
| Vault transactions | `GET /user/vaults/transactions`, `POST /user/vaults/transactions` | No |
| Supported chains | `GET /chains` | No |
| Set preferred chain | `POST /chains/user/choose-chain` | JWT |
| AdMob config | `GET /admob/config` | No |
| WebSocket stream | `WS /ws` | No |

> **Note:** JWT authentication is required only for user-specific write operations (favorites, setting chain preference). All read operations are public.

---

## Data Refresh Rates

| Data Type | Frequency |
|---|---|
| OHLCV candle data | ~60 seconds (via Binance WebSocket) |
| Technical indicators | Computed per candle update cycle |
| Vault statistics | On-demand (from database) |
| AI market data | On-demand (1-day candles) |
| WebSocket push | Every 60 seconds (configurable) |

---

## Contact

For technical questions about integrating with the Zenit API, refer to the inline API documentation at `/docs` once the service is running.
