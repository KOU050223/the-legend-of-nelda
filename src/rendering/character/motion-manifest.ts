import manifest from '../../../assets/motion-manifest.json';

/**
 * モーション定義の単一の出どころ。
 *
 * これまで定義は3箇所へ散っていた。Blenderのビルドスクリプトの `MOTIONS`、
 * `horiDaisukeMotions.ts` の `MOTION_CLIPS`、`character-models.ts` の `clip`。
 * 片方だけ足すとGLBとReact側がズレ、キャラが一切動かなくなる
 * (assets/motions/README.md が警告しているとおり)。`assets/motion-manifest.json`
 * を両者が読むことで、ズレようがなくする。
 *
 * JSONの import は値が `string` に潰れるため、ここで union へ絞り直す。
 * 呼び出し側がクリップ名を名前で引く型安全さは、以前の
 * `Readonly<Record<HoriDaisukeMotion, MotionPlayback>>` と同じだけ残す。
 */

/** マニフェストに載っているモデルのキー。 */
export type MotionModelId = keyof typeof manifest.models;

/** クリップの再生の仕方。 */
export interface ClipPlayback {
  /** ループ再生するか。false なら最終フレームで停止する。 */
  readonly loop: boolean;
  /** GUIへ出す日本語名。 */
  readonly label: string;
}

/**
 * どのゲーム状態でクリップを差し替えるか。
 *
 * 状態の組み合わせを総当たりの表にはしない。ボスだけで
 * `BossPhase`(6) × `AttackPhase`(4) あり、意味のあるマスはごく一部になる。
 * 上から順に最初に当たった行を採り、どれにも当たらなければ `defaultClip` へ
 * 落ちる優先順リストにする。GUIでも短い並び順として見せられる。
 */
export interface MotionRule {
  /** 立っている条件。`MotionContext` のキー。 */
  readonly when: MotionCondition;
  /** その条件で再生するクリップ名。 */
  readonly clip: string;
}

/**
 * ルールが見る状態。増やすときは `MotionContext` を作る側 (motion-context.ts) も
 * 揃える。
 *
 * ここに無い状態はGUIの選択肢にも出ない。判定が無い条件を並べておくと、
 * 絶対に当たらないルールを組めてしまい、なぜモーションが変わらないのかが
 * 分からなくなる。「移動中」は位置がスナップショットに出てこない都合で
 * まだ判定できないため、対応するまで置かない (docs/motion-manifest.md)。
 */
export const MOTION_CONDITIONS = ['attacking', 'fallingAsleep', 'asleep'] as const;

export type MotionCondition = (typeof MOTION_CONDITIONS)[number];

/** 現在のゲーム状態。表示層がフレームごとに組み立てて `resolveClip` へ渡す。 */
export type MotionContext = Partial<Record<MotionCondition, boolean>>;

/** マニフェスト1モデル分。 */
export interface MotionModel {
  readonly label: string;
  readonly url: string;
  /** GLB内で立っている状態の高さ (unit)。表示スケールの分母。 */
  readonly standingHeight: number;
  /**
   * リグの種類。`mixamo` なら `assets/motions/` の共有FBXをそのまま足せる。
   * `custom` はBlender製の独自ボーン名なので、共有モーションは載らない。
   */
  readonly rig: 'mixamo' | 'custom';
  readonly clips: Readonly<Record<string, ClipPlayback>>;
  readonly defaultClip: string;
  readonly rules: readonly MotionRule[];
}

function isCondition(value: string): value is MotionCondition {
  return (MOTION_CONDITIONS as readonly string[]).includes(value);
}

/**
 * JSONを読んだ形へ絞る。
 *
 * ここで弾かれるのは、マニフェストの手編集がクリップ名を打ち間違えた場合。
 * 起動時に黙って「クリップが無い」状態で進むと、キャラが静止する理由が
 * 分からなくなるので、読み込み時点で落とす。
 */
function narrow(id: string, raw: (typeof manifest.models)[MotionModelId]): MotionModel {
  const clips = raw.clips as Readonly<Record<string, ClipPlayback>>;

  if (!(raw.defaultClip in clips)) {
    throw new Error(`[motion-manifest] ${id}: defaultClip ${raw.defaultClip} が clips に無い`);
  }

  const rules = raw.rules.map(({ when, clip }): MotionRule => {
    if (!isCondition(when)) {
      throw new Error(`[motion-manifest] ${id}: 未知の条件 ${when}`);
    }
    if (!(clip in clips)) {
      throw new Error(`[motion-manifest] ${id}: ルールのクリップ ${clip} が clips に無い`);
    }
    return { when, clip };
  });

  return {
    label: raw.label,
    url: raw.url,
    standingHeight: raw.standingHeight,
    rig: raw.rig === 'mixamo' ? 'mixamo' : 'custom',
    clips,
    defaultClip: raw.defaultClip,
    rules,
  };
}

/**
 * マニフェストに載っているモデルのキー。
 *
 * `Object.keys` は `string[]` を返すので、そこから型を作ると
 * モデル名の打ち間違いを型で拾えなくなる。JSONのキーの型
 * (`MotionModelId`) を起点に並べ直して、絞り込みを保つ。
 */
export const MOTION_MODEL_IDS: readonly MotionModelId[] = Object.keys(manifest.models).filter(
  (id): id is MotionModelId => id in manifest.models,
);

/**
 * マニフェストの各モデルを読み込んだ形へ揃えたもの。
 *
 * JSONのキーをそのまま写すので、キーの過不足は起きない。`Object.fromEntries`
 * を使わないのは、あれが返す型がキーを `string` へ広げてしまい、結局
 * 型断言で絞り直すことになるため。
 */
export const MOTION_MODELS: Readonly<Record<MotionModelId, MotionModel>> = {
  'hori-daisuke': narrow('hori-daisuke', manifest.models['hori-daisuke']),
  'star-platinum': narrow('star-platinum', manifest.models['star-platinum']),
  'dance-daisuke': narrow('dance-daisuke', manifest.models['dance-daisuke']),
  'paypay-daisuke': narrow('paypay-daisuke', manifest.models['paypay-daisuke']),
};

/** クリップ間を繋ぐクロスフェードの秒数。 */
export const MOTION_FADE_SECONDS = 0.25;

/**
 * 今の状態で再生すべきクリップを決める。
 *
 * ルールを上から見て最初に当たった行を採る。どれにも当たらなければ既定へ。
 * Pure TypeScript にしてあるので、表示層を通さずテストできる。
 */
export function resolveClip(model: MotionModel, context: MotionContext): string {
  for (const { when, clip } of model.rules) {
    if (context[when] === true) return clip;
  }
  return model.defaultClip;
}
