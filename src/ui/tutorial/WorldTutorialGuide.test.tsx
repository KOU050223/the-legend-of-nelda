import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { WorldTutorialGuide } from './WorldTutorialGuide';

describe('WorldTutorialGuide', () => {
  it('ワールドの操作方法を表示する', () => {
    render(<WorldTutorialGuide />);

    expect(screen.getByRole('status')).toHaveTextContent('WASD / 矢印キー：移動');
    expect(screen.getByRole('status')).toHaveTextContent('SPACE / J：攻撃');
    expect(screen.getByRole('status')).toHaveTextContent('SHIFT：回避');
    expect(screen.getByRole('status')).toHaveTextContent('E：調べる');
  });
});
