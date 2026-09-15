import { lazy, Suspense, useEffect, useState, useSyncExternalStore } from 'react';

import { attachKeyboardInput } from '@/input/keyboard/keyboard-adapter';
import { readPresentationSettings } from '@/presentation/presentation-store';
import { GameScene } from '@/rendering/scene/GameScene';
import { VfxOverlay } from '@/rendering/vfx/VfxOverlay';
import { useGameStore } from '@/store/game-store';
import { ResultOverlay } from '@/ui/result/ResultOverlay';
import { Hud } from '@/ui/hud/Hud';
import { EffectSettings } from '@/ui/settings/EffectSettings';
import { TitleScreen } from '@/ui/title/TitleScreen';
import { OraDebugPage } from '@/ui/ora-debug/OraDebugPage';
import { WasshoiDebug } from '@/ui/wasshoi-debug/WasshoiDebug';
import { HoriDebugPage } from '@/ui/hori-debug/HoriDebugPage';
import { IntroCutscene } from '@/intro/IntroCutscene';

import { useScreenStore } from './screen';
import { currentRoute, subscribeToRoute } from './route';
import { createCombatSession } from './combat-session';
import styles from './App.module.css';

/**
 * 音声入力の閾値調整用パネル。(Issue #43)
 *
 * lazy() の呼び出しごと DEV ガードの内側へ置く。トップレベルに置くと
 * import.meta.env.DEV が false でも動的 import の記述自体が残り、
 * 本番バンドルへチャンク（CSS・pitchy 込み）が出力されてしまう。
 */
const MicrophoneDebug = import.meta.env.DEV
  ? lazy(async () => ({ default: (await import('@/ui/debug/MicrophoneDebug')).MicrophoneDebug }))
  : null;

// LiveKit SDK は通常のゲーム体験には不要なので、明示的な検証画面を開いた時だけ読む。
const VoiceDebugPage = lazy(async () => ({
  default: (await import('@/ui/voice-debug/VoiceDebug')).VoiceDebug,
}));

export function App(): React.JSX.Element {
  const screen = useScreenStore((state) => state.screen);
  const route = useSyncExternalStore(subscribeToRoute, currentRoute, () => 'TITLE');

  useEffect(() => {
    if (route === 'INTRO' || route === 'BATTLE' || route === 'WORLD') {
      useScreenStore.setState({ screen: route });
    } else if (route === 'TITLE') {
      useScreenStore.setState({ screen: 'TITLE' });
    }
  }, [route]);

  // `?debug=ora` `?debug=hori` はタイトルより先に見る。URLで直接開く動作確認用の
  // 入口なので、タイトルを経由させると既存の手順が変わってしまう
  // (`?scene=world` と同じ扱い)。
  const debug = new URLSearchParams(window.location.search).get('debug');
  if (route === 'ORA_DEBUG') {
    return <OraDebugPage />;
  }
  if (debug === 'hori') {
    return <HoriDebugPage />;
  }

  if (new URLSearchParams(window.location.search).get('debug') === 'wasshoi') {
    return <WasshoiDebug />;
  }
  if (new URLSearchParams(window.location.search).get('debug') === 'voice') {
    return (
      <Suspense fallback={null}>
        <VoiceDebugPage />
      </Suspense>
    );
  }

  if (screen === 'TITLE') return <TitleScreen />;

  if (screen === 'INTRO') {
    return <IntroCutscene onComplete={() => useScreenStore.getState().goTo('WORLD')} />;
  }

  // ワールドは Phase 1 の戦闘一式を起動しない。あちらは PlayerAction 前提で、
  // WASD が移動と同時に DODGE/GUARD としても解釈され、戦闘の時計・入力ロックが
  // 進んでしまう。Phase 2 は GameAction で動く (docs/technical-design.md §5.2)。
  if (screen === 'WORLD') {
    return (
      <div className={styles.root}>
        <GameScene world />
        <MicrophoneDebugPanel />
      </div>
    );
  }

  return <BattleScreen />;
}

export function BattleScreen(): React.JSX.Element {
  const [battle, setBattle] = useState(0);

  return (
    <>
      <Battle key={battle} onRestart={() => setBattle((value) => value + 1)} />
      {/*
        Battle の外へ置くのは、再戦のたびに key で再マウントされると
        調整中のマイクが毎回止まってしまうため。(Issue #43)
      */}
      <MicrophoneDebugPanel />
    </>
  );
}

/**
 * 音声入力の閾値調整用パネル。本番ビルドへは出さず、ゲームUIとも密結合させない。
 * ワールド探索モードでも閾値を合わせられるよう、両方の画面へ出す。(Issue #43)
 */
function MicrophoneDebugPanel(): React.JSX.Element | null {
  if (MicrophoneDebug === null) return null;

  return (
    <Suspense fallback={null}>
      <MicrophoneDebug />
    </Suspense>
  );
}

function Battle({ onRestart }: { onRestart: () => void }): React.JSX.Element {
  const result = useGameStore((state) => state.result);

  useEffect(() => {
    // 戦闘一式はこの Effect の中で作って同じ Effect で捨てる。StrictMode の
    // 二重マウントでもループと購読が二重に残らないようにするため。
    const session = createCombatSession();
    const { recordAction } = useGameStore.getState();

    const detachKeyboard = attachKeyboardInput((action) => {
      // ACTION_UI の直近入力表示は受理・不受理によらず押した内容を出す。
      if (useGameStore.getState().result) return;
      recordAction(action);
      session.submitAction(action);
    });

    const unsubscribeInput = useGameStore.subscribe((state) => {
      if (state.result) detachKeyboard();
    });

    return () => {
      unsubscribeInput();
      detachKeyboard();
      session.dispose();
    };
  }, []);

  return (
    <div className={styles.root}>
      <GameScene />
      {!result && (
        <>
          <VfxOverlay getSettings={readPresentationSettings} />
          <Hud />
          <EffectSettings />
        </>
      )}
      <ResultOverlay onRestart={onRestart} />
    </div>
  );
}
