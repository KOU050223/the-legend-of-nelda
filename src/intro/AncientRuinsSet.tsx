import { useMemo } from 'react';
import { AdditiveBlending, BufferGeometry, Float32BufferAttribute } from 'three';

type MonumentKind = 'EYES' | 'EARS' | 'MOUTH';

const PILLARS: readonly [number, number, number, number][] = [
  [-12, 0, 5, -0.12],
  [11, 0, 7, 0.18],
  [-15, 0, -6, 0.06],
  [14, 0, -8, -0.08],
];

const MOUNTAINS: readonly [number, number, number, number][] = [
  [-21, 2.5, -22, 7],
  [-12, 2, -25, 5],
  [12, 3, -25, 8],
  [23, 2, -21, 6],
];

/**
 * イントロ冒頭だけに置く、カメラ映え優先の小規模な映画セット。
 * プレイ用の衝突・移動・ナビゲーションは持たせず、低ポリの層を重ねて
 * 「三つの力が祀られた場所」を短時間で見せる。
 */
export function AncientRuinsSet({
  villainAwakened = false,
}: {
  villainAwakened?: boolean;
}): React.JSX.Element {
  return (
    <>
      <fog attach="fog" args={['#263555', 22, 62]} />
      <ambientLight intensity={1.05} color="#a8b9ff" />
      <directionalLight position={[-14, 18, -12]} intensity={4.8} color="#9eb8ff" />
      <pointLight position={[-6, 4, 1]} intensity={42} distance={18} decay={0} color="#ff9a4b" />
      <pointLight position={[6, 4, 1]} intensity={42} distance={18} decay={0} color="#ff9a4b" />
      <pointLight position={[0, 5, -3]} intensity={18} distance={16} decay={0} color="#789dff" />
      <pointLight position={[0, 9, -16]} intensity={2.5} distance={36} decay={0} color="#95aaff" />
      <HoriRimLights awakened={villainAwakened} />
      <Moon />
      <RuinsGround />
      <DistantMountains />
      <ForegroundPillars />
      <CentralAltar />
      <StoneMonkeyMonument kind="EYES" position={[-7, 0, -6]} rotationY={0.16} />
      <StoneMonkeyMonument kind="EARS" position={[0, 0, -13]} />
      <StoneMonkeyMonument kind="MOUTH" position={[7, 0, -6]} rotationY={-0.16} />
      <Torches />
      <Dust />
    </>
  );
}

function HoriRimLights({ awakened }: { awakened: boolean }): React.JSX.Element | null {
  if (!awakened) return null;

  return (
    <>
      <pointLight position={[0, 5, -2]} intensity={28} distance={18} decay={0} color="#b894ff" />
      <pointLight position={[-3, 3, 1]} intensity={9} distance={12} decay={0} color="#84b7ff" />
    </>
  );
}

function RuinsGround(): React.JSX.Element {
  return (
    <>
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[70, 70]} />
        <meshStandardMaterial color="#242839" roughness={1} />
      </mesh>
      <mesh position={[0, 0.015, -5]} rotation-x={-Math.PI / 2}>
        <circleGeometry args={[15, 8]} />
        <meshStandardMaterial color="#3b4050" roughness={0.95} />
      </mesh>
    </>
  );
}

function Moon(): React.JSX.Element {
  return (
    <>
      <mesh position={[4, 11, -29]}>
        <sphereGeometry args={[5.8, 20, 16]} />
        <meshBasicMaterial color="#dce6ff" />
      </mesh>
      <mesh position={[4, 11, -28.4]}>
        <sphereGeometry args={[6.4, 20, 16]} />
        <meshBasicMaterial color="#6b7cba" transparent opacity={0.18} />
      </mesh>
    </>
  );
}

function DistantMountains(): React.JSX.Element {
  return (
    <>
      {MOUNTAINS.map(([x, y, z, scale]) => (
        <mesh key={`${x}-${z}`} position={[x, y, z]} scale={[scale, scale, scale]}>
          <dodecahedronGeometry args={[1, 0]} />
          <meshStandardMaterial color="#252c45" flatShading roughness={1} />
        </mesh>
      ))}
      <mesh position={[-18, 8, -30]} scale={[3, 14, 3]}>
        <coneGeometry args={[1, 1, 5]} />
        <meshStandardMaterial color="#1c2237" flatShading roughness={1} />
      </mesh>
    </>
  );
}

function ForegroundPillars(): React.JSX.Element {
  return (
    <>
      {PILLARS.map(([x, y, z, rotationY], index) => (
        <group key={`${x}-${z}`} position={[x, y, z]} rotation-y={rotationY}>
          <mesh position={[0, 4.6, 0]} rotation-z={index < 2 ? 0.08 : -0.05}>
            <cylinderGeometry args={[0.82, 1.04, 9.2, 6]} />
            <meshStandardMaterial
              color="#586176"
              emissive="#161c3d"
              emissiveIntensity={0.6}
              roughness={0.95}
              flatShading
            />
          </mesh>
          <mesh position={[0, 0.45, 0]}>
            <cylinderGeometry args={[1.3, 1.45, 0.9, 6]} />
            <meshStandardMaterial color="#3d4250" roughness={1} flatShading />
          </mesh>
          <mesh position={[0, 9.35, 0]} rotation-y={0.3}>
            <dodecahedronGeometry args={[1.3, 0]} />
            <meshStandardMaterial color="#596072" roughness={1} flatShading />
          </mesh>
        </group>
      ))}
    </>
  );
}

