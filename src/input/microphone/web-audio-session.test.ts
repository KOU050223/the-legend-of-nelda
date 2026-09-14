import { beforeAll, describe, expect, it, vi } from 'vitest';

import type { AnalysisAudioContext, AudioInputStream } from './microphone-adapter';
import { createWebAudioSession } from './microphone-adapter';

/**
 * jsdom に AudioContext が無いため、context を差し替えて結線と後始末だけ確認する。
 * 実際に音が取れるかは実機の Manual Test で見る (docs/testing-strategy.md §11)。
 */

interface FakeContext {
  context: AnalysisAudioContext;
  closed: boolean;
  resumed: boolean;
  connected: boolean;
  disconnected: boolean;
  fftSize: number;
  readFrames: number;
}

function createFakeContext(initialState: AudioContextState = 'running'): FakeContext {
  let current = initialState;

  const state: FakeContext = {
    context: {
      get state() {
        return current;
      },
      sampleRate: 48_000,
      resume: () => {
        state.resumed = true;
        current = 'running';
        return Promise.resolve();
      },
      connectMicrophone: (_stream, fftSize) => {
        state.connected = true;
        state.fftSize = fftSize;

        return {
          analyser: {
            fftSize,
            getFloatTimeDomainData: () => {
              state.readFrames += 1;
            },
            disconnect: () => undefined,
          },
          disconnect: () => {
            state.disconnected = true;
          },
        };
      },
      close: () => {
        state.closed = true;
        return Promise.resolve();
      },
    },
    closed: false,
    resumed: false,
    connected: false,
    disconnected: false,
    fftSize: 0,
    readFrames: 0,
  };

  return state;
}

/**
 * jsdom には MediaStream が無い。実装は instanceof で本物かを見るため、
 * 最低限のクラスを用意して差し替える。
 */
class StubMediaStream {
  getTracks(): [] {
    return [];
  }
  getAudioTracks(): [] {
    return [];
  }
}

beforeAll(() => {
  if (!('MediaStream' in globalThis)) {
    Object.defineProperty(globalThis, 'MediaStream', { value: StubMediaStream, writable: true });
  }
});

function fakeStream(): AudioInputStream {
  return new StubMediaStream();
}

describe('createWebAudioSession', () => {
  it('マイクを解析へ繋いで、窓長と sampleRate を引き継ぐ', async () => {
    const fake = createFakeContext();

    const session = await createWebAudioSession(fakeStream(), () => fake.context);

    expect(fake.connected).toBe(true);
    expect(session.frameSize).toBe(fake.fftSize);
    expect(session.sampleRate).toBe(48_000);
  });

  it('停止していた AudioContext は再開してから使う', async () => {
    const fake = createFakeContext('suspended');

    await createWebAudioSession(fakeStream(), () => fake.context);

    expect(fake.resumed).toBe(true);
    expect(fake.closed).toBe(false);
  });

  it('動いている AudioContext は再開し直さない', async () => {
    const fake = createFakeContext('running');

    await createWebAudioSession(fakeStream(), () => fake.context);

    expect(fake.resumed).toBe(false);
  });

  // iOS Safari では resume が拒否されたまま解決することがある。
  // 無音を返し続けるより、起動失敗として表面化させる。
  it('再開できないまま解決したら起動を失敗させる', async () => {
    const fake = createFakeContext('suspended');
    vi.spyOn(fake.context, 'resume').mockResolvedValue(undefined);

    await expect(createWebAudioSession(fakeStream(), () => fake.context)).rejects.toThrow(
      'AudioContext を再開できない',
    );
  });

  it('起動に失敗したら AudioContext を残さない', async () => {
    const fake = createFakeContext('suspended');
    vi.spyOn(fake.context, 'resume').mockResolvedValue(undefined);

    await expect(createWebAudioSession(fakeStream(), () => fake.context)).rejects.toThrow(
      'AudioContext を再開できない',
    );

    // 残すと再試行のたびに増え、ブラウザ側の上限でマイクを開けなくなる。
    expect(fake.closed).toBe(true);
  });

  it('結線に失敗しても AudioContext を残さない', async () => {
    const fake = createFakeContext();
    vi.spyOn(fake.context, 'connectMicrophone').mockImplementation(() => {
      throw new Error('connect failed');
    });

    await expect(createWebAudioSession(fakeStream(), () => fake.context)).rejects.toThrow(
      'connect failed',
    );

    expect(fake.closed).toBe(true);
  });

  it('本物の MediaStream でなければ組み立てない', async () => {
    const fake = createFakeContext();
    const notAStream = { getTracks: () => [], getAudioTracks: () => [] };

    await expect(createWebAudioSession(notAStream, () => fake.context)).rejects.toThrow(
      'MediaStream',
    );

    expect(fake.closed).toBe(true);
  });

  it('後始末でノードを切り離し AudioContext を閉じる', async () => {
    const fake = createFakeContext();
    const session = await createWebAudioSession(fakeStream(), () => fake.context);

    session.dispose();

    expect(fake.disconnected).toBe(true);
    expect(fake.closed).toBe(true);
  });

  it('解析用の波形を取り出せる', async () => {
    const fake = createFakeContext();
    const session = await createWebAudioSession(fakeStream(), () => fake.context);

    session.readFrame(new Float32Array(new ArrayBuffer(session.frameSize * 4)));

    expect(fake.readFrames).toBe(1);
  });
});
