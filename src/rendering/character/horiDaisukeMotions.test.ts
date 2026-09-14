import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { DEFAULT_MOTION, MOTION_CLIPS } from './horiDaisukeMotions';

/**
 * GLBのクリップ名と `MOTION_CLIPS` がズレていないことを守るテスト。
 *
 * モデルは `scripts/build-hori-daisuke-glb.py` が生成し、React側は名前で
 * クリップを引く。片方だけ更新するとBossが一切動かなくなるが、GLBを実際に
 * 読むテストが他に無いため気付けない。ここでGLBのJSONチャンクを直接読む。
 */

// Vite環境の import.meta.url は http スキームになるため、CWD (リポジトリルート) から解く。
const GLB_PATH = resolve('public/models/hori-daisuke.glb');

/** 読み取った値がアニメーション名の配列として扱える形かを確かめる。 */
function isNamedList(value: unknown): value is readonly { readonly name?: unknown }[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'object' && item !== null);
}

/** GLBのJSONチャンクからアニメーション名を取り出す。 */
function readClipNames(path: string): readonly string[] {
  const glb = readFileSync(path);
  const view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
  // ヘッダ12バイトの後に [chunkLength: u32, chunkType: u32] が続き、最初のチャンクがJSON。
  const jsonLength = view.getUint32(12, true);
  const json: unknown = JSON.parse(glb.subarray(20, 20 + jsonLength).toString('utf8'));

  const animations =
    typeof json === 'object' && json !== null && 'animations' in json ? json.animations : [];
  if (!isNamedList(animations)) return [];

  return animations.flatMap(({ name }) => (typeof name === 'string' ? [name] : []));
}

describe('hori-daisuke.glb のモーション', () => {
  it('GLBのクリップ名と MOTION_CLIPS が一致する', () => {
    expect(readClipNames(GLB_PATH).toSorted()).toEqual(Object.keys(MOTION_CLIPS).toSorted());
  });

  it('既定のモーションが MOTION_CLIPS にある', () => {
    expect(MOTION_CLIPS[DEFAULT_MOTION]).toBeDefined();
  });
});
