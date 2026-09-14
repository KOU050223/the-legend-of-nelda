export const DEFAULT_CAMERA_CONSTRAINTS: MediaStreamConstraints = {
  audio: false,
  video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
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
