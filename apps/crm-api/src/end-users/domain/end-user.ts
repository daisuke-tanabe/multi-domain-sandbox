/**
 * CRM が管理するエンドユーザー。ログインする人ではなく顧客データ。
 */
export interface EndUser {
  readonly id: string;
  readonly tenantId: string;
  readonly name: string;
  readonly email: string;
  readonly phone: string;
  readonly note: string;
}

export interface EndUserInput {
  readonly name: string;
  readonly email: string;
  readonly phone: string;
  readonly note: string;
}

/** 部分更新。省略した項目は変えない */
export interface EndUserInputPatch {
  readonly name?: string | undefined;
  readonly email?: string | undefined;
  readonly phone?: string | undefined;
  readonly note?: string | undefined;
}

/** 表示用。masked が true ならメールと電話はマスクした値 */
export interface EndUserView extends EndUser {
  readonly masked: boolean;
}

/** 個人情報の規則。メールは先頭 1 文字とドメイン、電話は末尾 4 桁だけ残す */
export function maskEndUser(user: EndUser): EndUser {
  const [local = "", domain = ""] = user.email.split("@");
  const maskedEmail = `${local.slice(0, 1)}***@${domain}`;
  const digits = user.phone.replace(/\D/g, "");
  const maskedPhone = `***-****-${digits.slice(-4)}`;
  return { ...user, email: maskedEmail, phone: maskedPhone };
}

/** 閲覧者が解除権限を持つときだけ生の値を見せる */
export function presentEndUser(user: EndUser, canUnmask: boolean): EndUserView {
  return { ...(canUnmask ? user : maskEndUser(user)), masked: !canUnmask };
}
