# Swap sau quote — chẩn đoán & khắc phục (Zenit Exchange)

## Triệu chứng

- Quote (router / UI) hiển thị số USDC nhận được, nhưng **`Exchange.swap`** revert sau khi ký.
- HashPack / ví báo `CONTRACT_REVERT_EXECUTED` hoặc tương đương.
- Probe script: `Exchange.quote` revert nhưng gọi **QuoterV2 trực tiếp** (RPC) vẫn ra số; `staticCall swap` báo `SPENDER_DOES_NOT_HAVE_ALLOWANCE` khi **balance WHBAR = 0**.

### Giải thích nhanh (log probe)

| Hiện tượng | Ý nghĩa |
|------------|--------|
| `SPENDER_DOES_NOT_HAVE_ALLOWANCE` trên **staticCall** swap | Hedera HTS / ERC-20: mô phỏng `transferFrom` không có số dư hoặc chưa **approve** — **bình thường** nếu ví chưa có WHBAR ERC-20. Nạp WHBAR + `approve(Exchange)` rồi swap thật. |
| `Exchange.quote` revert (CLMM) nhưng Quoter trực tiếp OK | `UniswapV3SwapRouterAdapter.quote` gọi Quoter bằng **staticcall lồng**; trên Hedera đôi khi khác gọi Quoter từ RPC. **Swap thật không đi qua Quoter** — chỉ `SwapRouter.exactInput`. Giá trên UI vẫn có thể đúng (quote off-chain). |
| Script từng dùng nhầm default Quoter `…3c4370` | Entity **3949424** → EVM kết thúc **`…3c4250`** (đã sửa trong `diagnoseAggregatorMainnet` / probe). Luôn ưu tiên `VITE_SAUCERSWAP_V2_QUOTER_MAINNET` hoặc `quoter()` trên adapter deploy. |

## Nguyên nhân thường gặp

| Nguyên nhân | Mô tả |
|-------------|--------|
| **`SwapTooSmall`** | `amountOut < minAmountOut` — `minOut` được tính từ nguồn **lạc quan** hơn thực thi adapter (router `getAmountsOut` > output thực tế qua adapter). **Đã xử lý trong UI:** `minOut` dùng `min(router expected, Exchange.quote)` khi cả hai đều có. |
| **Adapter / id** | `adapterId` không khớp `adapterData`: V1 cần `abi.encode(address[])`, V2 CLMM cần `abi.encode(bytes path packed)` + id `saucerswap_v2`. Chỉ `setAdapter` đúng label (`saucerswap` / `saucerswap_v2`) và adapter deploy đúng router. |
| **`AdapterNotActive`** | Chưa `setAdapter` hoặc `active=false` — `verify:exchange:adapters:mainnet`, rồi `register:adapter:mainnet` hoặc `register:adapter:v3:mainnet`. |
| **WHBAR / HBAR** | `Exchange` chỉ swap **ERC-20**. Bán “HBAR” = cần **WHBAR** (wrap `deposit()` nếu thiếu). |
| **USDC / token out** | Trên Hedera, tài khoản phải **associate** token HTS — nếu không, transfer USDC vào ví có thể fail (thường revert ở router/DEX). |
| **Slippage** | Pool mỏng / giá trượt — tăng slippage (bps) hoặc giảm số lượng. |
| **Gas** | CLMM swap cần gas cao hơn V1 — UI đã set 12M vs 8M; nếu vẫn fail, thử tăng trong ví. |

## Script kiểm tra (10 WHBAR → USDC, khớp luồng Aggregate)

Dùng **cùng** `frontend/.env` với Hardhat (`PRIVATE_KEY` / `HEDERA_MAINNET_PRIVATE_KEY` + `VITE_AGGREGATOR_EXCHANGE_CONTRACT`, token USDC/WHBAR, router…).

```bash
cd perpetual-dex
npm run probe:swap:whbar-usdc:mainnet
```

Script sẽ:

1. So sánh V1 vs V2 (QuoterV2) — chọn venue giống logic `v2RouterQuote`.
2. Gọi `Exchange.quote` + **`swap` staticCall** (mô phỏng, không tốn gas).
3. In balance / allowance WHBAR.

**Chỉ khi bạn chủ động muốn gửi giao dịch thật:**

```bash
PROBE_SWAP_EXECUTE=1 npm run probe:swap:whbar-usdc:mainnet
```

**Không commit private key; không paste key vào chat.**

## Tài liệu liên quan

- `docs/AGGREGATOR.md` — kiến trúc adapter / quote.
- `docs/DEPLOY_AGGREGATOR.md` — deploy & biến môi trường.
- `npm run diagnose:aggregator:mainnet` — quote read-only (USDC↔WHBAR mặc định).
- `npm run verify:exchange:adapters:mainnet` — trạng thái `setAdapter`.
