import { index, route, type RouteConfig } from "@react-router/dev/routes";

export default [
  index("routes/portal.tsx"),
  route("login", "routes/login.tsx"),
  route("logout", "routes/logout.tsx"),
] satisfies RouteConfig;
