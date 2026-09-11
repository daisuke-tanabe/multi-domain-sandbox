import { index, route, type RouteConfig } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("end-users", "routes/end-users.tsx"),
  route("members", "routes/members.tsx"),
] satisfies RouteConfig;
