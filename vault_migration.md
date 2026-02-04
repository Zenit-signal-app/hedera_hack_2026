## Vault + Factory Migration Notes

Purpose: explain the on-chain datums/redeemers plus the Python helpers in `contracts/` and `libs/` so the new FE web client can integrate against the vault/factory flow.

### On-chain contracts

#### `contracts/factory.py`
- Minting policy that is parameterized with the authorized manager's PKH at build time.
- Only the manager can mint or burn; the policy inspects the signatories and rejects anything else.
- Each transaction must mint/burn *exactly one token* (quantity ±1). This enforces a one-to-one relationship between manager actions and the state NFT.
- The FE needs the minted NFT's `policy_id` + `asset_name` pair (often called the `pool_id`) because:
  - every vault config UTxO is guarded by that NFT,
  - every deposit UTxO refers to the pool_id, and
  - registrations/migrations/references use it as the canonical identifier.
- The factory client records metadata (policy id, NFT name, tx hash, network) via `libs/deployment_info.save_factory_info`, which is used during migration to query the current pool_id.

#### `contracts/vault.py`
- Defines two datum shapes: `VaultConfigDatum` (state machine) and `DepositDatum`.
  - `VaultConfigDatum` tracks: `state` (0=open, 1=trading, 2=withdrawable, 3=closed), `manager`, `asset_policy/name` (tracked asset), `max_users`, `t_time`/`w_time` (unix ms deadlines), `cap` (total ADA GDP), `pmv` (tracked asset snapshot).
  - `DepositDatum` carries a contributor address and the `pool_id` NFT name for matching deposits.
- `VaultRedeemer` encodes the tag (action) plus optional ints/bytes that represent parameters (new timeouts, asset names, etc.).
- The validator enforces the manager signature on every action, ensures NFT preservation (unless state=3), and checks value conservation per tag:
  - `TAG_COLLECT_DEPOSITS`: collects ADA from deposit UTxOs, optionally transitions from state 0→1 or merges in state 1.
  - `TAG_TRADE`: keeps the vault in trading, verifies coin preservation while letting the manager surface trading outputs.
  - `TAG_START_WITHDRAWAL`: moves to state 2 once `w_time` is reached; snapshots tracked asset amount.
  - `TAG_WITHDRAW`: drains ADA back to participants while keeping the vault in state 2.
  - `TAG_COLLECT_TRADING_RESULTS`: updates the tracked asset metadata (`asset_policy/name`).
  - `TAG_OPEN_VAULT`, `TAG_CLOSE_VAULT`, `TAG_UPDATE_SETTINGS`: control state/time transitions.

### Off-chain helpers

#### `libs/factory_client.py`
- `compile_factory(repo_root, manager_pkh_hex)` builds `contracts/factory.py` with OpShin (`uv run opshin build`). _FE tooling must respect the uv-based build step because dependencies live in `pyproject.toml` + `uv.lock`_.
- `load_script` and `derive_policy_hex` turn the on-chain script into a usable `PlutusV3Script` plus policy id that the FE will embed as the `factory_policy`.
- `state_nft_on_chain` / `mint_state_nft` are used during vault creation/migration:
  - `mint_state_nft` mints exactly one NFT (policy + asset name) and stores metadata via `save_factory_info`.
  - The minted NFT becomes the `pool_id` that the FE uses when parsing deposits or building vault configs.
- The FE should display the minted NFT details (policy, asset name, tx id) because every subsequent vault action looks up the NFT (e.g., `find_config_utxo_by_nft` in `libs/vault_client.py`) to match the right pool.

#### `libs/vault_client.py`
- `compile_vault` takes `factory_policy_hex` and (optional) `admin_pkh_hex` to produce the on-chain script that respects the factory policy. `derive_script_address` derives the script address that the FE polls for UTxOs.
- Datum helpers:
  - `build_initial_datum(...)` builds the first `VaultConfigDatum` for a vault (state 3 by default, configurable times/caps).
  - `_decode_datum` + `find_config_utxo` let the FE inspect all UTxOs at the vault address, filter for config vs deposit datums, and read the manager/asset metadata.
  - `view_vault_status` already wraps the `context.utxos` loop and returns `{config, config_utxos, deposits}` so the FE can fetch a refreshed state in one RPC call.
  - `parse_pool_id` / `_contributor_payment_part` convert FE-friendly strings (bech32 or hex) into the bytes that the contract expects.

