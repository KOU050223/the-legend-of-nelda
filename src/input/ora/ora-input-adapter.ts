import type { OraGameAction, OraRecognition } from './types';

export type OraActionListener = (action: OraGameAction) => void;

/**
 * 認識結果をゲーム向けのアクションへ写像する最後の境界。
 * このPoCでは listener はDebug UIが表示するだけで、既存Combat/Movementへは接続しない。
 */
export function createOraInputAdapter(onAction: OraActionListener) {
  let previousMove: OraGameAction | null = null;

  return {
    consume(recognition: OraRecognition): void {
      if (recognition.move !== previousMove && recognition.move) onAction(recognition.move);
      previousMove = recognition.move;
      for (const action of recognition.actions) onAction(action);
    },
    reset(): void {
      previousMove = null;
    },
  };
}