function CentralAltar(): React.JSX.Element {
  return (
    <group position={[0, 0, -3.3]}>
      <mesh position={[0, 0.35, 0]}>
        <cylinderGeometry args={[5.6, 6.5, 0.7, 8]} />
        <meshStandardMaterial color="#59545b" roughness={0.9} flatShading />
      </mesh>
      <mesh position={[0, 0.9, 0]}>
        <cylinderGeometry args={[3.8, 4.8, 0.5, 8]} />
        <meshStandardMaterial color="#79706a" roughness={0.86} flatShading />
      </mesh>
      <mesh position={[0, 1.45, 0]}>
        <cylinderGeometry args={[1.45, 2.1, 0.8, 8]} />
        <meshStandardMaterial color="#544a52" roughness={0.9} flatShading />
      </mesh>
      <mesh position={[0, 2.45, 0]}>
        <octahedronGeometry args={[0.75, 0]} />
        <meshStandardMaterial color="#b0d7ff" emissive="#4167c8" emissiveIntensity={2.8} />
      </mesh>
    </group>
  );
}

function StoneMonkeyMonument({
  kind,
  position,
  rotationY = 0,
}: {
  kind: MonumentKind;
  position: readonly [number, number, number];
  rotationY?: number;
}): React.JSX.Element {
  const handPositions = handsFor(kind);
  return (
    <group position={position} rotation-y={rotationY} scale={1.55}>
      <mesh position={[0, 1.3, 0]}>
        <cylinderGeometry args={[1.45, 1.8, 2.6, 7]} />
        <meshStandardMaterial
          color="#646b80"
          emissive="#293457"
          emissiveIntensity={0.9}
          roughness={1}
          flatShading
        />
      </mesh>
      <mesh position={[0, 4, 0]} scale={[1.15, 1.15, 0.95]}>
        <sphereGeometry args={[1.42, 12, 8]} />
        <meshStandardMaterial
          color="#858ba0"
          emissive="#293457"
          emissiveIntensity={0.9}
          roughness={1}
          flatShading
        />
      </mesh>
      <mesh position={[0, 5.45, -0.12]} scale={[0.85, 0.7, 0.72]}>
        <dodecahedronGeometry args={[1, 0]} />
        <meshStandardMaterial color="#595a62" roughness={1} flatShading />
      </mesh>
      {handPositions.map(([x, y, z]) => (
        <group key={`${x}-${y}-${z}`} position={[x, y, z]} rotation-z={x * -0.28}>
          <mesh position={[0, -0.75, 0]} rotation-z={x > 0 ? -0.45 : 0.45}>
            <cylinderGeometry args={[0.38, 0.55, 1.9, 6]} />
            <meshStandardMaterial
              color="#70788e"
              emissive="#222b4a"
              emissiveIntensity={0.7}
              roughness={1}
              flatShading
            />
          </mesh>
          <mesh>
            <sphereGeometry args={[0.58, 8, 6]} />
            <meshStandardMaterial
              color="#9ba2b8"
              emissive="#323c60"
              emissiveIntensity={0.7}
              roughness={1}
              flatShading
            />
          </mesh>
        </group>
      ))}
      <mesh position={[0, 0.12, 0]}>
        <cylinderGeometry args={[2.2, 2.5, 0.25, 7]} />
        <meshStandardMaterial color="#3d404a" roughness={1} flatShading />
      </mesh>
    </group>
  );
}

function handsFor(kind: MonumentKind): readonly [number, number, number][] {
  if (kind === 'EYES')
    return [
      [-0.55, 4.15, 1.08],
      [0.55, 4.15, 1.08],
    ];
  if (kind === 'EARS')
    return [
      [-1.35, 4.05, 0.05],
      [1.35, 4.05, 0.05],
    ];
  return [
    [-0.52, 3.42, 1.18],
    [0.52, 3.42, 1.18],
  ];
}

function Torches(): React.JSX.Element {
  return (
    <>
      <Torch position={[-6, 0, 1]} />
      <Torch position={[6, 0, 1]} />
      <Torch position={[-10, 0, -7]} />
      <Torch position={[10, 0, -7]} />
    </>
  );
}

function Torch({ position }: { position: readonly [number, number, number] }): React.JSX.Element {
  return (
    <group position={position}>
      <mesh position={[0, 1.35, 0]}>
        <cylinderGeometry args={[0.11, 0.16, 2.7, 6]} />
        <meshStandardMaterial color="#332820" roughness={1} />
      </mesh>
      <mesh position={[0, 2.82, 0]}>
        <sphereGeometry args={[0.38, 8, 6]} />
        <meshStandardMaterial color="#ffb354" emissive="#ff5a2b" emissiveIntensity={3.5} />
      </mesh>
    </group>
  );
}

function Dust(): React.JSX.Element {
  const geometry = useMemo(() => {
    const positions = new Float32Array(90 * 3);
    for (let index = 0; index < 90; index += 1) {
      const angle = index * 2.39996;
      const radius = 2 + (index % 11) * 1.4;
      positions[index * 3] = Math.cos(angle) * radius;
      positions[index * 3 + 1] = 0.8 + ((index * 7) % 13) * 0.43;
      positions[index * 3 + 2] = -2 - Math.sin(angle) * radius - (index % 5) * 1.5;
    }
    return new BufferGeometry().setAttribute('position', new Float32BufferAttribute(positions, 3));
  }, []);

  return (
    <points geometry={geometry}>
      <pointsMaterial
        color="#d9e6ff"
        size={0.1}
        sizeAttenuation
        transparent
        opacity={0.45}
        depthWrite={false}
        blending={AdditiveBlending}
      />
    </points>
  );
}
