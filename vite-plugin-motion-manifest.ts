import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';
import type { Plugin } from 'vite';

/**
 * `?debug=motion` の画面から `assets/motion-manifest.json` を書き換えるための
 * 開発サーバー限定の口。
 *
 * ブラウザからリポジトリのファイルは触れないので、dev サーバーに保存だけを
 * 引き受けさせる。書いたあとは Vite の HMR がマニフェストを読み直すので、
 * 画面はそのまま新しい割り当てで動く。
 *
 * **開発サーバーでしか動かない** (`apply: 'serve'`)。本番ビルドには入らないので、
 * 公開されたゲームからこの口は叩けない。
 */

const ENDPOINT = '/__motion-manifest';

/** 書き換えてよい唯一のファイル。パスを外から受け取らない。 */
const MANIFEST = fileURLToPath(new URL('./assets/motion-manifest.json', import.meta.url));

/** 受け取ってよいJSONの大きさ。マニフェストは数KBなので十分な余裕がある。 */
const MAX_BYTES = 256 * 1024;

/** ルール1行。GUIが組み立てる形。 */
interface RawRule {
  when: string;
  clip: string;
}

/** 1行が `{ when, clip }` の形か。 */
function isRule(value: unknown): value is RawRule {
  if (typeof value !== 'object' || value === null) return false;

  const { when, clip } = value as Partial<Record<'when' | 'clip', unknown>>;
  return typeof when === 'string' && typeof clip === 'string';
}

/**
 * 受け取った本文が「モデルごとのルールの並び」の形かを確かめる。
 *
 * 画面から来た値をそのまま書くと、壊れたJSONでマニフェストを潰しかねない。
 * 書く前に形を見て、違えば拒む。
 */
function parseRules(body: string): Record<string, RawRule[]> | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;

  const result: Record<string, RawRule[]> = {};
  for (const [modelId, rules] of Object.entries(parsed)) {
    if (!Array.isArray(rules)) return null;

    const checked: RawRule[] = [];
    for (const rule of rules) {
      if (!isRule(rule)) return null;
      checked.push({ when: rule.when, clip: rule.clip });
    }
    result[modelId] = checked;
  }

  return result;
}

/** 本文を読み切る。上限を超えたら読むのをやめる。 */
async function readBody(req: { on: NodeJS.EventEmitter['on'] }): Promise<string | null> {
  return new Promise((resolve) => {
    let body = '';
    let tooLarge = false;

    req.on('data', (chunk: Buffer) => {
      if (tooLarge) return;
      body += chunk.toString('utf8');
      if (body.length > MAX_BYTES) {
        tooLarge = true;
        resolve(null);
      }
    });
    req.on('end', () => {
      if (!tooLarge) resolve(body);
    });
    req.on('error', () => resolve(null));
  });
}

/** 読み込んだマニフェストから `models` を取り出す。形が違えば null。 */
function modelsOf(manifest: unknown): Record<string, unknown> | null {
  if (typeof manifest !== 'object' || manifest === null || !('models' in manifest)) return null;

  const { models } = manifest;
  if (typeof models !== 'object' || models === null || Array.isArray(models)) return null;

  return { ...models };
}

export function motionManifestPlugin(): Plugin {
  return {
    name: 'motion-manifest-writer',
    // 開発サーバーだけ。本番ビルドへは入れない。
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(ENDPOINT, (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end('POST only');
          return;
        }

        void (async () => {
          const body = await readBody(req);
          if (body === null) {
            res.statusCode = 413;
            res.end('body too large');
            return;
          }

          const rules = parseRules(body);
          if (rules === null) {
            res.statusCode = 400;
            res.end('unexpected shape');
            return;
          }

          try {
            // ルールだけを差し替える。GUIが触らない項目 (URL・身長・クリップ・
            // ビルド設定) は読んだ値をそのまま残す。画面が知らない項目を
            // 画面が消してしまわないため。
            const current: unknown = JSON.parse(await readFile(MANIFEST, 'utf8'));
            const models = modelsOf(current);
            if (models === null) {
              res.statusCode = 500;
              res.end('manifest is not readable');
              return;
            }

            for (const [modelId, modelRules] of Object.entries(rules)) {
              const model = models[modelId];
              // 知らないモデル名は黙って捨てる。マニフェストに無いキーを
              // 画面から生やせないようにする。
              if (typeof model === 'object' && model !== null) {
                Object.assign(model, { rules: modelRules });
              }
            }

            await writeFile(MANIFEST, `${JSON.stringify(current, null, 2)}\n`, 'utf8');

            res.statusCode = 200;
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify({ ok: true }));
          } catch (error) {
            server.config.logger.error(`[motion-manifest] 保存に失敗: ${String(error)}`);
            res.statusCode = 500;
            res.end('write failed');
          }
        })();
      });
    },
  };
}

/** 画面側が叩く先。定義を1箇所にするため外へ出す。 */
export const MOTION_MANIFEST_ENDPOINT = ENDPOINT;
