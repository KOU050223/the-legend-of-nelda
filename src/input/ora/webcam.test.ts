import { describe, expect, it } from 'vitest';

import { requestWebcam, stopWebcam } from './webcam';

describe('webcam', () => {
  it('Webカメラに対応しない環境では分かるエラーを返す', async () => {
    const request = requestWebcam({});

    await expect(request).rejects.toThrow('Webカメラに対応していません');
  });

  it('停止時に取得した全トラックを止める', () => {
    let firstStopped = false;
    let secondStopped = false;
    const stream = {
      getTracks: () => [
        {
          stop: () => {
            firstStopped = true;
          },
        },
        {
          stop: () => {
            secondStopped = true;
          },
        },
      ],
    };

    stopWebcam(stream);

    expect(firstStopped).toBe(true);
    expect(secondStopped).toBe(true);
  });
});
