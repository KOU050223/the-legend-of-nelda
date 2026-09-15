import { execFile } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';

import { isBuildFailure } from './blender-build-log.ts';

/**
 * `?debug=motion` の画面へ投げたモーションFBXを取り込む開発サーバー限定の口。
 *
 * CLIでやっていた手順 — FBXを置く、マニフェストへ登録する、Blenderでビルドし
 * 直す — をまとめて引き受ける。手順のどれかを飛ばしてGLBとマニフェストが
 * ズレるのを防ぐため、3つを1回の操作にまとめる。
 *
 * 途中で失敗したらすべて元へ戻す。マニフェストだけ書き換わってビルドが失敗
 * すると、`clips` に実体の無いクリップが残り、Python側とTypeScript側の
 * 突き合わせが両方落ちる (docs/motion-manifest.md)。
 *
 * **開発サーバーでしか動かない** (`apply: 'serve'`)。本番ビルドには入らない。
 */

const ENDPOINT = '/__motion-upload';

const REPO = fileURLToPath(new URL('.', import.meta.url));
const MANIFEST = join(REPO, 'assets', 'motion-manifest.json');

/** FBX1本の上限。Mixamo の Without Skin は数百KBだが、余裕を持たせる。 */
const MAX_BYTES = 32 * 1024 * 1024;

/** Blender の実行を諦めるまで。大きなモデルでも数十秒で終わる。 */
const BUILD_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * FBXの名前として受け付けてよいか。
 *
 * **ここが境界**。名前はブラウザから来るので、ディレクトリを跨げる形を
 * 通すと `assets/` の外へ書けてしまう。区切り文字を含むもの、`..`、
 * 隠しファイルを弾き、`.fbx` で終わるものだけ通す。
 */
export function isSafeFbxName(name: string): boolean {
  if (!name.toLowerCase().endsWith('.fbx')) return false;
  if (name.length <= '.fbx'.length) return false;
  if (name.includes('/') || name.includes('\\') || name.includes('\0')) return false;
  if (name.startsWith('.')) return false;

  return true;
}

/** クリップ名として受け付けてよいか。 */
export function isSafeClipName(clip: string): boolean {
  return clip.trim().length > 0 && clip.length <= 64 && !clip.includes('"');
}

/**
 * 書き込める形のオブジェクトか。
 *
 * `asRecord` は複製を返すので読み取り専用。こちらは元のオブジェクトを
 * そのまま指すので、書いた内容が JSON.stringify へ乗る。
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** ただのオブジェクトか。JSONを辿るときの足場。 */
function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;

  return { ...value };
}

/** ビルドできるモデルの定義。マニフェストから読む形。 */
interface BuildableModel {
  readonly script: string;
  readonly motionDir: string;
  readonly sources: Record<string, string>;
  readonly clips: Record<string, unknown>;
}

/**
 * マニフェストから1モデル分のビルド設定を取り出す。
 *
 * `build` を持たないモデル (Blender製の独自リグ) はここで弾く。走らせる
 * スクリプトが無いので、FBXを置いても取り込めない。
 */
export function buildableModel(manifest: unknown, modelId: string): BuildableModel | null {
  const models = asRecord(asRecord(manifest)?.['models']);
  const model = asRecord(models?.[modelId]);
  const build = asRecord(model?.['build']);
  const clips = asRecord(model?.['clips']);
  const sources = asRecord(build?.['sources']);
  if (build === null || clips === null || sources === null) return null;

  const script = build['script'];
  const motionDir = build['motionDir'];
  if (typeof script !== 'string' || typeof motionDir !== 'string') return null;

  const checked: Record<string, string> = {};
  for (const [filename, clip] of Object.entries(sources)) {
    if (typeof clip !== 'string') return null;
    checked[filename] = clip;
  }

  return { script, motionDir, sources: checked, clips };
}

/** Blender を走らせる。失敗したかと出力を返す。 */
function runBlender(script: string): Promise<{ failed: boolean; log: string }> {
  return new Promise((done) => {
    execFile(
      'blender',
      ['--background', '--python', join(REPO, script)],
      { timeout: BUILD_TIMEOUT_MS, maxBuffer: 16 * 1024 * 1024 },
      (error, stdout, stderr) => {
        const log = `${stdout}\n${stderr}`.trim();
        // 起動そのものの失敗 (blender が無い・時間切れ) と、スクリプトの例外の
        // 両方を拾う。後者は終了コードに出ないため出力で見る。
        done({ failed: error !== null || isBuildFailure(log), log });
      },
    );
  });
}

/** multipart の1パートを読む。 */
interface Part {
  readonly name: string;
  readonly filename: string | null;
  readonly data: Buffer;
}

/**
 * multipart/form-data を切り分ける。
 *
 * FBXはバイナリなので、テキストとして扱わずバイト列のまま境界で割る。
 * 依存を足さずに済むよう、必要な範囲だけを自前で読む。
 */
export function parseMultipart(body: Buffer, boundary: string): Part[] {
  const sep = Buffer.from(`--${boundary}`);
  const parts: Part[] = [];

  let index = body.indexOf(sep);
  while (index !== -1) {
    const start = index + sep.length;
    // 終端は `--boundary--`。
    if (body.subarray(start, start + 2).toString() === '--') break;

    const next = body.indexOf(sep, start);
    if (next === -1) break;

    // ヘッダと本文は空行で分かれる。
    const chunk = body.subarray(start, next);
    const headerEnd = chunk.indexOf('\r\n\r\n');
    if (headerEnd === -1) {
      index = next;
      continue;
    }

    const headers = chunk.subarray(0, headerEnd).toString('utf8');
    // 本文の末尾には次の境界の前の CRLF が付く。
    const data = chunk.subarray(headerEnd + 4, chunk.length - 2);

    const name = /name="([^"]*)"/.exec(headers)?.[1];
    if (name !== undefined) {
      parts.push({ name, filename: /filename="([^"]*)"/.exec(headers)?.[1] ?? null, data });
    }

    index = next;
  }

  return parts;
}

