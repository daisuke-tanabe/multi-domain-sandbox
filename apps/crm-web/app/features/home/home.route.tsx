import { HomePage } from "@sandbox/web-ui";

export default function Home() {
  return <HomePage primary={{ to: "/end-users", label: "エンドユーザー一覧へ" }} />;
}
