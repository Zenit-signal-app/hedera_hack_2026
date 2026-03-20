## Reward Flow Overview

This project wires frontend, backend, and on-chain components together to track leveraged volume so that users earn rewards automatically.

### Frontend (Trade.tsx)
- All trading actions (open, increase, close) call the PerpDEX contract via Wagmi + Viem.
- Each handler stores history locally, updates the sidebar state, and notifies the keeper service (`POST /orders/tp-sl`) so TP/SL data is available off-chain.
- Closing from the order panel now surfaces a detailed confirmation modal, while validators enforce max-amount and prevent double clicks.

### Smart Contracts (`contracts/PerpetualDEX.sol` + `contracts/Reward.sol`)
- `PerpetualDEX` keeps user positions, then inside `_setReward` forwards `amount * leverage` to the reward contract whenever a position is opened, increased, or decreased.
- The reward contract groups volumes into 30-day seasons, calculates each trader’s share of the pool, and lets them claim the accumulated reward token once per season.
- `_decreasePosition` also refunds margin to the user and emits `PositionClosed` so off-chain listeners can react.

### Backend Keeper (`keeper/src`)
- `eventListener.ts` watches `PositionOpened`/`PositionClosed` events via Viem, persists them in the Prisma DB, and fetches reference prices.
- `executor.ts` provides `executeOnChainClose` and `updateSmartContractWithClosureStats`, letting the keeper settle reward stats and keeper payouts when a position closes.
- The Fastify API includes `/orders/tp-sl` so the frontend can register TP/SL values immediately after opening a position, ensuring the keeper enforces them later.

Together, this stack ensures the risk/reward calculations and reward accounting stay consistent across UI, service, and blockchain layers.
