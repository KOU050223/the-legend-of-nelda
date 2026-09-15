import { describe, expect, it, vi } from 'vitest';

import { isValidClipName, isValidFbxName, uploadMotion } from './motion-upload';

describe('FBXの名前', () => {
  it('.fbx を受け付ける', () => {
    expect(isValidFbxName('walking.fbx')).toBe(true);
    expect(isValidFbxName('Sleeping Idle.FBX')).toBe(true);
  });

  it('拡張子が違えば断る', () => {
    expect(isValidFbxName('walking.glb')).toBe(false);
    expect(isValidFbxName('walking')).toBe(false);
  });

  /** ディレクトリを跨げる名前は置き場所の外を触れてしまう。 */
  it('区切り文字を含む名前は断る', () => {
    expect(isValidFbxName('../../etc/passwd.fbx')).toBe(false);
    expect(isValidFbxName('sub/dir.fbx')).toBe(false);
    expect(isValidFbxName('back\\slash.fbx')).toBe(false);
  });

  it('拡張子だけの名前は断る', () => {
    expect(isValidFbxName('.fbx')).toBe(false);
  });
});

describe('クリップ名', () => {
  it('普通の名前は通る', () => {
    expect(isValidClipName('walk')).toBe(true);
  });

  it('空や空白だけは断る', () => {
    expect(isValidClipName('')).toBe(false);
    expect(isValidClipName('   ')).toBe(false);
  });
});

describe('モーションの送信', () => {
  const fbx = new File([new Uint8Array([1, 2, 3])], 'walking.fbx');

  it('モデル・クリップ・ループ・ファイルを送る', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response('built'));
    vi.stubGlobal('fetch', fetchMock);

    await uploadMotion('hori-daisuke', 'walk', true, fbx);

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('/__motion-upload');

    const body = init?.body;
    expect(body).toBeInstanceOf(FormData);

    const form = body instanceof FormData ? body : new FormData();
    expect(form.get('modelId')).toBe('hori-daisuke');
    expect(form.get('clip')).toBe('walk');
    expect(form.get('loop')).toBe('true');
    expect(form.get('file')).toBeInstanceOf(File);

    vi.unstubAllGlobals();
  });

  it('成功すればクリップ名を返す', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(new Response('ok')));

    expect(await uploadMotion('hori-daisuke', 'walk', true, fbx)).toMatchObject({
      ok: true,
      clip: 'walk',
    });

    vi.unstubAllGlobals();
  });

  /**
   * ビルドが失敗したときの Blender の出力は、そのまま画面へ出す。
   * ボーン名の食い違いがそこに並ぶので、一番の手がかりになる。
   */
  it('失敗したらBlenderの出力をそのまま持って返る', async () => {
    const log = 'bone set differs from base rig (not in base: [...])';
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue(new Response(log, { status: 422 })),
    );

    expect(await uploadMotion('hori-daisuke', 'walk', true, fbx)).toMatchObject({
      ok: false,
      log,
    });

    vi.unstubAllGlobals();
  });

  it('通信そのものが失敗しても落ちない', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockRejectedValue(new Error('offline')));

    expect(await uploadMotion('hori-daisuke', 'walk', true, fbx)).toMatchObject({
      ok: false,
      message: 'offline',
    });

    vi.unstubAllGlobals();
  });
});
