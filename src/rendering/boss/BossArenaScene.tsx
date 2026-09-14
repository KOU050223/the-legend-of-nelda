import { useEffect, useRef, useState } from 'react';
import { Billboard } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { Vector3, type Group } from 'three';

import type { DangerZone } from '@/game/boss/attacks/danger-zone';
import { createHoriBoss } from '@/game/boss/hori-boss';
import { createRealClock } from '@/game/clock';
import { HORI_ATTACK_IDS, type HoriAttackId } from '@/game/config/phase2-boss-balance';
import { PROVISIONAL_ARENA_RADIUS } from '@/game/config/phase2-player-balance';
import { createGameEventBus } from '@/game/events/game-event';
import { reviveRatio, type PlayerSnapshot } from '@/game/player/player-state';
import { createBossBattle, type BattleSnapshot, type BossBattle } from '@/game/session/boss-battle';
import { attachKeyboardGameActions } from '@/input/keyboard/game-action-adapter';

import { FollowCamera } from '../camera/FollowCamera';
import { CharacterModel } from '../character/CharacterModel';
import { World } from '../world/World';
import { DangerZoneMarks } from './DangerZoneMarks';

/**
 * ワールドの中身。草原に堀大輔が居て、その場で戦う。(#55 / #56 / #58)
 *
 * 戦闘専用の別シーンは作らない。docs/phase2-gameplay-spec.md §2 が
 * 「1つの広めのボスマップ」「マップそのものをボス戦ギミックの一部として
 * 利用する」としているため、探索用と戦闘用へ分けると草原の定義が二重になり、
 * 片方だけ直してもう片方がずれる。
 *
 * 危険範囲は判定に使う `DangerZone` をそのまま描く。表示用に別の形を
 * 作らないことが「危険範囲が視覚的に読める」(#58) の前提。
 *
 * 操作するのは1人 (オドルノ) だけ。3人分の同時操作は #52 P6。
 */

/** 操作するプレイヤー。 */
const LOCAL_PLAYER_ID = 'odoruno';

/** 草原の広さ。アリーナの仮半径 (#54 が決めるまでの値) を覆う大きさにする。 */
const WORLD_GROUND_SIZE = PROVISIONAL_ARENA_RADIUS * 2 + 20;

/**
 * ボス戦の追従カメラ。探索用より高く・遠くする。
 *
 * 近い視点のままだと、絶対起床アラームの全方位リング (外径18) や
 * 突進の軌道 (長さ30) が視界へ収まらず、予兆を見て回避できない。
 */
const BATTLE_CAMERA_OFFSET = new Vector3(0, 16, 18);

/** 注視点はキャラの足元より少し先。ボスとの間を画面へ収める。 */
const BATTLE_LOOK_AT_HEIGHT = 2;

/** `?attack=WAKE_UP_ALARM` のように技を固定する。動作確認用の口。 */
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
      { id: LOCAL_PLAYER_ID, characterId: 'ODORUNO', position: { x: 0, z: 14 } },
      { id: 'pay', characterId: 'PAY', position: { x: 8, z: 12 } },
      { id: 'ora', characterId: 'ORA', position: { x: -8, z: 12 } },
    ],
    createBoss: (options) =>
      createHoriBoss(pinned === null ? options : { ...options, pickAttack: () => pinned }),
  });
}

/**
 * 再レンダーが要るほどの違いがあるか。
 *
 * 位置と向きは Object3D へ直接入れているので比較に含めない。含めると
 * 毎フレーム「変わった」ことになり、state へ逃がした意味が無くなる。
 */
function isSameView(a: BattleSnapshot, b: BattleSnapshot): boolean {
  if (a.boss.hp !== b.boss.hp || a.boss.phase !== b.boss.phase) return false;
  if (a.players.length !== b.players.length) return false;

  return a.players.every((player, index) => {
    const other = b.players[index];
    return (
      other !== undefined &&
      player.hp === other.hp &&
      player.status === other.status &&
      player.reviveInputs === other.reviveInputs
    );
  });
}

