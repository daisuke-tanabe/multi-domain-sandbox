import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

// 開発時は BFF (3003) が Vite (5174) へ中継する。BFF は 127.0.0.1 へつなぐので IPv4 で待ち受ける。HMR の WebSocket はブラウザから Vite へ直接つなぐ
export default defineConfig({
  plugins: [tailwindcss(), reactRouter()],
  server: {
    port: 5174,
    host: "127.0.0.1",
    strictPort: true,
    hmr: { host: "127.0.0.1", port: 5174 },
  },
});
