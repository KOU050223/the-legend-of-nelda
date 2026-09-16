const INTRO_VOICE_BASE_PATH = '/audio/se/intro_voice';

export const INTRO_VOICE_SOURCES = [
  `${INTRO_VOICE_BASE_PATH}/intro_voice1.mp3`,
  `${INTRO_VOICE_BASE_PATH}/intro_voice2.mp3`,
  `${INTRO_VOICE_BASE_PATH}/intro_voice3.mp3`,
  `${INTRO_VOICE_BASE_PATH}/intro_voice4.mp3`,
  `${INTRO_VOICE_BASE_PATH}/intro_voice5.mp3`,
  `${INTRO_VOICE_BASE_PATH}/intro_voice6.mp3`,
  `${INTRO_VOICE_BASE_PATH}/intro_voice7.mp3`,
  `${INTRO_VOICE_BASE_PATH}/intro_voice8.mp3`,
  `${INTRO_VOICE_BASE_PATH}/intro_voice9.mp3`,
  `${INTRO_VOICE_BASE_PATH}/intro_voice10.mp3`,
  `${INTRO_VOICE_BASE_PATH}/intro_voice11.mp3`,
  `${INTRO_VOICE_BASE_PATH}/intro_voice12.mp3`,
  `${INTRO_VOICE_BASE_PATH}/intro_voice13.mp3`,
] as const;

interface IntroVoiceAudio {
  addEventListener(type: 'ended', listener: EventListener, options?: AddEventListenerOptions): void;
  currentTime: number;
  preload: string;
  removeEventListener(type: 'ended', listener: EventListener): void;
  src: string;
  pause(): void;
  play(): Promise<void> | void;
}

export interface IntroVoicePlayer {
  play(shotIndex: number): void;
  stop(): void;
  dispose(): void;
}

export interface IntroVoicePlayerOptions {
  createAudio?: (source: string) => IntroVoiceAudio;
  onEnded?: (shotIndex: number) => void;
  onPlayError?: (shotIndex: number) => void;
}

/** イントロのショット番号に対応する堀大輔の音声を再生する。 */
export function createIntroVoicePlayer({
  createAudio = (source) => new Audio(source),
  onEnded,
  onPlayError,
}: IntroVoicePlayerOptions = {}): IntroVoicePlayer {
  const voices = INTRO_VOICE_SOURCES.map((source) => {
    const audio = createAudio(source);
    audio.preload = 'auto';
    return audio;
  });
  let activeIndex: number | null = null;
  let activeEndedListener: EventListener | null = null;
  let disposed = false;

  function stop(): void {
    if (activeIndex === null) return;

    const voice = voices[activeIndex];
    activeIndex = null;
    if (!voice) return;

    if (activeEndedListener) voice.removeEventListener('ended', activeEndedListener);
    activeEndedListener = null;
    voice.pause();
    voice.currentTime = 0;
  }

  return {
    play(shotIndex) {
      if (disposed || shotIndex < 0 || shotIndex >= voices.length || activeIndex === shotIndex) {
        return;
      }

      stop();
      const voice = voices[shotIndex];
      if (!voice) return;

      activeIndex = shotIndex;
      voice.pause();
      voice.currentTime = 0;
      const endedListener: EventListener = () => {
        if (activeIndex !== shotIndex) return;
        activeIndex = null;
        activeEndedListener = null;
        onEnded?.(shotIndex);
      };
      activeEndedListener = endedListener;
      voice.addEventListener('ended', endedListener, { once: true });
      try {
        const played = voice.play();
        if (played instanceof Promise) {
          void played.catch(() => {
            if (activeIndex !== shotIndex) return;
            activeIndex = null;
            activeEndedListener = null;
            voice.removeEventListener('ended', endedListener);
            onPlayError?.(shotIndex);
          });
        }
      } catch {
        if (activeIndex !== shotIndex) return;
        activeIndex = null;
        activeEndedListener = null;
        voice.removeEventListener('ended', endedListener);
        onPlayError?.(shotIndex);
      }
    },

    stop,

    dispose() {
      if (disposed) return;
      stop();
      for (const voice of voices) {
        voice.src = '';
      }
      disposed = true;
    },
  };
}
