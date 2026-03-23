# SaucerSwap V2 (CLMM) — QuoterV2 & khác biệt với V1

**SaucerSwap V1** (Uniswap V2–style): router `getAmountsOut(uint256 amountIn, address[] path)` — path là **mảng địa chỉ** token liên tiếp.

**SaucerSwap V2** (Uniswap V3–style, **concentrated liquidity**): **QuoterV2** dùng `quoteExactInputSingle` (1 pool) hoặc `quoteExactInput(bytes path, amountIn)` (multi-hop). Path phải **encode packed**: `tokenIn | uint24 fee | tokenMid | uint24 fee | … | tokenOut`.

HeliSwap (fork V2 cũ) đã đóng; thanh khoản thực tế cần tham chiếu **SaucerSwap** deployments.

## QuoterV2 mainnet (Hedera)

| | |
|--|--|
| **Entity** | `0.0.3949424` |
| **EVM (long-zero)** | `0x00000000000000000000000000000000003c4370` |
| **Override env** | `VITE_SAUCERSWAP_V2_QUOTER_MAINNET` |

Tài liệu: [SaucerSwap — Contract deployments](https://docs.saucerswap.finance/developerx/contract-deployments).

Trong repo, default trùng entity trên: `DEFAULT_SAUCERSWAP_V2_QUOTER_MAINNET` trong `frontend/src/config/aggregator.ts`.

## Fee tier (uint24)

Pool CLMM được gắn **một** mức phí; nếu gọi Quoter với fee **không** trùng pool đã triển khai → thường **revert**.

Zenit thử lần lượt (xem `frontend/src/lib/saucerswapV2Quoter.ts`):

| Phí | `uint24` |
|-----|----------|
| 0,01% | 100 |
| 0,05% | 500 |
| 0,15% | **1500** |
| 0,30% | 3000 |
| 1,00% | 10000 |

**Tốc độ quote:** Path **direct** dùng đủ các tier trên (song song hóa `getPool` + `quoteExactInputSingle`). Path **≥3 cạnh** dùng tập nhỏ hơn `[500, 3000, 10000]` để giảm số `eth_call`. Path multi-hop V2 bị **giới hạn số shape** (`MAX_V2_MULTIHOP_SHAPES`) sau khi loại duplicate 2-token (đã quote ở bước direct).

**Lưu ý:** Một số tài liệu chỉ nêu 500 / 3000 / 10000; nếu thanh khoản nằm ở **1500** mà code không thử → có thể “không có quote V2” dù pool tồn tại — **1500 vẫn được thử cho direct và path 2 cạnh**.

## `sqrtPriceLimitX96`

Trong `quoteExactInputSingle`, Zenit đặt **`0`** (không giới hạn giá) — đúng pattern mặc định khi chỉ cần quote.

## Multi-hop

Path 2 cạnh (ví dụ USDC → SAUCE → WHBAR):

```text
solidityPacked: [USDC, fee0, SAUCE, fee1, WHBAR]
```

Mỗi cạnh có fee riêng; repo sinh tổ hợp fee qua `feeCombinations` + `buildSaucerAggregatorPathShapes` (`saucerPathFinder.ts`).

## Fallback V1

Nếu mọi gọi QuoterV2 thất bại, `v2RouterQuote.ts` vẫn có thể dùng **SaucerSwap V1 Router** `getAmountsOut` + path `address[]` — nhiều pool “cũ” vẫn là AMM kiểu V2.

Router V1 tham chiếu (mainnet): entity **0.0.3045981** — xem `VITE_AGGREGATOR_V2_ROUTER_MAINNET` / docs.

## Selector `0xdb8fe633` (on-chain quote qua Exchange)

Khi `Exchange.quote` → `UniswapV3SwapRouterAdapter.quote` → Quoter revert, adapter Zenit ném **`QuoterCallFailed()`** — 4 byte đầu revert data là **`0xdb8fe633`**.

Đây là **custom error của contract adapter** trong repo, *không* phải function selector của QuoterV2. Nguyên nhân gốc vẫn thường là: **pool/fee không khớp**, path sai, hoặc RPC/`eth_call` lỗi.

Chi tiết hiển thị UI: `frontend/src/lib/aggregatorOnchainQuoteErrors.ts`.

## Checklist

1. **RPC:** Hashio / relay hỗ trợ `eth_call` tới Quoter (Zenit dùng `batchMaxCount: 1` trong provider).
2. **Địa chỉ token** mainnet đúng (USDC / WHBAR facade).
3. **Đủ fee tier** trong vòng lặp quote (gồm **1500**).
4. **Fallback V1** khi CLMM không có pool cho cặp đó.
