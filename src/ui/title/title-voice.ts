import aaQuiyaka from '../../../assets/character/hori-daisuke-v1/aa_quiyaka.wav';
import alarmBurst from '../../../assets/character/hori-daisuke-v1/alarm-burst.wav';
import horiComplaint from '../../../assets/character/hori-daisuke-v1/hori-complaint.wav';
import majidenannnann from '../../../assets/character/hori-daisuke-v1/majidenannnann.wav';

const HORI_TITLE_VOICE_SOURCES = [aaQuiyaka, alarmBurst, horiComplaint, majidenannnann] as const;

interface TitleVoiceAudio {
  currentTime: number;
  preload: string;
  src: string;
  pause(): void;
  play(): Promise<void> | void;
}

export interface TitleVoicePlayer {
  playRandom(): void;
  dispose(): void;
}

export interface TitleVoicePlayerOptions {
  random?: () => number;
  createAudio?: (source: string) => TitleVoiceAudio;
}

/** タイトル画面で堀大輔をクリックしたときだけ鳴らす、4種のランダムボイス。 */
export function createTitleVoicePlayer({
  random = Math.random,
  createAudio = (source) => new Audio(source),
}: TitleVoicePlayerOptions = {}): TitleVoicePlayer {
  const voices = HORI_TITLE_VOICE_SOURCES.map((source) => {
    const audio = createAudio(source);
    audio.preload = 'auto';
    return audio;
  });

  return {
    playRandom() {
      const index = Math.min(voices.length - 1, Math.floor(random() * voices.length));
      const voice = voices[index];
      if (voice === undefined) return;

      voice.pause();
      voice.currentTime = 0;
      try {
        const played = voice.play();
        if (played instanceof Promise) void played.catch(() => undefined);
      } catch {
        // 再生が拒否されても、タイトル画面の操作は続けられる。
      }
    },
    dispose() {
      for (const voice of voices) {
        voice.pause();
        voice.src = '';
      }
    },
  };
}
