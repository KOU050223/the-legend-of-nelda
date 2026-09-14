import type { AttachInputAdapter, InputAdapter } from '@/game/types/game-action';

import { attachMicrophoneNoteInput, type MicrophoneAdapterOptions } from './microphone-adapter';
import type { NoteEvent } from './types';

/**
 * マイク入力を共通の Input Adapter 契約へ合わせる。(#55)
 *
 * 中身は #43 の `attachMicrophoneNoteInput` をそのまま使う。あちらは
 * 購読解除関数を直接返す形で、テストとデバッグUIが既に乗っているため
 * 触らない。ここは形を揃えるだけの薄い層。
 *
 * **出力は `NoteEvent` のままで、`GameAction` へは変換しない。**
 * オカリナは終盤の最終局面でだけ使い、通常戦闘やオラ大輔の通常能力には
 * 使わない (docs/phase2-gameplay-spec.md §13)。通常戦闘のアクションへ
 * 対応付けると、仕様が「別途設計する」としている入力方式を先取りで
 * 決めることになる。安眠の旋律の設計が決まった時点で、その変換を
 * この層へ足せばよい。
 */
export const attachMicrophoneInput: AttachInputAdapter<NoteEvent> = async (onNote) =>
  attachMicrophoneInputWith(onNote);

/** 閾値などを渡せる形。テストと閾値調整UIから使う。 */
export async function attachMicrophoneInputWith(
  onNote: (event: NoteEvent) => void,
  options: MicrophoneAdapterOptions = {},
): Promise<InputAdapter> {
  const stop = await attachMicrophoneNoteInput(onNote, options);
  return {
    detach() {
      stop();
    },
  };
}
