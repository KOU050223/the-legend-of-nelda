import { describe, expect, it } from 'vitest';

import type { AttachInputAdapter, GameAction } from '@/game/types/game-action';
import { attachKeyboardInputAdapter } from '@/input/keyboard/game-action-adapter';
import { attachMicrophoneInputWith } from '@/input/microphone/microphone-input-adapter';
import type {
  AudioAnalysisSessionFactory,
  AudioInputStream,
  AudioInputTrack,
} from '@/input/microphone/microphone-adapter';
import type { NoteEvent } from '@/input/microphone/types';

/**
 * 入力源が共通の契約を満たしていることを確かめる。(#55)
 *
 * 「AR入力・マイク入力を後から足せる」を型の上の主張で終わらせないために、
 * 実在する2つの入力源を**同じ書き方で**起動・後始末できることを押さえる。
 * ARマーカー (#49) を足す人は、ここへ1件足せば同じ保証が得られる。
 *
 * 出力型は揃っていなくてよい。オカリナは終盤専用で通常戦闘のアクションを
 * 出さない (docs/phase2-gameplay-spec.md §13) ため、共通化するのは
 * 「正規化した値だけを通知する」「後始末できる」の2点に絞ってある。
 */

/**
 * 契約どおりに起動し、後始末する。出力型は問わない。
 *
 * @returns detach() を呼べたか。呼べていれば契約を満たしている。
 */
async function attachAndDetach<T>(attach: AttachInputAdapter<T>): Promise<boolean> {
  const adapter = await attach(() => undefined);
  if (typeof adapter.detach !== 'function') return false;
  adapter.detach();
  return true;
}

function createFakeTrack(): AudioInputTrack & { stopped: boolean } {
  const track = {
    stopped: false,
    stop() {
      track.stopped = true;
    },
    getSettings: () => ({ channelCount: 1, sampleRate: 48_000 }),
  };
  return track;
}

function createFakeStream(track: AudioInputTrack): AudioInputStream {
  return { getTracks: () => [track], getAudioTracks: () => [track] };
}

const createFakeSession: AudioAnalysisSessionFactory = () => ({
  sampleRate: 48_000,
  frameSize: 2048,
  readFrame: () => undefined,
  dispose: () => undefined,
});

describe('入力源の共通契約', () => {
  it('キーボードは契約どおりに起動・後始末できる', async () => {
    expect(await attachAndDetach<GameAction>(attachKeyboardInputAdapter)).toBe(true);
  });

  it('マイクは起動が非同期でも同じ契約に収まる', async () => {
    // getUserMedia の許可待ちがあるので、マイクだけ起動が非同期になる。
    // 契約が Promise を許しているので、呼び出し側は同じ書き方で繋げる。
    const track = createFakeTrack();
    const attach: AttachInputAdapter<NoteEvent> = (onNote) =>
      attachMicrophoneInputWith(onNote, {
        getUserMedia: () => Promise.resolve(createFakeStream(track)),
        createSession: createFakeSession,
        setInterval: () => 1,
        clearInterval: () => undefined,
      });

    expect(await attachAndDetach(attach)).toBe(true);
  });

  it('購読を解除するとマイクが解放される', async () => {
    const track = createFakeTrack();
    const adapter = await attachMicrophoneInputWith(() => undefined, {
      getUserMedia: () => Promise.resolve(createFakeStream(track)),
      createSession: createFakeSession,
      setInterval: () => 1,
      clearInterval: () => undefined,
    });

    adapter.detach();

    // MediaStream を握ったままにしない。マイクのランプが点きっぱなしになる。
    expect(track.stopped).toBe(true);
  });
});
