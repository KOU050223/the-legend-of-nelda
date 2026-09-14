import { lazy, Suspense, useEffect, useState } from 'react';

import { attachKeyboardInput } from '@/input/keyboard/keyboard-adapter';
import { readPresentationSettings } from '@/presentation/presentation-store';
import { GameScene } from '@/rendering/scene/GameScene';
import { VfxOverlay } from '@/rendering/vfx/VfxOverlay';
import { useGameStore } from '@/store/game-store';
import { ResultOverlay } from '@/ui/result/ResultOverlay';
import { Hud } from '@/ui/hud/Hud';
import { EffectSettings } from '@/ui/settings/EffectSettings';
import { OraDebugPage } from '@/ui/ora-debug/OraDebugPage';

import { isWorldSceneRequested } from './scene-mode';
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

export function App(): React.JSX.Element {
  const [battle, setBattle] = useState(0);

  if (new URLSearchParams(window.location.search).get('debug') === 'ora') {
    return <OraDebugPage />;
  }

  // ワールド探索モード (Issue #41 の動作確認用) は戦闘一式を起動しない。
  // 起動すると WASD が移動と同時に DODGE/GUARD としても解釈され、戦闘の
  // 時計・入力ロックが進んでしまい、Character基盤の確認にならない。
  if (isWorldSceneRequested()) {
    return (
      <div className={styles.root}>
        <GameScene />
        <MicrophoneDebugPanel />
      </div>
    );
  }

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
