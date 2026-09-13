import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createHtmlAudioOutput, createSilentAudioOutput } from './audio-output';

/**
 * jsdom の HTMLMediaElement は play() を実装していない。ブラウザの
 * 自動再生ポリシーを再現するため、拒否する / 許可する play() を差し込む。
 */
type PlaySpy = ReturnType<typeof vi.fn<() => Promise<void>>>;

function stubPlay(behavior: 'reject' | 'resolve'): PlaySpy {
  const play = vi.fn<() => Promise<void>>(() =>
    behavior === 'reject' ? Promise.reject(new Error('NotAllowedError')) : Promise.resolve(),
  );

  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(play);
  return play;
}

/** 実際に鳴らしにいった回数。 */
function playCount(play: PlaySpy): number {
  return play.mock.calls.length;
}

let dispose: (() => void) | undefined;

beforeEach(() => {
  // jsdom は pause() を実装していない。dispose() が必ず通る経路なので、
  // 実装の無い警告でテスト出力が埋まらないよう差し替える。
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function pause() {});
});

afterEach(() => {
  dispose?.();
  dispose = undefined;
  vi.restoreAllMocks();
});

describe('createSilentAudioOutput', () => {
  it('何も鳴らさずに破棄できる', () => {
    const output = createSilentAudioOutput();

    expect(() => {
      output.play('hit-impact', 1);
      output.dispose();
    }).not.toThrow();
  });
});

describe('createHtmlAudioOutput', () => {
  it('操作前に拒否されたCueを最初の操作で鳴らし直す', async () => {
    // 戦闘は操作を待たずに進むので、最初の予兆SEは自動再生として拒否されうる。
    // 拒否は握り潰す仕様のため、取り返さないと最初の技だけ無音になる。
    const play = stubPlay('reject');
    const output = createHtmlAudioOutput();
    dispose = () => output.dispose();

    output.play('yawn-inhale', 1);
    await vi.waitFor(() => expect(playCount(play)).toBe(1));

    // 拒否されたあとに最初の操作が来る。
    const retried = stubPlay('resolve');
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyA' }));

    // 操作だけでは何も要求していないので、鳴ったなら取り返した1件。
    await vi.waitFor(() => expect(playCount(retried)).toBe(1));
  });

  it('拒否されなかったCueは操作時に鳴り直さない', async () => {
    // 取り返しは「拒否された分」だけ。成功した音を後から重ねて鳴らさない。
    const play = stubPlay('resolve');
    const output = createHtmlAudioOutput();
    dispose = () => output.dispose();

    output.play('hit-impact', 1);
    await vi.waitFor(() => expect(playCount(play)).toBe(1));

    play.mockClear();
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyA' }));

    expect(playCount(play)).toBe(0);
  });

  it('再生できなくても例外を投げない', () => {
    // 演出が鳴らないだけでゲームは続ける。戦闘ループへ例外を返さない。
    stubPlay('reject');
    const output = createHtmlAudioOutput();
    dispose = () => output.dispose();

    expect(() => output.play('hit-impact', 1)).not.toThrow();
  });

  it('破棄したあとの操作では鳴らない', async () => {
    const play = stubPlay('reject');
    const output = createHtmlAudioOutput();

    output.play('hit-impact', 1);
    await vi.waitFor(() => expect(playCount(play)).toBe(1));

    output.dispose();
    play.mockClear();
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyA' }));

    expect(playCount(play)).toBe(0);
  });
});
