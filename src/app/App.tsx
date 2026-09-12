import { useEffect } from 'react';

import { attachKeyboardInput } from '@/input/keyboard/keyboard-adapter';
import { GameScene } from '@/rendering/scene/GameScene';
import { useGameStore } from '@/store/game-store';
import { Hud } from '@/ui/hud/Hud';

import styles from './App.module.css';

export function App(): React.JSX.Element {
  const recordAction = useGameStore((state) => state.recordAction);

  useEffect(() => attachKeyboardInput(recordAction), [recordAction]);

  return (
    <div className={styles.root}>
      <GameScene />
      <Hud />
    </div>
  );
}
