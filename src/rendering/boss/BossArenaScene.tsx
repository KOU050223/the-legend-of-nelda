import { Suspense, useEffect, useRef, useState } from 'react';

import { Billboard, Text } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { Vector3, type Group } from 'three';

import { createAudioManager } from '@/audio/audio-manager';
import { createHtmlAudioOutput } from '@/audio/audio-output';
import { BOSS_ANCHOR, SPAWN_POINTS } from '@/game/arena/arena';
import type { DangerZone } from '@/game/boss/attacks/danger-zone';
import { createHoriBoss } from '@/game/boss/hori-boss';
import { createRealClock } from '@/game/clock';
import { HORI_ATTACK_IDS, type HoriAttackId } from '@/game/config/phase2-boss-balance';
import { createGameEventBus, type GameEventBus } from '@/game/events/game-event';
import {
  createBossBattle,
  type BattleOutcome,
  type BattleSnapshot,
  type BossBattle,
} from '@/game/session/boss-battle';
import { attachKeyboardGameActions } from '@/input/keyboard/game-action-adapter';
import type { PlanarPosition } from '@/game/movement/types';
import { readPresentationSettings } from '@/presentation/presentation-store';
import { useWorldTutorialStore } from '@/ui/tutorial/world-tutorial-store';

import { FollowCamera } from '../camera/FollowCamera';
import { CharacterActor } from '../character/character-actor';
import {
  bossMotionContextFor,
  isSameMotionContext,
  motionContextFor,
} from '../character/motion-context';
import { syncCharacterRoot } from '../character/character-root';
import { TutorialFairy } from '../character/TutorialFairy';
import {
  DISPLAY_HEIGHT as BOSS_DISPLAY_HEIGHT,
  HoriDaisukeModel,
} from '../character/HoriDaisukeModel';
import type { MotionContext } from '../character/motion-manifest';
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

/**
 * 戦闘と、そのイベントバス。
 *
 * バスを戦闘の中へ閉じ込めると購読者を足せない (`BossBattle` はバスを
 * 公開していない)。SE を鳴らすには購読が要るので、作った側が持っておく。
 */
interface Battle {
  readonly battle: BossBattle;
  readonly events: GameEventBus;
}

