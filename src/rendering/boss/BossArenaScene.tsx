import { useEffect, useState } from 'react';
import { useFrame } from '@react-three/fiber';

import type { DangerZone } from '@/game/boss/attacks/danger-zone';
import { createHoriBoss } from '@/game/boss/hori-boss';
import { createRealClock } from '@/game/clock';
import { HORI_ATTACK_IDS, type HoriAttackId } from '@/game/config/phase2-boss-balance';
import { createGameEventBus } from '@/game/events/game-event';
import { createBossBattle, type BattleSnapshot, type BossBattle } from '@/game/session/boss-battle';
import { attachKeyboardGameActions } from '@/input/keyboard/game-action-adapter';

import { Ground } from '../world/Ground';
import { DangerZoneMarks } from './DangerZoneMarks';

/**
 * 堀大輔とのボス戦シーン。(#55 / #56 / #58)
 *
 * 実際の `createBossBattle` を回す。危険範囲は判定に使う `DangerZone` を
 * そのまま `DangerZoneMarks` へ渡す。表示用に別の形を作らないことが、
 * 「危険範囲が視覚的に読める」の前提。
 *
 * 操作するのは1人 (オドルノ) だけ。残り2人は立っているだけで、
 * マルチプレイは #52 P6 のスコープ。
 */

/** 操作するプレイヤー。3人分の同時操作は別Issue。 */
const LOCAL_PLAYER_ID = 'odoruno';

/** `?attack=WAKE_UP_ALARM` のように技を固定する。開発用の口。 */
function pinnedAttackId(): HoriAttackId | null {
  if (typeof window === 'undefined') return null;
  const requested = new URLSearchParams(window.location.search).get('attack');
  return HORI_ATTACK_IDS.find((id) => id === requested) ?? null;
}

function createBattle(): BossBattle {
  const pinned = pinnedAttackId();
  return createBossBattle({
    clock: createRealClock(),
    events: createGameEventBus(),
    roster: [
      { id: LOCAL_PLAYER_ID, characterId: 'ODORUNO', position: { x: 0, z: 12 } },
      { id: 'pay', characterId: 'PAY', position: { x: 10, z: 8 } },
      { id: 'ora', characterId: 'ORA', position: { x: -10, z: 8 } },
    ],
    createBoss: (options) =>
      createHoriBoss(pinned === null ? options : { ...options, pickAttack: () => pinned }),
  });
}

export function BossArenaScene(): React.JSX.Element {
  // 戦闘は1度だけ作る。レンダー中に ref を読まないよう、state の
  // 遅延初期化で持つ。
  const [battle] = useState<BossBattle>(createBattle);

  const [zones, setZones] = useState<readonly DangerZone[]>([]);
  const [imminent, setImminent] = useState(false);
  const [view, setView] = useState<BattleSnapshot>(() => battle.snapshot());

  useEffect(() => {
    // 入力一式はこの Effect の中で繋いで同じ Effect で捨てる。
    // StrictMode の二重マウントで購読が二重に残らないようにするため。
    const input = attachKeyboardGameActions((action) => {
      battle.submit(LOCAL_PLAYER_ID, action);
    });

    let frame = 0;
    const pump = (): void => {
      // 移動は押しっぱなしの状態なので毎フレーム取り出す。
      battle.submit(LOCAL_PLAYER_ID, input.pollMove());
      frame = requestAnimationFrame(pump);
    };
    frame = requestAnimationFrame(pump);

    return () => {
      cancelAnimationFrame(frame);
      input.detach();
    };
  }, [battle]);

  useFrame((_, delta) => {
    battle.update(delta);

    const snapshot = battle.snapshot();
    setView(snapshot);

    const active = snapshot.boss.activeAttack;
    // ボスへ渡す targets と同じものを使う。描画だけ別の配列を組むと、
    // 追尾ビームの着弾点が判定と食い違う。
    const targets = snapshot.players
      .filter((player) => player.status === 'ACTIVE')
      .map((player) => ({ id: player.id, position: player.position }));

    setZones(battle.boss.dangerZones(targets));
    setImminent(
      active !== null && performance.now() - active.startedAt >= active.timing.telegraphMs,
    );
  });

  return (
    <>
      <ambientLight intensity={1.1} />
      <directionalLight position={[10, 30, 10]} intensity={1.6} />
      <Ground size={80} color="#3a3550" />
      <DangerZoneMarks zones={zones} imminent={imminent} />

      {/* 仮ボス。Graybox First (docs/development-workflow.md §9)。 */}
      <mesh position={[view.boss.position.x, 1.2, view.boss.position.z]}>
        <boxGeometry args={[1.6, 2.4, 1.6]} />
        <meshStandardMaterial color="#6b4fa0" />
      </mesh>

      {view.players.map((player) => (
        <mesh
          key={player.id}
          position={[
            player.position.x,
            // 倒れた仲間は寝かせて、起こしに行く相手だと分かるようにする。
            player.status === 'ACTIVE' ? 0.9 : 0.3,
            player.position.z,
          ]}
          rotation={[player.status === 'ACTIVE' ? 0 : Math.PI / 2, player.rotationY, 0]}
        >
          <capsuleGeometry args={[0.4, 1, 8, 16]} />
          <meshStandardMaterial color={player.id === LOCAL_PLAYER_ID ? '#4cd964' : '#f2f2f7'} />
        </mesh>
      ))}
    </>
  );
}
