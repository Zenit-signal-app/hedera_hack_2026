#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# deploy-custom.sh
# Deploy Vault to a Hedera-compatible EVM network
#
# Usage:
#   bash scripts/deploy-custom.sh                # Deploy with defaults
#   bash scripts/deploy-custom.sh --dry-run      # Simulate without broadcasting
#   bash scripts/deploy-custom.sh --help          # Show help
#
# Prerequisites:
#   1. Edit config/vaultConfig.json with your token addresses
#   2. Set OPERATOR_KEY and HEDERA_TESTNET_RPC_URL (or HEDERA_MAINNET_RPC_URL) in .env
#   3. Ensure deployer account has sufficient HBAR balance
# ============================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PY_CLI="$SCRIPT_DIR/cli.py"

# Defaults
DRY_RUN=false
NETWORK="hedera_local"

# ============ Argument Parsing ============

show_help() {
    cat <<'HELP'
deploy-custom.sh - Deploy Vault to a Hedera-compatible EVM network

Usage:
  bash scripts/deploy-custom.sh [OPTIONS]

Options:
  --dry-run          Simulate deployment without broadcasting transactions
  --network NAME     Network name from vaultConfig.json (default: hedera_testnet)
  --help             Show this help message

Prerequisites:
  1. Edit config/vaultConfig.json with your token addresses
  2. Set OPERATOR_KEY and HEDERA_TESTNET_RPC_URL (or HEDERA_MAINNET_RPC_URL) in .env
  3. Ensure deployer account has sufficient HBAR balance

Examples:
  bash scripts/deploy-custom.sh
  bash scripts/deploy-custom.sh --dry-run
  bash scripts/deploy-custom.sh --network hedera_local
  bash scripts/deploy-custom.sh --network hedera_testnet
  bash scripts/deploy-custom.sh --network hedera_mainnet
HELP
    exit 0
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --dry-run)     DRY_RUN=true; shift ;;
        --network)     NETWORK="$2"; shift 2 ;;
        --help)        show_help ;;
        *)             echo "Unknown option: $1"; show_help ;;
    esac
done

# ============ Color Helpers ============

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color
BOLD='\033[1m'

