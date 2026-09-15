import type { CharacterId } from '@/game/config/phase2-player-balance';

import { MOTION_MODELS, type MotionModel, type MotionModelId } from './motion-manifest';

/**
 * 3人の大輔の表示スケールを揃えるための高さ。素材待ちの
 * PlaceholderCharacter (capsule, 高さ約1.4) に近い値にし、
 * ボス (HoriDaisukeModel の 2.4) より小さくする。
 */
export const CHARACTER_DISPLAY_HEIGHT = 1.6;

/**
 * キャラクターIDとマニフェスト上のモデルの対応 (Issue #79)。
 *
 * `if (characterId === 'ODORUNO')` のような分岐をコードへ書かず、
 * データとして持つ (phase2-player-balance.ts の CHARACTER_STATS と同じ方針)。
 *
 * GLBのURL・身長・クリップ一覧そのものは `assets/motion-manifest.json` が
 * 持つ。ここはゲーム上のキャラIDとモデルを繋ぐ対応表だけを持つ。
 *
 * 3体とも Blender は Z-up・正面 -Y、GLBは Y-up・正面 +Z で書き出されている。
 * ゲーム側の rotationY = 0 は -Z 向きなので、表示は 180° 回して合わせる
 * (CharacterModel が持つ)。
 */
export const CHARACTER_MOTION_MODEL_IDS: Readonly<Record<CharacterId, MotionModelId>> = {
  /** オドルノDaisuke: ダンス。 */
  ODORUNO: 'dance-daisuke',
  /** Pay大輔: 青シャツ・赤眼鏡。待機モーション。 */
  PAY: 'paypay-daisuke',
  /**
   * オラ大輔: スタープラチナ。Mixamo Auto-Rigger でリグを付け、
   * `scripts/build-star-platinum-glb.py` で待機・攻撃モーション込みのGLBにする。
   */
  ORA: 'star-platinum',
};

/** キャラIDからマニフェスト上のモデル定義を引く。 */
export function motionModelForCharacter(characterId: CharacterId): MotionModel {
  return MOTION_MODELS[CHARACTER_MOTION_MODEL_IDS[characterId]];
}
