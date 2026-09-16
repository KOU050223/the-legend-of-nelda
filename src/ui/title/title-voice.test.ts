import { describe, expect, it, vi } from 'vitest';

import { createTitleVoicePlayer } from './title-voice';

function audio() {
  return {
    currentTime: 9,
    preload: '',
    src: '',
    pause: vi.fn<() => void>(),
    play: vi.fn<() => Promise<void>>(() => Promise.resolve()),
  };
}

describe('createTitleVoicePlayer', () => {
  it('堀大輔をクリックしたときは選ばれたボイスを頭から再生する', () => {
    const created: ReturnType<typeof audio>[] = [];
    const voices = [audio(), audio(), audio(), audio()];
    const player = createTitleVoicePlayer({
      random: () => 0.51,
      createAudio: () => {
        const next = voices.shift() ?? audio();
        created.push(next);
        return next;
      },
    });

    player.playRandom();

    const selected = created[2];
    expect(selected?.pause).toHaveBeenCalledOnce();
    expect(selected?.currentTime).toBe(0);
    expect(selected?.play).toHaveBeenCalledOnce();
  });
});
