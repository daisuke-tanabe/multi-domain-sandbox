/**
 * サービス固有の権限の上書き。サービス自身の DB に持ち、Token には載せない。
 * 役割から導いた既定の権限に対して、個別に allow / deny を重ねる。
 */
export type PermissionEffect = "allow" | "deny";

export interface PermissionOverride {
  readonly permission: string;
  readonly effect: PermissionEffect;
}

export interface PermissionSubject {
  readonly tenantId: string;
  readonly userId: string;
  /** Access Token の client_id。同じ DB を複数サービスで共有しても混ざらないようにする */
  readonly clientId: string;
}

export interface PermissionReader {
  listOverrides(subject: PermissionSubject): Promise<ReadonlyArray<PermissionOverride>>;
}
