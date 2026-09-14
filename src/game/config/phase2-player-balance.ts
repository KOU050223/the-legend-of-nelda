/**
 * 3人のプレイヤーの数値。docs/phase2-gameplay-spec.md §4 §5 /
 * docs/phase2-role-design-spec.md。
 *
 * キャラ差を**データとして分離する**ためのファイル (#56 完了条件
 * 「キャラごとの性能差がデータとして分離されている（コード分岐にしない）」)。
 * ロジック側は `CHARACTER_STATS[characterId]` を引くだけで、
 * `if (characterId === 'ODORUNO')` のような分岐を書かない。
 *
 * #45（三人の大輔の制約・強み）に「攻撃・回避性能の具体値」が保留として
 * 残っている。ここは仮値で、#45 の決定後に数値だけ差し替える
 * (#56「具体値が未決のまま実装を止めない」)。
 */

/** プレイアブルキャラクター。docs/phase2-role-design-spec.md。 */
export const CHARACTER_IDS = [
  /** オドルノDaisuke: 実働・前線・高機動・救助担当。 */
  'ODORUNO',
  /** Pay大輔: 情報・判断。性能は標準。 */
  'PAY',
  /** オラ大輔: 特殊操作・世界干渉。ARマーカー入力。 */
  'ORA',
] as const;

export type CharacterId = (typeof CHARACTER_IDS)[number];

export interface CharacterStats {
  /** 1秒あたりの移動量。 */
  moveSpeed: number;
  /** 最大HP。 */
  maxHp: number;
  /** 通常攻撃1段あたりの基準ダメージ。段ごとの倍率は COMBO_STEPS が持つ。 */
  attackPower: number;
  /** 回避の無敵時間 (ms)。 */
  dodgeInvulnerableMs: number;
  /** 回避で移動する距離。 */
  dodgeDistance: number;
  /** 回避後に再び回避できるまでの時間 (ms)。 */
  dodgeCooldownMs: number;
}

/**
 * キャラごとの性能。
 *
 * オドルノは「攻撃性能が高い / 回避性能が高い / 移動速度・機動力が高い」
 * (role-design-spec)。Pay を標準 (1.0) とし、オドルノをその上へ置く。
 * オラは入力方式が特殊なぶん、性能そのものは標準に寄せる。ARマーカーの
 * 精度で不利になる側へさらに低い数値を乗せると二重の罰になる。
 */
export const CHARACTER_STATS: Readonly<Record<CharacterId, CharacterStats>> = {
  ODORUNO: {
    moveSpeed: 9,
    maxHp: 100,
    attackPower: 14,
    dodgeInvulnerableMs: 400,
    dodgeDistance: 5,
    dodgeCooldownMs: 600,
  },
  PAY: {
    moveSpeed: 7,
    maxHp: 100,
    attackPower: 10,
    dodgeInvulnerableMs: 300,
    dodgeDistance: 4,
    dodgeCooldownMs: 800,
  },
  ORA: {
    moveSpeed: 7,
    maxHp: 100,
    attackPower: 10,
    dodgeInvulnerableMs: 300,
    dodgeDistance: 4,
    dodgeCooldownMs: 800,
  },
};

/** 通常攻撃1段の尺と倍率。docs/phase2-gameplay-spec.md §4.1。 */
export interface ComboStep {
  /** 振り始めてから判定が出るまで (ms)。 */
  windupMs: number;
  /** 判定が出ている尺 (ms)。 */
  activeMs: number;
  /** 判定後、次の入力を受け付けるまでの硬直 (ms)。 */
  recoverMs: number;
  /** attackPower への倍率。 */
  damageScale: number;
}

/**
 * 3段の連撃。§4.1「最大3段程度の簡単な連撃」。
 *
 * 後の段ほど硬直が長くダメージが高い。3段目を振り切ると隙が大きいので、
 * 「3段入れるか、2段で止めて回避するか」の判断が生まれる。
 *
 * 判定のタイミングはここが持つ。Animation Frame には置かない
 * (docs/technical-design.md §13 / #56 完了条件)。
 */
export const COMBO_STEPS: readonly ComboStep[] = [
  { windupMs: 150, activeMs: 100, recoverMs: 250, damageScale: 1 },
  { windupMs: 180, activeMs: 100, recoverMs: 300, damageScale: 1.2 },
  { windupMs: 250, activeMs: 150, recoverMs: 550, damageScale: 1.8 },
];

/**
 * 連撃が途切れるまでの猶予 (ms)。
 * この時間内に次の攻撃入力が来なければ1段目へ戻る。
 */
export const COMBO_WINDOW_MS = 700;

/** 通常攻撃が届く距離。§4.1「ボス付近では軽い方向補正」の補正もこの範囲内。 */
export const ATTACK_REACH = 3;

/**
 * 睡眠・蘇生の数値。docs/phase2-gameplay-spec.md §5.3。
 *
 * 仕様が幅を持つ値は中央付近を既定とし、プレイテストで調整する
 * (§5.3「数値はプレイテストで調整する」)。
 */
export interface RevivalBalance {
  /** HP0から完全に寝てしまうまで (ms)。仕様は8〜10秒。 */
  sleepCountdownMs: number;
  /** 1人で起こしたときに必要な時間 (ms)。仕様は3〜4秒。 */
  soloReviveMs: number;
  /** 蘇生できる距離。駆け寄る必要がある (§5.3)。 */
  reviveRange: number;
  /** 復帰時のHP。最大HPへの割合。仕様は30%程度。 */
  revivedHpRatio: number;
  /** 復帰直後の無敵時間 (ms)。§5.3「復帰直後：短時間の無敵を付与」。 */
  revivedInvulnerableMs: number;
}

export const DEFAULT_REVIVAL: RevivalBalance = {
  sleepCountdownMs: 9000,
  soloReviveMs: 3500,
  reviveRange: 3,
  revivedHpRatio: 0.3,
  revivedInvulnerableMs: 1500,
};

/**
 * 蘇生入力1回あたりに進むゲージ量 (0〜1)。
 *
 * 「連打で助ける」(§5.3) を、連打の回数がそのまま進捗になる形で表す。
 * 1回で `soloReviveMs` を割った量だけ進むので、1人が一定間隔で連打し続けると
 * ちょうど `soloReviveMs` で起き上がる。2人なら2倍の速さで進み、仕様の
 * 「2人で起こす：1.5〜2秒程度」に収まる。人数で分岐を書かずに済む。
 */
export const REVIVE_INPUT_INTERVAL_MS = 250;
