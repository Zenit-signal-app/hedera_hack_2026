# Native HBAR Swap Guide

## Overview

The Liquidity Aggregator now supports **direct native HBAR → token swaps** without requiring manual WHBAR wrapping. Users can simply select "HBAR" as the input token and swap to any supported token (USDC, SAUCE, etc.).

## How It Works

The app automatically routes your swap through one of three methods:

### 1. SaucerSwap V1 Router (Direct)
- **Best for**: Simple HBAR → token swaps
- **Function**: `swapExactETHForTokensSupportingFeeOnTransferTokens`
- **Gas**: ~150k-200k
- **Tested**: ✅ 5 HBAR → 0.463 USDC (TX: `0x2566ebdbe642eb8fdc7a860c651afedd30d26a5dd2021526798fd36cd2e78b69`)

### 2. Exchange + NativeHbarV1Adapter
- **Best for**: V1 AMM pools via Exchange contract
- **Process**: Adapter wraps HBAR → WHBAR internally, then swaps via SaucerSwap V1
- **Gas**: ~2-3M

### 3. Exchange + NativeHbarV2Adapter
- **Best for**: CLMM (V2) pools via Exchange contract
- **Process**: Adapter wraps HBAR → WHBAR internally, then swaps via SaucerSwap V2
- **Gas**: ~3-3.5M

## User Experience

1. **Select HBAR** as input token from dropdown
2. **Enter amount** (e.g., 5 HBAR)
3. **Select output token** (e.g., USDC)
4. **Click "Get Quote"** - app fetches best route
5. **Click "Swap"** - app automatically:
   - Sends native HBAR as `msg.value`
   - Routes through best available method
   - No approve needed (native HBAR)
   - No manual wrapping required

## UI Messages

- **HBAR selected**: Shows "Native HBAR swap" info with automatic routing explanation
- **WHBAR selected**: Shows "WHBAR swap" info for ERC-20 token flow
- **Balance**: Displays native HBAR balance (not WHBAR ERC-20)

## Technical Details

### Unit Conversions
- **HBAR**: 8 decimals (tinybars)
- **msg.value**: 18 decimals (weibars)
- **Conversion**: `weibars = tinybars * 10^10`

### Router Quote
```typescript
// Router uses tinybars for quote
const amountTinybars = parseUnits("5", 8);  // 500000000
const amounts = await router.getAmountsOut(amountTinybars, [WHBAR, USDC]);

// But msg.value uses weibars
const valueWei = amountTinybars * 10n ** 10n;  // 5000000000000000000
await router.swapExactETHForTokens(..., { value: valueWei });
```

### Path Requirements
- Path must start with WHBAR address
- Example: `[WHBAR, USDC]` for HBAR → USDC
- Router automatically handles native HBAR → WHBAR conversion

## Testing

Test script available: `scripts/test5HbarDirectSwap.ts`

```bash
npx hardhat run scripts/test5HbarDirectSwap.ts --network hederaMainnet
```

**Test Results** (Mainnet):
- Input: 5 HBAR
- Output: 0.463029 USDC
- Gas used: 154,317
- Status: ✅ SUCCESS

## Requirements

1. **Token Association**: Output token must be associated with wallet (HTS requirement)
2. **HBAR Balance**: Sufficient native HBAR for swap + gas
3. **Network**: Hedera mainnet (chain ID 295)
4. **Wallet**: HashPack or EVM wallet (MetaMask, etc.)

## Configuration

Environment variables (already configured):
```env
VITE_AGGREGATOR_TOKEN_WHBAR_MAINNET=0x0000000000000000000000000000000000163b5a
VITE_AGGREGATOR_TOKEN_USDC_MAINNET=0x000000000000000000000000000000000006f89a
VITE_SAUCERSWAP_V1_ROUTER_MAINNET=0x00000000000000000000000000000000002e7a5d
VITE_AGGREGATOR_EXCHANGE_CONTRACT=0xb26ffBe614D95c925623218CF600bc1416A513Ba
```

## Troubleshooting

### "Token not associated"
- Associate output token in HashPack before swapping
- Check token ID on HashScan

### "Insufficient balance"
- Ensure enough HBAR for swap amount + gas (~0.2-0.6 HBAR)
- Check native HBAR balance (not WHBAR)

### "Wrong network"
- Switch to Hedera mainnet (chain ID 295)
- Check wallet network settings

## Future Improvements

- [ ] Support token → HBAR swaps (unwrap at end)
- [ ] Optimize gas usage for adapter routes
- [ ] Add price impact warnings for large swaps
- [ ] Support multi-hop native HBAR routes

## References

- Test TX: https://hashscan.io/mainnet/transaction/0x2566ebdbe642eb8fdc7a860c651afedd30d26a5dd2021526798fd36cd2e78b69
- SaucerSwap Docs: https://docs.saucerswap.finance/
- Hedera EVM: https://docs.hedera.com/hedera/core-concepts/smart-contracts/ethereum-virtual-machine-evm
