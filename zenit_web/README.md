# Zenit Web

> A crypto trading intelligence platform — browse vaults, track performance, swap tokens, and chat with an AI market assistant.

Zenit Web is the **frontend application** for the Zenit platform. It connects to the [Zenit API](/api_service) to deliver real-time market data, on-chain vault analytics, and AI-powered insights — all in a clean, dark-themed interface optimized for desktop and mobile.

---

## What You Can Do

### Asset Vaults

**Browse and invest in on-chain trading vaults.**

Vaults are live, algorithmically-managed trading strategies deployed on multiple blockchains. Each vault runs a defined trading strategy — users deposit funds and earn a share of the strategy's returns.

**Vault listing page** (`/asset-vault`)
- Browse active, inactive, or all vaults across chains
- Search by vault name or description
- See key metrics at a glance: annual return, TVL, max drawdown, age
- Status badges: `Open`, `Trading`, `Withdrawable`, `Closed`

**Vault detail page** (`/asset-vault/[id]`)
- **Overview tab** — live price chart (1D / 1W / 1M), performance metrics (annual return, TVL, max drawdown, trade frequency), vault type, blockchain, and smart contract address
- **Performance tab** — full stats table: total return, win rate, total trades, winning / losing trades, average win/loss %, max drawdown, total fees, monthly trade frequency
- **Positions tab** — paginated, searchable list of open and closed trading positions with pair, spend, value, profit/loss, and open/close timestamps
- **My Deposits panel** — your deposited amount, profit rate, deposit and redeem buttons

**Deposit & Redeem flow**
- Deposit modal with amount slider, fee estimation, balance check, and transaction confirmation
- Redeem modal with min/max limits and one-time withdrawal
- Real-time transaction status via WebSocket

### Portfolio

**Track your entire crypto portfolio in one place.**

- **Wallet balance** — connected wallet's token balances across the active chain
- **Vault earnings** — table of all vaults you've deposited into, showing total deposit, current value, ROI, and profit
- **Transaction history** — complete log of vault deposits and withdrawals with timestamps, amounts, and transaction IDs

### Market Analysis

**View live trend data and trade across pairs.**

- Uptrend / downtrend tables powered by RSI and ADX indicators
- Live trading pair info with token metadata
- In-app token swap interface

### AI Market Assistant

**Ask questions about the market and get answers backed by real data.**

- Chat interface at `/ai-assistant`
- Ask anything from *"Should I buy Bitcoin now?"* to *"How is the market today?"*
- GPT-4o-mini analyzes live OHLCV data, RSI levels, and support/resistance to generate technical analysis
- Markdown-rendered responses with structured output

### Landing Page

**Public-facing home page** (`/`)
- Hero section with platform overview
- Partner logos
- How It Works, AI Assistant teaser, FAQ, and Trade Smarter sections
- Dynamic platform statistics (total pairs, liquidity, transactions)

---

## Pages

| Route | Description |
|---|---|
| `/` | Landing page |
| `/asset-vault` | Vault listing with search and filters |
| `/asset-vault/[id]` | Vault detail with overview, performance, positions |
| `/analysis` | Market trend analysis, pair info, swap interface |
| `/portfolio` | Wallet balance, vault earnings, transaction history |
| `/ai-assistant` | AI-powered market chat |
| `/terms` | Terms of service |
| `/privacy` | Privacy policy |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS v4 + CSS variables |
| State | Zustand |
| API client | Axios |
| Charts | Recharts |
| Tables | TanStack Table |
| AI | Vercel AI SDK + OpenAI |
| Notifications | Sonner (toasts) |
| i18n | next-intl |
| Auth | Telegram Mini App + Firebase (handled via API) |
| Blockchain | Multi-chain wallet support (Hedera, EVM, Solana, etc.) |

---

## Project Structure

```
zenit_web/
├── app/                    # Next.js App Router pages
│   ├── asset-vault/        # Vault listing + detail pages
│   ├── analysis/           # Market analysis page
│   ├── portfolio/          # User portfolio page
│   ├── ai-assistant/       # AI chat page
│   └── page.tsx            # Landing page
├── components/
│   ├── page/               # Page-level UI components
│   │   ├── asset-vault/    # Vault card, detail tabs, deposit/redeem modals
│   │   ├── analysis/       # Trend tables, swap container, token info
│   │   ├── portfolio/      # Wallet balance, vault earnings, transactions
│   │   ├── ai-asistant/    # Chat UI, prompt suggestions, input
│   │   └── landing-page/   # Hero, partners, FAQ, CTA sections
│   ├── layout/             # Shell: sidebar navigator, header, conditional layout
│   └── ui/                 # Radix UI primitives + custom components
├── services/               # API service modules (vault, chain, AI, analysis)
├── hooks/                  # Custom React hooks (wallet, vault, WebSocket)
├── store/                  # Zustand state stores
├── lib/                    # Utilities, constants, formatters, vault helpers
└── types/                  # TypeScript type definitions
```

---

## Getting Started

### Prerequisites

- Node.js 20+
- Yarn

### Install

```bash
yarn install
```

### Configure

Create a `.env.local` file:

```env
NEXT_PUBLIC_API_BASE_URL=https://api.seerbot.io
```

### Run

```bash
yarn dev      # Development server on port 3001
yarn build    # Production build
yarn start    # Production server on port 3001
yarn lint     # Run ESLint
```

---

## Key Features

- **Vault investing** — deposit into strategy vaults, track earnings, redeem positions
- **Real-time vault analytics** — live charts, performance stats, trade history
- **Multi-chain** — switch between Hedera, EVM, Solana, and more
- **AI trading assistant** — natural language market analysis backed by live OHLCV data
- **Portfolio dashboard** — unified view of wallet balances and vault returns
- **Dark theme UI** — premium dark interface with glassmorphism accents
- **Responsive** — optimized for desktop and mobile
