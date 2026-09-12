import { index, route, type RouteConfig } from "@react-router/dev/routes";

// feature ごとにルートモジュールと部品を同じディレクトリに置く
export default [
  index("features/home/home.route.tsx"),
  route("end-users", "features/end-users/end-users.route.tsx"),
  route("members", "features/members/members.route.tsx"),
] satisfies RouteConfig;
