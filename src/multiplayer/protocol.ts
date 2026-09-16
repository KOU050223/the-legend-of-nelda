import type { CharacterId } from '../game/config/phase2-player-balance';
import type { BattleSnapshot } from '../game/session/boss-battle';
import { FINALE_STATES } from '../game/finale/finale-state';
import { isDiscreteGameActionType, type GameAction } from '../game/types/game-action';
import type { WasshoiEvent } from '../input/wasshoi/types';

/** クライアントが自分のブラウザへ保存する匿名参加者識別子。 */
export type ParticipantId = string;

export interface JoinMessage {
  readonly type: 'JOIN';
  readonly token: string;
  /** 旧fixtureとの型互換は残すが、validatorは省略を拒否する。 */
  readonly participantId?: ParticipantId;
}

export interface SelectCharacterMessage {
  readonly type: 'SELECT_CHARACTER';
  readonly characterId: CharacterId;
}

export interface StartMessage {
  readonly type: 'START';
}

export interface WelcomeMessage {
  readonly type: 'WELCOME';
  readonly participantId: ParticipantId;
  readonly epoch: number;
}

/** #47 の公開型を壊さないための authority 内部互換形。新規送信では使わない。 */
export interface LegacyWelcomeMessage {
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

export interface RosterSlot {
  readonly playerId: string;
  readonly characterId: CharacterId;
  readonly connected: boolean;
}

/** #47 の旧固定ロスターを読むクライアントのための互換メッセージ。 */
export interface RosterMessage {
  readonly type: 'ROSTER';
  readonly slots: readonly RosterSlot[];
  readonly started: boolean;
}

export interface LobbySlot {
  readonly participantId: ParticipantId | null;
  readonly role: CharacterId | null;
  readonly connected: boolean;
}

/** Authorityが毎回配信する、3スロットの真実源。 */
export interface LobbyMessage {
  readonly type: 'LOBBY';
  readonly slots: readonly LobbySlot[];
  readonly started: boolean;
  readonly full: boolean;
}

export interface RoomFullMessage {
  readonly type: 'ROOM_FULL';
  readonly slots: readonly LobbySlot[];
  readonly started: boolean;
}

export type RejectionReason =
  | 'INVALID_TOKEN'
  | 'INVALID_PARTICIPANT'
  | 'ROOM_FULL'
  | 'ROLE_TAKEN'
  | 'ROLE_LOCKED'
  | 'START_NOT_ALLOWED'
  | 'NOT_JOINED';

const REJECTION_REASONS = new Set<string>([
  'INVALID_TOKEN',
  'INVALID_PARTICIPANT',
  'ROOM_FULL',
  'ROLE_TAKEN',
  'ROLE_LOCKED',
  'START_NOT_ALLOWED',
  'NOT_JOINED',
]);

export interface RejectedMessage {
  readonly type: 'REJECTED';
  readonly reason: RejectionReason;
}

export interface WasshoiMessage {
  readonly type: 'WASSHOI';
  readonly event: WasshoiEvent;
}

export type ClientToAuthorityMessage =
  | JoinMessage
  | SelectCharacterMessage
  | StartMessage
  | ActionMessage;
export type AuthorityToClientMessage =
  | WelcomeMessage
  | LegacyWelcomeMessage
  | StateMessage
  | RosterMessage
  | LobbyMessage
  | RoomFullMessage
  | RejectedMessage
  | WasshoiMessage;

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return isFiniteNumber(value) && Number.isInteger(value) && value >= 0;
}

function hasOnlyKeys(value: UnknownRecord, keys: readonly string[]): boolean {
  return (
    Object.keys(value).length === keys.length &&
    Object.keys(value).every((key) => keys.includes(key))
  );
}

function isToken(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 256 && !/\s/.test(value);
}

/**
 * participantIdはrole/playerIdの代用品ではなく、ブラウザごとの不透明な値だけを受ける。
 * 生成値は `participant-${crypto.randomUUID()}`。テスト用の短いfixtureも許容するが、
 * 既知のrole名・player名をそのままidentityへ流用することは拒否する。
 */
export function isOpaqueParticipantId(value: unknown): value is ParticipantId {
  if (typeof value !== 'string' || value.length === 0 || value.length > 128) return false;
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(value)) return false;
  return !/^(?:ODORUNO|ORA|PAY|(?:odoruno|ora|pay)-player)$/i.test(value);
}

function isMovementInput(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ['forward', 'right']) &&
    isFiniteNumber(value.forward) &&
    isFiniteNumber(value.right)
  );
}

function isCharacterId(value: unknown): value is CharacterId {
  return value === 'ODORUNO' || value === 'PAY' || value === 'ORA';
}

