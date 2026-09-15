import { describe, expect, it } from 'vitest';

import { isBuildFailure } from '../../../blender-build-log';

/**
 * `blender --background --python` は、スクリプトが例外で落ちても終了コード 0 を
 * 返す。実際に、ボーンの合わないFBXを取り込ませたとき「失敗したのに 200 が
 * 返り、マニフェストとFBXが残る」状態になった。終了コードではなく出力で
 * 判断していることを、ここで押さえる。
 */
describe('Blenderの出力から失敗を見分ける', () => {
  it('スクリプトが例外で落ちた出力を失敗と見る', () => {
    const log = [
      'Traceback (most recent call last):',
      '  File "scripts/build-hori-daisuke-glb.py", line 170, in main',
      'RuntimeError: bad-test.fbx: expected 1 armature, got 0',
    ].join('\n');

    expect(isBuildFailure(log)).toBe(true);
  });

  /** ボーン名の食い違い。With Skin で落としたときに出る。 */
  it('ボーンの集合が違う出力を失敗と見る', () => {
    const log = "RuntimeError: x.fbx: bone set differs from base rig (not in base: ['Bip01'])";

    expect(isBuildFailure(log)).toBe(true);
  });

  it('普通に書き出せた出力は失敗と見ない', () => {
    const log = [
      "motion 'walk' from walking.fbx frames=(1.0, 43.0)",
      "exported clips ['stand-up', 'walk']",
      'wrote public/models/hori-daisuke.glb 6.24 MiB',
      'Blender quit',
    ].join('\n');

    expect(isBuildFailure(log)).toBe(false);
  });

  /** 警告は失敗ではない。glTFエクスポータは普通に出してくる。 */
  it('警告混じりでも成功は成功と見る', () => {
    const log = [
      'WARNING: There are more than 4 joint vertex influences.',
      'INFO: Finished glTF 2.0 export in 0.77 s',
      'wrote public/models/star-platinum.glb 1.35 MiB',
    ].join('\n');

    expect(isBuildFailure(log)).toBe(false);
  });
});
