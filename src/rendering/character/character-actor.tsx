import { forwardRef } from 'react';
import { Billboard } from '@react-three/drei';
import type { Group } from 'three';

import { reviveRatio, type PlayerSnapshot } from '@/game/player/player-state';

import { CharacterModel } from './CharacterModel';
import { CHARACTER_DISPLAY_HEIGHT } from './character-models';
import { motionContextFor } from './motion-context';
import type { MotionContext } from './motion-manifest';

export interface CharacterActorProps {
  /** 再レンダー対象の表示状態。HPバーとモデル選択がこの値を使う。 */
  player: PlayerSnapshot;
  /** 現在時刻 (GameClock の now)。連撃の局面を測ってモーションを決める。 */
  now: number;
  /** 親が前フレーム差分を計算済みなら、その条件をそのまま使う。 */
  context?: MotionContext | undefined;
  local?: boolean;
  /** 一人称では自分のClientだけ3Dモデルを隠す。 */
  hideModel?: boolean;
  /** 一人称では画面固定HUDへ移すため、自分の頭上HPバーを隠す。 */
  hideStatusBar?: boolean;
}

/**
 * プレイヤー1人分の3D表示境界。
 *
 * 位置・向き・モデル・HPバーを同じRootへ閉じ込める。位置・向きの更新は
 * 親のゲームフレームがRootへ反映し、ここは表示の階層だけを担当する。
 * そのため、位置更新のために毎フレームReactを再レンダーする必要がなく、
 * モデルとバーが別の座標系へ分かれることもない。
 *
 * 再生するモーションは状態から導く。判定のタイミングはゲームロジックが持ち、
 * ここは結果を読むだけにする (docs/technical-design.md §13)。
 */
export const CharacterActor = forwardRef<Group, CharacterActorProps>(function CharacterActor(
  { player, now, context, local = false, hideModel = false, hideStatusBar = false },
  ref,
): React.JSX.Element {
  return (
    <group ref={ref}>
      {!hideModel && (
        <CharacterModel
          characterId={player.characterId}
          context={context ?? motionContextFor(player, now)}
        />
      )}
      {!hideStatusBar && <StatusBar player={player} local={local} />}
    </group>
  );
});

/** バーの幅。追従カメラは近いので、頭上サイズで足りる。 */
const BAR_WIDTH = 1.4;
const BAR_HEIGHT = 0.16;

/**
 * 立っているときのバーの高さ。頭のすぐ上へ置く。
 *
 * キャラの表示高さ (CHARACTER_DISPLAY_HEIGHT) から決める。ここを固定値に
 * すると、モデルを差し替えて背の高さが変わったときにバーだけ頭上から離れ、
 * 別のキャラの上に浮いているように見える。
 */
const BAR_OVERHEAD_HEIGHT = CHARACTER_DISPLAY_HEIGHT + 0.25;

/** 倒れているときのバーの高さ。寝ている体の上に置く。 */
const BAR_DOWNED_HEIGHT = 0.6;

/**
 * 頭上のHPバー。倒れている間は蘇生ゲージに切り替わる。
 *
 * HUD は別Issueだが、これが無いと倒れた仲間が「連打1回目」なのか
 * 「あと1回で起きる」のかが画面から読めず、蘇生が成立しているかを
 * 目で確かめられない。最小限の表示だけ置く。
 */
function StatusBar({
  player,
  local = false,
}: {
  player: PlayerSnapshot;
  local?: boolean;
}): React.JSX.Element {
  const reviving = player.status === 'FALLING_ASLEEP';
  const ratio = reviving ? reviveRatio(player) : player.hp / player.hpMax;
  const color = reviving ? '#ffd60a' : local ? '#4cd964' : '#f2f2f7';

  // Actor Root が位置を持つので、バーは相対位置で置く。高さはキャラの表示高さ
  // から決める。固定値にすると、モデルの高さを変えたときに頭上から離れる。
  return (
    <Billboard position={[0, reviving ? BAR_DOWNED_HEIGHT : BAR_OVERHEAD_HEIGHT, 0]}>
      <mesh>
        <planeGeometry args={[BAR_WIDTH, BAR_HEIGHT]} />
        <meshBasicMaterial color="#1c1c1e" depthWrite={false} />
      </mesh>
      {/* 左端を固定して伸縮させるため、幅の半分だけ中心をずらす。 */}
      <mesh position={[(-BAR_WIDTH * (1 - ratio)) / 2, 0, 0.01]}>
        <planeGeometry args={[BAR_WIDTH * ratio, BAR_HEIGHT]} />
        <meshBasicMaterial color={color} depthWrite={false} />
      </mesh>
    </Billboard>
  );
}
