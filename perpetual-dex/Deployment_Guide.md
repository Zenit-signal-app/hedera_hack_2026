# Deployment Guide — Zenit Perp DEX (Hedera)

## Overview

This repository targets **Hedera Testnet** (EVM `chainId` **296**, RPC e.g. Hashio `https://testnet.hashio.io/api`):

- **Smart contracts (Hardhat)** — `PerpetualDEX`, `ZenitOracle`, collateral zUSDC (HTS / EVM alias).
- **Frontend (React + Vite)** — trading UI; **HashPack** via `@hashgraph/hedera-wallet-connect` + `VITE_WALLETCONNECT_PROJECT_ID`.
- **Keeper (Node.js)** — TP/SL/Liquidation closes on-chain, oracle publishing, **HTS zUSDC faucet**, **`POST /deposit/hts-sync`** after user HTS transfer to DEX.
- **Keeper DB** — Prisma + SQLite (`keeper/prisma/dev.db`).

Ensure **keeper is reachable from the browser** at `VITE_KEEPER_URL` (CORS enabled). If the faucet UI shows **Failed to fetch**, the keeper process is usually not running or the URL is wrong.

---

## 1. Server Requirements

- Node.js 20+
- SQLite (bundled via Prisma; no separate DB server)
- Hedera-compatible JSON-RPC (testnet)
- Wallets funded with **HBAR** (gas) and faucet wallet with **zUSDC** (HTS) for claims
- Optional: PM2/systemd for long-running keeper

---

## 2. Environment Setup

### Frontend (`frontend/`)

1. Copy or edit `frontend/.env` (see `frontend/.env.example` patterns):
   - `HEDERA_TESTNET_RPC_URL` or `VITE_*` RPC vars as used by your build — **must match** Hedera testnet.
   - `VITE_PERP_DEX_ADDRESS` — deployed `PerpetualDEX`.
   - `VITE_TOKEN_ADDRESS` — zUSDC EVM address (HTS token alias).
   - `VITE_ZUSDC_TOKEN_ID` — HTS token ID (e.g. `0.0.xxxxx`) for UI copy/import.
   - `VITE_ORACLE_ADDRESS` — `ZenitOracle`.
   - `VITE_KEEPER_URL` — **required** for TP/SL, orders, faucet, deposit sync. Local: `http://localhost:3100`. Production: `https://keeper.yourdomain.com` (HTTPS + valid CORS).
   - `VITE_WALLETCONNECT_PROJECT_ID` — from [WalletConnect Cloud](https://cloud.walletconnect.com) (HashPack).
2. `cd frontend && npm install`
3. Dev: `npm run dev`
4. Production: `npm run build` → serve `frontend/dist` (static hosting).

### Keeper (`keeper/`)

1. Edit `keeper/.env`:
   - `RPC_URL` — Hedera testnet JSON-RPC.
   - `CHAIN_ID=296`
   - `PERP_DEX_ADDRESS`, `TOKEN_ADDRESS`, `ORACLE_ADDRESS`
   - `KEEPER_PRIVATE_KEY` — signer for closes / oracle (if same key)
   - `FAUCET_PRIVATE_KEY` — optional; dedicated faucet account (recommended)
   - `FAUCET_ACCOUNT_ID` — optional; if omitting, resolved from key
   - **`FAUCET_HTS_TOKEN_ID`** — must match deployed zUSDC HTS token (also used by deposit verification)
   - `ORACLE_PRIVATE_KEY` — optional; must be authorized updater on `ZenitOracle`
   - `API_PORT=3100` (default)
2. `cd keeper && npm install && npx prisma generate && npx prisma db push`
3. `npm run dev` (dev) or `npm run build && npm start` (prod)
4. Verify:
   - `GET http://127.0.0.1:3100/health`
   - `GET http://127.0.0.1:3100/orders?status=Open&limit=500`

### Faucet (HTS)

- Faucet is **server-side**: keeper sends **HTS** transfer from the faucet account to the user account (supports `0.0.x` or resolved `0x` address).
- Ensure faucet account has **HBAR** (fees) and **zUSDC** balance.
- **Not** the old “frontend-only ERC20 transfer” pattern for Hedera HTS.

### Deposit (HTS → DEX)

- User sends **HTS zUSDC** to the DEX contract account via wallet (`TransferTransaction`).
- Frontend calls **`POST /deposit/hts-sync`** with transfer tx reference and amount so keeper verifies on Mirror Node and calls `depositFor` on the DEX.

---

## 3. Keeper Database

After Prisma schema changes:

```bash
cd keeper
npx prisma db push
```

Restart keeper. On Windows, if `prisma generate` hits EPERM, try `npx prisma db push --skip-generate` then regenerate when possible.

Close reason codes (`closeReasonCode`):

- `0` — Manual
- `1` — Take profit
- `2` — Stop loss
- `3` — Liquidated

---

## 4. Authorize Keeper On-Chain

The `PerpetualDEX` must know the keeper address. After deploy, as owner call `setKeeperAddress(keeperAddress)` or use project scripts (e.g. `scripts/setKeeper.ts` on the configured Hardhat network).

Without this, **TP/SL auto-close will not execute**.

---

## 5. Running the Stack

1. Start **keeper** first; confirm `/health`.
2. Start **frontend** with matching `VITE_KEEPER_URL`.
3. Test faucet: **Get zUSDC** in Setup Guide — should return a tx id / hash, not `Failed to fetch`.

---

## 6. Debugging Tips

| Issue | Cause | Fix |
| --- | --- | --- |
| Faucet **Failed to fetch** | Keeper down or wrong URL | Start keeper on 3100; set `VITE_KEEPER_URL`; restart Vite |
| TP/SL never fires | Keeper not authorized, or no prices | `setKeeperAddress`; check oracle updater; `GET /diagnostic` |
| Deposit sync fails | Mirror delay or wrong token/account | Retry; verify `FAUCET_HTS_TOKEN_ID` and DEX association |
| `Invalid Transaction` / gas | Hedera min gas / RPC policy | Raise gas; try Hashio; check keeper logs |

---

## 7. Recommended Process

- Use PM2/systemd for keeper in production.
- Keep `.env` out of version control.
- Document deployed contract addresses and HTS token ID for your deployment.
