import { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';

import type { DangerZone } from '@/game/boss/attacks/danger-zone';
import type { BossTarget } from '@/game/boss/boss-target';
import { createHoriBoss, type HoriBoss } from '@/game/boss/hori-boss';
import { createRealClock } from '@/game/clock';
import { HORI_ATTACK_IDS, type HoriAttackId } from '@/game/config/phase2-boss-balance';
import { createGameEventBus } from '@/game/events/game-event';
import { Ground } from '../world/Ground';

import { DangerZoneMarks } from './DangerZoneMarks';

/**
 * 堀大輔の危険範囲を目視確認するための最小シーン。(Issue #58)
 *
 * ボスアリーナ本体・プレイヤー操作は #54 / #56 のスコープなので、ここでは
 * 実際の `createHoriBoss` を回して危険範囲を描くところだけをやる。仮の
 * ターゲットを1体置き、追尾と狙いが働くようにしてある。
 *
 * 判定に使う `DangerZone` をそのまま `DangerZoneMarks` へ渡す。表示用に
 * 別の形を作らないことが、この画面で確認したい一番の点
 * (「危険範囲が視覚的に読める」)。
 */

/** 仮のターゲット。ボスの周りを回り、追尾ビームの挙動を見えるようにする。 */
const DUMMY_ORBIT_RADIUS = 12;

/** `?attack=WAKE_UP_ALARM` のように技を固定する。開発用の口。 */
function pinnedAttackId(): HoriAttackId | null {
  if (typeof window === 'undefined') return null;
  const requested = new URLSearchParams(window.location.search).get('attack');
  return HORI_ATTACK_IDS.find((id) => id === requested) ?? null;
}

export function BossArenaPreview(): React.JSX.Element {
  const bossRef = useRef<HoriBoss | null>(null);
  const [dummy, setDummy] = useState<BossTarget>({
    id: 'dummy',
    position: { x: DUMMY_ORBIT_RADIUS, z: 0 },
  });
  const [zones, setZones] = useState<readonly DangerZone[]>([]);
  const [imminent, setImminent] = useState(false);
  const [bossPosition, setBossPosition] = useState({ x: 0, z: 0 });

  bossRef.current ??= createHoriBoss({
    clock: createRealClock(),
    events: createGameEventBus(),
    // この画面ではプレイヤーHPを持たないので、被弾は捨てる。
    damageSink: { applyDamage: () => {} },
    // 既定では4技を順に出す。`?attack=<ID>` で1技へ固定できるようにして
    // あるのは、スクリーンショットで4つの危険範囲を確実に押さえるため。
    pickAttack: (_phase, attackCount) =>
      pinnedAttackId() ?? HORI_ATTACK_IDS[attackCount % HORI_ATTACK_IDS.length] ?? 'WAKE_UP_ALARM',
  });

  useFrame(({ clock }) => {
    const boss = bossRef.current;
    if (boss === null) return;

    const angle = clock.elapsedTime * 0.4;
    const moved: BossTarget = {
      id: 'dummy',
      position: {
        x: Math.cos(angle) * DUMMY_ORBIT_RADIUS,
        z: Math.sin(angle) * DUMMY_ORBIT_RADIUS,
      },
    };
    setDummy(moved);

    const targets = [moved];
    boss.update(targets);

    const snapshot = boss.snapshot();
    setZones(boss.dangerZones(targets));
    setBossPosition(snapshot.position);
    // 予兆が明けたかどうかで濃さを変える。濃さだけで「今当たる」が読める。
    setImminent(
      snapshot.activeAttack !== null &&
        performance.now() - snapshot.activeAttack.startedAt >=
          snapshot.activeAttack.timing.telegraphMs,
    );
  });

  return (
    <>
      <ambientLight intensity={1.1} />
      <directionalLight position={[10, 30, 10]} intensity={1.6} />
      {/* 危険範囲の赤・橙が地面と分離して見える明るさにする。 */}
      <Ground size={80} color="#3a3550" />
      <DangerZoneMarks zones={zones} imminent={imminent} />

      {/* 仮ボス。Graybox First (docs/development-workflow.md §9)。 */}
      <mesh position={[bossPosition.x, 1.2, bossPosition.z]}>
        <boxGeometry args={[1.6, 2.4, 1.6]} />
        <meshStandardMaterial color="#6b4fa0" />
      </mesh>

      {/* 仮のターゲット。追尾ビームが誰を追うか分かるようにする。 */}
      <mesh position={[dummy.position.x, 0.9, dummy.position.z]}>
        <capsuleGeometry args={[0.4, 1, 8, 16]} />
        <meshStandardMaterial color="#f2f2f7" />
      </mesh>
    </>
  );
}
