import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, type UserConfig } from "vite";

/**
 * SPA の Vite 設定。開発時は BFF が 127.0.0.1 の Vite へ中継するので IPv4 で待ち受ける。
 * HMR の WebSocket はブラウザから Vite へ直接つなぐ
 */
export function spaViteConfig(port: number): UserConfig {
  return defineConfig({
    plugins: [tailwindcss(), reactRouter()],
    server: { port, host: "127.0.0.1", strictPort: true, hmr: { host: "127.0.0.1", port } },
  });
}
