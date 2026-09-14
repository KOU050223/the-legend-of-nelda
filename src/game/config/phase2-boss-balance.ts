/**
 * 堀大輔（Phase 2 ボス）の数値。docs/phase2-gameplay-spec.md §8 §9 §10 §12。
 *
 * Phase 1 の `combat-balance.ts` とは別ファイルにする。あちらの
 * `DEFAULT_ATTACK_DAMAGE` は `sleepinessDamage`（= プレイヤーの眠気ゲージ）を
 * 前提に `vitals.ts` から引かれており、Phase 2 の「プレイヤーHPを削る攻撃」を
 * 同じ表へ混ぜると、片方の技に意味のない値を埋めることになる。
 *
 * プレイテストで一番よく触る値なので、技ごとの数値はすべてここへ集約する
 * (Issue #58「技ごとの数値が設定へ集約されている」)。
 */

/** 堀大輔のHP初期値。割合でフェーズが決まるので分母でもある。 */
export const HORI_INITIAL_HP = 1000;

/** Phase 2 で実装する通常攻撃。docs/phase2-gameplay-spec.md §9。 */
export const HORI_ATTACK_IDS = [
  /** 9.1 絶対起床アラーム: 全方位の巨大衝撃波。張り付きへの罰。 */
  'WAKE_UP_ALARM',
  /** 9.2 ブルーライト照射: 1人を狙う追尾ビーム。走って逃げる。 */
  'BLUE_LIGHT',
  /** 9.3 睡眠時間圧縮フィールド: 地面の複数箇所を危険エリア化。 */
  'COMPRESSION_FIELD',
  /** 9.4 早朝ルーティン突進: 直線の高速突進。横へ回避。 */
  'MORNING_DASH',
] as const;

export type HoriAttackId = (typeof HORI_ATTACK_IDS)[number];

/**
 * 危険範囲の形。当たり判定と、危険範囲の描画の両方がこれを読む。
 *
 * 「危険範囲が視覚的に読める」(Issue #58 完了条件) を満たすには、判定に使う
 * 形と表示する形が同じ1つの値でなければならない。別々に持つと演出の調整で
 * ずれ、B級演出が情報を潰す。
 */
export type DangerShape =
  /** ボス中心の全方位リング。`innerRadius` の内側は安全（アラームの足元）。 */
  | { kind: 'RING'; innerRadius: number; outerRadius: number }
  /** ボスから伸びる矩形。突進の軌道。 */
  | { kind: 'LINE'; length: number; halfWidth: number }
  /** 任意座標を中心とした円。追尾ビームの着弾点・圧縮フィールドの各区画。 */
  | { kind: 'CIRCLE'; radius: number };

/** 1つの技の尺と当たり方。ms は実時間。 */
export interface HoriAttackSpec {
  /**
   * 予兆の尺。プレイヤーはこの間に危険範囲を読んで回避する
   * (Issue #58「予兆を見て回避でき」)。
   */
  telegraphMs: number;
  /** 判定が出ている尺。この間に危険範囲へ居ると被弾する。 */
  activeMs: number;
  /** 判定後の硬直。次の技はこれが明けてから始まる。 */
  recoverMs: number;
  /** 命中時にプレイヤーHPから引く量。 */
  damage: number;
  /** 危険範囲の形。 */
  shape: DangerShape;
}

/**
 * 技ごとの既定値。
 *
 * 予兆の尺は「読んで動けるか」で決めてある。突進 (900ms) が一番短く、
 * 圧縮フィールド (1800ms) が一番長い。フィールドは安全地帯を探して
 * 走る距離が長いため (§9.3「安全地帯へ移動する」)。
 *
 * ダメージは HORI_INITIAL_HP ではなくプレイヤーHP (#56 未実装のため
 * 100 を仮定) に対する割合として読む。アラームが最大 (25) なのは
 * 「張り付き続けることへの罰」(§9.1) を数値でも表すため。
 */
export const DEFAULT_HORI_ATTACKS: Readonly<Record<HoriAttackId, HoriAttackSpec>> = {
  WAKE_UP_ALARM: {
    telegraphMs: 1400,
    activeMs: 400,
    recoverMs: 1200,
    damage: 25,
    // 足元だけが安全。距離を取るか、逆に潜り込むかの2択にする。
    shape: { kind: 'RING', innerRadius: 3, outerRadius: 18 },
  },
  BLUE_LIGHT: {
    telegraphMs: 1200,
    activeMs: 600,
    recoverMs: 900,
    damage: 15,
    shape: { kind: 'CIRCLE', radius: 3.5 },
  },
  COMPRESSION_FIELD: {
    telegraphMs: 1800,
    activeMs: 1500,
    recoverMs: 1000,
    damage: 18,
    shape: { kind: 'CIRCLE', radius: 6 },
  },
  MORNING_DASH: {
    telegraphMs: 900,
    activeMs: 500,
    recoverMs: 1100,
    damage: 20,
    shape: { kind: 'LINE', length: 30, halfWidth: 2.5 },
  },
};

/** 睡眠時間圧縮フィールドが同時に展開する危険区画の数。 */
export const COMPRESSION_FIELD_ZONE_COUNT = 5;

/** 危険区画を並べるリングの内径・外径。アリーナ半径 (#54) より内側に収める。 */
export const COMPRESSION_FIELD_RING = { innerRadius: 6, outerRadius: 22 } as const;

/** ブルーライト照射のビームが追尾する速さ (1秒あたりの距離)。 */
export const BLUE_LIGHT_TRACKING_SPEED = 6;

/** 技と技のあいだの待ち時間。recoverMs の後にさらに空ける。 */
export const HORI_ATTACK_INTERVAL_MS = 1500;

/**
 * カフェイン・オーバードライブの倍率。docs/phase2-gameplay-spec.md §10。
 *
 * 新技は足さず、既存4技の尺と間隔を縮めるだけにする
 * (§10「新しい攻撃を大量追加せず、既存攻撃を高速化・複合化する」)。
 * ダメージ倍率は控えめにしてある。速くなっただけで避けにくくなるので、
 * そこへダメージも乗せると事故死が増えて「読んで避ける」が成立しなくなる。
 */
export interface OverdriveModifiers {
  /** 予兆の尺への倍率。1未満で短くなる。 */
  telegraphScale: number;
  /** 硬直と技間インターバルへの倍率。 */
  recoverScale: number;
  /** ダメージへの倍率。 */
  damageScale: number;
  /** ボスの移動速度への倍率。 */
  moveSpeedScale: number;
}

export const OVERDRIVE_MODIFIERS: OverdriveModifiers = {
  telegraphScale: 0.65,
  recoverScale: 0.5,
  damageScale: 1.2,
  moveSpeedScale: 1.4,
};

/** 倍率を掛けない素の状態。オーバードライブ前のフェーズで使う。 */
export const NEUTRAL_MODIFIERS: OverdriveModifiers = {
  telegraphScale: 1,
  recoverScale: 1,
  damageScale: 1,
  moveSpeedScale: 1,
};

/** 堀大輔の基本移動速度 (1秒あたり)。 */
export const HORI_MOVE_SPEED = 4;

/** BOSS DOWN (総攻撃を受けられる状態) の継続時間。§11.2。 */
export const BOSS_DOWN_DURATION_MS = 6000;
