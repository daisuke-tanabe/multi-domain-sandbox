import type { Clock } from "./clock.ts";

/**
 * TTL 付きの Key-Value ストア。Session / Code / Refresh Token の保存に使う。
 * ローカルはインメモリ、本番は Redis を同じインターフェースで差し替える。
 */
export interface KeyValueStore<T> {
  get(key: string): Promise<T | undefined>;
  set(key: string, value: T, ttlSeconds: number): Promise<void>;
  /** 既にあるキーの値だけを置き換え、TTL は変えない。無ければ false。失敗回数の更新などに使う */
  update(key: string, value: T): Promise<boolean>;
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

/** 書き込みがこの回数に達するたびに期限切れを掃除する。読まれないキーが溜まり続けないようにする */
const SWEEP_EVERY = 256;

function sweep<T extends { expiresAt: number }>(entries: Map<string, T>, now: number): void {
  for (const [key, entry] of entries) {
    if (entry.expiresAt <= now) entries.delete(key);
  }
}

export class MemoryKeyValueStore<T> implements KeyValueStore<T> {
  private readonly entries = new Map<string, Entry<T>>();
  private writes = 0;

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

  private write(key: string, entry: Entry<T>): void {
    this.entries.set(key, entry);
    this.writes += 1;
    if (this.writes % SWEEP_EVERY === 0) sweep(this.entries, this.clock.nowSeconds());
  }

  public async get(key: string): Promise<T | undefined> {
    return this.live(key)?.value;
  }

  public async set(key: string, value: T, ttlSeconds: number): Promise<void> {
    this.write(key, { value, expiresAt: this.clock.nowSeconds() + ttlSeconds });
  }

  public async update(key: string, value: T): Promise<boolean> {
    const entry = this.live(key);
    if (entry === undefined) return false;
    this.entries.set(key, { value, expiresAt: entry.expiresAt });
    return true;
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
    this.write(key, { value, expiresAt: this.clock.nowSeconds() + ttlSeconds });
    return true;
  }
}

export class MemorySetStore implements SetStore {
  private readonly sets = new Map<string, { members: Set<string>; expiresAt: number }>();
  private writes = 0;

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
    this.writes += 1;
    if (this.writes % SWEEP_EVERY === 0) sweep(this.sets, this.clock.nowSeconds());
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
  private writes = 0;

  constructor(private readonly clock: Clock) {}

  public async increment(key: string, ttlSeconds: number): Promise<number> {
    const now = this.clock.nowSeconds();
    const entry = this.counters.get(key);
    if (entry === undefined || entry.expiresAt <= now) {
      this.counters.set(key, { value: 1, expiresAt: now + ttlSeconds });
      this.writes += 1;
      if (this.writes % SWEEP_EVERY === 0) sweep(this.counters, now);
      return 1;
    }
    entry.value += 1;
    return entry.value;
  }
}
