import type { BattleSnapshot } from '../game/session/boss-battle';
import { isDiscreteGameActionType, type GameAction } from '../game/types/game-action';
import type { WasshoiEvent } from '../input/wasshoi/types';

export interface JoinMessage {
  readonly type: 'JOIN';
  readonly token: string;
}

export interface WelcomeMessage {
  readonly type: 'WELCOME';
  readonly playerId: string;
  readonly epoch: number;
}

export interface ActionMessage {
  readonly type: 'ACTION';
  readonly epoch: number;
  readonly seq: number;
  readonly action: GameAction;
}

export interface StateMessage {
  readonly type: 'STATE';
  readonly battle: BattleSnapshot;
}

export interface WasshoiMessage {
  readonly type: 'WASSHOI';
  readonly event: WasshoiEvent;
}

export type ClientToAuthorityMessage = JoinMessage | ActionMessage;
export type AuthorityToClientMessage = WelcomeMessage | StateMessage | WasshoiMessage;

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function hasOnlyKeys(value: UnknownRecord, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

function isMovementInput(value: unknown): boolean {
  return isRecord(value) && isFiniteNumber(value.forward) && isFiniteNumber(value.right);
}

export function isGameAction(value: unknown): value is GameAction {
  if (!isRecord(value) || typeof value.type !== 'string') return false;
  if (value.type === 'MOVE') return isMovementInput(value.input);
  return isDiscreteGameActionType(value.type);
}

export function isWasshoiEvent(value: unknown): value is WasshoiEvent {
  return (
    isRecord(value) &&
    value.type === 'WASSHOI' &&
    isFiniteNumber(value.intensity) &&
    isFiniteNumber(value.durationMs)
  );
}

export function isBattleSnapshot(value: unknown): value is BattleSnapshot {
  return isRecord(value) && isRecord(value.boss) && Array.isArray(value.players);
}

export function isClientToAuthorityMessage(value: unknown): value is ClientToAuthorityMessage {
  if (!isRecord(value) || typeof value.type !== 'string') return false;

  if (value.type === 'JOIN') {
    return hasOnlyKeys(value, ['type', 'token']) && typeof value.token === 'string';
  }

  if (value.type === 'ACTION') {
    return (
      hasOnlyKeys(value, ['type', 'epoch', 'seq', 'action']) &&
      isFiniteNumber(value.epoch) &&
      isFiniteNumber(value.seq) &&
      isGameAction(value.action)
    );
  }

  return false;
}

export function isAuthorityToClientMessage(value: unknown): value is AuthorityToClientMessage {
  if (!isRecord(value) || typeof value.type !== 'string') return false;

  if (value.type === 'WELCOME') {
    return (
      hasOnlyKeys(value, ['type', 'playerId', 'epoch']) &&
      typeof value.playerId === 'string' &&
      isFiniteNumber(value.epoch)
    );
  }

  if (value.type === 'STATE') {
    return hasOnlyKeys(value, ['type', 'battle']) && isBattleSnapshot(value.battle);
  }

  if (value.type === 'WASSHOI') {
    return hasOnlyKeys(value, ['type', 'event']) && isWasshoiEvent(value.event);
  }

  return false;
}
