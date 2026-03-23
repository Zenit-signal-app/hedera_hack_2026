# Dev server — CORS (localhost + Hashio / Mirror)

Trình duyệt chặn `fetch` từ `http://127.0.0.1:3000` tới `https://mainnet.hashio.io` (thiếu header `Access-Control-Allow-Origin`). Repo dùng **proxy Vite** (`vite.config.ts`):

| Prefix dev | Upstream |
|------------|----------|
| `/hedera-rpc/mainnet` | `https://mainnet.hashio.io/api` |
| `/hedera-rpc/testnet` | `https://testnet.hashio.io/api` |
| `/mirror-mainnet` | `https://mainnet-public.mirrornode.hedera.com` |
| `/mirror-testnet` | `https://testnet.mirrornode.hedera.com` |
| `/allorigins-proxy` | `https://api.allorigins.win` |

- RPC mặc định: `frontend/src/lib/hederaDevProxy.ts` — chỉ khi **không** set `VITE_HEDERA_*_RPC_URL`.
- Wagmi + `createHashioProvider` dùng cùng logic → `eth_call` / `useReadContract` không còn lỗi CORS trên console.
- **Production build** (`npm run build` + host tĩnh): cần reverse proxy tương tự hoặc RPC có CORS; hoặc chỉ gọi RPC từ backend.

Sau khi sửa `vite.config.ts`, restart `npm run dev`.
