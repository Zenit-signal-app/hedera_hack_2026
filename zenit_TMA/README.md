# Zenit TMA - Trading & Market Analytics Platform

Zenit TMA is a comprehensive trading and market analytics platform designed to provide traders with real-time signals, trend analysis, and AI-powered insights across multiple blockchain networks.

## What Zenit TMA Does

### Core Features

**1. Trend Signals & Market Analysis**
- Real-time uptrend and downtrend signal detection
- Daily trend analysis powered by SeerBOT AI engine
- Token price tracking across multiple chains

**2. Advanced Trading Charts**
- TradingView-powered charting with technical indicators
- Multiple timeframe support (1m, 5m, 15m, 30m, 1h, 4h, 1D)
- Built-in indicators: RSI, MACD, Parabolic SAR, EMA, ADX, Bollinger Bands
- Real-time price updates via WebSocket

**3. AI Trading Assistant**
- Natural language AI assistant for trading queries
- Prompt suggestions for common trading questions
- Powered by OpenAI SDK integration

**4. Asset Vault (Yield Strategies)**
- Multiple vault strategies for different risk profiles
- Performance tracking and earnings overview
- Deposit and redeem functionality
- Position management

**5. Portfolio Management**
- Complete wallet balance tracking
- Vault earnings visualization
- Transaction history with filtering
- Multi-chain support

**6. Token Analytics & Swap**
- Token search and discovery
- Real-time price data
- Swap interface with transaction details
- Liquidity pool information

**7. Market Intelligence**
- Top traders leaderboard
- Transaction monitoring
- Platform statistics (total pairs, liquidity, transactions)

### Supported Blockchains

- **Solana** - High-performance DeFi ecosystem
- **Polkadot** - Multi-chain interoperability
- **Hedera** - Enterprise-grade public network

---

## Getting Started

### Prerequisites

- Node.js 20+
- Yarn or npm

### Installation

```bash
# Install dependencies
yarn install

# Start development server (port 3001)
yarn dev
```

### Build for Production

```bash
yarn build
yarn start
```

### Linting

```bash
yarn lint
```

---

## Tech Stack

| Category | Technology |
|----------|------------|
| Framework | Next.js 16 |
| UI | React 19, Tailwind CSS |
| State Management | Zustand |
| AI/ML | OpenAI SDK, Vercel AI SDK |
| Blockchain | @solana/web3.js, @polkadot/api |
| Charts | TradingView Charting Library, Recharts |
| UI Components | Radix UI, Headless UI |
| Data Validation | Zod |

---

## Project Structure

```
zenit_TMA/
├── app/                    # Next.js App Router pages
│   ├── analysis/          # Trend analysis & signals
│   ├── ai-assistant/     # AI trading assistant
│   ├── asset-vault/      # Yield strategies
│   ├── portfolio/        # User portfolio
│   └── page.tsx          # Landing page
├── components/
│   ├── page/             # Page-specific components
│   └── ui/               # Reusable UI components
├── services/             # API and blockchain services
├── store/                # Zustand state management
├── types/                # TypeScript definitions
└── public/               # Static assets
```

---

## API Integration

The platform integrates with the SeerBOT backend API (https://api.seerbot.io) for:
- Token price data
- Trend analysis signals
- Transaction history
- Vault performance data
- Platform statistics

---

## License

Proprietary - Zenit Trading Platform

---

Built with Next.js 16 • React 19 • Tailwind CSS 4