function isRosterSlot(value: unknown): value is RosterSlot {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ['playerId', 'characterId', 'connected']) &&
    typeof value.playerId === 'string' &&
    isCharacterId(value.characterId) &&
    typeof value.connected === 'boolean'
  );
}

function isLobbySlot(value: unknown): value is LobbySlot {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ['participantId', 'role', 'connected']) &&
    (value.participantId === null || isOpaqueParticipantId(value.participantId)) &&
    (value.role === null || isCharacterId(value.role)) &&
    typeof value.connected === 'boolean'
  );
}

export function isGameAction(value: unknown): value is GameAction {
  if (!isRecord(value) || typeof value.type !== 'string') return false;
  if (value.type === 'MOVE') {
    return hasOnlyKeys(value, ['type', 'input']) && isMovementInput(value.input);
  }
  if (value.type === 'ATTACK') {
    return (
      hasOnlyKeys(value, ['type']) ||
      (hasOnlyKeys(value, ['type', 'intensity']) && isFiniteNumber(value.intensity))
    );
  }
  return hasOnlyKeys(value, ['type']) && isDiscreteGameActionType(value.type);
}

export function isWasshoiEvent(value: unknown): value is WasshoiEvent {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ['type', 'intensity', 'durationMs']) &&
    value.type === 'WASSHOI' &&
    isFiniteNumber(value.intensity) &&
    isFiniteNumber(value.durationMs)
  );
}

export function isBattleSnapshot(value: unknown): value is BattleSnapshot {
  return (
    isRecord(value) &&
    isRecord(value.boss) &&
    Array.isArray(value.players) &&
    typeof value.finale === 'string' &&
    (FINALE_STATES as readonly string[]).includes(value.finale)
  );
}

export function isClientToAuthorityMessage(value: unknown): value is ClientToAuthorityMessage {
  if (!isRecord(value) || typeof value.type !== 'string') return false;

  if (value.type === 'JOIN') {
    return (
      hasOnlyKeys(value, ['type', 'token', 'participantId']) &&
      isToken(value.token) &&
      isOpaqueParticipantId(value.participantId)
    );
  }

  if (value.type === 'SELECT_CHARACTER') {
    return hasOnlyKeys(value, ['type', 'characterId']) && isCharacterId(value.characterId);
  }

  if (value.type === 'START') {
    return hasOnlyKeys(value, ['type']);
  }

  if (value.type === 'ACTION') {
    return (
      hasOnlyKeys(value, ['type', 'epoch', 'seq', 'action']) &&
      isNonNegativeInteger(value.epoch) &&
      isNonNegativeInteger(value.seq) &&
      isGameAction(value.action)
    );
  }

  return false;
}

export function isAuthorityToClientMessage(value: unknown): value is AuthorityToClientMessage {
  if (!isRecord(value) || typeof value.type !== 'string') return false;

  if (value.type === 'WELCOME') {
    if (hasOnlyKeys(value, ['type', 'participantId', 'epoch'])) {
      return isOpaqueParticipantId(value.participantId) && isNonNegativeInteger(value.epoch);
    }
    return (
      hasOnlyKeys(value, ['type', 'playerId', 'epoch']) &&
      typeof value.playerId === 'string' &&
      isNonNegativeInteger(value.epoch)
    );
  }

  if (value.type === 'STATE') {
    return hasOnlyKeys(value, ['type', 'battle']) && isBattleSnapshot(value.battle);
  }

  if (value.type === 'ROSTER') {
    return (
      hasOnlyKeys(value, ['type', 'slots', 'started']) &&
      Array.isArray(value.slots) &&
      value.slots.every(isRosterSlot) &&
      typeof value.started === 'boolean'
    );
  }

  if (value.type === 'LOBBY') {
    return (
      hasOnlyKeys(value, ['type', 'slots', 'started', 'full']) &&
      Array.isArray(value.slots) &&
      value.slots.length === 3 &&
      value.slots.every(isLobbySlot) &&
      typeof value.started === 'boolean' &&
      typeof value.full === 'boolean'
    );
  }

  if (value.type === 'ROOM_FULL') {
    return (
      hasOnlyKeys(value, ['type', 'slots', 'started']) &&
      Array.isArray(value.slots) &&
      value.slots.length === 3 &&
      value.slots.every(isLobbySlot) &&
      typeof value.started === 'boolean'
    );
  }

  if (value.type === 'REJECTED') {
    return (
      hasOnlyKeys(value, ['type', 'reason']) &&
      typeof value.reason === 'string' &&
      REJECTION_REASONS.has(value.reason)
    );
  }

  if (value.type === 'WASSHOI') {
    return hasOnlyKeys(value, ['type', 'event']) && isWasshoiEvent(value.event);
  }

  return false;
}
