import { Suspense, useEffect, useRef, useState } from 'react';

import { Billboard, Text } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { MathUtils, Vector3, type Group } from 'three';

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
  outcomeOfSnapshot,
  type BattleOutcome,
  type BattleSnapshot,
  type BossBattle,
} from '@/game/session/boss-battle';
import { createLocalBattleSource, type BattleSource } from '@/game/session/battle-source';
import { dangerZonesOfActiveAttack } from '@/game/boss/attacks/hori-attacks';
import { attachKeyboardGameActions } from '@/input/keyboard/game-action-adapter';
import { attachMicrophoneNoteInput } from '@/input/microphone/microphone-adapter';
import type { MicrophoneInputStatus, NoteName } from '@/input/microphone/types';
import { createMelodyRecognizer } from '@/game/ocarina/melody-recognizer';
import type { PlanarPosition } from '@/game/movement/types';
import { readPresentationSettings } from '@/presentation/presentation-store';
import type { PlayerStatus } from '@/game/player/player-state';
import {
  isLocalPlayerId,
  LOCAL_PLAYER_IDS,
  readLocalPlayerId,
  useLocalPlayerStore,
  type LocalPlayerId,
} from '@/store/local-player-store';
import { useWorldTutorialStore } from '@/ui/tutorial/world-tutorial-store';

import { FollowCamera } from '../camera/FollowCamera';
import { CharacterActor } from '../character/character-actor';
import {
  bossMotionContextFor,
  isSameMotionContext,
  motionContextFor,
} from '../character/motion-context';
import {
  dampCharacterRoot,
  dampPlanarPosition,
  syncCharacterRoot,
  type SmoothingOptions,
} from '../character/character-root';
import { TutorialFairy } from '../character/TutorialFairy';
import {
  DISPLAY_HEIGHT as BOSS_DISPLAY_HEIGHT,
  HoriDaisukeModel,
} from '../character/HoriDaisukeModel';
import type { MotionContext } from '../character/motion-manifest';
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
 * 操作するのは同時に1人だけ。ソロではオドルノ1人を生成し、リモートでは
 * Authority が割り当てた1人を表示する。ローカルの操作対象切り替えは、複数人を
 * 同時操作する仕組みではなく、既存セッションとの互換用に残している。
 */

const [LEFT_SPAWN, PLAYER_SPAWN, RIGHT_SPAWN] = SPAWN_POINTS;

/**
 * ボス戦の追従カメラ。探索用より高く・遠くする。
 *
 * 近い視点のままだと、絶対起床アラームの全方位リング (外径18) や
 * 突進の軌道 (長さ30) が視界へ収まらず、予兆を見て回避できない。
 */
const BATTLE_CAMERA_OFFSET = new Vector3(0, 16, 18);

/**
 * リモート(#127)でのみ使う位置・向きの指数減衰の設定。
 *
 * ローカルは毎フレーム tick() が新しい snapshot を作るので、直接 set
 * (syncCharacterRoot) のままで既に滑らか。リモートは STATE がサーバーの
 * stateBroadcastIntervalMs (server/index.ts, 暫定100ms) ごとにしか届かず、
 * 直接 set だと届いた瞬間だけ飛んで見える。lambda はベンチマークに基づく値
 * ではなく、その間隔をまたいでも動き続けて見える程度に大きめの値を仮に
 * 置いている。
 *
 * これは表示だけの補正で、当たり判定・危険範囲の予兆 (targets/
 * DangerZoneMarks, 下の snapshot.players をそのまま使う箇所) は常に真の
 * snapshot 座標で行われる。移動中はキャラの見た目が真の位置よりわずかに
 * (概ね 速度/lambda 相当) 遅れうる。通常歩行(秒速 7〜9 程度) では気付かない
 * 差だが、ボスの高速突進のように秒速数十単位で動く対象では無視できない
 * 差になり得るため、snapDistance を明らかに移動が意図的な瞬間移動
 * (回避・突進・新規マウント・再接続) と判定できる大きさに置き、それを
 * 超えたら滑らせず直接 set して見た目のずれが大きく残らないようにする。
 * 恒常誤差をゼロにするサーバー時刻ベースのスナップショット補間
 * (snapshot.players[].takenAt を使える) の方が正確だが、#127 の速度優先の
 * 対応範囲としてはここでは採用しない。
 */
