import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@shared": path.resolve(__dirname, "../shared"),
    },
  },
  server: {
    host: "127.0.0.1",
    port: 3000,
    strictPort: false,
    /**
     * - Hashio JSON-RPC: trình duyệt không gọi trực tiếp được (thiếu CORS).
     * - Mirror REST: đồng bộ origin khi dev.
     * - allorigins: RSS / CORS.
     */
    proxy: {
      "/hedera-rpc/mainnet": {
        target: "https://mainnet.hashio.io",
        changeOrigin: true,
        rewrite: () => "/api",
      },
      "/hedera-rpc/testnet": {
        target: "https://testnet.hashio.io",
        changeOrigin: true,
        rewrite: () => "/api",
      },
      "/mirror-mainnet": {
        target: "https://mainnet-public.mirrornode.hedera.com",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/mirror-mainnet/, "") || "/",
      },
      "/mirror-testnet": {
        target: "https://testnet.mirrornode.hedera.com",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/mirror-testnet/, "") || "/",
      },
      "/allorigins-proxy": {
        target: "https://api.allorigins.win",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/allorigins-proxy/, ""),
      },
    },
    fs: {
      allow: [path.resolve(__dirname, "..")],
    },
  },
});


