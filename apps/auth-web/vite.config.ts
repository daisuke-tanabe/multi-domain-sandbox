import { spaViteConfig } from "@sandbox/web-ui/vite";

// 開発時は auth-api (3000) が Vite (5175) へ中継する
export default spaViteConfig(5175);
