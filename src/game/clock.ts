/**
 * 時間取得の抽象化。docs/technical-design.md §10。
 * Production では RealClock、Test では FakeClock を使い、
 * 入力受付時間の判定をテスト可能にする。
 */
export interface GameClock {
  /** 経過時間をミリ秒で返す。 */
  now(): number;
}

export function createRealClock(): GameClock {
  return { now: () => performance.now() };
}

export function createFakeClock(initial = 0): GameClock & { advance(ms: number): void } {
  let current = initial;
  return {
    now: () => current,
    advance(ms: number) {
      current += ms;
    },
  };
}
