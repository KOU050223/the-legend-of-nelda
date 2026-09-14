import { create } from 'zustand';

import type { VfxCue, VfxKind } from './vfx-cue';

/**
 * 再生中の演出1つ。開始時刻を持ち、経過で自然に消える。
 *
 * 期限は Presentation 側の実時間 (performance.now) で測る。Game Logic の
 * GameClock とは別物で、演出のためにゲーム内時間を止めない
 * (止めると入力受付ウィンドウがずれる)。
 */
export interface ActiveVfx extends VfxCue {
  /** 実時間の開始時刻 (ms)。 */
  startedAt: number;
  /** 同じ種別が連続しても再生し直すための単調増加ID。 */
  id: number;
  /** Visual Cue の向きなど、描画側が読む付帯情報。 */
  cueId: string | null;
}

interface VfxStore {
  active: ActiveVfx[];
  /** 発行したVFXの通し番号。 */
  sequence: number;

  /** 演出を1つ足す。同じ種別が走っていても重ねず、新しいほうで置き換える。 */
  push: (cue: VfxCue, startedAt: number, cueId?: string | null) => void;
  /** 期限を過ぎた演出を落とす。描画ループから毎フレーム呼ぶ。 */
  prune: (now: number) => void;
  /** 全部消す。攻撃が切り替わったときに前の技の演出を残さないため。 */
  clear: () => void;
}

export const useVfxStore = create<VfxStore>((set) => ({
  active: [],
  sequence: 0,

  push: (cue, startedAt, cueId = null) =>
    set((state) => ({
      // 同じ種別を重ねると振幅が足し合わさって画面が破綻するので、
      // 走っている同種の演出は新しいほうで置き換える。
      active: [
        ...state.active.filter((item) => item.kind !== cue.kind),
        { ...cue, startedAt, id: state.sequence + 1, cueId },
      ],
      sequence: state.sequence + 1,
    })),

  prune: (now) =>
    set((state) => {
      const remaining = state.active.filter((item) => now - item.startedAt < item.durationMs);
      // 参照が変わると購読側が毎フレーム再描画されるので、
      // 実際に減ったときだけ新しい配列を返す。
      return remaining.length === state.active.length ? state : { active: remaining };
    }),

  clear: () => set((state) => (state.active.length === 0 ? state : { active: [] })),
}));

/**
 * 演出の進み具合 (0〜1)。0 が開始、1 が終了。
 * 尺が 0 以下の演出は即座に終わったものとして 1 を返す。
 */
export function vfxProgress(item: ActiveVfx, now: number): number {
  if (item.durationMs <= 0) return 1;
  return Math.min(1, Math.max(0, (now - item.startedAt) / item.durationMs));
}

/** 走っている演出のうち、指定した種別のもの。 */
export function findVfx(active: readonly ActiveVfx[], kind: VfxKind): ActiveVfx | null {
  return active.find((item) => item.kind === kind) ?? null;
}
