Vault Contract — Reference and Guidance

Overview
- Purpose: accept deposits of a single ERC20 (`token1`), allow a manager to trade assets while funds are locked, then distribute the resulting `token1` balance pro rata to depositors.
- Primary goals: safe token locking, manager-driven trading to generate profit, and fair snapshot-based withdrawal distribution.
- Sources: contract implementation at `src/Vault.sol` and ABI `vault_abi.json`.

Lifecycle (states)
- Closed: initial/idle state; no deposits.
- Deposit: users deposit `token1` and receive shares (1:1 with deposited amount).
- Running: manager may approve/execute allowed external interactions (e.g., DEX operations).
- Withdraw: manager (or users) withdraw based on a snapshot taken when entering Withdraw.

Concise function reference (most important first)
- `deposit(uint256 amount)` — Deposit `token1` while state == Deposit; issues shares 1:1; respects `maxShareholders` and `depositsClosed`.
- `stateToDeposit()`, `stateToRunning()`, `stateToWithdraw()` — Owner/manager controlled state transitions. `stateToWithdraw()` snapshots `withdrawalSnapshotBalance` and `withdrawalSnapshotShares` for fair distribution.
- `execute(address target, bytes data)` — Manager only during Running; calls whitelisted `allowedTargets` via low-level `call` (used to interact with DEXes/strategies).
- `approveToken(address token, address spender, uint256 amount)` — Manager-only approval for `token1` or `token2` while Running (note: uses `forceApprove` in code).
- `withdraw(address[] calldata shareholdersToWithdraw)` — Manager batch distribution while state == Withdraw; uses snapshot math to compute each recipient share and removes processed shareholders.
- `userWithdraw()` — Individual withdrawal available in Deposit or Withdraw; uses snapshot math in Withdraw, 1:1 in Deposit.
- `addAllowedTarget(address)`, `removeAllowedTarget(address)` — Owner-managed allowlist for `execute` targets.
- `emergencyRecover(address token, address to, uint256 amount)` — Owner-only rescue for non-vault tokens.

Key events
- `Deposited`, `DepositsClosed`, `Withdrawn`, `UserWithdrawn`, `ManagerCall`, `TokenApproved`, `TargetAllowed`, `TargetRemoved`, `StateChanged`, `VaultUpdated`, `VaultClosed` — use these for monitoring and auditing.

Data model / invariants
- `shares[address]` maps depositors to their share count; deposits mint shares 1:1 with `token1` amount.
- `totalShares` sums all shares; during Withdraw a snapshot pair (`withdrawalSnapshotBalance`, `withdrawalSnapshotShares`) is taken once and used for all batched distributions to guarantee fairness.
- `shareholders[]` with `shareholderIndexPlusOne` supports O(1) swap-and-pop removal.

Rounding & dust
- Withdraw math uses integer division; per-shareholder distributions may leave a remainder (dust) in the contract after processing a batch. The contract currently does not explicitly sweep that dust — it may remain locked if not handled when `totalShares` reaches 0.

Security considerations (high level)
- Manager power: manager can call `execute` and `approveToken` in Running; allowedTargets is owner-controlled, but manager still controls which operations run. Operational governance required.
- execute() uses low-level `call` without `nonReentrant`; consider adding `nonReentrant` to reduce surface for complex callbacks.
- `approveToken` calls `forceApprove` (non-standard). Ensure tokens used support the expected interface, or switch to a SafeERC20-compatible pattern (set to 0 then set allowance or use `safeIncreaseAllowance`).
- Emergency recover protects `token1` and `token2` from being swept, which is good — but dust handling must be addressed to avoid permanently trapped `token1` when integer rounding occurs.

Tests to add (Foundry / `forge test`)
- State transitions: only valid transitions succeed; invalid ones revert with `Vault__InvalidStateTransition`.
- Deposit flows: deposit success, cap handling (maxShareholders), `depositsClosed` behavior, index mapping correctness.
- Snapshot & withdraw math: deposit multiples, simulate profit (increase `token1` balance), call `stateToWithdraw()` then test batch and individual withdrawals for correctness (including rounding edge cases).
- execute / allowedTargets: only manager and whitelisted targets allowed; returns data and emits `ManagerCall`.
- approveToken: manager-only, token validation, allowance sets correctly (or fails gracefully if token incompatible).
- emergencyRecover: only non-vault tokens recoverable; token1/token2 recover attempts revert.

Small recommended code improvements (prioritized)
1) Add `nonReentrant` to `execute` to reduce callback risk.
2) Fix withdraw dust: when distributing the final shares (or last processed shareholder in a batch), forward any leftover (snapshotBalance - distributedTotal) to avoid permanently locked dust.
3) Replace or document `forceApprove`: prefer `SafeERC20.safeApprove` with zeroing pattern or `safeIncreaseAllowance`.

Operational notes
- Authority: owner controls allowedTargets and emergencyRecover; owner OR manager can call lifecycle transitions. Decide organizationally who should hold manager vs owner keys.
- Monitoring: watch `ManagerCall`, `TokenApproved`, `StateChanged`, `Deposited`, `Withdrawn` and `UserWithdrawn` events; expose `getVaultState()` and `getShareholders()` in dashboards.

Next steps I can take for you
1) Create this file at `vault.md` (done).
2) Open a PR with code changes for the three prioritized improvements and include unit tests (I can prepare the patch and test skeletons).
3) Add Foundry test skeletons under `test/` to cover the critical flows above.

References
- Implementation: `src/Vault.sol`
- ABI: `vault_abi.json`
