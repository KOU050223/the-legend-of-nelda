import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { FinaleOverlay } from './FinaleOverlay';

describe('FinaleOverlay', () => {
  it('エンディングでは横組みのタイトルへ戻るボタンだけを表示する', () => {
    render(
      <FinaleOverlay
        phase="NO_SLEEP_MODE"
        finale="ENDING"
        zeroDamageSequence={0}
        microphoneStatus="idle"
        playedMelodyNotes={[]}
        melodyMissSequence={0}
        melodyExpected={null}
        showMelodyHint={false}
      />,
    );

    expect(screen.getByRole('button', { name: 'タイトルに戻る' })).toBeInTheDocument();
    expect(screen.queryByText('本日の睡眠時間　8時間00分')).not.toBeInTheDocument();
  });
});
