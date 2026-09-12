import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { mfaSetupResponseSchema, type MfaSetupResponse } from "@sandbox/api-contract";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  Input,
  Notice,
  Progress,
} from "@sandbox/web-ui";
import { ApiError, getJson, pickQuery } from "../../lib/api.ts";
import type { Route } from "./+types/mfa-setup.route";

type SetupData =
  | { readonly kind: "form"; readonly mid: string; readonly setup: MfaSetupResponse }
  | { readonly kind: "expired"; readonly message: string };

/**
 * /login/mfa-setup?mid=&error=。認証アプリの登録。
 * QR コードには期限があり、残り時間をプログレスバーで示す。期限が来たら新しい QR コードに切り替える
 */
export async function clientLoader({ request }: Route.ClientLoaderArgs): Promise<SetupData> {
  const params = pickQuery(request.url, ["mid", "error"]);
  const mid = params.get("mid") ?? "";
  try {
    const setup = await getJson(
      mfaSetupResponseSchema,
      `/api/login/mfa-setup?${params.toString()}`,
    );
    return { kind: "form", mid, setup };
  } catch (error: unknown) {
    if (error instanceof ApiError && error.code === "expired_request") {
      return { kind: "expired", message: error.message };
    }
    throw error;
  }
}

function useQrCode(uri: string): string | undefined {
  const [dataUrl, setDataUrl] = useState<string | undefined>();
  useEffect(() => {
    let cancelled = false;
    const render = async () => {
      const url = await QRCode.toDataURL(uri, { width: 208, margin: 1 });
      if (!cancelled) setDataUrl(url);
    };
    void render();
    return () => {
      cancelled = true;
    };
  }, [uri]);
  return dataUrl;
}

/** 期限までの残り秒数を 1 秒ごとに数える */
function useCountdown(expiresAt: number): number {
  const [seconds, setSeconds] = useState(() => remainingSeconds(expiresAt));
  useEffect(() => {
    setSeconds(remainingSeconds(expiresAt));
    const timer = setInterval(() => setSeconds(remainingSeconds(expiresAt)), 1000);
    return () => clearInterval(timer);
  }, [expiresAt]);
  return seconds;
}

function remainingSeconds(expiresAt: number): number {
  return Math.max(0, expiresAt - Math.floor(Date.now() / 1000));
}

function SetupForm({ mid, initial }: { mid: string; initial: MfaSetupResponse }) {
  const [setup, setSetup] = useState(initial);
  const [renewError, setRenewError] = useState<string | undefined>();
  const seconds = useCountdown(setup.expiresAt);
  // auth-api の TOTP_SETUP_TTL_SECONDS と同じ 3 分
  const total = 3 * 60;
  const qr = useQrCode(setup.otpauthUri);

  // 期限が来たら新しい secret と QR コードを取り直す
  useEffect(() => {
    if (seconds > 0) return;
    let cancelled = false;
    const renew = async () => {
      try {
        const next = await getJson(
          mfaSetupResponseSchema,
          `/api/login/mfa-setup?mid=${encodeURIComponent(mid)}&renew=1`,
        );
        if (!cancelled) setSetup(next);
      } catch (error: unknown) {
        if (!cancelled) {
          setRenewError(error instanceof ApiError ? error.message : "エラーが発生しました");
        }
      }
    };
    void renew();
    return () => {
      cancelled = true;
    };
  }, [seconds, mid]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>認証アプリを登録</CardTitle>
        <CardDescription>
          Google Authenticator などの認証アプリで QR コードを読み取り、表示された 6
          桁のコードを入力してください。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {setup.errorMessage !== undefined && <Notice kind="error">{setup.errorMessage}</Notice>}
        {renewError !== undefined && <Notice kind="error">{renewError}</Notice>}
        <div className="flex flex-col items-center gap-3">
          {qr === undefined ? (
            <div className="size-52 rounded-md bg-muted" />
          ) : (
            <img
              src={qr}
              alt="認証アプリに登録する QR コード"
              className="size-52 rounded-md border"
            />
          )}
          <div className="w-full space-y-1">
            <Progress value={(seconds / total) * 100} aria-label="QR コードの残り時間" />
            <p className="text-center text-xs text-muted-foreground">
              {seconds > 0
                ? `QR コードの有効期限まで ${seconds} 秒`
                : "新しい QR コードを取得しています"}
            </p>
          </div>
          <p
            className="break-all text-center font-mono text-xs text-muted-foreground"
            data-testid="totp-secret"
          >
            {setup.secret}
          </p>
        </div>
        <form method="post" action="/login/mfa-setup">
          <input type="hidden" name="mid" value={mid} />
          <input type="hidden" name="csrf" value={setup.csrfToken} />
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="code">認証コード</FieldLabel>
              <Input
                id="code"
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                required
              />
              <FieldDescription>{setup.account} として登録する。</FieldDescription>
            </Field>
            <Button type="submit" className="w-full" disabled={seconds === 0}>
              登録して続ける
            </Button>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}

export default function MfaSetup({ loaderData }: Route.ComponentProps) {
  if (loaderData.kind === "expired") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>ログインをやり直してください</CardTitle>
          <CardDescription>{loaderData.message}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <a href="/login">ログイン画面へ</a>
          </Button>
        </CardContent>
      </Card>
    );
  }
  return <SetupForm key={loaderData.mid} mid={loaderData.mid} initial={loaderData.setup} />;
}
