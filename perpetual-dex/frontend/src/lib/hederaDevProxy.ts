/**
 * Trên `vite dev`, JSON-RPC Hashio / Mirror REST gọi qua **cùng origin** (`/hedera-rpc/*`, `/mirror-*`)
 * để tránh CORS (trình duyệt chặn `fetch` tới `mainnet.hashio.io` từ `localhost`).
 * `vite preview` / production: dùng URL đầy đủ (hoặc `VITE_*_RPC_URL` tự cấu hình).
 */
export function hederaJsonRpcUrl(mode: "mainnet" | "testnet"): string {
  const env =
    mode === "mainnet"
      ? import.meta.env.VITE_HEDERA_MAINNET_RPC_URL?.trim()
      : import.meta.env.VITE_HEDERA_TESTNET_RPC_URL?.trim();
  if (env) return env;
  if (import.meta.env.DEV) {
    return mode === "mainnet" ? "/hedera-rpc/mainnet" : "/hedera-rpc/testnet";
  }
  return mode === "mainnet" ? "https://mainnet.hashio.io/api" : "https://testnet.hashio.io/api";
}
