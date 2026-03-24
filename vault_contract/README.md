# Solidity Vault

A configurable ERC20 vault smart contract built with Foundry, targeting Hedera EVM.

## Overview

The Vault contract manages deposits, withdrawals, and manager operations using an explicit state machine. Shareholders deposit token1, a manager executes operations during the run phase, and shareholders withdraw proportionally after the stop phase.

## State Machine

```
Closed(0) ──► Deposit(1) ──► Running(2) ──► Withdraw(3) ──► Closed
     ▲                                                         │
     └─────────────────────────────────────────────────────────┘
```

| State | Value | Allowed Operations |
|-------|-------|-------------------|
| Closed | 0 | `updateVault()`, `stateToDeposit()` |
| Deposit | 1 | `deposit()`, `userWithdraw()`, `stateToRunning()`, `updateVault()` |
| Running | 2 | `execute()`, `approveToken()`, `stateToWithdraw()`, `updateVault()` |
| Withdraw | 3 | `withdraw()`, `userWithdraw()`, `updateVault()` |

State transitions are triggered manually by the owner or manager via `stateToDeposit()`, `stateToRunning()`, and `stateToWithdraw()`. The vault auto-closes when all shares are distributed.

## Features

- **Explicit state machine**: Explicit state transitions instead of timestamp-based phases
- **Self-service withdrawals**: Contributors can withdraw their own funds in Deposit or Withdraw states
- **Whitelisted execute targets**: Manager can only call addresses approved by the owner
- **Batch withdrawals**: Manager can withdraw for groups of shareholders to avoid gas limits
- **Configurable**: Token addresses and max shareholders via config files
- **Emergency reconfiguration**: Owner/manager can update vault config at any state
- **Security**: ReentrancyGuard, SafeERC20, access control, CEI pattern
- **HTS Token Support**: Native support for both HTS (Hedera Token Service) and ERC20 tokens

## HTS Token Support

The Vault supports both HTS (native Hedera tokens) and ERC20 tokens seamlessly. Token type is auto-detected based on bytecode size (HTS tokens have no EVM bytecode).

### Key Implementation Details

- **HTS Detection**: Tokens with empty bytecode are treated as HTS
- **Unified API**: All token operations use wrapper functions that handle both types
- **int64 Conversion**: HTS requires `int64` amounts (handled automatically)
- **Response Codes**: HTS returns response codes instead of reverting (handled with `HTS_SUCCESS = 22`)

### Association

The Vault contract is deployed with unlimited automatic token associations (`maxAutomaticTokenAssociations: -1`), meaning users can send any HTS token directly to the vault without requiring a separate association transaction.

- Deposits assume tokens are already associated (auto-associated by default)
- `userWithdraw()` checks if the account is associated with HTS tokens before withdrawal

## Prerequisites

- [Foundry](https://getfoundry.sh/) (v1.5.1+)
- [Node.js](https://nodejs.org/) (for config generation)
- [Docker](https://docs.docker.com/get-docker/) (for local dev node)

## Quick Start

```bash
# Install dependencies
forge install

# Copy environment file
cp .env.example .env
# Edit .env with your private key and RPC URLs

# Generate config for testnet
node config/genConfig.js hedera_testnet

# Build
forge build

# Test
forge test

# Deploy (testnet)
forge script script/Vault.s.sol:VaultScript --rpc-url https://testnet.hashio.io/api --broadcast
```

## Contract Build

After building, the ABI and bytecode are located at:
```
out/Vault.sol/Vault.json
```

You can also find interface ABIs in `out/I*.json` for interaction scripts.

## Network Support

| Network | RPC Endpoint | Chain ID |
|---------|-------------|----------|
| hedera_local | http://localhost:7546 | 298 |
| hedera_testnet | https://testnet.hashio.io/api | 296 |
| hedera_mainnet | https://mainnet.hashio.io/api | 295 |

### Important Hedera Token Addresses

| Token | Token ID | EVM Address |
|-------|----------|-------------|
| SAUCE (SaucerSwap) | 0.0.731861 | `0x00000000000000000000000000000000000b2ad5` |
| WHBAR (Wrapped HBAR) | 0.0.8840785 | `0xb1F616b8134F602c3Bb465fB5b5e6565cCAd37Ed` |
| USDC (Native HTS) | 0.0.456858 | — |

### Testnet Faucet

Get testnet HBAR: https://portal.hedera.com/faucet

## Deployment

### Option 1: JavaScript SDK (Recommended - with Auto-Association)

The recommended way to deploy with automatic token associations enabled:

```bash
# Deploy to testnet (auto-loads config from vaultConfig.json)
node scripts/deploy-vault.js --network hedera_testnet

# Deploy with options
node scripts/deploy-vault.js --network hedera_testnet --max-shareholders 10

# Deploy to local node
node scripts/deploy-vault.js --network hedera_local

# Dry-run to test without broadcasting
node scripts/deploy-vault.js --network hedera_testnet --dry-run
```

This script:
1. Generates `VaultConfig.sol` from `config/vaultConfig.json`
2. Builds the contract with Forge
3. Deploys via Foundry
4. Updates the contract with unlimited auto-associations (`-1`)

### Option 2: Foundry Only

Deploy directly with Foundry (no auto-association):

```bash
# Generate config for testnet
node config/genConfig.js hedera_testnet

# Build
forge build

# Deploy
forge script script/Vault.s.sol:VaultScript --rpc-url https://testnet.hashio.io/api --broadcast
```

### Configuration

Edit `config/vaultConfig.json` and regenerate:

```bash
node config/genConfig.js hedera_local    # Local dev
node config/genConfig.js hedera_testnet  # Testnet
node config/genConfig.js hedera_mainnet  # Mainnet
```

Do **not** edit `src/VaultConfig.sol` directly.

## Local Development Node (Hiero)

Run a local Hedera dev environment using Hiero Local Node:

```bash
# One-time setup: clone and install dependencies
bash scripts/setup-local-node.sh

# Start local node (Docker containers)
bash scripts/start-local-node.sh

# Stop local node
bash scripts/stop-local-node.sh
```

The Hiero Local Node includes:
- Consensus Node
- Mirror Node and explorer
- JSON-RPC Relay (at `http://localhost:7546`)
- Block Node
- Grafana UI and Prometheus UI

Note: `forge test` runs on Anvil, not a Hedera node. Deploy to the local dev node for Hedera-specific testing.

## Python CLI

Use the unified CLI at `scripts/cli.py` for Hedera/EVM helper actions.

```bash
# Show available commands
uv run python scripts/cli.py --help

# Chain info
uv run python scripts/cli.py chain-info --network hedera_testnet

# Check balances (native + configured token1/token2)
uv run python scripts/cli.py check-balance <wallet> --network hedera_testnet

# Transfer ERC20
uv run python scripts/cli.py transfer --network hedera_testnet --to <recipient> --tokens "<token>#<amount>"

# Mint ERC20 (for mintable test/dev tokens)
uv run python scripts/cli.py mint --network hedera_testnet --token <token> --to <recipient> --amount <raw_amount>
```

## Project Structure

```
src/           - Main contract files
script/        - Deployment scripts
test/          - Test files
config/        - Configuration files (vaultConfig.json, genConfig.js)
lib/           - Dependencies (forge-std, openzeppelin-contracts)
```
