export const DEFAULT_CAMERA_CONSTRAINTS: MediaStreamConstraints = {
  audio: false,
  // 原画像は高解像度・高フレームレートで取得する。検出用Canvasでは縮小するため、
  // マーカーを少し動かした時のブレと情報量不足を避けつつ処理量を増やさない。
  video: {
    facingMode: 'user',
    width: { ideal: 1280 },
    height: { ideal: 720 },
    frameRate: { ideal: 60 },
  },
};

export async function requestWebcam(
  mediaDevices: Partial<Pick<MediaDevices, 'getUserMedia'>> = navigator.mediaDevices,
): Promise<MediaStream> {
  if (!mediaDevices?.getUserMedia) throw new Error('このブラウザはWebカメラに対応していません。');
  return mediaDevices.getUserMedia(DEFAULT_CAMERA_CONSTRAINTS);
}

/** コンポーネントのunmount時も含め、取得した全トラックを必ず止める。 */
export function stopWebcam(stream: { getTracks(): Array<{ stop(): void }> } | undefined): void {
  stream?.getTracks().forEach((track) => track.stop());
}
