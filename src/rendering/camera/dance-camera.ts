import { Vector3, type Camera } from 'three';

export type DanceCameraMode = 'third-person' | 'overhead' | 'first-person';
export type DanceCameraProfile = 'normal' | 'debug';

const DANCE_CAMERA_MODES: readonly DanceCameraMode[] = ['third-person', 'overhead', 'first-person'];

/** 同じ視点を連続させず、見ざる用の次の強制視点を選ぶ。 */
export function nextDanceCameraMode(
  current: DanceCameraMode,
  random: () => number = Math.random,
): DanceCameraMode {
  const candidates = DANCE_CAMERA_MODES.filter((mode) => mode !== current);
  return candidates[Math.min(Math.floor(random() * candidates.length), candidates.length - 1)]!;
}

export interface DanceCameraOffset {
  readonly yaw: number;
  readonly pitch: number;
  readonly roll: number;
  readonly bobY: number;
  /** Cameraのローカル右方向へのスイング。 */
  readonly swayX: number;
  /** 正なら注視対象へ近づく。 */
  readonly zoom: number;
}

interface DanceCameraTuning {
  readonly yaw: number;
  readonly pitch: number;
  readonly roll: number;
  readonly bobY: number;
  readonly swayX: number;
  readonly zoom: number;
}

/** Mode 別に酔いやすさを抑えるための上限値。角度の単位は radians。 */
export const DANCE_CAMERA_LOOP_SECONDS = 4;

export interface DanceCameraDebugSettings {
  readonly visible: boolean;
  readonly enabled: boolean;
  /** ODORUNOにだけ、明確な可視確認用の強度を使う。 */
  readonly force: boolean;
  readonly intensity: number;
  readonly speed: number;
}

const TUNING: Readonly<
  Record<DanceCameraProfile, Readonly<Record<DanceCameraMode, DanceCameraTuning>>>
> = {
  normal: {
    // 「ほぼ見えない」に近づける。ただし180°反転はせず、拍の合間にだけボスを
    // 捉えられる余地を残す。入力用yawとは完全に別のPresentation値。
    'third-person': { yaw: 0.42, pitch: 0.24, roll: 0.22, bobY: 0.9, swayX: 1.2, zoom: 1.4 },
    overhead: { yaw: 0.36, pitch: 0.2, roll: 0.18, bobY: 0.65, swayX: 0.9, zoom: 1 },
    // 一人称も回避不能な強度にするが、位置移動は小さくしてモデル内へのめり込みは避ける。
    'first-person': { yaw: 0.28, pitch: 0.17, roll: 0.15, bobY: 0.15, swayX: 0.2, zoom: 0.25 },
  },
  // debug は実際に合成されているかを判別するための強制値。20°/10°/12°前後。
  debug: {
    'third-person': { yaw: 0.58, pitch: 0.32, roll: 0.32, bobY: 1.1, swayX: 1.5, zoom: 1.7 },
    overhead: { yaw: 0.5, pitch: 0.27, roll: 0.27, bobY: 0.85, swayX: 1.15, zoom: 1.25 },
    'first-person': { yaw: 0.4, pitch: 0.23, roll: 0.21, bobY: 0.2, swayX: 0.28, zoom: 0.32 },
  },
};

const cameraForward = new Vector3();
const cameraRight = new Vector3();

/**
 * 開発時の `?debug=dance-camera` は、ODORUNOにだけ明確な可視確認用の強度を
 * 強制する。role 判定そのものは絶対に上書きしない。
 */
export function readDanceCameraDebugSettings(search = ''): DanceCameraDebugSettings {
  const query = new URLSearchParams(search);
  const isDebugBuild = import.meta.env.DEV;
  const number = (name: string, fallback: number, maximum: number) => {
    const raw = query.get(name);
    // Number(null) は 0 になる。query を省略した通常のdebug URLまで
    // intensity/speed 0 と解釈すると、表示だけ動いてCamera offsetが消える。
    if (raw === null || raw.trim() === '') return fallback;
    const value = Number(raw);
    return Number.isFinite(value) ? Math.min(Math.max(value, 0), maximum) : fallback;
  };

  return {
    visible: isDebugBuild && query.get('debug') === 'dance-camera',
    enabled: !isDebugBuild || query.get('dance-camera') !== 'off',
    force: isDebugBuild && query.get('debug') === 'dance-camera',
    intensity: isDebugBuild ? number('dance-intensity', 1, 1.5) : 1,
    speed: isDebugBuild ? number('dance-speed', 1, 2) : 1,
  };
}

/**
 * 時刻だけから再現できる、オドルノ用の決め打ちダンス曲線。
 * 前フレームの transform を参照しないため、Camera Mode の切替や長時間プレイで
 * offset が蓄積しない。
 */
export function danceCameraOffset(
  elapsedSeconds: number,
  mode: DanceCameraMode,
  intensity = 1,
  profile: DanceCameraProfile = 'normal',
): DanceCameraOffset {
  const tuning = TUNING[profile][mode];
  const phase =
    ((elapsedSeconds % DANCE_CAMERA_LOOP_SECONDS) / DANCE_CAMERA_LOOP_SECONDS) * Math.PI * 2;
  const amount = Math.max(0, intensity);
  // 低周波の拍を重ね、単なるランダム shake ではない予測可能なリズムにする。
  // 2拍ごとの大振りが「今カメラ壊れた？」というB級の首振りを作る。
  // 連続値なので瞬間移動やランダム shake にはならない。
  const sideGlance = Math.max(0, Math.sin(phase * 2 - 0.45)) ** 8 * tuning.yaw * 0.64;

  return {
    yaw:
      (Math.sin(phase) * tuning.yaw + Math.sin(phase * 2 - 0.7) * tuning.yaw * 0.26 + sideGlance) *
      amount,
    pitch:
      (Math.sin(phase * 2 + 1.15) * tuning.pitch + Math.sin(phase) * tuning.pitch * 0.2) * amount,
    roll: Math.sin(phase * 2 - 0.3) * tuning.roll * amount,
    bobY: (0.5 + Math.sin(phase * 2 - 0.65) * 0.5) * tuning.bobY * amount,
    swayX: Math.sin(phase * 2 + 0.4) * tuning.swayX * amount,
    zoom: Math.sin(phase - 1.2) * tuning.zoom * amount,
  };
}

/** Base Camera が作ったそのフレームの transform へ、一度だけ presentation を重ねる。 */
export function applyDanceCameraOffset(camera: Camera, offset: DanceCameraOffset): void {
  // zoom はダンス前の視線方向で動かす。回転後の transform を入力や次フレームの
  // Base Camera 計算に渡さないことが、非累積の前提になる。
  camera.getWorldDirection(cameraForward);
  cameraRight.set(1, 0, 0).applyQuaternion(camera.quaternion);
  camera.position.addScaledVector(cameraForward, offset.zoom);
  camera.position.addScaledVector(cameraRight, offset.swayX);
  camera.position.y += offset.bobY;
  camera.rotateY(offset.yaw);
  camera.rotateX(offset.pitch);
  camera.rotateZ(offset.roll);
}
