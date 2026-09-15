import { create } from 'zustand';

import { CHARACTER_IDS, type CharacterId } from '@/game/config/phase2-player-balance';
import type { PlayerStatus } from '@/game/player/player-state';

/**
 * 操作対象のプレイヤーを切り替える。(Issue #106)
 *
 * ソロではオドルノだけを生成するが、既存のキャラID対応とセッション互換の
 * ため、切り替え用の状態・型は残している。
 *
 * ネットワーク経由の対戦では local が誰かは `WELCOME` の playerId で
 * 決まる (src/multiplayer)。ここはローカル1台で動かすときの切り替えで、
 * 向こうとは別経路。二重管理にならないよう混ぜない。
 */

/** roster 上のプレイヤーID。`createBattle` の roster と同じ綴り。 */
export const LOCAL_PLAYER_IDS = ['odoruno', 'pay', 'ora'] as const;

export type LocalPlayerId = (typeof LOCAL_PLAYER_IDS)[number];

/**
 * roster のIDとキャラクターIDの対応。
 *
 * roster ID は小文字、`CharacterId` は大文字で別物なので、取り違えが
 * 起きないよう対応表を1箇所へ置く。UI のラベルもここから引く。
 */
export const LOCAL_PLAYER_CHARACTER_IDS: Readonly<Record<LocalPlayerId, CharacterId>> = {
  odoruno: 'ODORUNO',
  pay: 'PAY',
  ora: 'ORA',
};

/** 画面に出す名前。docs/phase2-role-design-spec.md の呼び方に合わせる。 */
export const LOCAL_PLAYER_LABELS: Readonly<Record<LocalPlayerId, string>> = {
  odoruno: 'オドルノDaisuke',
  pay: 'Pay大輔',
  ora: 'オラ大輔',
};

/** 既定の操作キャラ。従来どおりオドルノから始める。 */
export const DEFAULT_LOCAL_PLAYER_ID: LocalPlayerId = 'odoruno';

interface LocalPlayerState {
  localPlayerId: LocalPlayerId;
  setLocalPlayerId: (id: LocalPlayerId) => void;
  /**
   * roster 各人の状態。切り替え先が寝ていると操作が効かないので、
   * 選ぶ前に分かるよう表示側へ渡す。真実源は戦闘 (boss-battle) で、
   * ここはそれを映すだけ。
   */
  statuses: Readonly<Partial<Record<LocalPlayerId, PlayerStatus>>>;
  setStatuses: (statuses: Readonly<Partial<Record<LocalPlayerId, PlayerStatus>>>) => void;
}

export const useLocalPlayerStore = create<LocalPlayerState>((set) => ({
  localPlayerId: DEFAULT_LOCAL_PLAYER_ID,
  setLocalPlayerId: (localPlayerId) => set({ localPlayerId }),
  statuses: {},
  setStatuses: (statuses) => set({ statuses }),
}));

/** 今そのキャラを操作できるか。状態が分からないうちは選べる扱いにする。 */
export function isSelectable(
  statuses: Readonly<Partial<Record<LocalPlayerId, PlayerStatus>>>,
  id: LocalPlayerId,
): boolean {
  const status = statuses[id];
  return status === undefined || status === 'ACTIVE';
}

/**
 * 再レンダーを挟まずに今の操作キャラを読む。
 *
 * 毎フレームのループや、張り直したくないイベント購読の中から使う。
 * フックの戻り値を closure で掴むと、切り替えのたびに入力アダプタを
 * 繋ぎ直すことになり、押しっぱなしの移動が切れる。
 */
export function readLocalPlayerId(): LocalPlayerId {
  return useLocalPlayerStore.getState().localPlayerId;
}

/** 文字列が roster 上のIDか。URLクエリなど外から来た値の検証に使う。 */
export function isLocalPlayerId(value: unknown): value is LocalPlayerId {
  return LOCAL_PLAYER_IDS.some((id) => id === value);
}

/** roster と対応表が食い違っていないことを型の外側でも確かめられるようにする。 */
export function characterIdOf(id: LocalPlayerId): CharacterId {
  return LOCAL_PLAYER_CHARACTER_IDS[id];
}

/** 対応表が `CHARACTER_IDS` を過不足なく覆っているか。 */
export function coversAllCharacters(): boolean {
  const mapped = LOCAL_PLAYER_IDS.map(characterIdOf);
  return mapped.length === CHARACTER_IDS.length && CHARACTER_IDS.every((id) => mapped.includes(id));
}
