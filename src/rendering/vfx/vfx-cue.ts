import type { GameEvent } from '@/game/events/game-event';

/**
 * 画面へ出す視覚演出。docs/single-player-poc-spec.md §21 /
 * docs/technical-design.md §5.3。
 *
 * Audio Cue とは別レイヤーとして扱う (同 §6)。ここは Visual Cue と
 * 判定結果だけを見て、音のイベントは参照しない。
 */
export type VfxKind =
  /** 枕薙ぎ払いの軌跡。 */
  | 'SWEEP_TRAIL'
  /** あくび衝撃波とブラー。 */
  | 'SHOCKWAVE'
  /** ふかふか布団の背景暗転。 */
  | 'DIM'
  /** ふかふか布団を構えた向き。左右どちらから来るかを見せる。 */
  | 'FUTON_BRACE'
  /** 枕を構えて引いた向き。左右どちらから来るかを見せる (仕様 §6.1)。 */
  | 'PILLOW_BRACE'
  /** あくびの構え。口元を押さえ猫背になる (仕様 §8)。方向は持たない。 */
  | 'YAWN_WINDUP'
  /** カメラシェイク。被弾と枕の着弾で強さを変える。 */
  | 'SHAKE'
  /** ガード成功のフラッシュ。 */
  | 'FLASH'
  /** ヒットストップ。時間が止まったように見せる姿勢固定。 */
  | 'HIT_STOP';

export interface VfxCue {
  kind: VfxKind;
  /** 演出の尺 (ms)。設定の強度を掛ける前の基準値。 */
  durationMs: number;
  /**
   * 演出の強さ (0〜1 の基準値)。設定の visualIntensity を掛けて実際の
   * 振幅・不透明度になる。
   */
  strength: number;
}

/**
 * Visual Cue ID から予兆 (TELEGRAPH) の演出を引く。
 *
 * Cue ID は技側が向きを埋め込む (`pillow-sweep-telegraph-left` など) ため
 * 前方一致で畳む。
 * 向きそのものは軌跡を左右どちらから描くかに使うので、呼び出し側が
 * Cue ID の文字列を別途見る。
 *
 * 枕の軌跡・あくびの衝撃波そのものは仕様上「発動」区分の演出なので、
 * ここでは返さない (TELEGRAPH の尺で終わる Cue のまま返すと、ATTACK が
 * 始まる前に演出が消えてしまう。docs/single-player-poc-spec.md §7 / §9、
 * レビュー指摘)。ただし枕は構え自体が回避方向の唯一の視覚情報
 * (§6.1「攻撃方向を視覚的に判断できる」、風切りSEは無方向) なので、
 * 軌跡とは別に構えの向きを返す。あくびは構えに方向を持たない
 * (§8: ガードは無音区間から測るので、構えは方向を示す必要がない) が、
 * 構え自体が何も出ないと予兆が無音に見えるため最小限の絵を出す。
 * ATTACK 開始時に届く ACTIVATION Cue は activationVfxFor が担当する。
 */
export function telegraphVfxFor(cue: string, durationMs: number): VfxCue | null {
  if (cue.startsWith('futon-summon-')) {
    return { kind: 'DIM', durationMs, strength: 0.7 };
  }
  if (cue.startsWith('pillow-sweep-')) {
    return { kind: 'PILLOW_BRACE', durationMs, strength: 1 };
  }
  if (cue.startsWith('yawn-inhale')) {
    return { kind: 'YAWN_WINDUP', durationMs, strength: 0.6 };
  }
  return null;
}

/**
 * Visual Cue ID から発動 (ATTACK) の演出を引く。
 *
 * telegraphVfxFor と違い、こちらは実際に攻撃判定が生じる瞬間の絵
 * (枕の軌跡・あくびの衝撃波) を返す。ATTACK State 開始時に同じ Cue ID が
 * `phase: 'ACTIVATION'` で再送されたときだけ呼ぶ。
 */
