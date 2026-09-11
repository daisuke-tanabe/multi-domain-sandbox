import type { Config } from "@react-router/dev/config";

// SPA モード。画面はブラウザで描き、BFF は build/client を配るだけ
export default {
  ssr: false,
  appDirectory: "app",
  buildDirectory: "build",
} satisfies Config;
