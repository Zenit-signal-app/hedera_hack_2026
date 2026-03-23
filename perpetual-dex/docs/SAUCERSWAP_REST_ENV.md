# Sinh snippet `.env` từ API SaucerSwap (USDC ↔ HBAR)

Script **`scripts/saucerswapUsdcWhbarEnv.mjs`** gọi REST API chính thức:

- `GET /pools/full` — pool V1 (AMM)
- `GET /v2/pools/full` — pool V2 (CLMM)

…lọc cặp **USDC** + cạnh **HBAR** (trên API có thể hiển thị `symbol: "HBAR"` nhưng `id` = `0.0.1456986` = WHBAR facade; V1 có thể là `HBAR.ℏ`).

## Tại sao mặc định off-chain?

Gọi **on-chain** (Hashio / JSON-RPC) thường chậm hoặc **429 / timeout**. Script **mặc định không gọi RPC** — chỉ REST → nhanh, ổn định hơn.

Tuỳ chọn `--validate-onchain` gọi **một lần** `getAmountsOut` (V1 Router) và `quoteExactInput` (Quoter V2) để kiểm tra; nếu lỗi vẫn in kết quả off-chain.

## Chạy

```bash
cd perpetual-dex
npm run saucerswap:usdc-hbar:env
```

Ghi file:

```bash
npm run saucerswap:usdc-hbar:env > frontend/.env.saucerswap-usdc-hbar.snippet
```

Testnet:

```bash
node scripts/saucerswapUsdcWhbarEnv.mjs --network testnet
```

Kiểm tra thêm bằng RPC (cần biến môi trường):

```bash
HEDERA_MAINNET_RPC_URL=https://mainnet.hashio.io/api \
  node scripts/saucerswapUsdcWhbarEnv.mjs --validate-onchain
```

## Biến môi trường

| Biến | Ý nghĩa |
|------|---------|
| `SAUCERSWAP_API_KEY` | Header `x-api-key` — mặc định dùng demo key trong docs (rate limit); production nên xin key riêng. |
| `HEDERA_MAINNET_RPC_URL` | RPC khi `--validate-onchain` (mainnet). |
| `HEDERA_TESTNET_RPC_URL` | RPC khi `--validate-onchain` + `--network testnet`. |

## Output

- `VITE_AGGREGATOR_TOKEN_USDC_MAINNET` / `VITE_AGGREGATOR_TOKEN_WHBAR_MAINNET` — địa chỉ EVM long-zero từ entity API.
- Comment `# ZENIT_V1_PATH_*` — path V1 (`address[]`) cho 2 chiều.
- Comment `# ZENIT_V2_PACKED_PATH_*` — `bytes` packed (Uniswap V3 style) cho QuoterV2 / SwapRouter.

Các dòng `ZENIT_*` là **gợi ý** (copy vào ghi chú hoặc tool nội bộ); frontend Zenit hiện đọc chủ yếu `VITE_AGGREGATOR_TOKEN_*` + router on-chain.

## Tài liệu API

- [Pools V1 full](https://docs.saucerswap.finance/v/developer/rest-api/pools-v1/pools-full)
- [Pools V2 full](https://docs.saucerswap.finance/v/developer/rest-api/pools-v2/pools-full)
