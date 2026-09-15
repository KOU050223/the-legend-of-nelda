/**
 * モーションFBXのアップロード。
 *
 * Mixamo から落としたFBXをGUIへ投げると、開発サーバーが
 * `assets/` の下へ置き、Blender でGLBを作り直し、マニフェストへクリップを
 * 登録する。CLIでやっていた手順をまとめて引き受ける口。
 *
 * React へ依存しない Pure TypeScript にして、変換だけを単体でテストできる
 * ようにする (docs/technical-design.md §5.1)。
 */

/** 開発サーバーの口。`vite-plugin-motion-manifest.ts` が受ける。 */
const ENDPOINT = '/__motion-upload';

/** アップロードの結果。失敗したときは Blender の出力をそのまま持つ。 */
export type UploadResult =
  | { readonly ok: true; readonly clip: string; readonly log: string }
  | { readonly ok: false; readonly message: string; readonly log: string };

/**
 * FBXの名前として受け付けてよいか。
 *
 * ディレクトリを跨げる名前は弾く。サーバー側でも同じ検査をするが、押す前に
 * 画面で気付けるほうが早い。
 */
export function isValidFbxName(name: string): boolean {
  if (!name.toLowerCase().endsWith('.fbx')) return false;
  if (name.includes('/') || name.includes('\\')) return false;
  if (name.startsWith('.')) return false;

  return name.length > '.fbx'.length;
}

/**
 * クリップ名として受け付けてよいか。
 *
 * GLB内で名前で引くので、空や重複は困る。重複の判定は呼び出し側が持つ
 * (どのモデルへ足すかで変わるため)。
 */
export function isValidClipName(clip: string): boolean {
  return clip.trim().length > 0 && !clip.includes('"');
}

/**
 * FBXを送ってGLBを作り直す。
 *
 * Blender の実行を挟むので、返ってくるまで数十秒かかることがある。
 * 失敗したときは Blender の出力を `log` に入れて返す。ボーン名が合わない
 * (With Skin で落とした等) 場合、Blender 側が食い違ったボーン名を並べて
 * 教えてくれるので、それを画面へ出す。
 */
export async function uploadMotion(
  modelId: string,
  clip: string,
  loop: boolean,
  file: File,
): Promise<UploadResult> {
  const body = new FormData();
  body.set('modelId', modelId);
  body.set('clip', clip);
  body.set('loop', loop ? 'true' : 'false');
  body.set('file', file);

  try {
    const response = await fetch(ENDPOINT, { method: 'POST', body });
    const text = await response.text();

    if (!response.ok) return { ok: false, message: `${response.status}`, log: text };

    return { ok: true, clip, log: text };
  } catch (error) {
    // 開発サーバー以外で開くと口が無いので必ずここへ来る。
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, message, log: '' };
  }
}
