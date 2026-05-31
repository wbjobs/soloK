import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { stateToCartesian } from '@/utils/quantumMath';

const UP = new THREE.Vector3(0, 1, 0);
const ANTI_UP = new THREE.Vector3(0, -1, 0);
const FALLBACK_AXIS = new THREE.Vector3(1, 0, 0);
const TIP_LOCAL = new THREE.Vector3(0, 1, 0);

interface StateVectorProps {
  theta: number;
  phi: number;
}

function computeTargetQuat(targetPos: THREE.Vector3): THREE.Quaternion {
  const direction = targetPos.clone().normalize();
  if (direction.distanceTo(ANTI_UP) < 1e-6) {
    return new THREE.Quaternion().setFromAxisAngle(FALLBACK_AXIS, Math.PI);
  }
  return new THREE.Quaternion().setFromUnitVectors(UP, direction);
}

export function StateVector({ theta, phi }: StateVectorProps) {
  const groupRef = useRef<THREE.Group>(null);
  const sphereRef = useRef<THREE.Mesh>(null);

  const targetPos = useMemo(() => {
    const { x, y, z } = stateToCartesian(theta, phi);
    return new THREE.Vector3(x, y, z);
  }, [theta, phi]);

  const targetQuat = useMemo(() => computeTargetQuat(targetPos), [targetPos]);

  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.quaternion.slerp(targetQuat, 1 - Math.exp(-delta * 8));

      if (sphereRef.current) {
        const tipWorld = TIP_LOCAL.clone().applyQuaternion(groupRef.current.quaternion);
        sphereRef.current.position.copy(tipWorld);
      }
    }
  });

  return (
    <group>
      <group ref={groupRef}>
        <mesh position={[0, 0.5, 0]}>
          <cylinderGeometry args={[0.015, 0.015, 1, 8]} />
          <meshBasicMaterial color="#00d4ff" toneMapped={false} />
        </mesh>
        <mesh position={[0, 1, 0]}>
          <coneGeometry args={[0.05, 0.12, 8]} />
          <meshBasicMaterial color="#00d4ff" toneMapped={false} />
        </mesh>
      </group>

      <mesh ref={sphereRef} position={[0, 0, 1]}>
        <sphereGeometry args={[0.06, 16, 16]} />
        <meshBasicMaterial color="#00ffff" toneMapped={false} />
      </mesh>
    </group>
  );
}
