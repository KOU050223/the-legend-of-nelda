import type { NoteName } from '@/input/microphone/types';

/**
 * 最終演出で奏でる「ゼルダの子守唄」の採用6音。
 *
 * 表示上のドレミは「ミ・ソ・レ・ミ・ソ・レ」。認識は音名だけを比較するため、
 * 演奏するオクターブは問わない。
 */
export const FINALE_OCARINA_MELODY = [
  'E',
  'G',
  'D',
  'E',
  'G',
  'D',
] as const satisfies readonly NoteName[];
