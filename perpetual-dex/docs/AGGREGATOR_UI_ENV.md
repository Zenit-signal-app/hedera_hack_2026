# Aggregator UI — biến env & id adapter (đúng / sai thường gặp)

## `bytes32 adapterId` ≠ địa chỉ contract

Trên **`Exchange.setAdapter(bytes32 adapterId, address adapter, bool active)`**:

| Đúng | Sai |
|------|-----|
| Chuỗi ngắn (≤ 31 ký tự) ví dụ `saucerswap`, `saucerswap_v2` | Dán **địa chỉ EVM** của contract `UniswapV2LikeAdapter` / `UniswapV3SwapRouterAdapter` (`0x` + 40 hex) |

Frontend encode: `ethers.encodeBytes32String("saucerswap_v2")`.  
Nếu dán nhầm `0xC720…` (địa chỉ adapter), bytes32 sẽ **không** trùng id đã đăng ký → lỗi **`AdapterNotActive`**.

Ô **“Adapter id (optional)”** trên `/aggregate`: nhập **tên id** hoặc **để trống** (dùng logic theo quote). **Không** dán địa chỉ contract.

## Biến `VITE_*` (browser)

| Biến | Ý nghĩa |
|------|---------|
| `VITE_AGGREGATOR_QUOTE_CONTRACT` | Địa chỉ **`QuoteAggregator`** (hoặc `Exchange` nếu bạn gọi `quote` trực tiếp). |
| `VITE_AGGREGATOR_EXCHANGE_CONTRACT` | Địa chỉ **`Exchange`** — bắt buộc cho **swap** on-chain. |
| `VITE_AGGREGATOR_V1_ADAPTER_ID` | Id **V1** đã `setAdapter` (mặc định `saucerswap`). Dùng khi quote off-chain fallback **V1 AMM** (`swapExecution === 'v1_amm'`). **Không** đặt địa chỉ `0x…`. |
| `VITE_AGGREGATOR_TOKEN_*_MAINNET` | Địa chỉ ERC-20 facade **USDC / WHBAR** mainnet — phải khớp pool thật trên SaucerSwap. |

## Hai adapter SaucerSwap phổ biến

1. **`UniswapV2LikeAdapter`** + router V1 — id thường **`saucerswap`** — `extraData = abi.encode(address[])`.
2. **`UniswapV3SwapRouterAdapter`** (CLMM) — id thường **`saucerswap_v2`** — `extraData = abi.encode(bytes path)`.

UI chọn **`adapterId` on-chain** theo `swapExecution` để khớp `encodedPath` (tránh `InvalidPath` / `AdapterNotActive`).

## Hardhat (không có tiền tố `VITE_`)

| Biến | Script |
|------|--------|
| `AGGREGATOR_EXCHANGE_ADDRESS` | `registerV2Adapter`, `registerV3SwapRouterAdapter` |
| `ADAPTER_ID` | `registerV2Adapter` — mặc định `saucerswap` |
| `ADAPTER_ID_V3` | `registerV3SwapRouterAdapter` — mặc định `saucerswap_v2` |

Xem thêm: `docs/DEPLOY_AGGREGATOR.md`, `command.md` (mục Aggregator).
