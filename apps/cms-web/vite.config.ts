import { spaViteConfig } from "@sandbox/web-ui/vite";

// 開発時は BFF (3003) が Vite (5174) へ中継する
export default spaViteConfig(5174);
