import { describe, expect, it, vi } from 'vitest';

import { MOTION_MODELS } from '@/rendering/character/motion-manifest';

import { initialDraft, nextUnusedCondition, saveDraft } from './motion-draft';

describe('GUIの下書き', () => {
  it('マニフェストの現在値から始まる', () => {
    expect(initialDraft()['star-platinum']).toEqual(MOTION_MODELS['star-platinum'].rules);
  });

  it('まだ使っていない条件を返す', () => {
    expect(nextUnusedCondition([{ when: 'attacking', clip: 'punch' }])).toBe('fallingAsleep');
  });

  it('条件を使い切っていれば null', () => {
    const all = [
      { when: 'attacking', clip: 'x' },
      { when: 'fallingAsleep', clip: 'x' },
      { when: 'asleep', clip: 'x' },
      { when: 'moving', clip: 'x' },
      { when: 'dodging', clip: 'x' },
    ] as const;

    expect(nextUnusedCondition(all)).toBeNull();
  });
});

describe('マニフェストの保存', () => {
  const draft = { ...initialDraft(), 'star-platinum': [{ when: 'asleep', clip: 'idle' }] } as const;

  it('ルールだけを開発サーバーへ送る', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}'));
    vi.stubGlobal('fetch', fetchMock);

    await saveDraft(draft);

    const call: unknown[] = fetchMock.mock.calls[0] ?? [];
    const [url, init] = call;
    expect(url).toBe('/__motion-manifest');

    const body = typeof init === 'object' && init !== null && 'body' in init ? init.body : null;
    expect(JSON.parse(String(body))).toMatchObject({
      'star-platinum': [{ when: 'asleep', clip: 'idle' }],
    });

    vi.unstubAllGlobals();
  });

  it('成功したら null', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(new Response('{}')));

    expect(await saveDraft(draft)).toBeNull();

    vi.unstubAllGlobals();
  });

  /** 開発サーバー以外で開くと口が無い。理由を画面へ出せる形で返す。 */
  it('失敗したら理由を返す', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue(new Response('not found', { status: 404 })),
    );

    expect(await saveDraft(draft)).toBe('404 not found');

    vi.unstubAllGlobals();
  });

  it('通信そのものが失敗しても落ちない', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockRejectedValue(new Error('offline')));

    expect(await saveDraft(draft)).toBe('offline');

    vi.unstubAllGlobals();
  });
});
