/**
 * 現在時刻の供給源。テストで期限切れを再現するために注入可能にする。
 */
export interface Clock {
  /** epoch 秒 */
  nowSeconds(): number;
}

export const systemClock: Clock = {
  nowSeconds: () => Math.floor(Date.now() / 1000),
};

/**
 * テスト用。任意に時刻を進められる。
 */
export class FakeClock implements Clock {
  constructor(private current: number) {}

  public nowSeconds(): number {
    return this.current;
  }

  public advance(seconds: number): void {
    this.current += seconds;
  }

  public set(seconds: number): void {
    this.current = seconds;
  }
}
