import { Suspense, useEffect, useRef, useState } from 'react';
import { Billboard, Text } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { Vector3, type Group } from 'three';

import { BOSS_ANCHOR, SPAWN_POINTS } from '@/game/arena/arena';
import type { DangerZone } from '@/game/boss/attacks/danger-zone';
import { createHoriBoss } from '@/game/boss/hori-boss';
import { createRealClock } from '@/game/clock';
import { HORI_ATTACK_IDS, type HoriAttackId } from '@/game/config/phase2-boss-balance';
import { createGameEventBus } from '@/game/events/game-event';
import { reviveRatio, type PlayerSnapshot } from '@/game/player/player-state';
import {
  createBossBattle,
  type BattleOutcome,
  type BattleSnapshot,
  type BossBattle,
} from '@/game/session/boss-battle';
import { attachKeyboardGameActions } from '@/input/keyboard/game-action-adapter';

import { FollowCamera } from '../camera/FollowCamera';
import { CharacterModel } from '../character/CharacterModel';
import { CHARACTER_DISPLAY_HEIGHT } from '../character/character-models';
import { HoriDaisukeModel } from '../character/HoriDaisukeModel';
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

const [LEFT_SPAWN, PLAYER_SPAWN, RIGHT_SPAWN] = SPAWN_POINTS;

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
    // スポーン地点は #54 のアリーナ定義をそのまま使う。見た目のアリーナと
    // 戦闘の初期配置がずれないよう、座標は1箇所 (arena.ts) に置く。
    roster: [
      { id: LOCAL_PLAYER_ID, characterId: 'ODORUNO', position: PLAYER_SPAWN },
      { id: 'pay', characterId: 'PAY', position: LEFT_SPAWN },
      { id: 'ora', characterId: 'ORA', position: RIGHT_SPAWN },
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

/**
 * 画面としての決着。戦闘の勝敗に「操作キャラが倒れた」を足したもの。
 */
type SceneOutcome = BattleOutcome | 'LOCAL_DOWN';

function sceneOutcome(battle: BossBattle): SceneOutcome {
  const settled = battle.outcome();
  if (settled !== 'ONGOING') return settled;

  const local = battle.players.find((player) => player.snapshot().id === LOCAL_PLAYER_ID);
  // 倒れて寝落ちのカウントが始まっている間も、操作は戻らない。
  return local !== undefined && local.snapshot().status !== 'ACTIVE' ? 'LOCAL_DOWN' : 'ONGOING';
}

export function BossArenaScene(): React.JSX.Element {
  // 戦闘は1度だけ作る。レンダー中に ref を読まないよう state の遅延初期化で持つ。
  // 決着後のやり直しでは作り直す (戦闘の状態を部分的に巻き戻すより、
  // 同じ初期化を通す方が「途中の状態が残っている」事故が無い)。
  const [battle, setBattle] = useState<BossBattle>(createBattle);

  // 画面に出す決着。
  //
  // `battle.outcome()` の DEFEAT は「3人全員が寝た」で、これは仕様どおり
  // (§5.5)。ただし今は操作できるのがオドルノ1人しか居ない。倒れても
  // 仲間2人は ACTIVE のままなので `outcome()` は ONGOING から動かず、
  // 操作だけが効かない状態で止まる (蘇生は ACTIVE な仲間からしか出せない)。
  //
  // そこで画面側では「操作キャラが倒れた」もやり直せる終わりとして扱う。
  // ロジックの勝敗条件は変えない。3人分の同時操作が入れば
  // (#52 P6) 仲間が起こしに来るので、この分岐は消える。
  const [outcome, setOutcome] = useState<SceneOutcome>('ONGOING');

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

  // 決着したら R でやり直す。決着後は戦闘を進めないので、ここだけは
  // キーボードを直接見る (GameAction にやり直しは無い。やり直しは
  // 戦闘の操作ではなく画面の操作なので、入力契約へ足さない)。
  useEffect(() => {
    if (outcome === 'ONGOING') return undefined;

    function onRestart(event: KeyboardEvent): void {
      if (event.code !== 'KeyR') return;
      mateRoots.current.clear();
      setBattle(createBattle());
      setOutcome('ONGOING');
      setZones([]);
      setImminent(false);
    }

    window.addEventListener('keydown', onRestart);
    return () => window.removeEventListener('keydown', onRestart);
  }, [outcome]);

  useFrame((_, delta) => {
    // 決着後は時間を進めない。倒れたまま技を撃たれ続けると、
    // 何が起きて負けたのかが画面に残らない。
    if (outcome !== 'ONGOING') {
      return;
    }

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

    const nextOutcome = sceneOutcome(battle);
    setOutcome((current) => (current === nextOutcome ? current : nextOutcome));
  });

  return (
    <>
      <World />

      {/* 危険範囲は草の上へ描く。地面より手前に出さないと草に埋もれる。 */}
      <DangerZoneMarks zones={zones} imminent={imminent} />

      {/*
        堀大輔 (#67 のGLBモデル)。位置は毎フレーム bossRoot へ直接入れるので、
        初期値だけ #54 のアンカーから与える。
      */}
      <group ref={bossRoot} position={[BOSS_ANCHOR.x, 0, BOSS_ANCHOR.z]}>
        {/*
          GLB の読み込みは suspend する。ここで受け止めないと、読み込みの間
          Canvas の中身が丸ごと消えて草原ごと真っ暗になる。
        */}
        <Suspense fallback={null}>
          <HoriDaisukeModel />
        </Suspense>
        <BossNameplate hp={view.boss.hp} hpMax={view.boss.hpMax} />
      </group>

      {/*
        3人の大輔 (#79 のGLBモデル)。どのモデルを出すかは characterId から
        引く。`player.id === 'pay'` のようなidでの分岐は書かない
        (phase2-player-balance.ts と同じく、キャラ差はデータで持つ)。

        ボスと同じ理由で、GLBの読み込みは Suspense で受け止める。境界は
        1人ずつ分ける。3人を1つの境界でまとめると、誰か1人のGLBが読み込み
        中の間ずっと3人とも unmount され、その間 localRoot が null になって
        FollowCamera が追従先を見失う (カメラがキャラを映さなくなる)。
      */}
      {view.players.map((player) =>
        player.id === LOCAL_PLAYER_ID ? (
          <Suspense key={player.id} fallback={null}>
            <group ref={localRoot}>
              <CharacterModel characterId={player.characterId} />
              <StatusBar player={player} local />
            </group>
          </Suspense>
        ) : (
          <Suspense key={player.id} fallback={null}>
            <group
              ref={(node) => {
                if (node === null) mateRoots.current.delete(player.id);
                else mateRoots.current.set(player.id, node);
              }}
            >
              <CharacterModel characterId={player.characterId} />
              <StatusBar player={player} />
            </group>
          </Suspense>
        ),
      )}

      {/*
        drei の Text はフォント読み込み中に suspend する。境界を挟まないと
        決着の瞬間に Canvas ごと空になる。ボス (GLB) と同じ理由。
      */}
      {outcome !== 'ONGOING' && (
        <Suspense fallback={null}>
          <OutcomeBanner outcome={outcome} />
        </Suspense>
      )}

      <FollowCamera
        target={localRoot}
        offset={BATTLE_CAMERA_OFFSET}
        lookAtHeight={BATTLE_LOOK_AT_HEIGHT}
      />
    </>
  );
}

/**
 * 決着の表示。
 *
 * カメラの前へ出さず、ボスの頭上に置く。操作キャラが倒れているときも
 * ボスは必ず画面に入っているため。
 */
function OutcomeBanner({ outcome }: { outcome: SceneOutcome }): React.JSX.Element {
  const won = outcome === 'VICTORY';
  return (
    <Billboard position={[BOSS_ANCHOR.x, 7, BOSS_ANCHOR.z]}>
      <Text fontSize={1.1} color={won ? '#4cd964' : '#ff453a'} anchorY="bottom">
        {won ? 'WAKE UP!' : 'ZZZ...'}
      </Text>
      <Text fontSize={0.45} color="#f2f2f7" anchorY="top" position={[0, -0.2, 0]}>
        R でやり直す
      </Text>
    </Billboard>
  );
}

/** バーの幅。追従カメラは近いので、頭上サイズで足りる。 */
const BAR_WIDTH = 1.4;
const BAR_HEIGHT = 0.16;

/**
 * 立っているときのバーの高さ。頭のすぐ上へ置く。
 *
 * キャラの表示高さ (CHARACTER_DISPLAY_HEIGHT) から決める。ここを固定値に
 * すると、モデルを差し替えて背の高さが変わったときにバーだけ頭上から離れ、
 * 別のキャラの上に浮いているように見える。
 */
const BAR_OVERHEAD_HEIGHT = CHARACTER_DISPLAY_HEIGHT + 0.25;

/** 倒れているときのバーの高さ。寝ている体の上に置く。 */
const BAR_DOWNED_HEIGHT = 0.6;

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

  // 親の group が位置を持つので、バーは相対位置で置く。高さはキャラの表示高さ
  // から決める。固定値にすると、モデルの高さを変えたときに頭上から離れる。
  return (
    <Billboard position={[0, reviving ? BAR_DOWNED_HEIGHT : BAR_OVERHEAD_HEIGHT, 0]}>
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
