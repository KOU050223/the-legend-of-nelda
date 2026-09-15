import { useEffect, useMemo } from 'react';

import { useScreenStore } from '@/app/screen';
import { useMultiplayerSessionStore } from '@/multiplayer/session-store';
import { createRemoteBattleSource } from '@/multiplayer/remote-battle-source';

import { BossArenaScene } from '../boss/BossArenaScene';

/**
 * GAME (本番マルチプレイ) の入口。
 *
 * ここが「ローカルへフォールバックしない」ことを保証する唯一の境界。
 * status/roster が揃っている間だけ Authority 権威の BattleSource を作って
 * BossArenaScene へ渡す。揃っていなければ何も描画せず MATCHING へ戻す
 * (source を渡さずに BossArenaScene を描画すると、内部でローカル
 * BossBattle を生成してしまい、本番なのにローカル戦闘が動く事故になる
 * ため、その組み合わせは絶対に使わない)。
 */
export function MultiplayerArenaScene(): React.JSX.Element | null {
  const status = useMultiplayerSessionStore((state) => state.status);
  const lobby = useMultiplayerSessionStore((state) => state.lobby);
  const roster = useMultiplayerSessionStore((state) => state.roster);
  const client = useMultiplayerSessionStore((state) => state.client);
  const localPlayerId = useMultiplayerSessionStore((state) => state.localPlayerId);

  const started = lobby?.started === true || roster?.started === true;
  const ready = status === 'CONNECTED' && started && client !== null && localPlayerId !== null;

  useEffect(() => {
    if (!ready) {
      useScreenStore.getState().goTo('MATCHING');
    }
  }, [ready]);

  // ready が true の間だけ client/localPlayerId は non-null。
  // useMemo は ready を条件に含めないので、client/localPlayerId が
  // 同じ間は再接続のたびに BattleSource を作り直さない。
  const source = useMemo(
    () =>
      client !== null && localPlayerId !== null
        ? createRemoteBattleSource(client, localPlayerId)
        : null,
    [client, localPlayerId],
  );

  if (!ready || source === null) return null;

  return <BossArenaScene source={source} />;
}
