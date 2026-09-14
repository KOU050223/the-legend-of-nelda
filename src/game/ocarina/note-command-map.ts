import type { NoteName } from '@/input/microphone/types';

/**
 * オカリナのド・ミ・ソをゲームコマンドへ対応付ける。(Issue #43)
 *
 * 音声基盤は12音階すべてを返す。ここは「ゲームが使う音だけ拾う」層で、
 * 対象外の音を C / E / G へ丸めない。D を無理に DO や MI にすると、
 * 吹き間違いが正解入力として通ってしまう。
 */
export type OcarinaCommand = 'DO' | 'MI' | 'SO';

/** 対象外の音。ゲーム側は無視する。 */
export const IGNORE = 'IGNORE' as const;

export type OcarinaInput = OcarinaCommand | typeof IGNORE;

const NOTE_TO_COMMAND: Partial<Record<NoteName, OcarinaCommand>> = {
  C: 'DO',
  E: 'MI',
  G: 'SO',
};

/**
 * 音名をゲームコマンドへ変換する。オクターブは問わないため、
 * C4 / C5 / C6 はいずれも DO になる。
 */
export function toOcarinaCommand(name: NoteName): OcarinaInput {
  return NOTE_TO_COMMAND[name] ?? IGNORE;
}

/** コマンドとして使う音かどうか。 */
export function isOcarinaCommand(input: OcarinaInput): input is OcarinaCommand {
  return input !== IGNORE;
}
