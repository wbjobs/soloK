import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { StateVector } from './StateVector';
import { useQuantumStore } from '@/store/quantumStore';
import { useShallow } from 'zustand/react/shallow';

function Axes() {
  return (
    <group>
      <group position={[1.1, 0, 0]}>
        <mesh>
          <cylinderGeometry args={[0.015, 0.015, 2.2, 8]} />
          <meshBasicMaterial color="#ff4757" toneMapped={false} />
        </mesh>
      </group>
      <group position={[0, 1.1, 0]}>
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.015, 0.015, 2.2, 8]} />
          <meshBasicMaterial color="#2ed573" toneMapped={false} />
        </mesh>
      </group>
      <group position={[0, 0, 1.1]}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.015, 0.015, 2.2, 8]} />
          <meshBasicMaterial color="#a55eea" toneMapped={false} />
        </mesh>
      </group>

      <mesh position={[1.15, 0, 0]}>
        <coneGeometry args={[0.05, 0.1, 8]} />
        <meshBasicMaterial color="#ff4757" toneMapped={false} />
      </mesh>
      <mesh position={[0, 1.15, 0]} rotation={[0, 0, -Math.PI / 2]}>
        <coneGeometry args={[0.05, 0.1, 8]} />
        <meshBasicMaterial color="#2ed573" toneMapped={false} />
      </mesh>
      <mesh position={[0, 0, 1.15]} rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.05, 0.1, 8]} />
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
          opacity={0.15}
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
          opacity={0.2}
        />
      </mesh>

      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.98, 1, 64]} />
        <meshBasicMaterial color="#3a7bd5" transparent opacity={0.4} side={2} />
      </mesh>
      <mesh rotation={[0, 0, 0]}>
        <ringGeometry args={[0.98, 1, 64]} />
        <meshBasicMaterial color="#3a7bd5" transparent opacity={0.4} side={2} />
      </mesh>
      <mesh rotation={[0, Math.PI / 2, 0]}>
        <ringGeometry args={[0.98, 1, 64]} />
        <meshBasicMaterial color="#3a7bd5" transparent opacity={0.4} side={2} />
      </mesh>
    </group>
  );
}

function SceneContent() {
  const { theta, phi } = useQuantumStore(
    useShallow((state) => ({
      theta: state.state.theta,
      phi: state.state.phi
    }))
  );

  return (
    <>
      <ambientLight intensity={0.4} />
      <directionalLight position={[5, 5, 5]} intensity={1} color="#ffffff" />
      <pointLight position={[-5, -5, -5]} intensity={0.5} color="#00d4ff" />

      <SphereShell />
      <Axes />
      <StateVector theta={theta} phi={phi} />

      <OrbitControls
        enableDamping
        dampingFactor={0.05}
        minDistance={2}
        maxDistance={8}
        autoRotate={false}
      />
    </>
  );
}

export function BlochSphereScene() {
  return (
    <Canvas
      camera={{ position: [2.5, 2, 2.5], fov: 50 }}
      gl={{ antialias: true, alpha: true }}
    >
      <SceneContent />
    </Canvas>
  );
}
