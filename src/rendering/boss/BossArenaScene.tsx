import { Suspense, useEffect, useRef, useState } from 'react';
import { Billboard, Text } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { Vector3, type Group } from 'three';

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
import { attachMicrophoneNoteInput } from '@/input/microphone/microphone-adapter';
import type { MicrophoneInputStatus } from '@/input/microphone/types';
import { createMelodyRecognizer } from '@/game/ocarina/melody-recognizer';

import { FollowCamera } from '../camera/FollowCamera';
import { CharacterActor } from '../character/character-actor';
import { syncCharacterRoot } from '../character/character-root';
import {
  DISPLAY_HEIGHT as BOSS_DISPLAY_HEIGHT,
  HoriDaisukeModel,
} from '../character/HoriDaisukeModel';
import { World } from '../world/World';
import { DangerZoneMarks } from './DangerZoneMarks';
import {
  publishFinalePresentation,
  resetFinalePresentation,
  type PlayedMelodyNote,
} from './finale-presentation-store';
import { LegendaryOcarina } from './LegendaryOcarina';

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

/** 結界UI・3人操作が未統合の段階で、後半フェーズを確認するための開発限定口。 */
function shouldSkipBarriers(): boolean {
  if (!import.meta.env.DEV || typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('skipBarrier') === '1';
}

interface BattleRuntime {
  readonly battle: BossBattle;
  readonly events: GameEventBus;
}

function createBattleRuntime(): BattleRuntime {
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
    debugSkipBarriers: shouldSkipBarriers(),
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
function isSameView(a: BattleSnapshot, b: BattleSnapshot): boolean {
  if (a.boss.hp !== b.boss.hp || a.boss.phase !== b.boss.phase || a.finale !== b.finale) {
    return false;
  }
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
  const [runtime, setRuntime] = useState<BattleRuntime>(createBattleRuntime);
  const { battle } = runtime;

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
  // 危険範囲・HP・状態は、変わったときだけ更新する。毎フレーム同じ値で
  // set しても再レンダーが走るので、中身を比べてから入れる。
  const [zones, setZones] = useState<readonly DangerZone[]>([]);
  const [imminent, setImminent] = useState(false);
  const [view, setView] = useState<BattleSnapshot>(() => battle.snapshot());
  const [zeroDamageSequence, setZeroDamageSequence] = useState(0);
  const [melodyStarted, setMelodyStarted] = useState(false);
  const [microphoneStatus, setMicrophoneStatus] = useState<MicrophoneInputStatus>('idle');
  const [playedMelodyNotes, setPlayedMelodyNotes] = useState<readonly PlayedMelodyNote[]>([]);
  const [melodyMissSequence, setMelodyMissSequence] = useState(0);
  const microphoneStop = useRef<(() => void) | null>(null);
  const melodyNoteSequence = useRef(0);
  const melody = useRef(
    createMelodyRecognizer({
      notes: ['C', 'E', 'G', 'E', 'C', 'G'],
    }),
  );

  useEffect(() => {
    publishFinalePresentation({
      phase: view.boss.phase,
      finale: view.finale,
      zeroDamageSequence,
      microphoneStatus,
      playedMelodyNotes,
      melodyMissSequence,
    });
  }, [
    view.boss.phase,
    view.finale,
    zeroDamageSequence,
    microphoneStatus,
    playedMelodyNotes,
    melodyMissSequence,
  ]);

  useEffect(() => resetFinalePresentation, []);

  useEffect(
    () =>
      runtime.events.subscribe((event) => {
        if (event.type === 'BOSS_DAMAGE_NULLIFIED' && event.phase === 'NO_SLEEP_MODE') {
          setZeroDamageSequence((current) => current + 1);
        }
      }),
    [runtime.events],
  );

  useEffect(() => {
    if (zeroDamageSequence === 0) return undefined;

    const timer = window.setTimeout(() => setZeroDamageSequence(0), 900);
    return () => window.clearTimeout(timer);
  }, [zeroDamageSequence]);

  useEffect(() => {
    const delayMs =
      // 台詞を読ませる間と、オカリナが空から降りる間を別々に確保する。
      // 最終局面の急な切り替えに見せず、後続の旋律入力へ気持ちを向けさせるため。
      view.finale === 'FINAL_STANDOFF'
        ? 7_500
        : view.finale === 'OCARINA_APPEARING'
          ? 5_200
          : // 旋律完成の余韻を置いてから、回想へ暗転する。
            view.finale === 'MELODY_ACCEPTED'
            ? 2_700
            : null;
    if (delayMs === null) return undefined;

    const timer = window.setTimeout(() => battle.advanceFinale(), delayMs);
    return () => window.clearTimeout(timer);
  }, [battle, view.finale]);

  useEffect(() => {
    let disposed = false;

    function startMelody(): void {
      if (microphoneStop.current !== null || view.finale !== 'WAITING_FOR_MELODY') return;
      setMelodyStarted(true);
      setMicrophoneStatus('requesting-permission');
      void attachMicrophoneNoteInput(
        (event) => {
          if (event.type === 'note-off') return;

          // 同じ息の途中で自然音から半音へ揺れるのは、実機では音程のブレとして
          // 起きやすい。これは直前の音と二重に書かない。一方、吹き直した半音は
          // note-on になるため、ド#などとして正しく楽譜へ出る。
          if (event.type === 'note-change' && event.note.name.includes('#')) return;

          const result = melody.current.consume(event);
          if (result === 'IGNORED') return;

          const note: PlayedMelodyNote = {
            id: melodyNoteSequence.current++,
            name: event.note.name,
            correct: result === 'CORRECT' || result === 'COMPLETE',
          };
          setPlayedMelodyNotes((current) => [...current.slice(-5), note]);

          if (result === 'MISS') setMelodyMissSequence((current) => current + 1);

          if (result === 'COMPLETE') {
            microphoneStop.current?.();
            microphoneStop.current = null;
            battle.advanceFinale();
          }
        },
        { onStatusChange: setMicrophoneStatus },
      )
        .then((stop) => {
          if (disposed) {
            stop();
            return;
          }
          microphoneStop.current = stop;
        })
        .catch(() => undefined);
    }

    window.addEventListener('finale:melody-start', startMelody);
    return () => {
      disposed = true;
      window.removeEventListener('finale:melody-start', startMelody);
      microphoneStop.current?.();
      microphoneStop.current = null;
    };
  }, [battle, view.finale]);

  useEffect(() => {
    if (!import.meta.env.DEV) return undefined;

    function onDebugFinale(event: KeyboardEvent): void {
      if (event.repeat) return;
      if (event.code === 'KeyZ') {
        battle.debugEnterNoSleepMode();
        return;
      }
      // 発表・回想演出の確認用。通常ビルドではリスナー自体を登録しない。
      if (event.code === 'KeyM' && view.finale === 'WAITING_FOR_MELODY') {
        melody.current.forceComplete();
        microphoneStop.current?.();
        microphoneStop.current = null;
        battle.advanceFinale();
      }
    }

    window.addEventListener('keydown', onDebugFinale);
    return () => window.removeEventListener('keydown', onDebugFinale);
  }, [battle, view.finale]);

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
      setRuntime(createBattleRuntime());
      setOutcome('ONGOING');
      setZones([]);
      setImminent(false);
      setZeroDamageSequence(0);
      setMelodyStarted(false);
      setMicrophoneStatus('idle');
      setPlayedMelodyNotes([]);
      setMelodyMissSequence(0);
      melodyNoteSequence.current = 0;
      melody.current.reset();
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
        {view.finale === 'NONE' && <BossNameplate hp={view.boss.hp} hpMax={view.boss.hpMax} />}
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
      {view.players.map((player) => (
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
            local={player.id === LOCAL_PLAYER_ID}
          />
        </Suspense>
      ))}

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
      <LegendaryOcarina phase={melodyStarted ? 'NONE' : view.finale} />
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