export function activationVfxFor(cue: string, durationMs: number): VfxCue | null {
  if (cue.startsWith('pillow-sweep-')) {
    return { kind: 'SWEEP_TRAIL', durationMs, strength: 0.6 };
  }
  if (cue.startsWith('yawn-inhale')) {
    return { kind: 'SHOCKWAVE', durationMs, strength: 0.8 };
  }
  return null;
}

/**
 * イベント1つが生む視覚演出。
 *
 * Pure function なので、Three.js を動かさずに「何が出るはずか」を確かめられる。
 * 複数の演出が同時に出る事象 (被弾 = シェイク + ヒットSE) では、
 * 音側は audio-manager が別に決めるのでここは絵だけを返す。
 */
export function vfxForEvent(event: GameEvent): VfxCue[] {
  switch (event.type) {
    case 'ATTACK_VISUAL_CUE': {
      // 予兆の尺が来ない場合はイベント側の既定に任せる。TELEGRAPH の長さを
      // ここで二重に持つとバランス調整とずれる (game-event.ts のコメント)。
      const durationMs = event.durationMs ?? 0;

      // ATTACK 開始時の再送 (レビュー指摘: 発動区分の演出を予兆の尺で終わる
      // Cue に乗せると ATTACK が始まる前に消える)。
      if (event.phase === 'ACTIVATION') {
        const activation = activationVfxFor(event.cue, durationMs);
        return activation ? [activation] : [];
      }

      const cue = telegraphVfxFor(event.cue, durationMs);
      if (!cue) return [];

      // 布団は暗転だけでは回避方向が分からない。仕様 §10 は視覚の予兆として
      // 「布団を右または左に構える / 攻撃方向が分かる」を挙げており、
      // これはプレイヤーが回避方向を選ぶための情報そのもの。暗転と構えを
      // 別の演出として返し、構えの側が Cue ID の向きを描く。
      if (cue.kind === 'DIM') {
        return [cue, { kind: 'FUTON_BRACE', durationMs, strength: 1 }];
      }

      return [cue];
    }

    case 'JUDGED':
      switch (event.result) {
        // 回避成功は軽いヒットストップだけ。避けているので画面は揺らさない。
        case 'PERFECT_DODGE':
          return [{ kind: 'HIT_STOP', durationMs: 80, strength: 0.4 }];
        // ガード成功は衝突しているのでフラッシュと軽い揺れ。
        case 'JUST_GUARD':
          return [
            { kind: 'FLASH', durationMs: 140, strength: 0.7 },
            { kind: 'SHAKE', durationMs: 180, strength: 0.35 },
          ];
        // 被弾のシェイクは HIT State で出す (下)。
        default:
          return [];
      }

    case 'COMBAT_STATE_CHANGED':
      // 被弾。HIT State へ入ることが「攻撃が通った」ことそのもの。JUDGED を
      // 発火源にすると、早押しで弾かれた周回が演出なしで被弾する。早押しは
      // JUDGED を発行しないが State は HIT へ進むため (§13)。
      if (event.to === 'HIT') {
        return [{ kind: 'SHAKE', durationMs: 420, strength: 1 }];
      }
      // 反撃成立は強めのヒットストップ。打撃が刺さった手応えを出す。
      if (event.to === 'DAMAGE') {
        return [
          { kind: 'HIT_STOP', durationMs: 180, strength: 1 },
          { kind: 'SHAKE', durationMs: 260, strength: 0.6 },
        ];
      }
      // 大ダウンはボスが倒れている間ずっと続くので、尺は State 側が持つ。
      if (event.to === 'BOSS_DOWN') {
        return [{ kind: 'SHAKE', durationMs: 500, strength: 0.8 }];
      }
      return [];

    // 大ダウン中の追撃。State が進まないぶん COMBAT_STATE_CHANGED は来ないが、
    // 実際にHPが削れているので DAMAGE と同じ手応えの演出を出す。
    case 'BOSS_DOWN_FOLLOW_UP_HIT':
      return [
        { kind: 'HIT_STOP', durationMs: 180, strength: 1 },
        { kind: 'SHAKE', durationMs: 260, strength: 0.6 },
      ];

    default:
      return [];
  }
}
