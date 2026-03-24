# Zenit Swap Aggregator

**A Web3 liquidity aggregator and perpetual DEX built on Hedera**

---

## What It Does

Zenit Swap Aggregator is a decentralized trading platform that:

- ✅ **Aggregates liquidity** from multiple DEXs to find the best swap rates
- ✅ **Perpetual trading** - Trade crypto assets with leverage (long/short positions)
- ✅ **Cross-DEX routing** - Automatically finds the cheapest route across SaucerSwap, Pangolin, and other Hedera DEXs
- ✅ **Automated trading** - Take Profit (TP) / Stop Loss (SL) / Liquidation triggers
- ✅ **HTS token support** - Native Hedera token integration (zUSDC stablecoin)
- ✅ **REST API** - Built-in API for developers to build on top

---

## Who Is It For

| User Type | What They Get |
|-----------|---------------|
| **Traders** | Best rates across DEXs, leveraged positions, automated TP/SL |
| **DApp Developers** | REST API, oracle data, smart contract hooks |
| **Protocols** | Liquidity aggregation, white-label integration |
| **Hedera ecosystem** | Native HTS support, low fees, fast finality |

---

## Tech Stack

```
Frontend     → React + Vite + Tailwind
Backend      → Node.js + Fastify + Prisma
Blockchain   → Hedera EVM + Solidity
Database     → SQLite (via Prisma)
Wallets      → HashPack (WalletConnect)
```

---

## Key Features

### 🔄 Liquidity Aggregation
Smart router that checks multiple DEXs (V2/V3) and returns the best price. Users get better rates automatically.

### 📈 Perpetual Trading
- Open long/short positions on BTC, ETH, HBAR
- Use zUSDC as collateral
- Leverage up to 10x (configurable)
- Real-time oracle pricing

### 🤖 Automated Keeper
- 24/7 monitoring for TP/SL triggers
- Auto-liquidates undercollateralized positions
- Publishes price feeds to on-chain oracle
- Provides testnet faucet for zUSDC

### 🌐 Hedera-Native
- HTS (Hedera Token Service) tokens
- EVM-compatible smart contracts
- Low gas fees (~$0.001 per swap)
- Fast finality (<3 seconds)

---

## Project Structure

```
swap_aggregator/
├── perpetual-dex/
│   ├── contracts/           # Smart contracts (Solidity)
│   │   ├── Exchange.sol   # Core trading engine
│   │   ├── QuoteAggregator.sol  # Liquidity router
│   │   ├── adapters/      # DEX integrations (V2, V3)
│   │   └── token/          # zUSDC, Reward tokens
│   │
│   ├── frontend/           # Trading UI
│   │   └── src/
│   │       ├── pages/     # Trade, Aggregate pages
│   │       └── lib/       # Wallet, quotes, routing
│   │
│   ├── keeper/            # Backend service
│   │   └── src/
│   │       ├── executor.ts   # TP/SL execution
│   │       ├── oracle.ts     # Price feeds
│   │       └── faucet.ts     # Token distribution
│   │
│   └── scripts/           # Deployment scripts
│
└── roles.json            # Wallet setup
```

---

## Quick Start

### 1. Start Keeper (Backend)
```bash
cd perpetual-dex/keeper
npm install
npx prisma generate
npm run dev
```

### 2. Start Frontend
```bash
cd perpetual-dex/frontend
npm install
npm run dev
```

### 3. Open Browser
Go to `http://localhost:5173`

---

## Environment Setup

Create `.env` in `perpetual-dex/frontend/`:
```env
VITE_KEEPER_URL=http://localhost:3100
VITE_WALLETCONNECT_PROJECT_ID=your-project-id
```

Create `.env` in `perpetual-dex/keeper/`:
```env
HEDERA_RPC_URL=https://testnet.hashio.io/api
CHAIN_ID=296
KEEPER_PRIVATE_KEY=your-key
```

---

## API Endpoints

The keeper provides a REST API on port 3100:

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Server health check |
| `GET /orders` | List all positions |
| `POST /orders/tp-sl` | Set Take Profit / Stop Loss |
| `POST /faucet/zusdc` | Get test tokens |
| `POST /deposit/hts-sync` | Sync deposits |

---

## Smart Contracts

| Contract | What It Does |
|----------|---------------|
| `Exchange` | Match orders, route to best DEX |
| `QuoteAggregator` | Find best swap path |
| `PerpetualDEX` | Manage positions & margin |
| `ZenitOracle` | On-chain price feeds |
| `Adapters (V2/V3)` | Connect to DEXs like SaucerSwap |

---

## Supported Markets

- BTC/USD
- ETH/USD
- HBAR/USD

---

## Documentation

- [Architecture Details](./perpetual-dex/README.md)
- [Keeper API](./perpetual-dex/keeper/README.md)
- [Aggregator Guide](./perpetual-dex/docs/AGGREGATOR.md)
- [Deployment Guide](./perpetual-dex/Deployment_Guide.md)

---

## Networks

| Network | Chain ID |
|---------|----------|
| Hedera Testnet | 296 |
| Hedera Mainnet | 295 |

---

## License

MIT