/** 本文を読み切る。上限を超えたら諦める。 */
function readBody(req: IncomingMessage): Promise<Buffer | null> {
  return new Promise((done) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let tooLarge = false;

    req.on('data', (chunk: Buffer) => {
      if (tooLarge) return;
      size += chunk.length;
      if (size > MAX_BYTES) {
        tooLarge = true;
        done(null);
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!tooLarge) done(Buffer.concat(chunks));
    });
    req.on('error', () => done(null));
  });
}

function send(res: ServerResponse, status: number, text: string): void {
  res.statusCode = status;
  res.setHeader('content-type', 'text/plain; charset=utf-8');
  res.end(text);
}

export function motionUploadPlugin(): Plugin {
  return {
    name: 'motion-upload',
    // 開発サーバーだけ。本番ビルドへは入れない。
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(ENDPOINT, (req, res) => {
        if (req.method !== 'POST') {
          send(res, 405, 'POST only');
          return;
        }

        void (async () => {
          const type = req.headers['content-type'] ?? '';
          const boundary = /boundary=(?:"([^"]+)"|([^;]+))/.exec(type);
          if (boundary === null) {
            send(res, 400, 'multipart/form-data が要る');
            return;
          }

          const body = await readBody(req);
          if (body === null) {
            send(res, 413, 'ファイルが大きすぎる');
            return;
          }

          const parts = parseMultipart(body, boundary[1] ?? boundary[2] ?? '');
          const field = (name: string): string | undefined =>
            parts
              .find((part) => part.name === name && part.filename === null)
              ?.data.toString('utf8');
          const upload = parts.find((part) => part.filename !== null);

          const modelId = field('modelId');
          const clip = field('clip');
          const loop = field('loop') === 'true';

          if (modelId === undefined || clip === undefined || upload === undefined) {
            send(res, 400, 'modelId / clip / file が要る');
            return;
          }
          if (!isSafeClipName(clip)) {
            send(res, 400, `クリップ名が使えない: ${clip}`);
            return;
          }
          if (upload.filename === null || !isSafeFbxName(upload.filename)) {
            send(res, 400, `ファイル名が使えない: ${upload.filename ?? ''}`);
            return;
          }

          // 元へ戻せるよう、書き換える前のマニフェストを取っておく。
          const original = await readFile(MANIFEST, 'utf8');
          const manifest: unknown = JSON.parse(original);
          const model = buildableModel(manifest, modelId);
          if (model === null) {
            send(res, 400, `${modelId} はビルドできるモデルではない`);
            return;
          }
          if (clip in model.clips) {
            send(res, 409, `クリップ ${clip} はすでにある`);
            return;
          }

          const target = join(REPO, model.motionDir, upload.filename);
          // 名前を検査済みでも、解決後のパスが置き場所の中に収まることを必ず確かめる。
          const motionDir = resolve(join(REPO, model.motionDir));
          if (resolve(dirname(target)) !== motionDir) {
            send(res, 400, '置き場所の外へは書けない');
            return;
          }

          try {
            await mkdir(motionDir, { recursive: true });
            await writeFile(target, upload.data);

            // マニフェストへ登録してからビルドする。スクリプトはマニフェストを
            // 読んでビルドするので、先に書いておかないと新しいFBXを見ない。
            // 読み直した側へ足す。`buildableModel` が返すのは複製なので、
            // そちらへ書いてもファイルには反映されない。
            const updated: unknown = JSON.parse(original);
            const updatedModels = isPlainObject(updated) ? updated['models'] : null;
            const entry = isPlainObject(updatedModels) ? updatedModels[modelId] : null;
            const entryBuild = isPlainObject(entry) ? entry['build'] : null;
            const entrySources = isPlainObject(entryBuild) ? entryBuild['sources'] : null;
            const entryClips = isPlainObject(entry) ? entry['clips'] : null;
            if (!isPlainObject(entrySources) || !isPlainObject(entryClips)) {
              send(res, 400, `${modelId} のマニフェストの形が想定と違う`);
              return;
            }

            entrySources[upload.filename] = clip;
            entryClips[clip] = { loop, label: clip };
            await writeFile(MANIFEST, `${JSON.stringify(updated, null, 2)}\n`, 'utf8');

            const { failed, log } = await runBlender(model.script);
            if (failed) {
              // ビルドが失敗したら、置いたFBXもマニフェストも元へ戻す。
              // 実体の無いクリップがマニフェストへ残ると、突き合わせのテストが
              // 両方落ちて原因が分かりにくくなる。
              await writeFile(MANIFEST, original, 'utf8');
              await rm(target, { force: true });
              send(res, 422, log);
              return;
            }

            send(res, 200, log);
          } catch (error) {
            await writeFile(MANIFEST, original, 'utf8').catch(() => undefined);
            await rm(target, { force: true }).catch(() => undefined);
            server.config.logger.error(`[motion-upload] ${String(error)}`);
            send(res, 500, String(error));
          }
        })();
      });
    },
  };
}