- Common user-facing flows:
 1. **Deposit** (`deposit_to_vault`):
    - FE supplies `amount_ada`, `pool_id` (NFT asset name hex), optional contributor address.
    - Backend constructs a `DepositDatum`, ensures the ADA meets `min_lovelace_post_alonzo`, then builds, signs, and submits the transaction.
 2. **Manager facing flows** (require manager signing key/address):
    - `manager_collect`: collects outstanding deposits into the config UTxO; optionally transitions from state 0→1 and increases `cap`.
    - `open_vault`: transitions a closed vault (state 3) → open (state 0) and resets `t_time/w_time`.
    - `start_withdrawal`: waits until `w_time`, consolidates loose/trading UTxOs, sets state=2, and snapshots the asset (`pmv`).
    - `withdraw_from_vault`: manager-only payout to a recipient; FE must calculate entitlements off-chain and pass the ADA amount.
    - `trade_vault`: manager can spend config + loose UTxOs to route ADA/assets to arbitrary outputs; FE should supply the `TransactionOutput[]` representing AMM or DEX orders.
    - `collect_trading_results`: updates the tracked asset identity if the vault switches the tracked asset mid-trade (manager passes new policy/name in the redeemer bytes).
    - `update_vault_settings`: adjust `t_time`, `w_time`, or state without touching asset values.
    - `close_vault`: move the vault to state 3 after withdrawals finish.

- Utility helpers:
  - `_wait_for_tx_confirmation` polls Blockfrost until the tx is visible.
  - `list_deposit_utxos`, `list_loose_utxos_at_vault` let FE determine which UTxOs are ready to be consumed (e.g., deposits waiting to be collected or loose trading outputs).
  - `_build_collect_output_value` just sums deposit + config values to ensure `manager_collect` keeps coins conserved.

### How the FE should migrate
1. **Know the pool_id**: read the factory metadata (`factory_policy_id` + `nft_asset_name`) saved by `mint_state_nft`. Use that hex string as the `pool_id` argument when depositing or filtering config UTxOs.
2. **Use `view_vault_status`** to populate UI state (manager address, tracked asset, cap, PMV, list of deposit UTxOs, timings). All downstream actions can reuse the datums it returns.
3. **Respect state deadlines**: `t_time` and `w_time` live in milliseconds. `manager_collect` requires `t_time` to have passed, `start_withdrawal` requires `w_time` to pass, and `collect_trading_results` expects asset changes during state 1.
4. **Always include the right redeemer**: each helper constructs a `VaultRedeemer` with a tag constant (e.g., `TAG_START_WITHDRAWAL`, `TAG_TRADE`). When the FE replicates these flows, it should match the tag, manager signature, and datum updates described here.

### Key constants for the FE
- `VaultConfigDatum.state`: 0=open, 1=trading, 2=withdrawable, 3=closed.
- `VaultRedeemer.tag`:
  - 0 collect deposits, 1 refund, 2 start withdrawal, 3 close, 4 trade, 5 update settings, 6 collect trading results, 7 open, 8 withdraw.
- NFT checks live in `_chk_nft`; they ensure the NFT stays at the script unless the vault is closed (state 3). The FE should never burn or move that NFT outside the script except via the vault logic shown above.

### Summary
Let the FE read `view_vault_status` and use the helper routines as a reference implementation for every action: deposits, manager transitions, trades, withdrawals. The contracts expect the manager to sign every state-changing action, the factory policy to mint exactly one NFT per vault, and the datums/redeemers above to stay consistent. Use this document as the node-side contract spec when translating it into FE experiences.
