import { redirect } from "react-router";
import { portalResponseSchema, type PortalResponse } from "@sandbox/api-contract";
import { ApiError, getJson } from "../api.ts";
import type { Route } from "./+types/portal";

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
    <>
      <h1>Sandbox ポータル</h1>
      <p className="muted">{loaderData.email} としてログイン中</p>
      {loaderData.tenants.length === 0 ? (
        <p>利用できるサービスがありません。管理者に招待を依頼してください。</p>
      ) : (
        loaderData.tenants.map((tenant) => (
          <section key={tenant.slug}>
            <h2>
              {tenant.name} <span className="muted">({tenant.slug})</span>
            </h2>
            <ul>
              {tenant.services.map((service) => (
                <li key={service.clientId}>
                  <a href={service.loginUrl}>{service.name}</a>{" "}
                  <span className="muted">{service.clientId}</span>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
      <p>
        <a href="/logout">Sandbox 全体からログアウト</a>
      </p>
    </>
  );
}
