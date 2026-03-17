#!/usr/bin/env bash
# =============================================================================
# start-local-node.sh
# Start Hiero Local Node (Hedera local dev environment).
# Includes Consensus Node, Mirror Node, JSON-RPC Relay, Block Node, and more.
# =============================================================================

set -euo pipefail

HIERO_DIR="$HOME/hiero-local-node"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$PROJECT_DIR/.env"
ENV_EXAMPLE="$PROJECT_DIR/.env.example"

# ── Colors ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

info()    { echo -e "${BLUE}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*" >&2; }

echo ""
echo "=============================================="
echo "  Hedera Local Node (Hiero) - Start"
echo "=============================================="
echo ""

# ── Pre-check: Docker ─────────────────────────────────────────────────────────
if ! command -v docker &>/dev/null; then
    error "Docker is not installed. Install from https://docs.docker.com/get-docker/"
    exit 1
fi
if ! docker info &>/dev/null; then
    error "Docker daemon is not running. Start Docker first."
    exit 1
fi
success "Docker is running"

# ── Pre-check: Node.js / npm ─────────────────────────────────────────────────
if ! command -v npm &>/dev/null; then
    error "npm is not installed. Install Node.js from https://nodejs.org/"
    exit 1
fi
success "npm found"

# ── Pre-check: Hiero Local Node ──────────────────────────────────────────────
if [ ! -d "$HIERO_DIR" ]; then
    error "Hiero Local Node not found at $HIERO_DIR"
    echo ""
    echo "  Run the setup script first:"
    echo "    bash scripts/setup-local-node.sh"
    echo ""
    exit 1
fi
success "Hiero Local Node found at $HIERO_DIR"

# ── Generate / load OPERATOR_KEY ──────────────────────────────────────────────
echo ""
info "Checking OPERATOR_KEY..."

if [ ! -f "$ENV_FILE" ]; then
    if [ -f "$ENV_EXAMPLE" ]; then
        cp "$ENV_EXAMPLE" "$ENV_FILE"
        info "Created .env from .env.example"
    else
        touch "$ENV_FILE"
        info "Created empty .env"
    fi
fi

# Source the .env
set +u
# shellcheck disable=SC1090
source "$ENV_FILE" 2>/dev/null || true
set -u

if [ -z "${OPERATOR_KEY:-}" ]; then
    info "Generating new OPERATOR_KEY..."
    NEW_KEY="0x$(openssl rand -hex 32)"

    if grep -q "^OPERATOR_KEY=" "$ENV_FILE"; then
        sed -i "s|^OPERATOR_KEY=.*|OPERATOR_KEY=$NEW_KEY|" "$ENV_FILE"
    else
        echo "OPERATOR_KEY=$NEW_KEY" >> "$ENV_FILE"
    fi

    OPERATOR_KEY="$NEW_KEY"
    success "Generated new OPERATOR_KEY"
else
    success "OPERATOR_KEY already set in .env"
fi

# Ensure HEDERA_LOCAL_RPC_URL is set in .env
if ! grep -q "^HEDERA_LOCAL_RPC_URL=" "$ENV_FILE"; then
    echo "HEDERA_LOCAL_RPC_URL=http://localhost:7546" >> "$ENV_FILE"
    info "Added HEDERA_LOCAL_RPC_URL=http://localhost:7546 to .env"
fi

# ── Start Hiero Local Node ───────────────────────────────────────────────────
echo ""
info "Starting Hiero Local Node..."
cd "$HIERO_DIR"
npm run start

success "Hiero Local Node started"

# ── Print connection info ─────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${GREEN}=============================================="
echo -e "  Hedera Local Node Running!"
echo -e "==============================================${NC}"
echo ""
echo -e "${CYAN}  JSON-RPC Relay:${NC}    http://localhost:7546"
echo -e "${CYAN}  Mirror Node REST:${NC}  http://localhost:5551"
echo -e "${CYAN}  Consensus Node:${NC}    Running in Docker"
echo ""
echo -e "${CYAN}  Your Operator:${NC}"
echo -e "    Private Key:  ${BOLD}${OPERATOR_KEY}${NC}"
echo -e "    (stored in .env as OPERATOR_KEY)"
echo ""
echo -e "${CYAN}  MetaMask Network Config:${NC}"
echo -e "    Network Name: Hedera Local"
echo -e "    RPC URL:      http://localhost:7546"
echo -e "    Chain ID:     298 (Hiero local default)"
echo -e "    Currency:     HBAR"
echo ""
echo -e "${CYAN}  Hiero Local Node Commands:${NC}"
echo -e "    Stop node:      bash scripts/stop-local-node.sh"
echo -e "    View containers: docker ps"
echo ""
echo -e "${CYAN}  Foundry Deploy:${NC}"
echo -e "    forge script script/Vault.s.sol:VaultScript \\"
echo -e "      --rpc-url http://localhost:7546 --broadcast"
echo ""
