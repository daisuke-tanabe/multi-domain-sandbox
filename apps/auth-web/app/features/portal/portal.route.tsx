import { redirect } from "react-router";
import { portalResponseSchema, type PortalResponse } from "@sandbox/api-contract";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@sandbox/web-ui";
import { ApiError, getJson } from "../../lib/api.ts";
import type { Route } from "./+types/portal.route";

/**
 * ポータル。テナントごとに、入れるサービスの入口を並べる。役割はサービス側が持つのでここには出ない。
 * SSO Session がなければ rid なしのログイン画面へ送る。
 */
export async function clientLoader(): Promise<PortalResponse> {
  try {
    return await getJson(portalResponseSchema, "/api/portal");
  } catch (error: unknown) {
    if (error instanceof ApiError && error.status === 401) throw redirect("/login");
    throw error;
  }
}

export default function Portal({ loaderData }: Route.ComponentProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Sandbox ポータル</CardTitle>
        <CardDescription>{loaderData.email} としてログイン中</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {loaderData.tenants.length === 0 ? (
          <p className="text-sm">
            利用できるサービスがありません。管理者に招待を依頼してください。
          </p>
        ) : (
          loaderData.tenants.map((tenant) => (
            <section key={tenant.slug} className="space-y-2">
              <h2 className="text-lg font-medium">
                {tenant.name}{" "}
                <span className="text-sm font-normal text-muted-foreground">{tenant.slug}</span>
              </h2>
              <ul className="space-y-1">
                {tenant.services.map((service) => (
                  <li key={service.clientId} className="flex items-center gap-2">
                    <Button asChild variant="link" className="px-0">
                      <a href={service.loginUrl}>{service.name}</a>
                    </Button>
                    <span className="text-xs text-muted-foreground">{service.clientId}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </CardContent>
      <CardFooter>
        <Button asChild variant="outline">
          <a href="/logout">Sandbox 全体からログアウト</a>
        </Button>
      </CardFooter>
    </Card>
  );
}
