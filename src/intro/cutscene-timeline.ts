export interface CutsceneShot {
  durationMs: number;
  subtitle: string;
  camera: readonly [number, number, number];
  lookAt: readonly [number, number, number];
  focus:
    | 'RUINS_WIDE'
    | 'RUINS_APPROACH'
    | 'WORLD'
    | 'HORI'
    | 'REVEAL'
    | 'ODORUNO'
    | 'PAY'
    | 'ORA'
    | 'FINAL';
}

export const INTRO_SHOTS: readonly CutsceneShot[] = [
  {
    durationMs: 3_200,
    subtitle: 'この世界には古くから、三つの不思議な力が存在していた――',
    camera: [19, 10, 22],
    lookAt: [0, 3, -5],
    focus: 'RUINS_WIDE',
  },
  {
    durationMs: 3_300,
    subtitle: '見ざる　　聞かざる　　言わざる',
    camera: [11, 4.5, 12],
    lookAt: [-0.8, 3, -4.5],
    focus: 'RUINS_APPROACH',
  },
  {
    durationMs: 3_300,
    subtitle: 'しかし――「聞かざる」の力を持つ男、堀大輔は……',
    camera: [2, 2.4, 7],
    lookAt: [0, 1, -3],
    focus: 'HORI',
  },
  {
    durationMs: 2_800,
    subtitle: 'ショートスリーパーに目覚めた。\n「人間に長い睡眠など必要ない。」',
    camera: [0, 1.4, 4.7],
    lookAt: [0, 1, -3],
    focus: 'HORI',
  },
  {
    durationMs: 2_800,
    subtitle: '世界から、安眠が失われていく――',
    camera: [11, 8, 12],
    lookAt: [0, 0, -2],
    focus: 'WORLD',
  },
  {
    durationMs: 3_200,
    subtitle: '世界に再び安眠を取り戻すため――',
    camera: [9, 3.4, 10],
    lookAt: [0, 1, 1],
    focus: 'REVEAL',
  },
  {
    durationMs: 3_100,
    subtitle: '三人の大輔が立ち上がった。',
    camera: [0, 2.2, 10],
    lookAt: [0, 1, 0],
    focus: 'FINAL',
  },
  {
    durationMs: 2_400,
    subtitle: 'オドルノ Daisuke　― 見ざる ―',
    camera: [-5, 2, 5],
    lookAt: [-3, 1, 0],
    focus: 'ODORUNO',
  },
  {
    durationMs: 2_400,
    subtitle: 'Pay 大輔　― 言わざる ―',
    camera: [0, 2, 5],
    lookAt: [0, 1, 0],
    focus: 'PAY',
  },
  {
    durationMs: 2_400,
    subtitle: 'オラ 大輔　― せざる ―',
    camera: [5, 2, 5],
    lookAt: [3, 1, 0],
    focus: 'ORA',
  },
  {
    durationMs: 2_800,
    subtitle: 'THE LEGEND OF NELDA\n〜3人の勇者と眠らない男〜',
    camera: [0, 3, 12],
    lookAt: [0, 1, 0],
    focus: 'FINAL',
  },
];

export const INTRO_DURATION_MS = INTRO_SHOTS.reduce((total, shot) => total + shot.durationMs, 0);

export function shotAt(elapsedMs: number): CutsceneShot {
  let elapsed = 0;
  for (const shot of INTRO_SHOTS) {
    elapsed += shot.durationMs;
    if (elapsedMs < elapsed) return shot;
  }
  return INTRO_SHOTS.at(-1)!;
}
