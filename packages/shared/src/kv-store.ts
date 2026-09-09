import type { Clock } from "./clock.ts";

/**
 * TTL 付きの Key-Value ストア。Session / Code / Refresh Token の保存に使う。
 * ローカルはインメモリ、本番は Redis を同じインターフェースで差し替える。
 */
export interface KeyValueStore<T> {
  get(key: string): Promise<T | undefined>;
  set(key: string, value: T, ttlSeconds: number): Promise<void>;
  delete(key: string): Promise<void>;
  /** 取得と削除をアトミックに行う。Authorization Code の一回限り消費に使う */
  getAndDelete(key: string): Promise<T | undefined>;
}

type Entry<T> = { value: T; expiresAt: number };

export class MemoryKeyValueStore<T> implements KeyValueStore<T> {
  private readonly entries = new Map<string, Entry<T>>();

  constructor(private readonly clock: Clock) {}

  public async get(key: string): Promise<T | undefined> {
    const entry = this.entries.get(key);
    if (entry === undefined) return undefined;
    if (entry.expiresAt <= this.clock.nowSeconds()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  public async set(key: string, value: T, ttlSeconds: number): Promise<void> {
    this.entries.set(key, { value, expiresAt: this.clock.nowSeconds() + ttlSeconds });
  }

  public async delete(key: string): Promise<void> {
    this.entries.delete(key);
  }

  public async getAndDelete(key: string): Promise<T | undefined> {
    const value = await this.get(key);
    this.entries.delete(key);
    return value;
  }

  /** テスト用 */
  public size(): number {
    return this.entries.size;
  }
}
