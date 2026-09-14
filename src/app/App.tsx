import { useEffect, useState } from 'react';

import { attachKeyboardInput } from '@/input/keyboard/keyboard-adapter';
import { readPresentationSettings } from '@/presentation/presentation-store';
import { GameScene } from '@/rendering/scene/GameScene';
import { VfxOverlay } from '@/rendering/vfx/VfxOverlay';
import { useGameStore } from '@/store/game-store';
import { ResultOverlay } from '@/ui/result/ResultOverlay';
import { Hud } from '@/ui/hud/Hud';
import { EffectSettings } from '@/ui/settings/EffectSettings';

import { createCombatSession } from './combat-session';
import styles from './App.module.css';

export function App(): React.JSX.Element {
  const [battle, setBattle] = useState(0);
  return <Battle key={battle} onRestart={() => setBattle((value) => value + 1)} />;
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
