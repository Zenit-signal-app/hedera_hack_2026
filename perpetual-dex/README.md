# Zenit Perpetual DEX

## Overview

**Zenit Perpetual DEX** is a perpetual trading stack targeting **Hedera Testnet** (EVM-compatible, `chainId` **296**). Collateral is **zUSDC** implemented as **HTS** (8 decimals on-chain; internal accounting often uses 18 decimals in the DEX contract). The repo includes:

- **Smart contracts** (`contracts/`) — `PerpetualDEX`, `ZenitOracle`, `Reward`, token wrapper for zUSDC.
- **React + Vite frontend** — trading UI, HashPack via **@hashgraph/hedera-wallet-connect** (WalletConnect Project ID required), optional wagmi for reads; HTS transfers for deposit path.
- **Keeper service** (`keeper/`) — TP/SL/Liquidation triggers with on-chain `keeperClosePosition`, oracle price publishing, **REST API** (default port **3100**), SQLite (Prisma), **zUSDC faucet** (HTS transfer from faucet account), **`POST /deposit/hts-sync`** after user HTS transfer to sync internal margin.

**Markets** (price feeds / UI): **BTCUSD**, **ETHUSD**, **HBARUSD** (legacy DOT/SAUCE/PACK/BONZO pairs were removed).

## Smart Contracts

- **zUSDC (HTS-backed)** — fungible token used as margin/collateral; EVM address is often the HTS token alias.
- **`PerpetualDEX.sol`** — deposit/withdraw, open/increase/close per market; HTS-native transfers via precompiles where applicable; events `PositionOpened`, `PositionClosed`, `PositionLiquidated`.
- **`ZenitOracle.sol`** — on-chain prices for settlement; keeper publishes prices when configured (`ORACLE_PRIVATE_KEY` must be authorized as updater).
- **`Reward.sol`** — reward distribution (if deployed).

## Frontend

- Main page: `frontend/src/pages/Trade.tsx` — positions, deposit/withdraw, HashPack transactions via `hashgraphWalletConnect` (`DAppSigner.call`).
- **Setup guide** (`SetupGuideWidget`) — Hedera Testnet: HBAR faucet, zUSDC token ID import, **faucet Step B** accepts `0.0.x` account ID or `0x…` EVM address.
- **Faucet UI** calls `POST ${VITE_KEEPER_URL}/faucet/zusdc` — if keeper is down, the browser shows **Failed to fetch**.
- Keeper sync: `GET /orders`, TP/SL registration `POST /orders/tp-sl`, optional history reconciliation; close reason badges (TP / SL / Liquidated / Manual).

## Keeper Service

Node.js app in `keeper/`:

- Fetches prices (e.g. Pyth Hermes, DIA fallbacks) and publishes to `ZenitOracle` when possible.
- Watches open orders and executes on-chain closes when TP/SL/Liq triggers.
- Listens to contract events to update DB.
- **Faucet**: `POST /faucet/zusdc` with `{ "walletAddress": "0.0.xxx" | "0x..." }` — HTS transfer; configure `FAUCET_HTS_TOKEN_ID`, faucet keys, rate limits in code/env.
- **Deposit sync**: `POST /deposit/hts-sync` — verifies HTS transfer via mirror node then `depositFor` on DEX.

REST (default **`:3100`**), including:

- `GET /health`
- `GET /diagnostic`
- `GET /orders` (e.g. `?status=Open&limit=500`)
- `POST /orders/tp-sl`, `POST /orders/sync`
- `POST /deposit/hts-sync`
- `GET /faucet/status?wallet=…`
- `POST /faucet/zusdc`
- `GET /cache/reset?wallet=0x…`

CORS is enabled for browser access (`origin: true`).

## Development

### Prerequisites

- Node.js 20+
- npm

### Install (contracts root)

```bash
npm install
npx hardhat compile
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Set `frontend/.env` — at minimum:

- `VITE_PERP_DEX_ADDRESS` / `VITE_DEX_ADDRESS`
- `VITE_TOKEN_ADDRESS` (zUSDC EVM address)
- `VITE_ZUSDC_TOKEN_ID` (HTS `0.0.xxxxx`)
- `VITE_KEEPER_URL` (e.g. `http://localhost:3100`)
- `VITE_WALLETCONNECT_PROJECT_ID` (HashPack / WalletConnect)

### Keeper

```bash
cd keeper
npm install
npx prisma generate
npx prisma db push
npm run dev
```

Set `keeper/.env` — RPC, `CHAIN_ID=296`, contract addresses, `KEEPER_PRIVATE_KEY`, optional `FAUCET_PRIVATE_KEY`, `ORACLE_PRIVATE_KEY`, **`FAUCET_HTS_TOKEN_ID`** (must match deployed zUSDC token), `API_PORT=3100`.

## Deployment

See **`Deployment_Guide.md`** (Hedera-focused).

## Notes

- Run **only one** keeper instance per signer set to avoid nonce issues.
- Use a **dedicated faucet wallet** for `FAUCET_PRIVATE_KEY` when possible.
- If Prisma schema changes: `npx prisma db push` and restart keeper.
- On Hedera, legacy gas behavior may apply — see keeper logs and `KEEPER_ALLOW_EIP1559_TX` if needed.
