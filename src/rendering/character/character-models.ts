import type { CharacterId } from '@/game/config/phase2-player-balance';

export interface CharacterModelSpec {
  /** public/models 以下のGLB。 */
  readonly url: string;
  /**
   * GLB内で立っている状態の高さ (unit)。各キャラのREADMEの実測値。
   * 表示スケールを `DISPLAY_HEIGHT / standingHeight` で求めるために使う。
   */
  readonly standingHeight: number;
  /**
   * 再生するクリップ名。クリップを持たないモデルは null。
   *
   * 添字ではなく名前で引く。GLB内の並び順はエクスポータ依存で、クリップが
   * 増減すると添字が意味を失うため (horiDaisukeMotions.ts と同じ理由)。
   */
  readonly clip: string | null;
}

/**
 * 3人の大輔の表示スケールを揃えるための高さ。素材待ちの
 * PlaceholderCharacter (capsule, 高さ約1.4) に近い値にし、
 * ボス (HoriDaisukeModel の 2.4) より小さくする。
 */
export const CHARACTER_DISPLAY_HEIGHT = 1.6;

/**
 * キャラクターIDとGLBの対応 (Issue #79)。
 *
 * `if (characterId === 'ODORUNO')` のような分岐をコードへ書かず、
 * データとして持つ (phase2-player-balance.ts の CHARACTER_STATS と同じ方針)。
 *
 * 3体とも Blender は Z-up・正面 -Y、GLBは Y-up・正面 +Z で書き出されている。
 * ゲーム側の rotationY = 0 は -Z 向きなので、表示は 180° 回して合わせる
 * (CharacterModel が持つ)。
 */
export const CHARACTER_MODELS: Readonly<Record<CharacterId, CharacterModelSpec>> = {
  /** オドルノDaisuke: ダンス。 */
  ODORUNO: { url: '/models/dance-daisuke.glb', standingHeight: 1.809, clip: 'Dance_Loop' },
  /** Pay大輔: 青シャツ・赤眼鏡。待機モーション。 */
  PAY: { url: '/models/paypay-daisuke.glb', standingHeight: 1.902, clip: 'Animation' },
  /**
   * オラ大輔: スタープラチナ。Mixamo Auto-Rigger でリグを付け、
   * `scripts/build-star-platinum-glb.py` で待機モーション込みのGLBにする。
   */
  ORA: { url: '/models/star-platinum.glb', standingHeight: 1.98, clip: 'idle' },
};
