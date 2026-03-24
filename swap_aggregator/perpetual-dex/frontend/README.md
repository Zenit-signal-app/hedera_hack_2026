# Zenit Perpetual DEX — Frontend

React + Vite trading UI for **Zenit Perpetual DEX** on **Hedera Testnet** (EVM `chainId` 296).

## Requirements

- Node.js 20+
- **HashPack** (recommended) with **WalletConnect Project ID** (`VITE_WALLETCONNECT_PROJECT_ID`)
- **Keeper** reachable from the browser at `VITE_KEEPER_URL` (default `http://localhost:3100`) — required for TP/SL, orders, **faucet**, and **deposit sync**

## Install

```bash
cd frontend
npm install
```

## Run

```bash
npm run dev
```

Vite prints the local URL (often `http://localhost:5173` or `http://127.0.0.1:3000`).

## On-ramp (Onramper)

Route: **`/onramp`** — “Buy crypto” in the nav embeds the **hosted** Onramper widget (`https://buy.onramper.com`) in an iframe.

The npm/GitHub package [`onramper/widget`](https://github.com/onramper/widget) is **deprecated**; integration follows [Onramper’s current docs](https://docs.onramper.com/docs/integration-steps).

Set in `.env`:

```bash
VITE_ONRAMPER_API_KEY=your_key_from_onramper_dashboard
```

Without a key, the page shows setup instructions instead of the iframe.

## Build

```bash
npm run build
```

## Environment (`frontend/.env`)

Typical variables (names may vary slightly; see `contracts.ts` and `.env` in repo):

| Variable | Purpose |
|----------|---------|
| `VITE_PERP_DEX_ADDRESS` / `VITE_DEX_ADDRESS` | PerpetualDEX contract |
| `VITE_TOKEN_ADDRESS` | zUSDC EVM address (HTS alias) |
| `VITE_ZUSDC_TOKEN_ID` | HTS token ID `0.0.xxxxx` (display / import) |
| `VITE_ORACLE_ADDRESS` | ZenitOracle |
| `VITE_REWARD_ADDRESS` | Reward contract (if used) |
| **`VITE_KEEPER_URL`** | Keeper base URL, e.g. `http://localhost:3100` |
| **`VITE_WALLETCONNECT_PROJECT_ID`** | Required for HashPack connection |
| `HEDERA_TESTNET_RPC_URL` | RPC for wagmi/viem public client |

After changing `.env`, restart `npm run dev`.

## Wallet & transactions

- **HashPack** (`@hashgraph/hedera-wallet-connect`): native Hedera transactions — `TransferTransaction` for HTS zUSDC to DEX, `ContractExecuteTransaction` for `closePosition` / trading when using the DApp signer.
- **wagmi** may still be used for read-only contract calls; primary writes for Hedera flows go through `hashgraphWalletConnect`.

## Features

- Markets: **BTCUSD**, **ETHUSD**, **HBARUSD**
- Deposit: HTS transfer + `POST /deposit/hts-sync` on keeper
- Withdraw / open / close: contract calls via HashPack signer when connected
- Setup guide: Hedera Testnet — HBAR faucet, zUSDC token ID, **zUSDC faucet** (keeper `POST /faucet/zusdc`)
- Order history synced with keeper; close reason badges (TP / SL / Liquidated / Manual); optional PnL sanity warning when `|PnL| > 3× size`

## Tech stack

- React 18 + TypeScript + Vite
- Tailwind CSS
- `@hashgraph/hedera-wallet-connect`, `@hiero-ledger/sdk`
- wagmi + viem (reads / optional flows)
