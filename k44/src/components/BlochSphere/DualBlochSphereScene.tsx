import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Line } from '@react-three/drei';
import { useTwoQubitStore } from '@/store/twoQubitStore';
import { useShallow } from 'zustand/react/shallow';
import { BELL_STATES } from '@/utils/twoQubitMath';
import { BellStateType } from '@/types/quantum';
import { ReducedStateVector } from './ReducedStateVector';
import { useRef } from 'react';
import * as THREE from 'three';

function Axes() {
  return (
    <group>
      <group position={[1.1, 0, 0]}>
        <mesh>
          <cylinderGeometry args={[0.012, 0.012, 2.2, 8]} />
          <meshBasicMaterial color="#ff4757" toneMapped={false} />
        </mesh>
      </group>
      <group position={[0, 1.1, 0]}>
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.012, 0.012, 2.2, 8]} />
          <meshBasicMaterial color="#2ed573" toneMapped={false} />
        </mesh>
      </group>
      <group position={[0, 0, 1.1]}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.012, 0.012, 2.2, 8]} />
          <meshBasicMaterial color="#a55eea" toneMapped={false} />
        </mesh>
      </group>
      <mesh position={[1.15, 0, 0]}>
        <coneGeometry args={[0.04, 0.08, 8]} />
        <meshBasicMaterial color="#ff4757" toneMapped={false} />
      </mesh>
      <mesh position={[0, 1.15, 0]} rotation={[0, 0, -Math.PI / 2]}>
        <coneGeometry args={[0.04, 0.08, 8]} />
        <meshBasicMaterial color="#2ed573" toneMapped={false} />
      </mesh>
      <mesh position={[0, 0, 1.15]} rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.04, 0.08, 8]} />
        <meshBasicMaterial color="#a55eea" toneMapped={false} />
      </mesh>
    </group>
  );
}

function SphereShell() {
  return (
    <group>
      <mesh>
        <sphereGeometry args={[1, 32, 32]} />
        <meshStandardMaterial
          color="#1a3a5c"
          transparent
          opacity={0.12}
          side={2}
          metalness={0.3}
          roughness={0.5}
        />
      </mesh>
      <mesh>
        <sphereGeometry args={[1, 32, 32]} />
        <meshBasicMaterial
          color="#3a7bd5"
          wireframe
          transparent
          opacity={0.15}
        />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.98, 1, 64]} />
        <meshBasicMaterial color="#3a7bd5" transparent opacity={0.3} side={2} />
      </mesh>
      <mesh rotation={[0, 0, 0]}>
        <ringGeometry args={[0.98, 1, 64]} />
        <meshBasicMaterial color="#3a7bd5" transparent opacity={0.3} side={2} />
      </mesh>
      <mesh rotation={[0, Math.PI / 2, 0]}>
        <ringGeometry args={[0.98, 1, 64]} />
        <meshBasicMaterial color="#3a7bd5" transparent opacity={0.3} side={2} />
      </mesh>
    </group>
  );
}

function EntanglementLines({ bellType }: { bellType: BellStateType }) {
  const lineRef = useRef<THREE.Group>(null);
  const config = BELL_STATES[bellType];
  const [corrA0, corrA1] = config.correlationA;
  const [corrB0, corrB1] = config.correlationB;

  const pointA0 = new THREE.Vector3(-3, corrA0 > 0 ? 1 : -1, 0);
  const pointB0 = new THREE.Vector3(3, corrB0 > 0 ? 1 : -1, 0);
  const pointA1 = new THREE.Vector3(-3, corrA1 > 0 ? 1 : -1, 0);
  const pointB1 = new THREE.Vector3(3, corrB1 > 0 ? 1 : -1, 0);

  useFrame(({ clock }) => {
    if (lineRef.current) {
      const t = Math.sin(clock.elapsedTime * 2) * 0.3 + 0.7;
      lineRef.current.children.forEach((child) => {
        if (child instanceof THREE.Line) {
          const mat = child.material as THREE.LineBasicMaterial;
          mat.opacity = t;
        }
      });
    }
  });

  return (
    <group ref={lineRef}>
      <Line
        points={[
          [pointA0.x, pointA0.y, pointA0.z],
          [pointB0.x, pointB0.y, pointB0.z]
        ]}
        color="#ff6b9d"
        lineWidth={2}
        transparent
        opacity={0.7}
        dashed
        dashSize={0.15}
        gapSize={0.08}
      />
      <Line
        points={[
          [pointA1.x, pointA1.y, pointA1.z],
          [pointB1.x, pointB1.y, pointB1.z]
        ]}
        color="#c56bff"
        lineWidth={2}
        transparent
        opacity={0.7}
        dashed
        dashSize={0.15}
        gapSize={0.08}
      />
    </group>
  );
}

function QubitLabel({ position, text }: { position: [number, number, number]; text: string }) {
  return (
    <group position={position}>
      <mesh>
        <sphereGeometry args={[0.05, 8, 8]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0} />
      </mesh>
    </group>
  );
}

function DualSceneContent() {
  const { blochVectorA, blochVectorB, bellType } = useTwoQubitStore(
    useShallow((state) => ({
      blochVectorA: state.state.blochVectorA,
      blochVectorB: state.state.blochVectorB,
      bellType: state.bellType
    }))
  );

  return (
    <>
      <ambientLight intensity={0.4} />
      <directionalLight position={[5, 5, 5]} intensity={1} color="#ffffff" />
      <pointLight position={[-5, -5, -5]} intensity={0.5} color="#00d4ff" />

      <group position={[-3, 0, 0]}>
        <SphereShell />
        <Axes />
        <ReducedStateVector blochVector={blochVectorA} color="#00d4ff" />
        <QubitLabel position={[0, -1.5, 0]} text="Qubit A" />
      </group>

      <group position={[3, 0, 0]}>
        <SphereShell />
        <Axes />
        <ReducedStateVector blochVector={blochVectorB} color="#ff6b9d" />
        <QubitLabel position={[0, -1.5, 0]} text="Qubit B" />
      </group>

      <EntanglementLines bellType={bellType} />

      <OrbitControls
        enableDamping
        dampingFactor={0.05}
        minDistance={4}
        maxDistance={16}
        autoRotate={false}
      />
    </>
  );
}

export function DualBlochSphereScene() {
  return (
    <Canvas
      camera={{ position: [0, 4, 10], fov: 45 }}
      gl={{ antialias: true, alpha: true }}
    >
      <DualSceneContent />
    </Canvas>
  );
}
