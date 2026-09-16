import { describe, expect, it, vi } from 'vitest';

import { createIntroVoicePlayer, INTRO_VOICE_SOURCES } from './intro-voice';

function createAudio() {
  let endedListener: EventListener | null = null;
  return {
    addEventListener: vi.fn<(type: 'ended', listener: EventListener) => void>((_type, listener) => {
      endedListener = listener;
    }),
    currentTime: 9,
    preload: '',
    removeEventListener: vi.fn<(type: 'ended', listener: EventListener) => void>(
      (_type, listener) => {
        if (endedListener === listener) endedListener = null;
      },
    ),
    src: '',
    pause: vi.fn<() => void>(),
    play: vi.fn<() => Promise<void>>(() => Promise.resolve()),
    emitEnded: () => endedListener?.(new Event('ended')),
  };
}

describe('createIntroVoicePlayer', () => {
  it('13本のイントロ音声を事前読み込みする', () => {
    const created: ReturnType<typeof createAudio>[] = [];

    createIntroVoicePlayer({
      createAudio: (source) => {
        const audio = createAudio();
        audio.src = source;
        created.push(audio);
        return audio;
      },
    });

    expect(created).toHaveLength(13);
    expect(created.map((audio) => audio.src)).toEqual([...INTRO_VOICE_SOURCES]);
    expect(created.every((audio) => audio.preload === 'auto')).toBe(true);
  });

  it('ショット番号に対応する音声を先頭から再生する', () => {
    const created: ReturnType<typeof createAudio>[] = [];
    const player = createIntroVoicePlayer({
      createAudio: (source) => {
        const audio = createAudio();
        audio.src = source;
        created.push(audio);
        return audio;
      },
    });

    player.play(3);

    const selected = created[3];
    expect(selected?.pause).toHaveBeenCalledOnce();
    expect(selected?.currentTime).toBe(0);
    expect(selected?.play).toHaveBeenCalledOnce();
  });

  it('同じショットを再通知せず、別ショットへ移ると前の音声を停止する', () => {
    const created: ReturnType<typeof createAudio>[] = [];
    const player = createIntroVoicePlayer({
      createAudio: () => {
        const audio = createAudio();
        created.push(audio);
        return audio;
      },
    });

    player.play(1);
    player.play(1);
    player.play(2);

    expect(created[1]?.play).toHaveBeenCalledOnce();
    expect(created[1]?.pause).toHaveBeenCalledTimes(2);
    expect(created[2]?.play).toHaveBeenCalledOnce();
  });

  it('停止と破棄で音声を止めて解放する', () => {
    const created: ReturnType<typeof createAudio>[] = [];
    const player = createIntroVoicePlayer({
      createAudio: () => {
        const audio = createAudio();
        created.push(audio);
        return audio;
      },
    });

    player.play(0);
    player.stop();
    player.dispose();

    expect(created[0]?.pause).toHaveBeenCalledTimes(2);
    expect(created.every((audio) => audio.src === '')).toBe(true);
  });

  it('音声再生が失敗してもイントロを止めない', async () => {
    const blocked = createAudio();
    blocked.play.mockRejectedValueOnce(new Error('autoplay blocked'));
    const player = createIntroVoicePlayer({ createAudio: () => blocked });

    expect(() => player.play(0)).not.toThrow();
    await Promise.resolve();
  });

  it('音声の再生完了をショット番号付きで通知する', () => {
    const created: ReturnType<typeof createAudio>[] = [];
    const completed: number[] = [];
    const player = createIntroVoicePlayer({
      createAudio: () => {
        const audio = createAudio();
        created.push(audio);
        return audio;
      },
      onEnded: (shotIndex) => completed.push(shotIndex),
    });

    player.play(4);
    created[4]?.emitEnded();

    expect(completed).toEqual([4]);
  });

  it('再生拒否をショット番号付きで通知する', async () => {
    const blocked = createAudio();
    blocked.play.mockRejectedValueOnce(new Error('autoplay blocked'));
    const failed: number[] = [];
    const player = createIntroVoicePlayer({
      createAudio: () => blocked,
      onPlayError: (shotIndex) => failed.push(shotIndex),
    });

    player.play(2);
    await Promise.resolve();

    expect(failed).toEqual([2]);
  });

  it('範囲外のショット番号では再生しない', () => {
    const created: ReturnType<typeof createAudio>[] = [];
    const player = createIntroVoicePlayer({
      createAudio: () => {
        const audio = createAudio();
        created.push(audio);
        return audio;
      },
    });

    player.play(-1);
    player.play(INTRO_VOICE_SOURCES.length);

    expect(created.every((audio) => audio.play.mock.calls.length === 0)).toBe(true);
  });
});