function createBattle(): Battle {
  const pinned = pinnedAttackId();
  const events = createGameEventBus();
  const battle = createBossBattle({
    clock: createRealClock(),
    events,
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

  return { battle, events };
}

/**
 * 再レンダーが要るほどの違いがあるか。
 *
 * 位置と向きは Object3D へ直接入れているので比較に含めない。含めると
 * 毎フレーム「変わった」ことになり、state へ逃がした意味が無くなる。
 */
/**
 * 表示が読む状態のひと組。
 *
 * スナップショットに時刻を添える。連撃の局面は経過時間で決まるので、
 * 「いつ時点のスナップショットか」が無いとモーションを決められない。
 * 描画と再レンダー判定で同じ時刻を使うために、状態として一緒に持つ。
 */
interface View {
  readonly snapshot: BattleSnapshot;
  readonly now: number;
  readonly playerMotionContexts: readonly MotionContext[];
  readonly bossMotionContext: MotionContext;
}

function motionContextsFor(
  snapshot: BattleSnapshot,
  now: number,
  previousPositions: ReadonlyMap<string, PlanarPosition>,
  previousBossPosition: PlanarPosition | undefined,
): Pick<View, 'playerMotionContexts' | 'bossMotionContext'> {
  return {
    playerMotionContexts: snapshot.players.map((player) =>
      motionContextFor(player, now, previousPositions.get(player.id)),
    ),
    bossMotionContext: bossMotionContextFor(snapshot.boss, now, previousBossPosition),
  };
}

function isSameView(a: View, b: View): boolean {
  if (a.snapshot.boss.hp !== b.snapshot.boss.hp) return false;
  if (a.snapshot.boss.phase !== b.snapshot.boss.phase) return false;
  if (a.snapshot.players.length !== b.snapshot.players.length) return false;
  if (!isSameMotionContext(a.bossMotionContext, b.bossMotionContext)) return false;

  return a.snapshot.players.every((player, index) => {
    const other = b.snapshot.players[index];
    return (
      other !== undefined &&
      player.hp === other.hp &&
      player.status === other.status &&
      player.reviveInputs === other.reviveInputs &&
      // モーションが変わるときは作り直す。`swing` をそのまま比べると、
      // 同じ振りの最中に時刻が進むだけで毎フレーム「変わった」ことになる。
      // 解決後の条件で比べると、変わるのは1回の振りにつき2回で済む。
      isSameMotionContext(a.playerMotionContexts[index] ?? {}, b.playerMotionContexts[index] ?? {})
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
  const worldTutorialVisible = useWorldTutorialStore((state) => state.visible);

  // 戦闘は1度だけ作る。レンダー中に ref を読まないよう state の遅延初期化で持つ。
  // 決着後のやり直しでは作り直す (戦闘の状態を部分的に巻き戻すより、
  // 同じ初期化を通す方が「途中の状態が残っている」事故が無い)。
  const [{ battle, events }, setBattle] = useState<Battle>(createBattle);

  // SE。戦闘が流すイベントを購読して鳴らす。戦闘を作り直したら (やり直し)
  // 前の購読と音源を捨てて繋ぎ直す。
  //
  // ここで購読していなければ、戦闘がイベントを流しても誰も聞いていない
  // 状態になる。単騎PoC 側は combat-session.ts が同じ形で繋いでいる。
  useEffect(() => {
    const output = createHtmlAudioOutput();
    return createAudioManager({ eventBus: events, output, getSettings: readPresentationSettings });
  }, [events]);

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
  const actorRoots = useRef(new Map<string, Group>());
  const previousPositions = useRef(new Map<string, PlanarPosition>());
  const previousBossPosition = useRef<PlanarPosition | undefined>(undefined);
  // 危険範囲・HP・状態は、変わったときだけ更新する。毎フレーム同じ値で
  // set しても再レンダーが走るので、中身を比べてから入れる。
  const [zones, setZones] = useState<readonly DangerZone[]>([]);
  const [imminent, setImminent] = useState(false);
  const [view, setView] = useState<View>(() => ({
    snapshot: battle.snapshot(),
    now: performance.now(),
    playerMotionContexts: [],
    bossMotionContext: {},
  }));

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
      const root = actorRoots.current.get(player.id);
      if (root !== undefined) syncCharacterRoot(root, player);
    }

    // HP・状態・モーションが変わったときだけ再レンダーする。位置差分は
    // 条件の計算にだけ使い、毎フレームReactを再レンダーする理由にはしない。
    const now = performance.now();
    const contexts = motionContextsFor(
      snapshot,
      now,
      previousPositions.current,
      previousBossPosition.current,
    );
    const next: View = { snapshot, now, ...contexts };
    for (const player of snapshot.players)
      previousPositions.current.set(player.id, player.position);
    previousBossPosition.current = snapshot.boss.position;
    setView((previous) => (isSameView(previous, next) ? previous : next));

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
          {/*
            モーションはボスのスナップショットから決める。条件とクリップの
            対応はマニフェストへ閉じ込め、ここは状態を渡すだけにする。
          */}
          <HoriDaisukeModel context={view.bossMotionContext} />
        </Suspense>
        <BossNameplate hp={view.snapshot.boss.hp} hpMax={view.snapshot.boss.hpMax} />
      </group>

      {/*
        3人の大輔 (#79 のGLBモデル)。どのモデルを出すかは characterId から
        引く。`player.id === 'pay'` のようなidでの分岐は書かない
        (phase2-player-balance.ts と同じく、キャラ差はデータで持つ)。

        ボスと同じ理由で、GLBの読み込みは Suspense で受け止める。境界は
        1人ずつ分ける。3人を1つの境界でまとめると、誰か1人のGLBが読み込み
        中の間ずっと3人とも unmount され、その間 localRoot が null になって
        FollowCamera が追従先を見失う (カメラがキャラを映さなくなる)。各Actorは
        モデルとHPバーを同じRootへ持ち、位置同期はこのシーンのゲームフレームが
        Actor Rootへ反映する。
      */}
      {view.snapshot.players.map((player) => (
        <Suspense key={player.id} fallback={null}>
          <CharacterActor
            ref={(node) => {
              if (node === null) {
                actorRoots.current.delete(player.id);
                if (player.id === LOCAL_PLAYER_ID) localRoot.current = null;
              } else {
                actorRoots.current.set(player.id, node);
                if (player.id === LOCAL_PLAYER_ID) localRoot.current = node;
              }
            }}
            player={player}
            now={view.now}
            context={view.playerMotionContexts[view.snapshot.players.indexOf(player)]}
            local={player.id === LOCAL_PLAYER_ID}
          />
        </Suspense>
      ))}

      {/* ワールド探索中も操作キャラの周囲をナビ妖精が案内する。 */}
      <TutorialFairy
        anchor={localRoot}
        fallbackPosition={[PLAYER_SPAWN.x, 0, PLAYER_SPAWN.z]}
        visible={worldTutorialVisible}
      />

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

/**
 * ボスのHPバーの高さ。ボスの表示高さのすぐ上へ置く。
 *
 * プレイヤーのバーと同じ理由で、頭から離しすぎない。遠近法で、高い位置に
 * あるものほど画面の端にあるときに横へ大きくずれて見え、モデルと別の場所に
 * バーが浮いているように読める。
 */
const BOSS_BAR_HEIGHT = BOSS_DISPLAY_HEIGHT + 0.4;

/** ボスのHPバー。プレイヤーより大きく、頭上に置く。 */
function BossNameplate({ hp, hpMax }: { hp: number; hpMax: number }): React.JSX.Element {
  const ratio = hp / hpMax;
  const width = 4;

  return (
    <Billboard position={[0, BOSS_BAR_HEIGHT, 0]}>
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
