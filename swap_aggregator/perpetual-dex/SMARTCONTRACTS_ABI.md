# Zenit Perpetual DEX Smart Contract ABIs

The deployed contracts expose the following core Application Binary Interface (ABI) items. Use these definitions when interacting with the contracts from scripts, a frontend, or a relayer. Addresses are listed in `frontend/.env`.

## `PerpetualDEX` (DEX contract)

- **Events**
  - `Deposit(address indexed user, uint256 amount)` — emitted after a successful deposit.
  - `Withdraw(address indexed user, uint256 amount)` — emitted after a withdrawal.
  - `PositionOpened(address indexed user, bytes32 indexed market, uint256 amount, PositionType position, uint8 leverage)` — fired when a new market-specific position is created.
  - `PositionIncreased(address indexed user, bytes32 indexed market, uint256 amount)` — fired when an existing position receives more margin for a particular market.
  - `PositionClosed(address indexed user, bytes32 indexed market, uint256 amount)` — fired when some or all of a market position is closed.

- **Functions**
  - `deposit(uint256 _amount)` — transfer `_amount` of zUSDC into the DEX. Requires prior `approve`.
  - `withdraw(uint256 _amount)` (nonReentrant) — remove collateral from the DEX back to the caller; `_amount` must be ≤ balance.
  - `openPosition(bytes32 _market, uint256 _amount, PositionType _positionType, uint8 _leverage)` — create a new long/short position on `_market` using `_amount` collateral and leverage up to 25.
  - `increasePosition(bytes32 _market, uint256 _amount)` — add `_amount` collateral to an existing `_market` position (same leverage).
  - `closePosition(bytes32 _market, uint256 _amount)` — decrease or close the `_market` position and refund `_amount` collateral.
  - `getCurrentPosition(address user, bytes32 market) -> Position` — view a user’s `Position` struct (`amount`, `position`, `leverage`) for the specified market.
  - `balanceOf(address _account) -> uint256` — read the on-chain zUSDC balance managed by the DEX.
  - `getTokenAddress() -> address` — returns the zUSDC ERC20 address.
  - `getRewardContractAddress() -> address` — reward contract associated with this DEX.

## `RewardContract`

- **Events**
  - `RewardClaimed(address indexed user, uint256 amount)`
  - `RewardSet(address indexed user, uint256 amount)`
  - `DEXContractAddressSet(address indexed dexContractAddress)`

- **Functions**
  - `claimReward()` — claim the currently available reward balance in the current season.
  - `setUserReward(uint256 _amount, address user)` — callable only by the DEX to increment a user’s volume-based reward.
  - `setDEXContractAddress(address _dexContractAddress)` — owner-only setter for linking the reward owner.
  - `getCumulativeTraderVolumeByMarket(uint256 marketSeason, address user) -> uint256`
  - `getCumulativeVolumeByMarket(uint256 marketSeason) -> uint256`

## `RewardToken` (`zUSDC`)

- ERC20 standard ABI (from OpenZeppelin).
  - Standard functions: `name()`, `symbol()`, `decimals()`, `totalSupply()`, `balanceOf(address)`, `transfer(address,uint256)`, `allowance(address,address)`, `approve(address,uint256)`, `transferFrom(address,address,uint256)`
  - `_mint` is executed only during deployment (500M tokens to deployer).

## Deployment Addresses (per `frontend/.env`)

- `VITE_PERP_DEX_ADDRESS`: `0xa8de3e548054417e4d918FAC46E990aF623AC7BA`
- `VITE_TOKEN_ADDRESS`: `0x277E42B9454fB36A7Eaa52D4cE332bEF71dd017a`
- `VITE_REWARD_ADDRESS`: `0x5b218Bf85172a3df8017A3f29322B93B05a4C3C9`

Use these ABI fragments alongside the addresses when configuring SDKs, contract wrappers, or manual `ethers.js`/`viem` calls.
