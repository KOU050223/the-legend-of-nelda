import {
  MOTION_CONDITIONS,
  MOTION_MODELS,
  type MotionCondition,
  type MotionModelId,
  type MotionRule,
} from '@/rendering/character/motion-manifest';

/**
 * GUIで編集中の「状態 → クリップ」割り当て。
 *
 * ブラウザからリポジトリのJSONは書けないので、画面では下書きを持ち、
 * `assets/motion-manifest.json` へ貼り戻せる形のJSONを吐く。
 * 編集と書き戻しの手順は docs/motion-manifest.md にある。
 *
 * React へ依存しない Pure TypeScript にして、変換だけを単体でテストできる
 * ようにする (docs/technical-design.md §5.1)。
 */
export type MotionDraft = Readonly<Record<MotionModelId, readonly MotionRule[]>>;

/** マニフェストの現在値を下書きの初期値にする。 */
export function initialDraft(): MotionDraft {
  return {
    'hori-daisuke': MOTION_MODELS['hori-daisuke'].rules,
    'star-platinum': MOTION_MODELS['star-platinum'].rules,
    'dance-daisuke': MOTION_MODELS['dance-daisuke'].rules,
    'paypay-daisuke': MOTION_MODELS['paypay-daisuke'].rules,
  };
}

/**
 * まだ使っていない条件のうち最初のものを返す。行を足すときの初期値。
 * すべて使い切っていれば null。同じ条件を2行置いても下の行は死ぬため。
 */
export function nextUnusedCondition(rules: readonly MotionRule[]): MotionCondition | null {
  const used = new Set(rules.map((rule) => rule.when));
  return MOTION_CONDITIONS.find((condition) => !used.has(condition)) ?? null;
}

/**
 * 開発サーバーの保存の口。`vite-plugin-motion-manifest.ts` が受ける。
 *
 * この口は開発サーバーにしか無い (`apply: 'serve'`)。本番ビルドには入らない
 * ので、公開されたゲームからマニフェストは書き換えられない。
 */
const ENDPOINT = '/__motion-manifest';

/**
 * 下書きを `assets/motion-manifest.json` へ保存する。
 *
 * 送るのはルールだけで、残りの項目 (URL・身長・クリップ・ビルド設定) は
 * サーバー側が読んだ値をそのまま残す。GUIで触れない部分をGUIが壊さないため。
 *
 * 保存すると Vite がマニフェストを読み直すので、画面はそのまま新しい割り当てで
 * 動く。貼り付け直す手間は要らない。
 *
 * @returns 成功したら null、失敗したら理由。
 */
export async function saveDraft(draft: MotionDraft): Promise<string | null> {
  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(draft),
    });

    if (!response.ok) return `${response.status} ${await response.text()}`;

    return null;
  } catch (error) {
    // 開発サーバー以外で開くと口が無いので必ずここへ来る。
    return error instanceof Error ? error.message : String(error);
  }
}
