import type { BarrierChallengeSnapshot } from '@/game/barrier/barrier-challenge';
import type { CharacterId } from '@/game/config/phase2-player-balance';

/**
 * 結界 (ショートスリーパー結界) の表示状態。docs/phase2-gameplay-spec.md §11。
 *
 * finale-presentation-store と同じ形にしてある。Canvas の外へ DOM を出す
 * 経路は1本にしておきたいので、購読の作法も揃える。
 *
 * ソロ (WORLD) では BossBattle が結界を自動解除するため `challenge` は常に
 * null になり、何も表示されない。ここが動くのは GAME (マルチプレイ) だけ。
 */
export interface BarrierPresentationSnapshot {
  /** 進行中の結界。結界フェーズ外・ソロでは null。 */
  readonly challenge: BarrierChallengeSnapshot | null;
  /** 操作しているキャラ。案内の文言を役割ごとに変えるために持つ。 */
  readonly localCharacterId: CharacterId | null;
  /**
   * 手順を間違えて進行が巻き戻された回数。
   *
   * 0 なら表示しない。同じ文言を続けて出し直せるよう、真偽値ではなく
   * 単調増加の連番にする (FinaleOverlay の zeroDamageSequence と同じ理由)。
   */
  readonly resetSequence: number;
}

const INITIAL_SNAPSHOT: BarrierPresentationSnapshot = {
  challenge: null,
  localCharacterId: null,
  resetSequence: 0,
};

let snapshot = INITIAL_SNAPSHOT;
const listeners = new Set<() => void>();

export function getBarrierPresentationSnapshot(): BarrierPresentationSnapshot {
  return snapshot;
}

export function subscribeToBarrierPresentation(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function publishBarrierPresentation(next: BarrierPresentationSnapshot): void {
  if (
    snapshot.challenge === next.challenge &&
    snapshot.localCharacterId === next.localCharacterId &&
    snapshot.resetSequence === next.resetSequence
  )
    return;
  snapshot = next;
  for (const listener of listeners) listener();
}

export function resetBarrierPresentation(): void {
  publishBarrierPresentation(INITIAL_SNAPSHOT);
}
