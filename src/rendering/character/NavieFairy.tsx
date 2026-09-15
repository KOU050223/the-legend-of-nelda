import { useFrame } from '@react-three/fiber';
import { useMemo, useRef, type ReactNode } from 'react';
import type { Group } from 'three';
import { DoubleSide, Shape } from 'three';

export interface NavieFairyProps {
  /** 浮遊と全体の揺れを止める。プレビューやスクリーンショットにも使える。 */
  animate?: boolean;
}

const WING_ROTATIONS = [0.14, Math.PI - 0.14, 0.82, Math.PI - 0.82];
const MOTE_POSITIONS: [number, number, number][] = [
  [-0.47, -0.72, 0.08],
  [0.2, -0.88, 0.1],
  [0.52, -0.66, 0.05],
];

function createWingShape(): Shape {
  const shape = new Shape();
  shape.moveTo(0, 0);
  shape.bezierCurveTo(0.32, 0.08, 0.92, 0.16, 1.35, 0.62);
  shape.bezierCurveTo(1.02, 0.5, 0.5, 0.28, 0, 0.08);
  shape.closePath();
  return shape;
}

/**
 * ナビィを参考にした軽量な妖精モデル。
 *
 * 原点は中央の光球。外部モデル・テクスチャを使わず、9メッシュだけで
 * 光球、4枚の翼、小さな光の粒を表現する。
 */
export function NavieFairy({ animate = true }: NavieFairyProps): React.JSX.Element {
  const wingShape = useMemo(() => createWingShape(), []);

  const parts = (
    <group>
      <mesh castShadow>
        <sphereGeometry args={[0.42, 16, 12]} />
        <meshStandardMaterial color="#087fd4" emissive="#0754a8" emissiveIntensity={0.8} />
      </mesh>
      <mesh scale={0.72}>
        <sphereGeometry args={[0.42, 12, 8]} />
        <meshBasicMaterial color="#d8fff2" transparent opacity={0.88} />
      </mesh>

      {WING_ROTATIONS.map((rotation, index) => (
        <mesh
          key={rotation}
          rotation={[0, 0, rotation]}
          scale={index < 2 ? 1 : 0.58}
          position={[0, index < 2 ? 0.08 : -0.03, -0.02]}
        >
          <shapeGeometry args={[wingShape]} />
          <meshStandardMaterial
            color="#b9d7f2"
            emissive="#6a9fe0"
            emissiveIntensity={0.25}
            transparent
            opacity={0.56}
            side={DoubleSide}
            depthWrite={false}
          />
        </mesh>
      ))}

      {MOTE_POSITIONS.map((position, index) => (
        <mesh key={position.join(',')} position={position} scale={index === 0 ? 0.72 : 0.46}>
          <sphereGeometry args={[0.12, 10, 8]} />
          <meshBasicMaterial color="#57c5ed" />
        </mesh>
      ))}
    </group>
  );

  return animate ? <NavieFairyMotion>{parts}</NavieFairyMotion> : parts;
}

function NavieFairyMotion({ children }: { children: ReactNode }): React.JSX.Element {
  const root = useRef<Group>(null);
  const phase = useRef(0);

  useFrame((_, delta) => {
    phase.current += delta;
    if (!root.current) return;
    root.current.position.y = Math.sin(phase.current * 1.5) * 0.06;
    root.current.rotation.z = Math.sin(phase.current * 1.2) * 0.025;
  });

  return <group ref={root}>{children}</group>;
}
