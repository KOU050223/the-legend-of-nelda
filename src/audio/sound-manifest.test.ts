import { describe, expect, it } from 'vitest';

import { SOUND_IDS, SOUND_MANIFEST, soundIdForAudioCue } from './sound-manifest';

/**
 * `public/audio/se/` に実在するファイルの一覧。
 *
 * `src` は Node の型を持たない (tsconfig.app.json の types) ので fs は使わず、
 * Vite が解決する import.meta.glob で拾う。キーはプロジェクトルートからの
 * 相対パスなので、マニフェストの URL と同じ形へ直してから突き合わせる。
 */
const SOUND_FILES = new Set(
  Object.keys(import.meta.glob('/public/audio/se/*', { eager: false })).map((path) =>
    path.replace('/public', ''),
  ),
);

/**
 * 音源ファイルの実在を確かめる。
 *
 * 再生は失敗しても握り潰す (音が鳴らないだけでゲームは続けるべきなので)。
 * つまりマニフェストとファイル名がずれても実行時には何も起きない。
 * 素材を差し替え・改名したときに気づける場所がここしかない。
 */
describe('音源マニフェスト', () => {
  it.each(SOUND_IDS)('%s の音源ファイルが実在する', (soundId) => {
    expect(SOUND_FILES).toContain(SOUND_MANIFEST[soundId].src);
  });

  it('すべてのSEに音源が定義されている', () => {
    expect(Object.keys(SOUND_MANIFEST).toSorted()).toEqual([...SOUND_IDS].toSorted());
  });

  it('同じ音源を複数のSEが指していない', () => {
    // 取り違えたまま気づかないのを防ぐ。意図的に共用したくなったら
    // このテストを消すのではなく、共用する理由をコメントで残す。
    const sources = SOUND_IDS.map((id) => SOUND_MANIFEST[id].src);

    expect(new Set(sources).size).toBe(sources.length);
  });

  it.each(SOUND_IDS)('%s の音量係数が0〜1に収まっている', (soundId) => {
    const { gain } = SOUND_MANIFEST[soundId];

    expect(gain).toBeGreaterThan(0);
    expect(gain).toBeLessThanOrEqual(1);
  });

  it('爆発音のあとに「やめてもらっていいですか」が続く', () => {
    // 尺はコードではなく素材が持つ。ここで繋ぎ先だけを固定しておけば、
    // 録り直しても順番は保たれる。
    expect(SOUND_MANIFEST['alarm-burst'].followedBy).toBe('hori-complaint');
  });

  it('続きの音が定義されていれば実在するSEを指す', () => {
    for (const soundId of SOUND_IDS) {
      const { followedBy } = SOUND_MANIFEST[soundId];
      if (followedBy === undefined) continue;

      expect(SOUND_IDS).toContain(followedBy);
      // 自分自身へ繋ぐと鳴り止まなくなる。
      expect(followedBy).not.toBe(soundId);
    }
  });

  it('未知の Cue ID ではSEを引かない', () => {
    expect(soundIdForAudioCue('unknown-cue')).toBeNull();
  });
});
