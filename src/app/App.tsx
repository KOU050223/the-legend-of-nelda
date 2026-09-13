import { useEffect } from 'react';

import { attachKeyboardInput } from '@/input/keyboard/keyboard-adapter';
import { readPresentationSettings } from '@/presentation/presentation-store';
import { GameScene } from '@/rendering/scene/GameScene';
import { VfxOverlay } from '@/rendering/vfx/VfxOverlay';
import { useGameStore } from '@/store/game-store';
import { Hud } from '@/ui/hud/Hud';
import { EffectSettings } from '@/ui/settings/EffectSettings';

import { createCombatSession } from './combat-session';
import styles from './App.module.css';

export function App(): React.JSX.Element {
  useEffect(() => {
    // 戦闘一式はこの Effect の中で作って同じ Effect で捨てる。StrictMode の
    // 二重マウントでもループと購読が二重に残らないようにするため。
    const session = createCombatSession();
    const { recordAction } = useGameStore.getState();

    const detachKeyboard = attachKeyboardInput((action) => {
      // ACTION_UI の直近入力表示は受理・不受理によらず押した内容を出す。
      recordAction(action);
      session.submitAction(action);
    });

    return () => {
      detachKeyboard();
      session.dispose();
    };
  }, []);

  return (
    <div className={styles.root}>
      <GameScene />
      <VfxOverlay getSettings={readPresentationSettings} />
      <Hud />
      <EffectSettings />
    </div>
  );
}
