import { HomePage } from "@sandbox/web-ui";

export default function Home() {
  return <HomePage primary={{ to: "/posts", label: "投稿一覧へ" }} />;
}
