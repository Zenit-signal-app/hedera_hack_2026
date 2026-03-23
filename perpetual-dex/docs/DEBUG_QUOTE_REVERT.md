# Debug `quote()` bị revert (QuoteAggregator / Exchange)

Khi UI hoặc RPC báo:

```text
execution reverted (no data present; likely require(false) occurred)
data="0x"
```

nghĩa là **lệnh `eth_call` đã chạy trên contract** nhưng **EVM revert**; `data="0x"` = **không có ABI-encoded revert reason** (khác với lỗi có tên như `AdapterNotActive`).

**UI Zenit:** Nếu quote **off-chain** đã thành công (`quoteSource === 'router_v2'` và có `expectedOutHuman` / `expectedOutWei`), **mọi** lỗi `Exchange.quote` on-chain được **không hiển thị như cảnh báo vàng/đỏ** — chỉ ghi chú xám (giá vẫn từ router off-chain). Xem `shouldSuppressOnchainQuoteErrorUi` trong `frontend/src/lib/aggregatorOnchainQuoteErrors.ts`.

---

## 1. Luồng thực thi (đọc contract)

```
QuoteAggregator.quote(params)
  → Exchange.quote(params)
    → adapters[adapterId] phải active
    → UniswapV2LikeAdapter.quote(request)
      → path = abi.decode(adapterData) HOẶC mặc định [tokenIn, tokenOut]
      → router.getAmountsOut(amountIn, path)
```

File tham chiếu:

| Bước | File |
|------|------|
| Gọi `exchange.quote` | `contracts/QuoteAggregator.sol`, `contracts/Exchange.sol` |
| Path + router | `contracts/adapters/UniswapV2LikeAdapter.sol` |

**Selector** `0x083a4ae5` = `quote((bytes32,address,address,uint256,uint256,address,uint256,bytes))` (tuple `SwapParams`).

---

## 2. Phân loại revert (có data vs không data)

| Hiện tượng | Ý nghĩa gợi ý |
|------------|----------------|
| Revert **có** mã 4 byte + payload | Thường là **custom error** Solidity 0.8 (`AdapterNotActive`, `InvalidPath`, …) — dễ decode. |
| Revert **`data="0x"`** | Thường là **router/pool** (AMM fork) revert **không message**, hoặc lỗi sâu trong `getAmountsOut` / pair math. |

Trong repo, `Exchange` và `UniswapV2LikeAdapter` dùng **custom errors** → nếu revert từ đó, RPC thường **có** data.  
Nếu bạn chỉ thấy **`0x`**, nghiêng về: **`router.getAmountsOut`** hoặc **pair** revert.

---

## 3. Nguyên nhân hay gặp với calldata kiểu của bạn

Trong payload, phần **`adapterData` rỗng** (`bytes` length `0`) → adapter dùng path mặc định **2 token**:

```solidity
path = [tokenIn, tokenOut]; // trực tiếp
```

Nếu **không có pool trực tiếp** giữa USDC và WHBAR (hoặc sai địa chỉ token), `getAmountsOut` **revert** — đúng với triệu chứng **`data="0x"`**.

**Cách xử lý:** truyền **`adapterData = abi.encode(address[])`** với path mà router đã chấp nhận (thường **2 hop** trên SaucerSwap V1 USDC–WHBAR; đôi khi **3 hop**). Frontend đã làm khi dùng quote SaucerSwap V1 + `encodedPath` (`v2RouterQuote.ts`).

---

## 4. Checklist debug (theo thứ tự)

1. **`adapters(bytes32("saucerswap"))`** (hoặc id bạn đã `setAdapter`) trên `Exchange`: `active == true`, `adapter != 0x0`.  
   - Nếu không → revert **`AdapterNotActive`** (thường **có** revert data).
2. **Gọi thẳng router** (read-only):  
   `getAmountsOut(amountIn, path)` với **cùng** `amountIn`, **cùng** `path` bạn định nhét vào `adapterData`.  
   - Router fail → `quote` chắc chắn fail.
3. **`amountIn` đúng decimals** token vào (USDC 6 vs 18).
4. **`tokenIn` / `tokenOut`** đúng địa chỉ mainnet (pool **SaucerSwap V1**, không dùng HeliSwap đã đóng).
5. Nếu chỉ có route **USDC → X → WHBAR**: **`adapterData` không được để trống** — phải encode `address[]`.

---

## 5. Công cụ trong repo

```bash
cd perpetual-dex
npm run diagnose:aggregator:mainnet
```

Script sẽ:

- Thử `getAmountsOut` với path 2 hop và (tuỳ chọn) 3 hop (`DIAGNOSE_BRIDGE_TOKEN`).
- Nếu router OK, gọi `quote()` với **`adapterData = abi.encode(path)`**.

Khớp kết quả với UI: on-chain `quote` phải dùng **cùng** `adapterData` như route router đã test.

---

## 6. Decode nhanh calldata (Node / ethers)

```js
import { AbiCoder, id } from "ethers";
// Xác nhận selector
console.log(id("quote((bytes32,address,address,uint256,uint256,address,uint256,bytes))").slice(0, 10)); // 0x083a4ae5
```

Dùng ABI `quote((bytes32,address,address,uint256,uint256,address,uint256,bytes))` với `ethers.Interface.decodeFunctionData` để đọc `adapterId`, token, `amountIn`, `adapterData`.

---

## 7. Công cụ ngoài repo (tuỳ chọn)

- **Tenderly** / simulator: trace từng external call, thấy contract nào revert.
- **Foundry** `cast call` + trace (nếu bạn cài Foundry).
- Gọi **trực tiếp adapter** `quote` (nếu expose) hoặc **staticcall** từng lớp để khoanh vùng.

---

## Tóm tắt

| Câu hỏi | Trả lời |
|--------|--------|
| Đã on-chain chưa? | **Có** — `eth_call` đã thực thi contract. |
| Vì sao `data=0x`? | Hay gặp nhất: **router/pool** revert không message; với **`adapterData` rỗng** thường là **không có pool 2 hop** tương ứng. |
| Fix nhanh? | Đảm bảo **`getAmountsOut` OK** rồi truyền **`adapterData = encode(path)`** vào `quote`. |
