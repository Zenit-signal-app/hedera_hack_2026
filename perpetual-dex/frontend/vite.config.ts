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
    fs: {
      allow: [path.resolve(__dirname, "..")],
    },
  },
});


