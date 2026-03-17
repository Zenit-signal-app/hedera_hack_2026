#!/usr/bin/env bash
# =============================================================================
# stop-local-node.sh
# Stop the Hiero Local Node (Hedera local dev environment).
# =============================================================================

set -euo pipefail

HIERO_DIR="$HOME/hiero-local-node"

# ── Colors ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info()    { echo -e "${BLUE}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }

echo ""
echo "=============================================="
echo "  Hedera Local Node (Hiero) - Stop"
echo "=============================================="
echo ""

if [ -d "$HIERO_DIR" ]; then
    info "Stopping Hiero Local Node..."
    cd "$HIERO_DIR"
    npm run stop 2>/dev/null || true
    success "Hiero Local Node stopped."
else
    warn "Hiero Local Node directory not found at $HIERO_DIR"
    warn "Attempting to stop any running Hiero containers..."
    docker ps --filter "name=hiero" --format "{{.Names}}" | xargs -r docker stop 2>/dev/null || true
    success "Done."
fi

echo ""
