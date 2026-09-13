#!/usr/bin/env node
/**
 * 仮SE (プレースホルダ) を WAV で書き出す。
 *
 *   node scripts/generate-placeholder-se.mjs
 *
 * 本素材が用意できたら `public/audio/se/` の同名ファイルを上書きするだけで
 * 差し替わる (src/audio/sound-manifest.ts)。別名で置きたい場合は
 * マニフェストの `src` を書き換える。本素材へ全部入れ替えたら
 * このスクリプトごと消してよい。
 *
 * 音の性格は docs/single-player-poc-spec.md §22「音設計」に合わせてある。
 * 聞き分けられることだけが目的で、質は問わない。
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SAMPLE_RATE = 44_100;
const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../public/audio/se');

/** 0〜1 の経過に対する音量。頭と尻を落として耳障りなクリックを防ぐ。 */
function envelope(progress, { attack = 0.02, release = 0.3 } = {}) {
  if (progress < attack) return progress / attack;
  if (progress > 1 - release) return (1 - progress) / release;
  return 1;
}

/** 決定論的な擬似乱数。実行ごとに同じ WAV が出るようにする。 */
function createNoise(seed) {
  let state = seed;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296;
    return (state / 4_294_967_296) * 2 - 1;
  };
}

/**
 * サンプル列を WAV (16bit PCM モノラル) のバイト列へ包む。
 */
function toWav(samples) {
  const buffer = Buffer.alloc(44 + samples.length * 2);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + samples.length * 2, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // fmt チャンクの長さ
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // モノラル
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * 2, 28); // バイト毎秒
  buffer.writeUInt16LE(2, 32); // ブロックあたりバイト
  buffer.writeUInt16LE(16, 34); // ビット深度
  buffer.write('data', 36);
  buffer.writeUInt32LE(samples.length * 2, 40);

  for (const [index, sample] of samples.entries()) {
    const clamped = Math.max(-1, Math.min(1, sample));
    buffer.writeInt16LE(Math.round(clamped * 32_767), 44 + index * 2);
  }

  return buffer;
}

/**
 * 1つの SE を合成する。
 *
 * @param seconds 長さ (秒)
 * @param render 経過秒と進捗 (0〜1) から振幅を返す
 */
function synth(seconds, render) {
  const total = Math.floor(SAMPLE_RATE * seconds);
  const samples = new Float32Array(total);

  for (let index = 0; index < total; index += 1) {
    const time = index / SAMPLE_RATE;
    samples[index] = render(time, index / total);
  }

  return samples;
}

/** ノイズを低域寄りにする1次ローパス。風・吸気の「サー」を作る。 */
function lowpass(previous, input, factor) {
  return previous + (input - previous) * factor;
}

const SOUNDS = {
  // 枕: 風切り音。攻撃直前に音程が上がる (§22)。
  'pillow-sweep-wind': () => {
    const noise = createNoise(1);
    let filtered = 0;
    return synth(1.3, (time, progress) => {
      filtered = lowpass(filtered, noise(), 0.08 + progress * 0.25);
      const whistle = Math.sin(2 * Math.PI * (220 + progress * 480) * time) * 0.25;
      return (filtered * 0.8 + whistle) * envelope(progress, { attack: 0.15, release: 0.2 }) * 0.7;
    });
  },

  // あくび: 吸気音。音程が上がり、最後の約0.15秒は無音 (§8 / §22)。
  //
  // 長さは あくび衝撃波の TELEGRAPH (src/game/attacks/yawn-wave.ts の
  // TELEGRAPH_MS) に合わせる。Cue は予兆の頭で鳴らしっぱなしにするので、
  // 素材が短いとその差がまるごと無音になり、「発射直前の0.15秒だけ無音」
  // という手がかりが成立しない。TELEGRAPH_MS を変えたらここも変える。
  'yawn-inhale': () => {
    const noise = createNoise(2);
    let filtered = 0;
    const seconds = 2.0;
    const silenceFrom = (seconds - 0.15) / seconds;
    return synth(seconds, (time, progress) => {
      if (progress >= silenceFrom) return 0;

      const shaped = progress / silenceFrom;
      filtered = lowpass(filtered, noise(), 0.05 + shaped * 0.3);
      const tone = Math.sin(2 * Math.PI * (160 + shaped * 380) * time) * 0.2;
      return (filtered * 0.9 + tone) * envelope(shaped, { attack: 0.2, release: 0.05 }) * 0.65;
    });
  },

  // 布団: 専用ジングル。上行する3音で「奥義が来る」ことを知らせる (§22)。
  'futon-jingle': () => {
    const steps = [523.25, 659.25, 783.99];
    return synth(1.2, (time, progress) => {
      const step = Math.min(steps.length - 1, Math.floor(progress * steps.length));
      const local = progress * steps.length - step;
      const tone = Math.sin(2 * Math.PI * steps[step] * time);
      const soft = Math.sin(2 * Math.PI * steps[step] * 2 * time) * 0.2;
      return (tone + soft) * envelope(local, { attack: 0.05, release: 0.4 }) * 0.4;
    });
  },

  // 被弾。低い衝撃音。
  'hit-impact': () => {
    const noise = createNoise(3);
    return synth(0.45, (time, progress) => {
      const body = Math.sin(2 * Math.PI * (120 - progress * 60) * time);
      return (body * 0.7 + noise() * 0.3) * Math.exp(-progress * 6) * 0.9;
    });
  },

  // 回避成功。短く軽い成功音。
  'dodge-success': () =>
    synth(0.22, (time, progress) => {
      const tone = Math.sin(2 * Math.PI * (880 + progress * 440) * time);
      return tone * Math.exp(-progress * 9) * 0.5;
    }),

  // ガード成功。金属質な衝突音。
  'guard-success': () => {
    const noise = createNoise(4);
    return synth(0.3, (time, progress) => {
      const clang =
        Math.sin(2 * Math.PI * 1_400 * time) * 0.5 + Math.sin(2 * Math.PI * 2_100 * time) * 0.3;
      return (clang + noise() * 0.2) * Math.exp(-progress * 11) * 0.6;
    });
  },

  // カウンター成功。強めの打撃音。
  'counter-success': () => {
    const noise = createNoise(5);
    return synth(0.5, (time, progress) => {
      const body = Math.sin(2 * Math.PI * (180 - progress * 90) * time);
      const snap = noise() * Math.exp(-progress * 25);
      return (body * 0.8 + snap * 0.5) * Math.exp(-progress * 5) * 1;
    });
  },

  // 大ダウン。倒れ込む低い音。
  'boss-down': () => {
    const noise = createNoise(6);
    let filtered = 0;
    return synth(0.9, (time, progress) => {
      filtered = lowpass(filtered, noise(), 0.05);
      const body = Math.sin(2 * Math.PI * (90 - progress * 45) * time);
      return (body * 0.7 + filtered * 0.5) * Math.exp(-progress * 3.5) * 0.9;
    });
  },
};

mkdirSync(OUT_DIR, { recursive: true });

for (const [name, build] of Object.entries(SOUNDS)) {
  const path = resolve(OUT_DIR, `${name}.wav`);
  writeFileSync(path, toWav(build()));
  console.log(`wrote ${path}`);
}
