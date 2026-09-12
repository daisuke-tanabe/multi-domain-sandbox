import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@sandbox/web-ui";

/** rid や mid の期限切れ。ログインを最初からやり直してもらう */
export function ExpiredCard({ message }: { message: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>ログインをやり直してください</CardTitle>
        <CardDescription>{message}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild>
          <a href="/login">ログイン画面へ</a>
        </Button>
      </CardContent>
    </Card>
  );
}
