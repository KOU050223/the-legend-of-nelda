import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { NavieFairy } from './NavieFairy';

describe('ナビィの妖精モデル', () => {
  it('アニメーションなしでも本体・4枚の翼・3つの光球を描画する', () => {
    const { container } = render(<NavieFairy animate={false} />);

    expect(container.querySelectorAll('mesh')).toHaveLength(9);
  });
});
