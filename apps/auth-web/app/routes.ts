import { index, route, type RouteConfig } from "@react-router/dev/routes";

// feature ごとにルートモジュールと部品を同じディレクトリに置く
export default [
  index("features/portal/portal.route.tsx"),
  route("login", "features/login/login.route.tsx"),
  route("logout", "features/logout/logout.route.tsx"),
  route("security", "features/security/security.route.tsx"),
] satisfies RouteConfig;