/** 危険範囲の形が前フレームと同じか。 */
function isSameZones(a: readonly DangerZone[], b: readonly DangerZone[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((zone, index) => {
    const other = b[index];
    return (
      other !== undefined &&
      zone.origin.x === other.origin.x &&
      zone.origin.z === other.origin.z &&
      zone.rotationY === other.rotationY &&
      zone.shape.kind === other.shape.kind
    );
  });
}

export function BossArenaScene(): React.JSX.Element {
  // 戦闘は1度だけ作る。レンダー中に ref を読まないよう state の遅延初期化で持つ。
  const [battle] = useState<BossBattle>(createBattle);

  // 追従カメラは Object3D を見るので、操作キャラの Root を渡す。
  const localRoot = useRef<Group>(null);

  // 入力は useFrame から毎フレーム引く。requestAnimationFrame を別に
  // 回すと、r3f の描画ループと二重になって1フレームに2回進む。
  const inputRef = useRef<ReturnType<typeof attachKeyboardGameActions> | null>(null);

  // 位置と向きは毎フレーム変わるので state へ入れない。Object3D を直接
  // 動かす。state にすると1フレームごとに React の再レンダーが走る。
  const bossRoot = useRef<Group>(null);
  const mateRoots = useRef(new Map<string, Group>());

  // 危険範囲・HP・状態は、変わったときだけ更新する。毎フレーム同じ値で
  // set しても再レンダーが走るので、中身を比べてから入れる。
  const [zones, setZones] = useState<readonly DangerZone[]>([]);
  const [imminent, setImminent] = useState(false);
  const [view, setView] = useState<BattleSnapshot>(() => battle.snapshot());

  useEffect(() => {
    // 入力はこの Effect の中で繋いで同じ Effect で捨てる。StrictMode の
    // 二重マウントで購読が二重に残らないようにするため。
    // 自分自身を参照するので、先に入れ物を作ってから繋ぐ。
    let adapter: ReturnType<typeof attachKeyboardGameActions> | null = null;

    adapter = attachKeyboardGameActions((action) => {
      // 離散アクションの前に、その瞬間の移動方向を送る。
      //
      // 「A を押した直後に Shift」のように、ポーリングの合間に方向と回避が
      // 続けて来ると、回避は前フレームの方向へ飛ぶ。回避は「移動方向 +
      // 回避入力」(§4.2) なので、方向が1フレーム古いと横へ避けたつもりが
      // 別方向へ転がる。
      if (adapter !== null) battle.submit(LOCAL_PLAYER_ID, adapter.pollMove());
      battle.submit(LOCAL_PLAYER_ID, action);
    });
    const input = adapter;

    inputRef.current = input;

    return () => {
      inputRef.current = null;
      input.detach();
    };
  }, [battle]);

  useFrame((_, delta) => {
    // 移動は押しっぱなしの状態なので毎フレーム取り出す。
    const input = inputRef.current;
    if (input !== null) battle.submit(LOCAL_PLAYER_ID, input.pollMove());

    battle.update(delta);

    const snapshot = battle.snapshot();

    // 位置と向きは Object3D へ直接反映する。真実源はロジック側
    // (boss-battle) で、ここは映すだけ。
    bossRoot.current?.position.set(snapshot.boss.position.x, 0, snapshot.boss.position.z);

    for (const player of snapshot.players) {
      const root =
        player.id === LOCAL_PLAYER_ID ? localRoot.current : mateRoots.current.get(player.id);
      if (root == null) continue;
      root.position.set(player.position.x, 0, player.position.z);
      root.rotation.set(0, player.rotationY, 0);
    }

    // HP や状態が変わったときだけ再レンダーする。
    setView((previous) => (isSameView(previous, snapshot) ? previous : snapshot));

    const active = snapshot.boss.activeAttack;
    // ボスへ渡す targets と同じものを使う。描画だけ別の配列を組むと、
    // 追尾ビームの着弾点が判定と食い違う。
    const targets = snapshot.players
      .filter((player) => player.status === 'ACTIVE')
      .map((player) => ({ id: player.id, position: player.position }));

    const nextZones = battle.boss.dangerZones(targets);
    setZones((previous) => (isSameZones(previous, nextZones) ? previous : nextZones));
    setImminent(
      active !== null && performance.now() - active.startedAt >= active.timing.telegraphMs,
    );
  });

  return (
    <>
      <World groundSize={WORLD_GROUND_SIZE} />

      {/* 危険範囲は草の上へ描く。地面より手前に出さないと草に埋もれる。 */}
      <DangerZoneMarks zones={zones} imminent={imminent} />

      {/* 仮ボス。Graybox First (docs/development-workflow.md §9)。 */}
      <group ref={bossRoot}>
        <mesh position={[0, 1.6, 0]} castShadow>
          <boxGeometry args={[2, 3.2, 2]} />
          <meshStandardMaterial color="#6b4fa0" />
        </mesh>
        <BossNameplate hp={view.boss.hp} hpMax={view.boss.hpMax} />
      </group>

      {view.players.map((player) =>
        player.id === LOCAL_PLAYER_ID ? (
          <group key={player.id} ref={localRoot}>
            <CharacterModel />
            <StatusBar player={player} local />
          </group>
        ) : (
          <group
            key={player.id}
            ref={(node) => {
              if (node === null) mateRoots.current.delete(player.id);
              else mateRoots.current.set(player.id, node);
            }}
          >
            <CharacterModel />
            <StatusBar player={player} />
          </group>
        ),
      )}

      <FollowCamera
        target={localRoot}
        offset={BATTLE_CAMERA_OFFSET}
        lookAtHeight={BATTLE_LOOK_AT_HEIGHT}
      />
    </>
  );
}

/** バーの幅。追従カメラは近いので、頭上サイズで足りる。 */
const BAR_WIDTH = 1.4;
const BAR_HEIGHT = 0.16;

/**
 * 頭上のHPバー。倒れている間は蘇生ゲージに切り替わる。
 *
 * HUD は別Issueだが、これが無いと倒れた仲間が「連打1回目」なのか
 * 「あと1回で起きる」のかが画面から読めず、蘇生が成立しているかを
 * 目で確かめられない。最小限の表示だけ置く。
 */
function StatusBar({
  player,
  local = false,
}: {
  player: PlayerSnapshot;
  local?: boolean;
}): React.JSX.Element {
  const reviving = player.status === 'FALLING_ASLEEP';
  const ratio = reviving ? reviveRatio(player) : player.hp / player.hpMax;
  const color = reviving ? '#ffd60a' : local ? '#4cd964' : '#f2f2f7';

  // 親の group が位置を持つので、バーは相対位置で置く。
  return (
    <Billboard position={[0, reviving ? 1 : 2.1, 0]}>
      <mesh>
        <planeGeometry args={[BAR_WIDTH, BAR_HEIGHT]} />
        <meshBasicMaterial color="#1c1c1e" depthWrite={false} />
      </mesh>
      {/* 左端を固定して伸縮させるため、幅の半分だけ中心をずらす。 */}
      <mesh position={[(-BAR_WIDTH * (1 - ratio)) / 2, 0, 0.01]}>
        <planeGeometry args={[BAR_WIDTH * ratio, BAR_HEIGHT]} />
        <meshBasicMaterial color={color} depthWrite={false} />
      </mesh>
    </Billboard>
  );
}

/** ボスのHPバー。プレイヤーより大きく、頭上高くに置く。 */
function BossNameplate({ hp, hpMax }: { hp: number; hpMax: number }): React.JSX.Element {
  const ratio = hp / hpMax;
  const width = 4;

  return (
    <Billboard position={[0, 4, 0]}>
      <mesh>
        <planeGeometry args={[width, 0.3]} />
        <meshBasicMaterial color="#1c1c1e" depthWrite={false} />
      </mesh>
      <mesh position={[(-width * (1 - ratio)) / 2, 0, 0.01]}>
        <planeGeometry args={[width * ratio, 0.3]} />
        <meshBasicMaterial color="#ff453a" depthWrite={false} />
      </mesh>
    </Billboard>
  );
}