const REMOTE_POSITION_SMOOTHING: Omit<SmoothingOptions, 'deltaSeconds'> = {
  lambda: 18,
  snapDistance: 2,
};

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
  /** ローカル戦闘を描画ループへ繋ぐ口。リモートと同じ経路を通す。 */
  readonly source: BattleSource;
}

function createBattle(): Battle {
  const pinned = pinnedAttackId();
  const events = createGameEventBus();
  const battle = createBossBattle({
    clock: createRealClock(),
    events,
    // スポーン地点は #54 のアリーナ定義をそのまま使う。ソロでも3人を生成し、
    // 1人のプレイヤーが操作対象を切り替えながら進められるようにする。
    // 3人協力を前提にした結界は BossBattle 側で省略する。
    roster: [
      { id: 'odoruno', characterId: 'ODORUNO', position: PLAYER_SPAWN },
      { id: 'pay', characterId: 'PAY', position: LEFT_SPAWN },
      { id: 'ora', characterId: 'ORA', position: RIGHT_SPAWN },
    ],
    solo: true,
    createBoss: (options) =>
      createHoriBoss(pinned === null ? options : { ...options, pickAttack: () => pinned }),
  });

  // 操作対象はストアから毎回読む。ここで固定すると、切り替え (Issue #106) が
  // source を作り直さない限り効かなくなる。
  return { battle, events, source: createLocalBattleSource(battle, readLocalPlayerId) };
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
  if (a.snapshot.finale !== b.snapshot.finale) return false;
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

function sceneOutcome(snapshot: BattleSnapshot, localPlayerId: string): SceneOutcome {
  // snapshot だけで決める。リモートは Authority の STATE しか持たないので、
  // BossBattle のインスタンスを覗く判定にすると勝敗が出せない。
  const settled = outcomeOfSnapshot(snapshot);
  if (settled !== 'ONGOING') return settled;

  const local = snapshot.players.find((player) => player.id === localPlayerId);
  // 倒れて寝落ちのカウントが始まっている間も、操作は戻らない。
  return local !== undefined && local.status !== 'ACTIVE' ? 'LOCAL_DOWN' : 'ONGOING';
}

/**
 * 各プレイヤーの状態を切り替えパネルへ渡す。
 *
 * 変わったときだけ書く。毎フレーム同じ値を set すると、購読している
 * パネルが毎フレーム再レンダーされる (view / zones と同じ規律)。
 */
function publishLocalPlayerStatuses(snapshot: BattleSnapshot): void {
  const { statuses, setStatuses } = useLocalPlayerStore.getState();

  const next: Partial<Record<LocalPlayerId, PlayerStatus>> = {};
  for (const player of snapshot.players) {
    if (isLocalPlayerId(player.id)) next[player.id] = player.status;
  }

  const changed =
    Object.keys(next).length !== Object.keys(statuses).length ||
    LOCAL_PLAYER_IDS.some((id) => next[id] !== statuses[id]);
  if (changed) setStatuses(next);
}

interface BossArenaSceneProps {
  /**
   * Authority 権威の戦闘を描くときに渡す。省略するとローカル戦闘を作る
   * (ワールド探索・dev用)。本番マルチプレイでは必ず渡す。
   */
  readonly source?: BattleSource;
}

export function BossArenaScene({
  source: providedSource,
}: BossArenaSceneProps = {}): React.JSX.Element {
  const worldTutorialVisible = useWorldTutorialStore((state) => state.visible);
  const switchedLocalPlayerId = useLocalPlayerStore((state) => state.localPlayerId);

  // ローカル戦闘は source 未指定のときだけ作る。リモートを渡されたときに
  // 作ってしまうと、本番なのにローカル戦闘が裏で走ることになる。
  //
  // 決着後のやり直しでは作り直す (戦闘の状態を部分的に巻き戻すより、
  // 同じ初期化を通す方が「途中の状態が残っている」事故が無い)。
  const [localBattle, setLocalBattle] = useState<Battle | null>(() =>
    providedSource === undefined ? createBattle() : null,
  );

  const source = providedSource ?? localBattle?.source ?? null;
  if (source === null) {
    throw new Error('BattleSource is unavailable');
  }
  const activeSource = source;

  // 最終演出を進められるのはローカル戦闘のときだけ。リモートでは Authority が
  // finale を進め、こちらは snapshot を映すだけ (二重に進めない)。
  const battle = localBattle?.battle ?? null;
  const events = localBattle?.events ?? null;

  // 操作キャラ。ローカルは画面から切り替えられ (Issue #106)、リモートは
  // Authority が WELCOME で決めた1人に固定される。混ぜないよう分けて持つ。
  const localPlayerId = providedSource === undefined ? switchedLocalPlayerId : source.localPlayerId;

  // SE。戦闘が流すイベントを購読して鳴らす。戦闘を作り直したら (やり直し)
  // 前の購読と音源を捨てて繋ぎ直す。
  //
  // ここで購読していなければ、戦闘がイベントを流しても誰も聞いていない
  // 状態になる。単騎PoC 側は combat-session.ts が同じ形で繋いでいる。
  useEffect(() => {
    if (events === null) return undefined;
    const output = createHtmlAudioOutput();
    return createAudioManager({ eventBus: events, output, getSettings: readPresentationSettings });
  }, [events]);

  // 画面に出す決着。
  //
  // `outcomeOfSnapshot` は全プレイヤーが寝たら敗北と判定する。ソロでは
  // プレイヤーが1人だけなので、そのまま「自分が倒れたら敗北」となる。
  const [outcome, setOutcome] = useState<SceneOutcome>('ONGOING');

  // 追従カメラは Object3D を見るので、操作キャラの Root を渡す。
  // 中身は actorRoots から引き直す (下の Effect)。
  const localRoot = useRef<Group>(null);

  // 入力は useFrame から毎フレーム引く。requestAnimationFrame を別に
  // 回すと、r3f の描画ループと二重になって1フレームに2回進む。
  const inputRef = useRef<ReturnType<typeof attachKeyboardGameActions> | null>(null);

  // 位置と向きは毎フレーム変わるので state へ入れない。Object3D を直接
  // 動かす。state にすると1フレームごとに React の再レンダーが走る。
  const bossRoot = useRef<Group>(null);
  const bossVisual = useRef<Group>(null);
  const actorRoots = useRef(new Map<string, Group>());
  const previousPositions = useRef(new Map<string, PlanarPosition>());
  const previousBossPosition = useRef<PlanarPosition | undefined>(undefined);
  // 危険範囲・HP・状態は、変わったときだけ更新する。毎フレーム同じ値で
  // set しても再レンダーが走るので、中身を比べてから入れる。
  const [zones, setZones] = useState<readonly DangerZone[]>([]);
  const [imminent, setImminent] = useState(false);
  // リモートは最初の STATE が来るまで snapshot を持てないので null から始める。
  const [view, setView] = useState<View | null>(() =>
    localBattle === null
      ? null
      : {
          snapshot: localBattle.battle.snapshot(),
          now: performance.now(),
          playerMotionContexts: [],
          bossMotionContext: {},
        },
  );

  // 描画ループが読む最新 snapshot。source から来た値をそのまま置く。
  const snapshotRef = useRef<BattleSnapshot | null>(view?.snapshot ?? null);

  // finale など「snapshot を見て動く Effect」はこれを読む。view が null の間は
  // 演出を始めない (リモート接続直後の1瞬)。
  const finale = view?.snapshot.finale ?? 'NONE';
  const [zeroDamageSequence, setZeroDamageSequence] = useState(0);
  const [melodyStarted, setMelodyStarted] = useState(false);
  const [microphoneStatus, setMicrophoneStatus] = useState<MicrophoneInputStatus>('idle');
  const [playedMelodyNotes, setPlayedMelodyNotes] = useState<readonly PlayedMelodyNote[]>([]);
  const [melodyMissSequence, setMelodyMissSequence] = useState(0);
  const [melodyExpected, setMelodyExpected] = useState<NoteName | null>(null);
  const [showMelodyHint, setShowMelodyHint] = useState(false);
  const [melodyActivitySequence, setMelodyActivitySequence] = useState(0);
  const microphoneStop = useRef<(() => void) | null>(null);
  const melodyNoteSequence = useRef(0);
  const melody = useRef(createMelodyRecognizer({ notes: ['C', 'E', 'G', 'E', 'C', 'G'] }));

  const bossPhase = view?.snapshot.boss.phase ?? null;

  useEffect(() => {
    if (bossPhase === null) return;
    publishFinalePresentation({
      phase: bossPhase,
      finale,
      zeroDamageSequence,
      microphoneStatus,
      playedMelodyNotes,
      melodyMissSequence,
      melodyExpected,
      showMelodyHint,
    });
  }, [
    bossPhase,
    finale,
    zeroDamageSequence,
    microphoneStatus,
    playedMelodyNotes,
    melodyMissSequence,
    melodyExpected,
    showMelodyHint,
  ]);

  useEffect(() => resetFinalePresentation, []);

  // source が流す STATE を受ける。ローカルは tick() が、リモートは
  // サーバーが流す。描画ループはここで置かれた snapshot を読む。
  useEffect(() => {
    snapshotRef.current = null;

    return activeSource.onState((snapshot) => {
      snapshotRef.current = snapshot;
      setView((previous) => {
        const now = performance.now();
        const next: View = {
          snapshot,
          now,
          ...motionContextsFor(
            snapshot,
            now,
            previousPositions.current,
            previousBossPosition.current,
          ),
        };
        return previous !== null && isSameView(previous, next) ? previous : next;
      });
    });
  }, [activeSource]);

  useEffect(() => {
    if (events === null) return undefined;
    return events.subscribe((event) => {
      if (event.type === 'BOSS_DAMAGE_NULLIFIED' && event.phase === 'NO_SLEEP_MODE') {
        setZeroDamageSequence((current) => current + 1);
      }
    });
  }, [events]);

  useEffect(() => {
    if (zeroDamageSequence === 0) return undefined;
    const timer = window.setTimeout(() => setZeroDamageSequence(0), 900);
    return () => window.clearTimeout(timer);
  }, [zeroDamageSequence]);

  // 演出の自動進行はローカル戦闘だけが行う。リモートでは Authority が
  // finale を進めるので、クライアント側から進めると二重に進む。
  useEffect(() => {
    if (battle === null) return undefined;
    const delayMs =
      finale === 'FINAL_STANDOFF'
        ? 7_500
        : finale === 'OCARINA_APPEARING'
          ? 5_200
          : finale === 'MELODY_ACCEPTED'
            ? 2_700
            : finale === 'MEMORY'
              ? 14_500
              : finale === 'HORI_FALLING_ASLEEP'
                ? 5_000
                : null;
    if (delayMs === null) return undefined;
    const timer = window.setTimeout(() => battle.advanceFinale(), delayMs);
    return () => window.clearTimeout(timer);
  }, [battle, finale]);

  useEffect(() => {
    if (battle === null) return undefined;
    // コールバックの中から読むので、narrow 済みの参照を掴んでおく。
    const localBattleForMelody = battle;
    let disposed = false;
    function startMelody(): void {
      if (microphoneStop.current !== null || finale !== 'WAITING_FOR_MELODY') return;
      setMelodyStarted(true);
      setMicrophoneStatus('requesting-permission');
      setMelodyExpected(melody.current.snapshot().expected);
      setShowMelodyHint(false);
      void attachMicrophoneNoteInput(
        (event) => {
          if (
            event.type === 'note-off' ||
            (event.type === 'note-change' && event.note.name.includes('#'))
          )
            return;
          const result = melody.current.consume(event);
          if (result === 'IGNORED') return;
          const snapshot = melody.current.snapshot();
          setMelodyExpected(snapshot.expected);
          setShowMelodyHint(snapshot.showHint);
          setMelodyActivitySequence((current) => current + 1);
          setPlayedMelodyNotes((current) => [
            ...current.slice(-5),
            {
              id: melodyNoteSequence.current++,
              name: event.note.name,
              correct: result === 'CORRECT' || result === 'COMPLETE',
            },
          ]);
          if (result === 'MISS') setMelodyMissSequence((current) => current + 1);
          if (result === 'COMPLETE') {
            microphoneStop.current?.();
            microphoneStop.current = null;
            localBattleForMelody.advanceFinale();
          }
        },
        { onStatusChange: setMicrophoneStatus },
      )
        .then((stop) => {
          if (disposed) stop();
          else microphoneStop.current = stop;
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
  }, [battle, finale]);

  useEffect(() => {
    if (!melodyStarted || finale !== 'WAITING_FOR_MELODY') return undefined;
    const timer = window.setTimeout(
      () => setShowMelodyHint(true),
      melodyActivitySequence === 0 ? 9_000 : 7_000,
    );
    return () => window.clearTimeout(timer);
  }, [melodyActivitySequence, melodyStarted, finale]);

  useEffect(() => {
    if (battle === null) return undefined;
    const completeEnding = () => {
      if (finale === 'ENDING') battle.advanceFinale();
    };
    window.addEventListener('finale:ending-complete', completeEnding);
    return () => window.removeEventListener('finale:ending-complete', completeEnding);
  }, [battle, finale]);

  useEffect(() => {
    if (!import.meta.env.DEV || battle === null) return undefined;
    const onDebugFinale = (event: KeyboardEvent) => {
      if (event.repeat) return;
      if (event.code === 'KeyZ') battle.debugEnterNoSleepMode();
      if (event.code === 'KeyM' && finale === 'WAITING_FOR_MELODY') {
        melody.current.forceComplete();
        microphoneStop.current?.();
        microphoneStop.current = null;
        battle.advanceFinale();
      }
    };
    window.addEventListener('keydown', onDebugFinale);
    return () => window.removeEventListener('keydown', onDebugFinale);
  }, [battle, finale]);

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
      // 送り先は source が決める。ローカルは送るたびにストアから操作キャラを
      // 読み直すので (createLocalBattleSource)、切り替えてもこの Effect を
      // 張り直さずに済む。張り直すと押しっぱなしの移動が切れる。
      if (adapter !== null) activeSource.submit(adapter.pollMove());
      activeSource.submit(action);
    });
    const input = adapter;

    inputRef.current = input;

    return () => {
      inputRef.current = null;
      input.detach();
    };
  }, [activeSource]);

  // 決着したら R でやり直す。決着後は戦闘を進めないので、ここだけは
  // キーボードを直接見る (GameAction にやり直しは無い。やり直しは
  // 戦闘の操作ではなく画面の操作なので、入力契約へ足さない)。
  useEffect(() => {
    if (outcome === 'ONGOING') return undefined;

    function onRestart(event: KeyboardEvent): void {
      if (event.code !== 'KeyR') return;
      // やり直せるのはローカル戦闘だけ。リモートは Authority が持つ進行なので、
      // クライアントが勝手に戦闘を作り直すことはできない。
      if (providedSource !== undefined) return;
      previousPositions.current.clear();
      previousBossPosition.current = undefined;
      setLocalBattle(createBattle());
      setView(null);
      snapshotRef.current = null;
      setOutcome('ONGOING');
      setZones([]);
      setImminent(false);
      setZeroDamageSequence(0);
      setMelodyStarted(false);
      setMicrophoneStatus('idle');
      setPlayedMelodyNotes([]);
      setMelodyMissSequence(0);
      setMelodyExpected(null);
      setShowMelodyHint(false);
      setMelodyActivitySequence(0);
      melodyNoteSequence.current = 0;
      melody.current.reset();
    }

    window.addEventListener('keydown', onRestart);
    return () => window.removeEventListener('keydown', onRestart);
  }, [outcome, providedSource]);

  // 操作対象が変わったら、離れたキャラへ移動停止を送る。
  //
  // 入力アダプタは1つで、submit 先のIDを差し替えているだけなので、
  // 直前のキャラの player-state には最後に送った移動入力が残る。
  // 放っておくと、切り替えた瞬間に前のキャラが押しっぱなしのまま走り出す。
  const previousLocalPlayerId = useRef(localPlayerId);
  useEffect(() => {
    const left = previousLocalPlayerId.current;
    previousLocalPlayerId.current = localPlayerId;
    if (left === localPlayerId || battle === null) return;

    battle.submit(left, { type: 'MOVE', input: { forward: 0, right: 0 } });
  }, [battle, localPlayerId]);

  useFrame((_, delta) => {
    // 決着後は時間を進めない。倒れたまま技を撃たれ続けると、
    // 何が起きて負けたのかが画面に残らない。
    if (outcome !== 'ONGOING') {
      return;
    }

    // 操作対象は毎フレーム読む。切り替えても Effect を張り直さずに追従できる。
    const activePlayerId = activeSource.localPlayerId;

    // 追従カメラの見る Root を選択中のキャラへ合わせる。ref コールバックで
    // 決めると、切り替え時に新旧どちらが先に走るかで一瞬古い Root を指す。
    localRoot.current = actorRoots.current.get(activePlayerId) ?? null;

    // 移動は押しっぱなしの状態なので毎フレーム取り出す。
    const input = inputRef.current;
    if (input !== null) activeSource.submit(input.pollMove());

    // ローカルはここで時間が進み、その場で STATE が流れる。リモートは
    // サーバーが進めるので tick() は何もしない。
    activeSource.tick(delta);

    // 描画は source から流れてきた snapshot だけを見る。ローカル戦闘の
    // インスタンスを直接覗くと、リモートで同じ経路が通らなくなる。
    const snapshot = snapshotRef.current;
    if (snapshot === null) return;

    const sleeping =
      snapshot.finale === 'HORI_FALLING_ASLEEP' ||
      snapshot.finale === 'ENDING' ||
      snapshot.finale === 'COMPLETE';
    if (bossVisual.current !== null) {
      bossVisual.current.rotation.z = MathUtils.damp(
        bossVisual.current.rotation.z,
        sleeping ? Math.PI / 2 : 0,
        3.4,
        delta,
      );
      bossVisual.current.position.y = MathUtils.damp(
        bossVisual.current.position.y,
        sleeping ? 0.32 : 0,
        3.4,
        delta,
      );
    }

    // 位置と向きは Object3D へ直接反映する。真実源はロジック側
    // (boss-battle) で、ここは映すだけ。
    //
    // リモートだけ指数減衰で寄せる(#127)。ローカルは tick() が毎フレーム
    // 新しい snapshot を作るので直接 set のままで滑らかだが、リモートは
    // STATE が一定間隔でしか届かず、直接 set だと届いた瞬間だけ飛んで
    // 見える(その間は静止して見える)。
    if (activeSource.kind === 'REMOTE') {
      const smoothing: SmoothingOptions = { ...REMOTE_POSITION_SMOOTHING, deltaSeconds: delta };
      if (bossRoot.current !== null) {
        dampPlanarPosition(bossRoot.current, snapshot.boss.position, smoothing);
      }

      for (const player of snapshot.players) {
        const root = actorRoots.current.get(player.id);
        if (root !== undefined) dampCharacterRoot(root, player, smoothing);
      }
    } else {
      bossRoot.current?.position.set(snapshot.boss.position.x, 0, snapshot.boss.position.z);

      for (const player of snapshot.players) {
        const root = actorRoots.current.get(player.id);
        if (root !== undefined) syncCharacterRoot(root, player);
      }
    }

    // view の更新は source.onState 側で行う。ここでは次フレームの
    // モーション判定に使う「前フレームの位置」だけを覚えておく。
    for (const player of snapshot.players)
      previousPositions.current.set(player.id, player.position);
    previousBossPosition.current = snapshot.boss.position;

    // 切り替えパネルへ各人の状態を渡す。寝ているキャラは選べないようにする。
    // ローカルだけ。リモートの roster を切り替えストアへ流すと、別経路である
    // はずの Authority 側の状態が混ざる (local-player-store の但し書き)。
    if (providedSource === undefined) publishLocalPlayerStatuses(snapshot);

    const active = snapshot.boss.activeAttack;
    // ボスへ渡す targets と同じものを使う。描画だけ別の配列を組むと、
    // 追尾ビームの着弾点が判定と食い違う。
    const targets = snapshot.players
      .filter((player) => player.status === 'ACTIVE')
      .map((player) => ({ id: player.id, position: player.position }));

    // 危険範囲も snapshot から出す。リモートには boss オブジェクトが無い。
    const nextZones = dangerZonesOfActiveAttack(
      snapshot.boss.activeAttack,
      targets,
      snapshot.boss.takenAt,
    );
    setZones((previous) => (isSameZones(previous, nextZones) ? previous : nextZones));
    setImminent(
      active !== null && snapshot.boss.takenAt - active.startedAt >= active.timing.telegraphMs,
    );

    const nextOutcome = sceneOutcome(snapshot, activePlayerId);
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
        <group ref={bossVisual}>
          <Suspense fallback={null}>
            <HoriDaisukeModel context={view?.bossMotionContext ?? {}} />
          </Suspense>
        </group>
        {(finale === 'HORI_FALLING_ASLEEP' || finale === 'ENDING') && <FinaleFuton />}
        {view !== null && finale === 'NONE' && (
          <BossNameplate hp={view.snapshot.boss.hp} hpMax={view.snapshot.boss.hpMax} />
        )}
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
      {view?.snapshot.players.map((player) => (
        <Suspense key={player.id} fallback={null}>
          <CharacterActor
            ref={(node) => {
              if (node === null) {
                actorRoots.current.delete(player.id);
              } else {
                actorRoots.current.set(player.id, node);
              }
              // localRoot はここで決めない。操作キャラを切り替えると新旧2つの
              // ref コールバックが走り、どちらが後かで一瞬古い Root を指す。
              // 選択中の Root は下の Effect でまとめて引き直す。
            }}
            player={player}
            now={view.now}
            context={view.playerMotionContexts[view.snapshot.players.indexOf(player)]}
            local={player.id === localPlayerId}
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
          <OutcomeBanner outcome={outcome} canRestart={providedSource === undefined} />
        </Suspense>
      )}

      <FollowCamera
        target={localRoot}
        offset={BATTLE_CAMERA_OFFSET}
        lookAtHeight={BATTLE_LOOK_AT_HEIGHT}
      />
      <SleepCamera target={bossRoot} active={finale === 'HORI_FALLING_ASLEEP'} />
      <LegendaryOcarina phase={melodyStarted ? 'NONE' : finale} />
    </>
  );
}

/** 就寝演出専用の簡易3D布団。物理判定を持たず、安全にPop-inさせる。 */
function FinaleFuton(): React.JSX.Element {
  const quilt = useRef<Group>(null);
  const appearedAt = useRef<number | null>(null);

  useFrame(({ clock }, delta) => {
    appearedAt.current ??= clock.getElapsedTime();
    const elapsed = clock.getElapsedTime() - appearedAt.current;
    const lift =
      elapsed < 0.72 ? (elapsed / 0.72) * 0.92 : Math.max(0, 0.92 - (elapsed - 0.72) * 1.7);
    if (quilt.current !== null) {
      quilt.current.position.y = MathUtils.damp(quilt.current.position.y, 0.53 + lift, 8, delta);
      quilt.current.rotation.z = MathUtils.damp(quilt.current.rotation.z, -lift * 0.52, 8, delta);
    }
  });

  return (
    <group position={[0, 0.18, 0.15]} rotation={[0, 0.12, 0]}>
      <mesh position={[0, 0.25, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.9, 0.35, 1.55]} />
        <meshStandardMaterial color="#bd344a" roughness={0.9} />
      </mesh>
      <mesh position={[-0.88, 0.48, 0]} castShadow>
        <boxGeometry args={[0.85, 0.2, 1.22]} />
        <meshStandardMaterial color="#fff1c6" roughness={0.96} />
      </mesh>
      <group ref={quilt} position={[0.22, 0.53, 0]}>
        <mesh castShadow>
          <boxGeometry args={[1.85, 0.2, 1.34]} />
          <meshStandardMaterial color="#e65764" roughness={0.88} />
        </mesh>
      </group>
    </group>
  );
}

const SLEEP_CAMERA_OFFSET = new Vector3(0, 3.1, 5.1);
const sleepCameraDesired = new Vector3();

function SleepCamera({
  target,
  active,
}: {
  target: React.RefObject<Group | null>;
  active: boolean;
}): null {
  useFrame(({ camera }, delta) => {
    const boss = target.current;
    if (!active || boss === null) return;
    sleepCameraDesired.copy(boss.position).add(SLEEP_CAMERA_OFFSET);
    camera.position.lerp(sleepCameraDesired, 1 - Math.exp(-4.4 * delta));
    camera.lookAt(boss.position.x, boss.position.y + 0.75, boss.position.z);
  });
  return null;
}

/**
 * 決着の表示。
 *
 * カメラの前へ出さず、ボスの頭上に置く。操作キャラが倒れているときも
 * ボスは必ず画面に入っているため。
 */
function OutcomeBanner({
  outcome,
  canRestart,
}: {
  outcome: SceneOutcome;
  canRestart: boolean;
}): React.JSX.Element {
  const won = outcome === 'VICTORY';
  return (
    <Billboard position={[BOSS_ANCHOR.x, 7, BOSS_ANCHOR.z]}>
      <Text fontSize={1.1} color={won ? '#4cd964' : '#ff453a'} anchorY="bottom">
        {won ? 'WAKE UP!' : 'ZZZ...'}
      </Text>
      {/* Rでのやり直しはローカルdev経路専用。リモートでは押しても何も
          起きないため、その場合はヒント自体を出さない (UIが嘘をつかない)。 */}
      {canRestart && (
        <Text fontSize={0.45} color="#f2f2f7" anchorY="top" position={[0, -0.2, 0]}>
          R でやり直す
        </Text>
      )}
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
