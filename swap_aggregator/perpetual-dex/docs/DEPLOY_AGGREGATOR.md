# Deploy Zenit Aggregator (Exchange + QuoteAggregator)

## Kiểm tra nhanh smart contract (repo)

| Contract | Vai trò |
|----------|---------|
| `contracts/Exchange.sol` | Meta-router: `setAdapter`, `swap`, `quote`, `Pausable`, `ReentrancyGuard` |
| `contracts/interface/IAdapter.sol` | `quote` + `executeSwap` |
| `contracts/interface/IExchange.sol` | `SwapParams` + events |
| `contracts/QuoteAggregator.sol` | `quote(params)` → gọi `Exchange.quote` (ABI cố định cho frontend) |
| `contracts/adapters/UniswapV2LikeAdapter.sol` | Cần router V2-style (`getAmountsOut` + swap) — điền `AGGREGATOR_V2_ROUTER` khi deploy |
| `contracts/adapters/UniswapV3SwapRouterAdapter.sol` | SaucerSwap V2 CLMM — `SAUCERSWAP_V3_SWAP_ROUTER` + `SAUCERSWAP_V3_QUOTER`; `setAdapter` id khuyến nghị `saucerswap_v2` |
| `contracts/adapters/FixedRateSwapAdapter.sol` | Tỷ giá cố định — cần token in/out + rate (wei) |

**Lưu ý:** Luôn review/audit trước khi dùng mainnet với thanh khoản thật.

## Biến môi trường (`frontend/.env`)

Hardhat đọc **`perpetual-dex/frontend/.env`** (xem `hardhat.config.ts`).

| Biến | Mạng | Mô tả |
|------|------|--------|
| `HEDERA_MAINNET_PRIVATE_KEY` | Mainnet (295) | **Ưu tiên** — private key deploy mainnet (`0x` + 64 hex) |
| `PRIVATE_KEY` | Fallback | Dùng nếu không set key riêng theo mạng |
| `HEDERA_TESTNET_PRIVATE_KEY` | Testnet (296) | Tùy chọn — ví chỉ testnet |
| `HEDERA_MAINNET_RPC_URL` | Mainnet | Mặc định: `https://mainnet.hashio.io/api` |
| `HEDERA_TESTNET_RPC_URL` | Testnet | Mặc định: `https://testnet.hashio.io/api` |

**Không** commit file `.env`; không đưa private key vào `VITE_*` (frontend browser).

## Lệnh deploy

Từ thư mục `perpetual-dex/`:

```bash
npm run deploy:exchange:mainnet
# hoặc
npx hardhat run scripts/deployExchangeStack.ts --network hederaMainnet
```

Testnet:

```bash
npm run deploy:exchange:testnet
```

Script `scripts/deployExchangeStack.ts` deploy:

1. `Exchange` (owner = deployer)
2. `QuoteAggregator` (trỏ tới `Exchange`)
3. *(Tùy chọn)* `UniswapV2LikeAdapter` nếu có `AGGREGATOR_V2_ROUTER`
4. *(Tùy chọn)* `FixedRateSwapAdapter` nếu có đủ `FIXED_ADAPTER_TOKEN_*` và `FIXED_RATE_*`
5. *(Tùy chọn)* `UniswapV3SwapRouterAdapter` nếu có `SAUCERSWAP_V3_SWAP_ROUTER` và `SAUCERSWAP_V3_QUOTER` (cùng mạng; id mặc định `saucerswap_v2`)

**Quan trọng — id V1 (`UniswapV2LikeAdapter`):** script dùng **`ADAPTER_ID_V2=saucerswap`** (mặc định), **khớp** ô `VITE_AGGREGATOR_V1_ADAPTER_ID` và `resolveOnchainAdapterBytes32` trên UI. Nếu deploy cũ dùng `v2`, on-chain quote sẽ revert với id `saucerswap` — **không cần redeploy `Exchange`**: chạy `npm run register:adapter:mainnet` (đăng ký lại adapter với id `saucerswap`) hoặc `npm run verify:exchange:adapters:mainnet` để xem trạng thái.

Cuối script, copy địa chỉ `QuoteAggregator` vào:

