/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * コミットされている `public/audio/se/*.wav` の長さが、対応する技の
 * TELEGRAPH と同じかそれ以上であることを確かめる。
 *
 * `yawn-inhale` (あくび) は実ファイルが TELEGRAPH より短く、着弾直前の
 * 無音が仕様の0.15秒ではなく0.55秒になっていた (レビュー指摘)。
 * `futon-jingle` (布団) でも同じ理由で後半 (寝息・ポフッ) が丸ごと
 * 無音になっていた。どちらも「生成スクリプトを再実行して確かめる」運用の
 * ため、スクリプトを直しても実ファイルの再生成を忘れると気づけない
 * (sound-manifest.test.ts の「マニフェストと実ファイルの一致」と同じ理由で、
 * ここも生成スクリプトではなくコミットされた成果物そのものを検証する)。
 */
const AUDIO_SE_DIR = resolve(__dirname, '../../public/audio/se');

/** WAV (RIFF/PCM) のサンプル数からミリ秒を出す。 */
function wavDurationMs(buffer: Buffer): number {
  const sampleRate = buffer.readUInt32LE(24);
  const blockAlign = buffer.readUInt16LE(32);
  const dataSize = buffer.readUInt32LE(40);
  const frames = dataSize / blockAlign;
  return (frames / sampleRate) * 1000;
}

describe('予兆SEの長さ', () => {
  it.each([
    // TELEGRAPH_MS は各技ファイル (fluffy-futon.ts / yawn-wave.ts) の定義値。
    // 技側を変えたらここも変える。
    ['futon-jingle', 2300],
    ['yawn-inhale', 2000],
  ])('%s は対応する技の TELEGRAPH と同じ長さ以上で存在する', (soundName, telegraphMs) => {
    const buffer = readFileSync(resolve(AUDIO_SE_DIR, `${soundName}.wav`));
    const durationMs = wavDurationMs(buffer);

    // 予兆の頭で鳴らしっぱなしにする実装なので、素材が TELEGRAPH より
    // 短いとその差がまるごと無音になる。長い分には後続の Cue で
    // 上書きされるだけなので問題ない (yawn-inhale のレビュー指摘)。
    expect(durationMs).toBeGreaterThanOrEqual(telegraphMs);
  });
});
