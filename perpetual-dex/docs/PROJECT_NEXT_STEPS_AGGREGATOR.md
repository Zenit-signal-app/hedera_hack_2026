# Hoàn thiện Aggregator (sau `diagnose:aggregator:mainnet`)

**HeliSwap đã chấm dứt hoạt động** — không dùng router/pool HeliSwap; thanh khoản đang được rút. Route mặc định trong repo là **SaucerSwap V1** (Uniswap V2–style `getAmountsOut`).

**Lưu ý tên “V2”:** Trên [docs SaucerSwap](https://docs.saucerswap.finance/protocol/saucerswap-v2), **SaucerSwap V2** là AMM **Uniswap V3** (concentrated liquidity). Adapter hiện tại (`UniswapV2LikeAdapter`) chỉ hỗ trợ **`getAmountsOut` + path[]** — tương thích **SaucerSwap V1** (entity **Router 0.0.3045981**, **Factory 0.0.1062784**). Entity **0.0.3949425** gần các contract **V3** (vd. Quoter `0.0.3949424`) — **không** dùng cho adapter V2-style này.

---

## Bước 1 — Đăng ký adapter trỏ tới SaucerSwap V1

1. Trong `frontend/.env` (Hardhat đọc file này):
   - `AGGREGATOR_V2_ROUTER=0x00000000000000000000000000000000002e7a5d` — **SaucerSwapV1RouterV3** (entity `0.0.3045981`; hoặc bỏ qua để script dùng mặc định).
   - `ADAPTER_ID=saucerswap` — khớp UI mặc định.
2. Chạy: `npm run register:adapter:mainnet`
3. Chạy: `npm run diagnose:aggregator:mainnet` (có thể `export ADAPTER_ID=saucerswap` nếu cần).

Nếu Exchange của bạn **chỉ** có `bytes32("heliswap")` đã đăng ký trước đây: hoặc chạy lại `register` với router SaucerSwap + `ADAPTER_ID=saucerswap`, hoặc tạm thời chọn venue **HeliSwap (đã đóng)** trong UI / đặt `ADAPTER_ID=heliswap` khi diagnose — **khuyến nghị** chuyển hẳn sang `saucerswap`.

---

## Bước 2 — Token & route (USDC ↔ WHBAR)

- **WHBAR** token id phổ biến: **0.0.1456986** (địa chỉ EVM trong env thường dạng `0x…163b5a` — đối chiếu [deployments](https://docs.saucerswap.finance/developerx/contract-deployments)).
- Trên SaucerSwap V1, cặp **USDC–WHBAR** thường có thanh khoản tốt — **direct 2-hop** có thể đủ; `DIAGNOSE_BRIDGE_TOKEN` chỉ cần khi router không có pool trực tiếp với địa chỉ token trong env.

---

## Bước 3 — Frontend

- Trang `/aggregate` quote qua **SaucerSwap V1 Router** + `encodedPath` (`v2RouterQuote.ts`).
- Đặt `VITE_AGGREGATOR_V2_ROUTER_MAINNET` hoặc để trống (mặc định repo = RouterV3).
- Đặt `VITE_SAUCERSWAP_V1_FACTORY_EVM_MAINNET` hoặc để trống (mặc định = Factory V1 cho Mirror graph).

---

## Bước 4 — Tương lai (SaucerSwap “V2” = Uniswap V3)

- Cần **adapter mới** (QuoterV2 / `exactInput` với path bytes) — không thuộc phạm vi `UniswapV2LikeAdapter` hiện tại.

---

## Checklist P0

- [ ] `register:adapter:mainnet` với router SaucerSwap V1  
- [ ] `diagnose:aggregator:mainnet` → `getAmountsOut` + `quote()` OK  
- [ ] UI `/aggregate` + swap thử nhỏ  

Xem thêm: **`DEPLOY_AGGREGATOR.md`**, **`DEBUG_QUOTE_REVERT.md`**.
