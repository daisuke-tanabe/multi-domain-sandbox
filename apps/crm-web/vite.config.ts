import { spaViteConfig } from "@sandbox/web-ui/vite";

// 開発時は BFF (3001) が Vite (5173) へ中継する
export default spaViteConfig(5173);