`VITE_AGGREGATOR_QUOTE_CONTRACT=0x...`

## Rate cho FixedRateSwapAdapter

`FIXED_RATE_NUMERATOR` / `FIXED_RATE_DENOMINATOR` phải là **chuỗi số nguyên đầy đủ** (wei), ví dụ `1000000000000000000` cho 1e18 — **không** dùng dạng `1e18` trong `.env` nếu parser không hỗ trợ.

## Exchange đã deploy — chỉ đăng ký **SaucerSwap V2 CLMM** (`saucerswap_v2`)

UI venue SaucerSwap dùng hint **`saucerswap_v2`**, nhưng khi **không có pool CLMM** quote off-chain fallback **V1** — lúc đó on-chain cần **`UniswapV2LikeAdapter`** đã `setAdapter` với id **`saucerswap`** (hoặc `VITE_AGGREGATOR_V1_ADAPTER_ID`). CLMM cần **`UniswapV3SwapRouterAdapter`** + id **`saucerswap_v2`**. Frontend gửi đúng id theo từng route (không nhầm địa chỉ contract adapter với `bytes32` id).

Trong `frontend/.env`:

- `AGGREGATOR_EXCHANGE_ADDRESS=0x...` — địa chỉ **Exchange** đã deploy (cùng `VITE_AGGREGATOR_EXCHANGE_CONTRACT`).
- *(Tuỳ chọn mainnet)* `SAUCERSWAP_V3_SWAP_ROUTER` / `SAUCERSWAP_V3_QUOTER` — nếu bỏ trống, script dùng mặc định entity **0.0.3949434** (SwapRouter) và **0.0.3949424** (QuoterV2).
- `ADAPTER_ID_V3=saucerswap_v2` *(mặc định)*

```bash
cd perpetual-dex
npm run register:adapter:v3:mainnet
```

Testnet: bắt buộc set cả hai địa chỉ router + quoter từ [SaucerSwap deployments](https://docs.saucerswap.finance/developerx/contract-deployments).

```bash
npm run register:adapter:v3:testnet
```

**Lưu ý:** Ví Hardhat phải là **owner** của `Exchange` (cùng private key lúc deploy Exchange), vì `setAdapter` là `onlyOwner`.

---

## Exchange đã deploy — đăng ký adapter SaucerSwap V1 (fix `AdapterNotActive`)

**HeliSwap đã ngừng hoạt động** — dùng **SaucerSwap V1 RouterV3** (`getAmountsOut` + `path[]`). Không dùng địa chỉ router/pool HeliSwap.

Khi `diagnose:aggregator:mainnet` báo `adapters(saucerswap) → 0x0` (hoặc id bạn chọn) và `quote()` revert:

1. Trong `frontend/.env` thêm (hoặc dùng biến sẵn có):
   - `AGGREGATOR_EXCHANGE_ADDRESS=0x...` — trùng **`VITE_AGGREGATOR_EXCHANGE_CONTRACT`** (địa chỉ **Exchange**).
   - `AGGREGATOR_V2_ROUTER=0x00000000000000000000000000000000002e7a5d` — **SaucerSwapV1RouterV3** (entity `0.0.3045981`) hoặc bỏ qua để script dùng mặc định.
   - `ADAPTER_ID=saucerswap` (mặc định UI) — hoặc `heliswap` nếu bạn chỉ giữ đăng ký cũ.
2. Chạy: `npm run register:adapter:mainnet`
3. Chạy lại: `npm run diagnose:aggregator:mainnet` — có thể `ADAPTER_ID=saucerswap` trong shell để khớp `bytes32`.

Nếu adapter **active** mà `quote()` vẫn revert: thường là **sai địa chỉ token** hoặc **không có pool** cho path mặc định. Trên SaucerSwap V1, USDC–WHBAR thường đủ thanh khoản (2-hop); nếu cần, thêm `DIAGNOSE_BRIDGE_TOKEN=0x…` vào `frontend/.env` rồi chạy lại diagnose.

**Roadmap hoàn thiện dự án (sau diagnose):** xem **`PROJECT_NEXT_STEPS_AGGREGATOR.md`**.
