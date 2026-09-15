import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { MOTION_MODELS, MOTION_MODEL_IDS, resolveClip, type MotionModel } from './motion-manifest';

/**
 * マニフェストとGLBの中身がズレていないことを守るテスト。
 *
 * モデルは Blender のビルドスクリプトが生成し、React側は名前でクリップを引く。
 * 片方だけ更新するとキャラが一切動かなくなるが、GLBを実際に読むテストが他に
 * 無いため気付けない。ここでGLBのJSONチャンクを直接読む。
 *
 * 旧 `horiDaisukeMotions.test.ts` がボス1体に対してやっていたことを、
 * マニフェストに載る全モデルへ広げたもの。
 */

/** 読み取った値がアニメーション名の配列として扱える形かを確かめる。 */
function isNamedList(value: unknown): value is readonly { readonly name?: unknown }[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'object' && item !== null);
}

/** GLBのJSONチャンクからアニメーション名を取り出す。 */
function readClipNames(url: string): readonly string[] {
  // Vite環境の import.meta.url は http スキームになるため、CWD (リポジトリルート) から解く。
  const glb = readFileSync(resolve(`public${url}`));
  const view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
  // ヘッダ12バイトの後に [chunkLength: u32, chunkType: u32] が続き、最初のチャンクがJSON。
  const jsonLength = view.getUint32(12, true);
  const json: unknown = JSON.parse(glb.subarray(20, 20 + jsonLength).toString('utf8'));

  const animations =
    typeof json === 'object' && json !== null && 'animations' in json ? json.animations : [];
  if (!isNamedList(animations)) return [];

  return animations.flatMap(({ name }) => (typeof name === 'string' ? [name] : []));
}

describe.each(MOTION_MODEL_IDS)('%s のモーション', (id) => {
  const model: MotionModel = MOTION_MODELS[id];

  it('マニフェストのクリップがすべてGLBに入っている', () => {
    const declared = Object.keys(model.clips).toSorted();

    const inGlb = readClipNames(model.url).toSorted();

    expect(inGlb).toEqual(declared);
  });

  it('既定のクリップがGLBに入っている', () => {
    const inGlb = readClipNames(model.url);

    expect(inGlb).toContain(model.defaultClip);
  });
});

describe('状態からクリップを決める', () => {
  const model = MOTION_MODELS['star-platinum'];

  it('どの条件にも当たらなければ既定のクリップへ落ちる', () => {
    expect(resolveClip(model, {})).toBe(model.defaultClip);
  });

  it('条件に当たった行のクリップを返す', () => {
    expect(resolveClip(model, { attacking: true })).toBe('punch');
  });

  it('false の条件は当たったことにしない', () => {
    expect(resolveClip(model, { attacking: false })).toBe(model.defaultClip);
  });

  it('上の行を優先する', () => {
    const ordered: MotionModel = {
      ...model,
      rules: [
        { when: 'attacking', clip: 'punch' },
        { when: 'fallingAsleep', clip: 'idle' },
      ],
    };

    expect(resolveClip(ordered, { attacking: true, fallingAsleep: true })).toBe('punch');
  });
});
