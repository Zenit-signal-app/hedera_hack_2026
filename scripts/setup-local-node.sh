#!/usr/bin/env bash
# =============================================================================
# setup-local-node.sh
# One-time setup: clone and install Hiero Local Node (Hedera local dev environment)
# =============================================================================

set -euo pipefail

HIERO_DIR="$HOME/hiero-local-node"
REPO_URL="https://github.com/hiero-ledger/hiero-local-node.git"

# ── Colors ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info()    { echo -e "${BLUE}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*" >&2; }

# ── Step 0: Check dependencies ───────────────────────────────────────────────
echo ""
echo "=============================================="
echo "  Hedera Local Node (Hiero) - Setup"
echo "=============================================="
echo ""

info "Checking dependencies..."

MISSING=()

command -v git    &>/dev/null || MISSING+=("git")
command -v node   &>/dev/null || MISSING+=("node (see https://nodejs.org)")
command -v npm    &>/dev/null || MISSING+=("npm (comes with Node.js)")
command -v docker &>/dev/null || MISSING+=("docker (see https://docs.docker.com/get-docker/)")

if [ ${#MISSING[@]} -gt 0 ]; then
    error "Missing required tools:"
    for pkg in "${MISSING[@]}"; do
        echo "         - $pkg"
    done
    echo ""
    echo "  Install them and re-run: bash scripts/setup-local-node.sh"
    exit 1
fi
success "Required tools: git, node, npm, docker"

# Check Docker is running
if ! docker info &>/dev/null; then
    error "Docker daemon is not running. Start Docker first."
    exit 1
fi
success "Docker daemon is running"

# ── Step 1: Clone or update the repo ─────────────────────────────────────────
echo ""
if [ -d "$HIERO_DIR/.git" ]; then
    warn "hiero-local-node already exists at $HIERO_DIR"
    info "Pulling latest changes..."
    git -C "$HIERO_DIR" pull || warn "Could not pull (non-critical)"
    success "Repository updated"
else
    info "Cloning hiero-local-node to $HIERO_DIR ..."
    git clone "$REPO_URL" "$HIERO_DIR"
    success "Cloned hiero-local-node"
fi

# ── Step 2: Install npm dependencies ─────────────────────────────────────────
echo ""
info "Installing npm dependencies..."
cd "$HIERO_DIR"
npm install
success "npm dependencies installed"

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}Setup complete!${NC}"
echo ""
echo "  Next step: bash scripts/start-local-node.sh"
echo ""
