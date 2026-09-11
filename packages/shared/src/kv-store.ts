import type { Clock } from "./clock.ts";

/**
 * TTL 付きの Key-Value ストア。Session / Code / Refresh Token の保存に使う。
 * ローカルはインメモリ、本番は Redis を同じインターフェースで差し替える。
 */
export interface KeyValueStore<T> {
  get(key: string): Promise<T | undefined>;
  set(key: string, value: T, ttlSeconds: number): Promise<void>;
  delete(key: string): Promise<void>;
  /** 取得と削除をアトミックに行う。Authorization Code や Refresh Token の一回限り消費に使う */
  getAndDelete(key: string): Promise<T | undefined>;
  /** キーが無いときだけ書く。ロックの取得に使う。書けたら true */
  setIfAbsent(key: string, value: T, ttlSeconds: number): Promise<boolean>;
}

/**
 * 集合。要素の追加と削除がアトミックで、並行更新で要素が落ちない。
 * Refresh Token 系列や sid に紐付くセッションの一覧に使う。
 */
export interface SetStore {
  add(key: string, member: string, ttlSeconds: number): Promise<void>;
  remove(key: string, member: string): Promise<void>;
  members(key: string): Promise<ReadonlyArray<string>>;
  delete(key: string): Promise<void>;
}

/** 固定窓のカウンタ。レート制限に使う */
export interface CounterStore {
  /** 加算後の値を返す。初回の加算で TTL を付ける */
  increment(key: string, ttlSeconds: number): Promise<number>;
}

type Entry<T> = { value: T; expiresAt: number };

export class MemoryKeyValueStore<T> implements KeyValueStore<T> {
  private readonly entries = new Map<string, Entry<T>>();

  constructor(private readonly clock: Clock) {}

  private live(key: string): Entry<T> | undefined {
    const entry = this.entries.get(key);
    if (entry === undefined) return undefined;
    if (entry.expiresAt <= this.clock.nowSeconds()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry;
  }

  public async get(key: string): Promise<T | undefined> {
    return this.live(key)?.value;
  }

  public async set(key: string, value: T, ttlSeconds: number): Promise<void> {
    this.entries.set(key, { value, expiresAt: this.clock.nowSeconds() + ttlSeconds });
  }

  public async delete(key: string): Promise<void> {
    this.entries.delete(key);
  }

  public async getAndDelete(key: string): Promise<T | undefined> {
    // await を挟まず同期的に読んで消す。並行呼び出しでも 1 回しか値を返さない
    const entry = this.live(key);
    this.entries.delete(key);
    return entry?.value;
  }

  public async setIfAbsent(key: string, value: T, ttlSeconds: number): Promise<boolean> {
    if (this.live(key) !== undefined) return false;
    this.entries.set(key, { value, expiresAt: this.clock.nowSeconds() + ttlSeconds });
    return true;
  }

  /** テスト用 */
  public size(): number {
    return this.entries.size;
  }
}

export class MemorySetStore implements SetStore {
  private readonly sets = new Map<string, { members: Set<string>; expiresAt: number }>();

  constructor(private readonly clock: Clock) {}

  private live(key: string): Set<string> | undefined {
    const entry = this.sets.get(key);
    if (entry === undefined) return undefined;
    if (entry.expiresAt <= this.clock.nowSeconds()) {
      this.sets.delete(key);
      return undefined;
    }
    return entry.members;
  }

  public async add(key: string, member: string, ttlSeconds: number): Promise<void> {
    const members = this.live(key) ?? new Set<string>();
    members.add(member);
    this.sets.set(key, { members, expiresAt: this.clock.nowSeconds() + ttlSeconds });
  }

  public async remove(key: string, member: string): Promise<void> {
    this.live(key)?.delete(member);
  }

  public async members(key: string): Promise<ReadonlyArray<string>> {
    return [...(this.live(key) ?? [])];
  }

  public async delete(key: string): Promise<void> {
    this.sets.delete(key);
  }
}

export class MemoryCounterStore implements CounterStore {
  private readonly counters = new Map<string, Entry<number>>();

  constructor(private readonly clock: Clock) {}

  public async increment(key: string, ttlSeconds: number): Promise<number> {
    const now = this.clock.nowSeconds();
    const entry = this.counters.get(key);
    if (entry === undefined || entry.expiresAt <= now) {
      this.counters.set(key, { value: 1, expiresAt: now + ttlSeconds });
      return 1;
    }
    entry.value += 1;
    return entry.value;
  }
}
