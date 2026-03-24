# Smart Contract Features of Perp DEX

## 1. Overview
- The identity of the project lives in `PerpetualDEX.sol`, which handles deposits/withdrawals, leveraged position lifecycle (open/increase/close) using `zUSDC` as the trading asset.
- `RewardContract.sol` tracks trader volumes in reward seasons and lets users claim earned rewards.
- `zUSDC` is an ERC20 token defined in `RewardToken.sol`, minted at deploy time and used for margin/collateral inside the perpetual system.

## 2. `PerpetualDEX.sol`
- Inherits from OpenZeppelin’s `Ownable` and `ReentrancyGuard` while implementing `IPerpDEX`/`IPosition`.
- Users call `deposit` to send `zUSDC` into the DEX, and `withdraw` to pull it back; both actions trigger events.
- `balances` and `positions` mappings track every account’s collateral and current position (amount, side, leverage).
- `openPosition` validates there is no active position, sufficient balance, positive amount/leverage, deducts collateral, and records the new `Position`.
- `increasePosition` adds margin to an existing position while keeping the same leverage.
- `closePosition` reduces or removes the position, credits collateral back to balance, and emits `PositionClosed`.
- `_setReward` forwards the leveraged size (`amount × leverage`) to the reward contract, so every trade contributes to future rewards.
- Convenience views (`balanceOf`, `getCurrentPosition`, `getTokenAddress`, `getRewardContractAddress`) expose state for the frontend.

## 3. `RewardContract.sol`
- Maintains immutable reward season timing (`REWARD_PERIOD = 30 days`) and per-season trackers for user volume and market volume.
- Only the DEX contract can call `setUserReward`, ensuring reward updates originate from actual trading activity.
- `claimReward` computes the currently claimable reward for a user and transfers the ERC20 reward token to them once the season data is up to date.
- The reward formula divides the trader’s seasonal volume by total market volume, multiplies by `REWARD_RATE / REWARD_RATE_DIVISOR`, and scales by 1e18 to maintain precision.
- Season rollover logic updates `currentRewardSeason` automatically whenever the block timestamp crosses the next 30-day boundary.

## 4. Token Contracts
- `RewardToken` (`zUSDC`) implements a basic ERC20 with 500 million tokens minted for the deployer; this contract represents both margin currency and claimable rewards.

## 5. Interaction Flow
1. Deploy `RewardToken`, then `RewardContract` with the reward token address.
2. Owner sets the DEX contract address in the reward contract (`setDEXContractAddress`), enabling DEX → reward communication.
3. Deploy `PerpetualDEX` with the token and reward addresses. Users approve zUSDC and call `deposit`.
4. When a user opens/increases/closes a position, `PerpetualDEX` updates balances/positions and calls `RewardContract.setUserReward` with the leveraged amount.
5. Users claim the accumulated reward by calling `RewardContract.claimReward`, which pays out based on seasons.

## 6. Security Considerations
- Input validation (`require` statements) protects against zero-amount deposits/withdrawals and ensures open positions only exist where appropriate.
- `ReentrancyGuard` prevents reentrancy attacks on withdraw/claimReward functions.
- `Ownable` restricts configuration (like setting the DEX address) to the contract owner.
