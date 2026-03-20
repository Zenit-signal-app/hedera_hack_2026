# Zenit Keeper Service

Off-chain service for **Zenit Perpetual DEX** on **Hedera Testnet** (EVM). It handles:

- Automatic **TP / SL / Liquidation** closes on-chain (`keeperClosePosition` with fallback where configured)
- **ZenitOracle** price publishing (when `ORACLE_PRIVATE_KEY` is set and authorized as updater)
- **zUSDC (HTS) faucet** — transfers from faucet Hedera account to user (`0.0.x` or `0x…`)
- **`POST /deposit/hts-sync`** — verifies HTS transfer via Mirror Node, then `depositFor` on the DEX
- REST API consumed by the frontend (`/orders`, `/faucet/*`, `/deposit/hts-sync`, …)
- Optional **`GET /cache/reset?wallet=0x…`** for UI refresh signals
- SQLite (Prisma) for order persistence

## Architecture

```
 ┌─────────────┐      ┌──────────┐      ┌───────────────┐
 │ Price Feeds │─────▶│  Watcher │─────▶│  Executor     │
 │ (Pyth/DIA…) │      │ (tick)   │      │ (ethers tx)   │
 └─────────────┘      └────┬─────┘      └───────┬───────┘
                           │                     │
                      ┌────▼─────┐          ┌────▼─────┐
                      │  Prisma  │          │ Hedera   │
                      │  SQLite  │          │ EVM RPC  │
                      └──────────┘          └──────────┘

                     + HTS faucet signer (FAUCET_PRIVATE_KEY)
                     + optional ORACLE_PRIVATE_KEY
```

`txManager` serializes transactions per private key (separate nonce queues).

Recommended:

- `KEEPER_PRIVATE_KEY` — closes / general keeper txs
- `FAUCET_PRIVATE_KEY` — faucet only (optional but recommended)
- `ORACLE_PRIVATE_KEY` — oracle updater only (optional)

## Quick start

```bash
cd keeper
npm install
cp .env.example .env   # fill RPC, CHAIN_ID=296, contracts, keys, FAUCET_HTS_TOKEN_ID
npx prisma generate
npx prisma db push
npm run dev
```

Windows: if `prisma generate` fails with EPERM, try `npx prisma db push --skip-generate` then restart.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Run with hot-reload (`tsx watch`) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled JS |
| `npm run db:push` | Push Prisma schema to SQLite |

## API endpoints (default `:3100`)

- `GET /health`
- `GET /diagnostic`
- `GET /orders?status=Open&limit=500`
- `GET /orders/:id`
- `PUT /orders/:id/tp-sl`
- `POST /orders/sync`
- `POST /orders/tp-sl`
- `POST /deposit/hts-sync`
- `GET /logs/recent?limit=200`
- `GET /cache/reset?wallet=0x…`
- `GET /faucet/status?wallet=…`
- `POST /faucet/zusdc` — body `{ "walletAddress": "0.0.xxx" | "0x..." }`

## Environment variables (key)

| Variable | Description |
|----------|-------------|
| `RPC_URL` | Hedera testnet JSON-RPC |
| `CHAIN_ID` | **296** (Hedera testnet EVM) |
| `PERP_DEX_ADDRESS` | PerpetualDEX contract |
| `TOKEN_ADDRESS` | zUSDC EVM address |
| `ORACLE_ADDRESS` | ZenitOracle contract |
| `KEEPER_PRIVATE_KEY` | Keeper signer |
| `FAUCET_PRIVATE_KEY` | Faucet signer (optional; falls back to keeper) |
| `FAUCET_ACCOUNT_ID` | Optional explicit faucet account `0.0.x` |
| **`FAUCET_HTS_TOKEN_ID`** | **HTS token ID** for zUSDC (faucet + deposit verification) |
| `ORACLE_PRIVATE_KEY` | Oracle updater (optional) |
| `API_PORT` | Default `3100` |
| `POLL_INTERVAL_MS` | Watcher interval (default `5000`) |

See `src/config.ts` and `.env.example` for the full list.

## Markets

Watcher / order types use markets such as **BTCUSD**, **ETHUSD**, **HBARUSD** (see `keeper/src/types.ts`).

## Operational notes

- Keep **one** keeper instance per deployment to avoid nonce conflicts.
- Fund faucet wallet with **HBAR** (fees) and **zUSDC** (HTS) for claims.
- If the UI shows **Failed to fetch** on faucet, the browser cannot reach this API — check `API_PORT` and firewall.
