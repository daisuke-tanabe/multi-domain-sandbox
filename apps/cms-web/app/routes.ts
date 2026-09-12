import { index, route, type RouteConfig } from "@react-router/dev/routes";

// feature ごとにルートモジュールと部品を同じディレクトリに置く
export default [
  index("features/home/home.route.tsx"),
  route("posts", "features/posts/posts.route.tsx"),
  route("members", "features/members/members.route.tsx"),
] satisfies RouteConfig;
