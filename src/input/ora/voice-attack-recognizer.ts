export interface OraUtteranceCandidate {
  transcript: string;
  startedAt: number;
  endedAt: number;
  intensity: number;
}

export interface OraVoiceAttackEvent {
  hitAt: number;
  intensity: number;
  isRush: boolean;
}

export interface OraVoiceAttackRecognizerOptions {
  minIntensity?: number;
  cooldownMs?: number;
  rushWindowMs?: number;
  rushThreshold?: number;
  maxHitsPerUtterance?: number;
  hitSpacingMs?: number;
}

export interface OraVoiceAttackRecognizer {
  recognize(candidate: OraUtteranceCandidate): OraVoiceAttackEvent[];
  reset(): void;
}

const defaults: Required<OraVoiceAttackRecognizerOptions> = {
  // キーワード一致を主な誤発火防止にし、音量は無音・環境ノイズの除外だけを担う。
  minIntensity: 0.05,
  cooldownMs: 300,
  rushWindowMs: 1_200,
  rushThreshold: 3,
  maxHitsPerUtterance: 6,
  hitSpacingMs: 140,
};

const decorationPattern = /[\s\p{P}\p{S}ー〜～]/gu;

function normalizeTranscript(transcript: string): string {
  // SpeechRecognitionの結果に混ざる句読点や長音は、キーワード判定の前に除く。
  return transcript.normalize('NFKC').replace(decorationPattern, '');
}

function countOraMatches(transcript: string): number {
  let count = 0;

  for (let index = 0; index < transcript.length - 1; index += 1) {
    if (transcript.startsWith('オラ', index) || transcript.startsWith('おら', index)) {
      count += 1;
      index += 1;
    }
  }

  return count;
}

function clampIntensity(intensity: number): number {
  return Math.min(1, Math.max(0, intensity));
}

/** 音声認識のfinal結果を、ブラウザAPIから独立したATTACK hit列へ変換する。 */
export function createOraVoiceAttackRecognizer(
  options: OraVoiceAttackRecognizerOptions = {},
): OraVoiceAttackRecognizer {
  const config = {
    minIntensity: Math.min(1, Math.max(0, options.minIntensity ?? defaults.minIntensity)),
    cooldownMs: Math.max(0, options.cooldownMs ?? defaults.cooldownMs),
    rushWindowMs: Math.max(0, options.rushWindowMs ?? defaults.rushWindowMs),
    rushThreshold: Math.max(1, Math.floor(options.rushThreshold ?? defaults.rushThreshold)),
    maxHitsPerUtterance: Math.max(
      0,
      Math.floor(options.maxHitsPerUtterance ?? defaults.maxHitsPerUtterance),
    ),
    hitSpacingMs: Math.max(0, options.hitSpacingMs ?? defaults.hitSpacingMs),
  };

  let lastAcceptedEndedAt: number | null = null;
  // 発話をまたいだRush判定に必要な、すでに生成したhitの時刻だけを保持する。
  let hitTimes: number[] = [];

  return {
    recognize(candidate) {
      const intensity = clampIntensity(candidate.intensity);
      if (intensity < config.minIntensity) return [];

      if (
        lastAcceptedEndedAt !== null &&
        candidate.startedAt - lastAcceptedEndedAt < config.cooldownMs
      ) {
        return [];
      }

      const normalizedTranscript = normalizeTranscript(candidate.transcript);
      const oraCount = countOraMatches(normalizedTranscript);
      if (oraCount === 0) return [];

      const matchedCharacters = oraCount * 2;
      const remainingCharacters = normalizedTranscript.length - matchedCharacters;
      // キーワードが発話の半分未満なら、通常会話中の偶発的な一致として扱う。
      if (remainingCharacters > matchedCharacters) return [];

      const hitCount = Math.min(oraCount, config.maxHitsPerUtterance);
      if (hitCount === 0) return [];

      lastAcceptedEndedAt = candidate.endedAt;

      const events: OraVoiceAttackEvent[] = [];
      for (let index = 0; index < hitCount; index += 1) {
        const hitAt = candidate.startedAt + index * config.hitSpacingMs;
        hitTimes = hitTimes.filter((previousHitAt) => hitAt - previousHitAt <= config.rushWindowMs);
        hitTimes.push(hitAt);
        events.push({
          hitAt,
          intensity,
          isRush: hitTimes.length >= config.rushThreshold,
        });
      }

      return events;
    },
    reset() {
      lastAcceptedEndedAt = null;
      hitTimes = [];
    },
  };
}