info()  { echo -e "${BLUE}[INFO]${NC}  $1"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $1"; }
err()   { echo -e "${RED}[ERROR]${NC} $1"; }
header() { echo -e "\n${BOLD}${CYAN}=== $1 ===${NC}\n"; }

# ============ Pre-flight Checks ============

header "Pre-flight Checks"

# Check required tools
for tool in forge cast node; do
    if ! command -v "$tool" &>/dev/null; then
        err "Required tool '$tool' is not installed."
        if [ "$tool" = "forge" ] || [ "$tool" = "cast" ]; then
            echo "    Install Foundry: curl -L https://foundry.paradigm.xyz | bash && foundryup"
        elif [ "$tool" = "node" ]; then
            echo "    Install Node.js: https://nodejs.org/"
        fi
        exit 1
    fi
done
ok "Required tools: forge, cast, node"

if ! command -v uv &>/dev/null; then
    err "Required tool 'uv' is not installed."
    echo "    Install uv: https://docs.astral.sh/uv/getting-started/installation/"
    exit 1
fi
ok "Required tool: uv"

if [ ! -f "$PY_CLI" ]; then
    err "Missing Python CLI helper: $PY_CLI"
    exit 1
fi
ok "Python CLI helper found"

# Check .env file
ENV_FILE="$PROJECT_DIR/.env"
if [ ! -f "$ENV_FILE" ]; then
    err ".env file not found. Copy from .env.example:"
    echo "    cp .env.example .env"
    exit 1
fi
ok ".env file found"

# Source .env
set -a
source "$ENV_FILE"
set +a

# Check OPERATOR_KEY
if [ -z "${OPERATOR_KEY:-}" ]; then
    err "OPERATOR_KEY is not set in .env"
    echo "    Generate one: openssl rand -hex 32"
    exit 1
fi
ok "OPERATOR_KEY is set"

# Determine RPC URL based on network
if [ "$NETWORK" = "custom" ]; then
    RPC_URL="${CUSTOM_RPC_URL:-}"
elif [ "$NETWORK" = "hedera_local" ]; then
    RPC_URL="${HEDERA_LOCAL_RPC_URL:-http://localhost:7546}"
elif [ "$NETWORK" = "hedera_testnet" ]; then
    RPC_URL="${HEDERA_TESTNET_RPC_URL:-}"
elif [ "$NETWORK" = "hedera_mainnet" ]; then
    RPC_URL="${HEDERA_MAINNET_RPC_URL:-}"
else
    # For any other network name, try the foundry.toml named endpoint
    RPC_URL=""
fi

if [ -z "$RPC_URL" ]; then
    err "RPC URL is not set for network '$NETWORK'."
    echo "    Set HEDERA_TESTNET_RPC_URL or HEDERA_MAINNET_RPC_URL in .env (or CUSTOM_RPC_URL)"
    exit 1
fi
ok "RPC URL: $RPC_URL"

# Create deploy directory early (before any checks that might exit)
DEPLOY_DIR="$PROJECT_DIR/deploy/$NETWORK"
mkdir -p "$DEPLOY_DIR"
info "Deploy directory: $DEPLOY_DIR"

# ============ Hedera Chain Info ============

header "Chain Information"

OPERATOR_ADDRESS=$(cast wallet address "$OPERATOR_KEY" 2>/dev/null)
info "Operator EVM address: $OPERATOR_ADDRESS"

# Get chain info
CHAIN_INFO=$(uv run python "$PY_CLI" chain-info --network "$NETWORK" --rpc-url "$RPC_URL" 2>&1) || {
    err "Failed to connect to RPC endpoint: $RPC_URL"
    echo "    $CHAIN_INFO"
    echo "    Make sure the RPC endpoint is running and accessible."
    exit 1
}

CHAIN_ID=$(echo "$CHAIN_INFO" | uv run python -c 'import json,sys; print(json.load(sys.stdin)["chainId"])')
CHAIN_NAME=$(echo "$CHAIN_INFO" | uv run python -c 'import json,sys; print(json.load(sys.stdin)["networkName"])')
LATEST_BLOCK=$(echo "$CHAIN_INFO" | uv run python -c 'import json,sys; print(json.load(sys.stdin)["latestBlock"])')

ok "Chain ID:      $CHAIN_ID"
ok "Network:       $CHAIN_NAME"
ok "Latest Block:  $LATEST_BLOCK"

# ============ Balance Check ============

header "Balance Check"

MIN_BALANCE="${CUSTOM_MIN_BALANCE:-100000000000000000}" # Default: 0.1 HBAR = 10^17 tinybar

BALANCE_RESULT=$(uv run python "$PY_CLI" check-balance "$OPERATOR_ADDRESS" --network "$NETWORK" --rpc-url "$RPC_URL" --min-threshold-wei "$MIN_BALANCE" --json 2>&1)
BALANCE_EXIT=$?

if [ $BALANCE_EXIT -eq 1 ]; then
    err "Failed to check balance: $BALANCE_RESULT"
    exit 1
fi

BALANCE_WEI=$(echo "$BALANCE_RESULT" | uv run python -c 'import json,sys; print(json.load(sys.stdin)["balanceWei"])')
BALANCE_FMT=$(echo "$BALANCE_RESULT" | uv run python -c 'import json,sys; print(json.load(sys.stdin)["balanceFormatted"])')
THRESHOLD_FMT=$(echo "$BALANCE_RESULT" | uv run python -c 'import json,sys; print(json.load(sys.stdin)["thresholdFormatted"])')
SUFFICIENT=$(echo "$BALANCE_RESULT" | uv run python -c 'import json,sys; print(str(json.load(sys.stdin)["sufficient"]).lower())')

info "Deployer balance:    $BALANCE_FMT"
info "Minimum threshold:   $THRESHOLD_FMT"

if [ "$SUFFICIENT" = "false" ]; then
    warn "Deployer balance is BELOW the minimum threshold!"
    warn "Fund your account with HBAR before deploying."
    warn "Hedera testnet faucet: https://portal.hedera.com/faucet"
    echo ""
    if [ "$DRY_RUN" = "false" ]; then
        read -rp "Continue anyway? (y/N): " CONFIRM
        if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
            info "Deployment cancelled."
            exit 0
        fi
    fi
else
    ok "Balance is sufficient for deployment"
fi

# ============ Generate Config ============

header "Config Generation"

info "Generating VaultConfig.sol for network: $NETWORK"
node "$PROJECT_DIR/config/genConfig.js" "$NETWORK"
ok "VaultConfig.sol generated"

# ============ Build ============

header "Building Contracts"

forge build --root "$PROJECT_DIR"
ok "Contracts compiled successfully"

# ============ Deploy ============

header "Deployment"

# Capture deployment output
DEPLOY_OUTPUT=""
DEPLOY_EXIT=0
DEPLOY_STATUS="unknown"

FORGE_SCRIPT_FLAGS=("--legacy" "--gas-limit" "15000000" "--skip-simulation")
if [ -n "${CUSTOM_GAS_PRICE:-}" ]; then
    FORGE_SCRIPT_FLAGS+=("--with-gas-price" "$CUSTOM_GAS_PRICE")
fi

if [ "$DRY_RUN" = "true" ]; then
    warn "DRY RUN - simulating deployment (no transactions will be broadcast)"
    echo ""
    set +e
    DEPLOY_OUTPUT=$(forge script script/Vault.s.sol:VaultScript \
        --rpc-url "$RPC_URL" \
        --root "$PROJECT_DIR" \
        "${FORGE_SCRIPT_FLAGS[@]}" 2>&1)
    DEPLOY_EXIT=$?
    set -e
    DEPLOY_STATUS="dry_run"
    if [ $DEPLOY_EXIT -eq 0 ]; then
        ok "Dry run completed (no transactions broadcast)"
    else
        warn "Dry run command exited with status $DEPLOY_EXIT"
    fi
else
    info "Broadcasting deployment to $CHAIN_NAME (Chain ID: $CHAIN_ID)..."
    echo ""

    set +e
    DEPLOY_OUTPUT=$(forge script script/Vault.s.sol:VaultScript \
        --rpc-url "$RPC_URL" \
        --broadcast \
        --root "$PROJECT_DIR" \
        "${FORGE_SCRIPT_FLAGS[@]}" 2>&1)
    DEPLOY_EXIT=$?
    set -e

    if [ $DEPLOY_EXIT -eq 0 ]; then
        DEPLOY_STATUS="success"
        ok "Deployment broadcast completed"
    else
        DEPLOY_STATUS="failed"
        warn "Deployment command exited with status $DEPLOY_EXIT"
        warn "Will still write deployment artifact for debugging"
    fi
fi

# Always persist raw deploy output for debugging
DEPLOY_LOG_FILE="$DEPLOY_DIR/vault.deploy.log"
printf "%s\n" "$DEPLOY_OUTPUT" > "$DEPLOY_LOG_FILE"
info "Raw deployment log: $DEPLOY_LOG_FILE"

# ============ Parse Deployment Info ============

header "Parsing Deployment Info"

# Extract contract address from output
CONTRACT_ADDRESS=$(echo "$DEPLOY_OUTPUT" | grep -oP "Vault deployed to: \K0x[a-fA-F0-9]{40}" | head -1 || true)
if [ -z "$CONTRACT_ADDRESS" ]; then
    CONTRACT_ADDRESS=$(echo "$DEPLOY_OUTPUT" | grep -oP "Deployer: \K0x[a-fA-F0-9]{40}" | head -1 || true)
fi

# Extract transaction hash from forge output
TX_HASH=$(echo "$DEPLOY_OUTPUT" | grep -oP "Tx Hash: \K0x[a-fA-F0-9]{64}" | tail -1 || true)

# Fallback: parse broadcast artifact if hash/address missing
BROADCAST_JSON="$PROJECT_DIR/broadcast/Vault.s.sol/$CHAIN_ID/run-latest.json"
if [ -f "$BROADCAST_JSON" ]; then
    if [ -z "$CONTRACT_ADDRESS" ]; then
        CONTRACT_ADDRESS=$(node -e "
            try {
                const fs = require('fs');
                const data = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
                const addr = data?.transactions?.[0]?.contractAddress || '';
                process.stdout.write(addr);
            } catch (_) { process.stdout.write(''); }
        " "$BROADCAST_JSON")
    fi

    if [ -z "$TX_HASH" ]; then
        TX_HASH=$(node -e "
            try {
                const fs = require('fs');
                const data = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
                const txs = data?.transactions || [];
                const hash = txs.length ? (txs[txs.length - 1].hash || '') : '';
                process.stdout.write(hash);
            } catch (_) { process.stdout.write(''); }
        " "$BROADCAST_JSON")
    fi
fi

# Get deployment timestamp
DEPLOY_TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Manager address (same as operator for this deployment)
MANAGER_ADDRESS=$OPERATOR_ADDRESS

info "Contract Address: ${CONTRACT_ADDRESS:-N/A}"
info "Transaction Hash:  ${TX_HASH:-N/A}"
info "Manager Address:  $MANAGER_ADDRESS"
info "Timestamp:        $DEPLOY_TIMESTAMP"

# ============ Write Deployment Info to YAML ============

header "Writing Deployment Info"

DEPLOY_FILE="$DEPLOY_DIR/vault.yaml"

# Get token addresses from VaultConfig.sol
TOKEN1_ADDR=$(grep -oP "TOKEN1\s*=\s*address\(\K0x[a-fA-F0-9]{40}" "$PROJECT_DIR/src/VaultConfig.sol" 2>/dev/null || echo "")
TOKEN2_ADDR=$(grep -oP "TOKEN2\s*=\s*address\(\K0x[a-fA-F0-9]{40}" "$PROJECT_DIR/src/VaultConfig.sol" 2>/dev/null || echo "")
MAX_SHAREHOLDERS=$(grep -oP "uint256 constant MAX_SHAREHOLDERS = \K[0-9]+" "$PROJECT_DIR/src/VaultConfig.sol" 2>/dev/null || echo "100")

cat > "$DEPLOY_FILE" <<EOF
# Vault Deployment Info
# Generated: $DEPLOY_TIMESTAMP

network:
  name: $NETWORK
  chain_id: $CHAIN_ID
  chain_name: $CHAIN_NAME

deployment:
  status: $DEPLOY_STATUS
  exit_code: $DEPLOY_EXIT
  contract_address: ${CONTRACT_ADDRESS:-""}
  transaction_hash: "${TX_HASH:-}"
  timestamp: $DEPLOY_TIMESTAMP
  block_number: ${LATEST_BLOCK:-""}
  raw_log_file: $DEPLOY_LOG_FILE

manager:
  address: $MANAGER_ADDRESS

tokens:
  token1: ${TOKEN1_ADDR:-""}
  token2: ${TOKEN2_ADDR:-""}

configuration:
  max_shareholders: ${MAX_SHAREHOLDERS:-100}

rpc:
  url: $RPC_URL
EOF

ok "Deployment info written to: $DEPLOY_FILE"

# ============ Post-Deploy Summary ============

header "Deployment Summary"

echo -e "${BOLD}Network Configuration${NC}"
echo "  Network:           $NETWORK ($CHAIN_NAME)"
echo "  Chain ID:          $CHAIN_ID"
echo "  RPC URL:           $RPC_URL"
echo ""
echo -e "${BOLD}Operator / Manager${NC}"
echo "  EVM Address:       $OPERATOR_ADDRESS"
echo ""
echo -e "${BOLD}Wallet Connection (MetaMask)${NC}"
echo "  Network Name:      $CHAIN_NAME"
echo "  RPC URL:           $RPC_URL"
echo "  Chain ID:          $CHAIN_ID"
echo "  Currency Symbol:   HBAR"
echo ""

if [ "$DRY_RUN" = "true" ]; then
    warn "This was a DRY RUN. No transactions were broadcast."
    echo "  Remove --dry-run to deploy for real."
elif [ "$DEPLOY_STATUS" = "failed" ]; then
    warn "Deployment failed (exit code: $DEPLOY_EXIT)"
    warn "Deployment artifact written to: $DEPLOY_FILE"
    warn "Raw forge output saved to: $DEPLOY_LOG_FILE"
    exit $DEPLOY_EXIT
else
    ok "Deployment complete!"
    echo ""
    info "Deployment info saved to: $DEPLOY_FILE"
    echo ""
    info "Next steps:"
    echo "  1. Check the deployed contract address: $CONTRACT_ADDRESS"
    echo "  2. Verify the contract on HashScan (https://hashscan.io)"
    echo "  3. Users can deposit token1 during the Deposit phase"
    echo "  4. Manager can execute operations during the Running phase"
    echo "  5. Manager calls withdraw() after transitioning to Withdraw"
fi

echo ""
info "Hedera helper commands:"
echo "  uv run python scripts/cli.py check-balance <address> --network $NETWORK"
echo "  uv run python scripts/cli.py chain-info --network $NETWORK"
