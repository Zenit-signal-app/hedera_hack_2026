#!/usr/bin/env bash
# =============================================================================
# deploy-token.sh
# Deploy ERC20 tokens (USDC, TOKEN_A) to a Hedera EVM network.
# Addresses are deterministic based on deployment order (first USDC, then TOKEN_A).
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$PROJECT_DIR/.env"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

info()    { echo -e "${BLUE}[INFO]${NC}  $*" >&2; }
success() { echo -e "${GREEN}[OK]${NC}    $*" >&2; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*" >&2; }
error()   { echo -e "${RED}[ERROR]${NC} $*" >&2; }

usage() {
    cat << EOF
Usage: $0 [network] [rpc-url]

Deploy USDC and TOKEN_A tokens to a Hedera EVM network.

Examples:
  $0                                                          # Deploy to hedera_local
  $0 hedera_local http://localhost:7546                        # Explicit local network/RPC
  $0 hedera_testnet https://testnet.hashio.io/api             # Deploy to testnet
  $0 hedera_mainnet https://mainnet.hashio.io/api             # Deploy to mainnet
EOF
    exit 1
}

load_env() {
    if [ -f "$ENV_FILE" ]; then
        set +u
        source "$ENV_FILE" 2>/dev/null || true
        set -u
    fi

    NETWORK_PARAM="${1:-${NETWORK:-hedera_local}}"
    
    if [ "$NETWORK_PARAM" = "custom" ]; then
        RPC_URL="${CUSTOM_RPC_URL:-}"
    elif [ "$NETWORK_PARAM" = "hedera_local" ]; then
        RPC_URL="${HEDERA_LOCAL_RPC_URL:-http://localhost:7546}"
    elif [ "$NETWORK_PARAM" = "hedera_testnet" ]; then
        RPC_URL="${HEDERA_TESTNET_RPC_URL:-}"
    elif [ "$NETWORK_PARAM" = "hedera_mainnet" ]; then
        RPC_URL="${HEDERA_MAINNET_RPC_URL:-}"
    else
        RPC_URL=""
    fi
    
    PRIVATE_KEY="${OPERATOR_KEY:-}"

    if [ -z "$PRIVATE_KEY" ]; then
        error "OPERATOR_KEY not set. Run: echo 'OPERATOR_KEY=0x...' > .env"
        exit 1
    fi
    
    if [ -z "$RPC_URL" ]; then
        error "RPC URL not set for network '$NETWORK_PARAM'. Set the appropriate *_RPC_URL in .env"
        exit 1
    fi
}

preflight() {
    info "Pre-flight checks..."
    
    for cmd in forge cast; do
        if ! command -v $cmd >/dev/null; then
            error "$cmd is required"
            exit 1
        fi
    done
    
    DEPLOYER="$(cast wallet address --private-key "$PRIVATE_KEY")"
    info "Deployer: $DEPLOYER"
    
    BALANCE=$(cast balance "$DEPLOYER" --rpc-url "$RPC_URL" 2>/dev/null || echo "0")
    if [ "$BALANCE" = "0" ]; then
        warn "Deployer has zero balance!"
    else
        success "Balance: $(cast from-wei $BALANCE 2>/dev/null || echo "$BALANCE") HBAR"
    fi
}

contract_exists() {
    local addr="$1"
    local code
    code=$(cast code "$addr" --rpc-url "$RPC_URL" 2>/dev/null || echo "0x")
    [ "${code}" != "0x" ] && [ "${#code}" -gt 2 ]
}

deploy_token() {
    local name="$1"
    local symbol="$2"
    local contract_path="$3"
    local mint_amount="$4"
    local deploy_dir="$5"

    local existing_addr=""
    if [ -f "$deploy_dir/token.yaml" ]; then
        existing_addr=$(grep -A2 "symbol: $symbol" "$deploy_dir/token.yaml" | grep "address:" | awk '{print $2}' || true)
    fi
    
    if [ -n "$existing_addr" ] && contract_exists "$existing_addr"; then
        success "$name already exists at: $existing_addr"
        if [ -n "$mint_amount" ] && [ "$mint_amount" -gt 0 ]; then
            cast send "$existing_addr" \
                "mint(address,uint256)" \
                "$DEPLOYER" "$mint_amount" \
                --private-key "$PRIVATE_KEY" \
                --rpc-url "$RPC_URL" >/dev/null 2>&1 || true
            success "Minted additional $mint_amount $symbol"
        fi
        echo "$existing_addr"
        return 0
    fi
    
    info "Deploying $name ($symbol)..."
    
    OUTPUT=$(forge create --broadcast \
        "$PROJECT_DIR/$contract_path" \
        --private-key "$PRIVATE_KEY" \
        --rpc-url "$RPC_URL" 2>&1)
    
    TOKEN_ADDR=$(echo "$OUTPUT" | grep "Deployed to:" | grep -oE "0x[a-fA-F0-9]{40}" | tail -1)
    
    if [ -z "$TOKEN_ADDR" ]; then
        error "Failed to deploy $name"
        echo "$OUTPUT"
        exit 1
    fi
    
    success "$name at: $TOKEN_ADDR"
    
    if [ -n "$mint_amount" ] && [ "$mint_amount" -gt 0 ]; then
        cast send "$TOKEN_ADDR" \
            "mint(address,uint256)" \
            "$DEPLOYER" "$mint_amount" \
            --private-key "$PRIVATE_KEY" \
            --rpc-url "$RPC_URL" >/dev/null 2>&1 || true
        success "Minted $mint_amount $symbol"
    fi
    
    echo "$TOKEN_ADDR"
}

main() {
    if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
        usage
    fi

    local network_arg="$1"
    if [ "$network_arg" = "--network" ]; then
        network_arg="$2"
    fi

    echo ""
    echo "=============================================="
    echo "  Token Deployment"
    echo "=============================================="
    echo ""

    load_env "$network_arg"
    preflight

    DEPLOY_DIR="$PROJECT_DIR/deploy/$NETWORK_PARAM"
    mkdir -p "$DEPLOY_DIR"

    if [ -f "$DEPLOY_DIR/token.yaml" ]; then
        cp "$DEPLOY_DIR/token.yaml" "$DEPLOY_DIR/token.yaml.bak"
    fi

    info "Deploying tokens..."
    echo ""

    USDC_ADDR=$(deploy_token "USD Coin" "USDC" "src/Token1.sol:USDC" $((1000000 * 10**6)) "$DEPLOY_DIR")
    
    TOKEN_A_ADDR=$(deploy_token "Token A" "TOKEN_A" "src/Token2.sol:TOKEN_A" $((1000000 * 10**18)) "$DEPLOY_DIR")

    echo ""
    echo "=============================================="
    echo "  Deployment Complete"
    echo "=============================================="
    echo ""
    echo -e "${CYAN}Token Addresses:${NC}"
    echo -e "  USDC:     ${BOLD}$USDC_ADDR${NC}"
    echo -e "  TOKEN_A:  ${BOLD}$TOKEN_A_ADDR${NC}"
    echo ""

    cat > "$DEPLOY_DIR/token.yaml" << EOF
# Token Deployment
network:
  name: $NETWORK_PARAM
  rpc_url: $RPC_URL
tokens:
  - name: USD Coin
    symbol: USDC
    address: $USDC_ADDR
    decimals: 6
    initial_supply: $((1000000 * 10**6))
  - name: Token A
    symbol: TOKEN_A
    address: $TOKEN_A_ADDR
    decimals: 18
    initial_supply: $((1000000 * 10**18))
EOF

    success "Artifacts: $DEPLOY_DIR/token.yaml"
    echo ""
}

main "$@"
