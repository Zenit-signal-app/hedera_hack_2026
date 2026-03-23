# Quét token trung gian (3-hop USDC → X → WHBAR)

Script **`scripts/scanBridgeCandidates.ts`** gọi **SaucerSwap V1 Factory** (`allPairs` + `getReserves`), xây map thanh khoản và xếp hạng token **X** có đồng thời pool **USDC–X** và **X–WHBAR**.

- **Không** dùng HeliSwap (đã đóng).
- Whitelist tĩnh: `shared/constants/bridges.ts` (re-export `frontend/src/constants/bridges.ts`).

```bash
cd perpetual-dex
npm run scan:bridges:mainnet
```

Tuỳ chọn (env):

| Biến | Ý nghĩa |
|------|--------|
| `SCAN_MAX_PAIRS` | Chỉ index N cặp đầu (test nhanh). Bỏ qua để quét hết. |
| `SCAN_PAIR_CONCURRENCY` | RPC song song — **mặc định 2** (tránh `UND_ERR_HEADERS_TIMEOUT` / 429 trên Hashio). |
| `SCAN_BATCH_DELAY_MS` | Nghỉ giữa mỗi batch (mặc định `250`). |
| `SCAN_RPC_TIMEOUT_MS` | Timeout HTTP toàn request (mặc định `600000`). |
| `SCAN_SEQUENTIAL` | `1` = một pair mỗi lần (chậm, ổn định nhất). |
| `SCAN_RPC_RETRIES` | Retry khi lỗi tạm thời (mặc định `12`). |

Nếu vẫn lỗi: `SCAN_SEQUENTIAL=1`, hoặc RPC khác qua `HEDERA_MAINNET_RPC_URL`. Lỗi **502** / **HeadersTimeout** / **UND_ERR_*** được **retry** tự động.

Cần `VITE_AGGREGATOR_TOKEN_USDC_MAINNET` và `VITE_AGGREGATOR_TOKEN_WHBAR_MAINNET` trong `frontend/.env`.

**Heuristic:** `score ≈ (r0·r1)_{USDC/X} × (r0·r1)_{X/WHBAR}` — proxy độ sâu thanh khoản, không thay thế quote `getAmountsOut`.
