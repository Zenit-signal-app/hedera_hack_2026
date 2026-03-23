# Hedera Mainnet rollout (Zenit perpetual-dex)

Checklist để chạy app và aggregator trên **mainnet (EVM chain 295)**.

## 1. Biến môi trường frontend (`frontend/.env`)

| Biến | Mô tả |
|------|--------|
| `VITE_HEDERA_EVM_NETWORK=mainnet` | Bật wagmi + HashPack WalletConnect cho chain **295** (bắt buộc cho mainnet). |
| `VITE_HEDERA_MAINNET_RPC_URL` | (Tuỳ chọn) RPC, mặc định `https://mainnet.hashio.io/api`. |
| `VITE_HEDERA_MIRROR_REST` | (Tuỳ chọn) Mirror REST, ví dụ `https://mainnet.mirrornode.hedera.com`. |
| `VITE_AGGREGATOR_NETWORK=mainnet` | Mục tiêu quote UI (nếu không set sẽ theo `VITE_HEDERA_EVM_NETWORK`). |
| `VITE_AGGREGATOR_QUOTE_CONTRACT` | Địa chỉ `QuoteAggregator` hoặc `Exchange` (on-chain `quote`). |
| `VITE_AGGREGATOR_EXCHANGE_CONTRACT` | Địa chỉ **`Exchange`** (bắt buộc cho swap UI: `approve` + `swap`). |
| `VITE_AGGREGATOR_TOKEN_USDC_MAINNET` / `VITE_AGGREGATOR_TOKEN_WHBAR_MAINNET` | **Bắt buộc** để route **SaucerSwap V1** thật (địa chỉ ERC-20 facade trên mainnet). USDC thường **6 decimals** — chỉnh ô decimals token in nếu cần. |
| `VITE_AGGREGATOR_V2_ROUTER_MAINNET` | (Tuỳ chọn) Ghi đè router; mặc định **SaucerSwapV1RouterV3** — [deployments](https://docs.saucerswap.finance/developerx/contract-deployments). HeliSwap đã đóng. |
| `VITE_DEX_ADDRESS`, `VITE_TOKEN_ADDRESS`, … | Địa chỉ contract Perp DEX khi đã deploy mainnet. |

**Không** commit private key; chỉ dùng key trên máy build/deploy backend/hardhat.

## 2. Smart contracts đã deploy (tham chiếu)

- Stack aggregator (ví dụ từ `deployExchangeStack`): ghi lại `Exchange` và `QuoteAggregator` vào env phía trên.
- Perp DEX đầy đủ (`deploy.ts`, oracle, reward, …): deploy riêng khi đã có token collateral mainnet (zUSDC) và deployer đủ HBAR.

## 3. Keeper / faucet

- Faucet test zUSDC trong UI chỉ dùng cho **testnet**. Trên mainnet cần collateral thật và keeper (nếu có) trỏ đúng network + contract.

## 4. Build

```bash
cd frontend && npm run build
```

Xác minh trên HashPack: network **Hedera Mainnet**, chain **295**, RPC khớp env.

## 5. Kiểm tra nhanh

1. Kết nối ví → không báo sai chain.
2. Trang Liquidity Aggregator → quote (mock hoặc on-chain) khớp network.
3. Giao dịch perp (nếu đã cấu hình contract mainnet) → explorer `https://hashscan.io/mainnet`.
