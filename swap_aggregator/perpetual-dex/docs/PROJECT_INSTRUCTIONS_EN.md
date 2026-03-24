## Zenit Perpetual DEX (Hedera) – Quick Instructions

### 1. Local Development Flow
1. Start the **keeper** service before the frontend (it powers the faucet, TP/SL logic, and order synchronization).
   ```bash
   cd perpetual-dex/keeper
   npm install
   npx prisma generate
   npm run dev
   ```
   → Health check: `curl http://localhost:3100/health`.
2. Run the **frontend** (Vite). The dev URL is printed to the terminal (typically `http://localhost:5173` or `http://127.0.0.1:3000`).
   ```bash
   cd perpetual-dex/frontend
   npm install
   npm run dev
   ```

### 2. zUSDC Staking (Hedera Testnet)
- Add `PRIVATE_KEY` + `HEDERA_TESTNET_RPC_URL` (or a HashIO URL) to `frontend/.env`.
- Deploy the staking contract:
  ```bash
  cd perpetual-dex
  npx hardhat run scripts/deployStaking.ts --network hederaTestnet
  ```
  Copy the printed `ZUSDCStaking deployed to:` address into `frontend/.env` as `VITE_STAKING_ADDRESS=0x...`.
- Fund rewards by transferring zUSDC HTS tokens (e.g., 100,000 zUSDC) directly to the staking contract via HashPack, and then run:
  ```bash
  cd perpetual-dex
  STAKING_FUND_ONLY=1 npx hardhat run scripts/fundStakingRewards.ts --network hederaTestnet
  ```
  Add `SKIP_ASSOCIATE=1` if the contract has already been associated with zUSDC.
- If `fundRewards` still reverts, deploy the latest `ZUSDCStaking`, update `VITE_STAKING_ADDRESS`, transfer zUSDC again, and rerun the funding command.
- Before staking from HashPack, make sure:
  - The user wallet and staking contract have associated zUSDC.
  - The user performs the ERC-20 `approve` flow in HashPack (Step 0: associate; Step 1: approve; Step 2: stake).
  - The approved amount is a positive value, not `0.0`.
- Associate tokens for the staking contract owner if needed:
  ```bash
  cd perpetual-dex
  npm install
  npx hardhat run scripts/associateStakingTokens.ts --network hederaTestnet
  ```

### 3. Aggregator Configuration
- **Bridge scan for mainnet:** whitelist tokens are in `shared/constants/bridges.ts`.
  ```bash
  cd perpetual-dex
  npm run scan:bridges:mainnet
  ```
  Details: `docs/SCAN_BRIDGES.md`.
- **CLMM + V1 routing:**
  - Register CLMM adapters: `npm run register:adapter:v3:mainnet` (deploys `UniswapV3SwapRouterAdapter` and sets `saucerswap_v2`).
  - Register V1 fallback if needed: `npm run register:adapter:mainnet` (adapter id typically `saucerswap`).
  - Set `VITE_AGGREGATOR_EXCHANGE_ADDRESS` (alias `VITE_AGGREGATOR_EXCHANGE_CONTRACT`) in `frontend/.env`.
  - Use `VITE_AGGREGATOR_V1_ADAPTER_ID=saucerswap` when your V1 adapter uses that ID.
  - Do not confuse adapter **labels** with contract addresses (`0x…`). Refer to `docs/AGGREGATOR_UI_ENV.md`.
- Inspect registered adapters without redeploying by running:
  ```bash
  cd perpetual-dex
  npm run verify:exchange:adapters:mainnet
  ```
  Set `ADAPTER_ID=saucerswap_v2` or `saucerswap` as needed for diagnosis.

### 4. SaucerSwap REST Environment Snippet
- Pull the best USDC↔HBAR path data (V1/V2) without using RPC:
  ```bash
  cd perpetual-dex
  npm run saucerswap:usdc-hbar:env
  # This creates frontend/.env.saucerswap-usdc-hbar.snippet
  ```
  See `docs/SAUCERSWAP_REST_ENV.md` for details.

### 5. Environment Notes
- `frontend/.env` must include `VITE_KEEPER_URL` that points to the keeper (e.g., `http://localhost:3100`). Restart the frontend after any changes.
- `keeper/.env` needs values such as `RPC_URL`, `CHAIN_ID=296`, contract addresses, `FAUCET_PRIVATE_KEY`, `FAUCET_HTS_TOKEN_ID`, etc.
- Always run Hardhat scripts from the repository root (`perpetual-dex`) so `hardhat.config.ts` is loaded. Running from other folders triggers “No Hardhat config file found” errors and may install Hardhat 3 unexpectedly.

### 6. Troubleshooting Tips
- For revert errors caused by missing associations, always associate the involved HTS tokens via HashPack before retrying the swap or staking flow.
- `INSUFFICIENT_TX_FEE` during simulation/deploy generally means the signer lacks native HBAR. Top up the account via the Hedera Portal faucet or another testnet faucet.
- When adapters or ZUSDC contracts change, redeploy, update the relevant `.env` entry, and rerun funding/scanning scripts so the UI reflects the new addresses.
