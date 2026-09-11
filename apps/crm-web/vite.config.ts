import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";

// 開発時は BFF (3001) が Vite (5173) へ中継する。BFF は 127.0.0.1 へつなぐので IPv4 で待ち受ける。HMR の WebSocket はブラウザから Vite へ直接つなぐ
export default defineConfig({
  plugins: [reactRouter()],
  server: {
    port: 5173,
    host: "127.0.0.1",
    strictPort: true,
    hmr: { host: "127.0.0.1", port: 5173 },
  },
});
