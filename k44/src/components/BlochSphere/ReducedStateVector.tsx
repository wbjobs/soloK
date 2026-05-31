import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { BlochVector } from '@/types/quantum';

const UP = new THREE.Vector3(0, 1, 0);
const ANTI_UP = new THREE.Vector3(0, -1, 0);
const FALLBACK_AXIS = new THREE.Vector3(1, 0, 0);
const TIP_LOCAL = new THREE.Vector3(0, 1, 0);

function computeTargetQuat(targetPos: THREE.Vector3): THREE.Quaternion {
  const direction = targetPos.clone().normalize();
  if (direction.length() < 1e-6) {
    return new THREE.Quaternion();
  }
  if (direction.distanceTo(ANTI_UP) < 1e-6) {
    return new THREE.Quaternion().setFromAxisAngle(FALLBACK_AXIS, Math.PI);
  }
  return new THREE.Quaternion().setFromUnitVectors(UP, direction);
}

interface ReducedStateVectorProps {
  blochVector: BlochVector;
  color: string;
}

export function ReducedStateVector({ blochVector, color }: ReducedStateVectorProps) {
  const groupRef = useRef<THREE.Group>(null);
  const sphereRef = useRef<THREE.Mesh>(null);

  const targetPos = useMemo(() => {
    return new THREE.Vector3(blochVector.x, blochVector.z, blochVector.y);
  }, [blochVector]);

  const targetQuat = useMemo(() => computeTargetQuat(targetPos), [targetPos]);

  const isMixed = useMemo(() => {
    const len = Math.sqrt(
      blochVector.x ** 2 + blochVector.y ** 2 + blochVector.z ** 2
    );
    return len < 0.01;
  }, [blochVector]);

  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.quaternion.slerp(targetQuat, 1 - Math.exp(-delta * 8));

      if (sphereRef.current) {
        const tipWorld = TIP_LOCAL.clone().applyQuaternion(groupRef.current.quaternion);
        sphereRef.current.position.copy(tipWorld);
      }
    }
  });

  if (isMixed) {
    return (
      <mesh>
        <sphereGeometry args={[0.12, 16, 16]} />
        <meshBasicMaterial color={color} transparent opacity={0.6} toneMapped={false} />
      </mesh>
    );
  }

  return (
    <group>
      <group ref={groupRef}>
        <mesh position={[0, 0.5, 0]}>
          <cylinderGeometry args={[0.015, 0.015, 1, 8]} />
          <meshBasicMaterial color={color} toneMapped={false} />
        </mesh>
        <mesh position={[0, 1, 0]}>
          <coneGeometry args={[0.05, 0.12, 8]} />
          <meshBasicMaterial color={color} toneMapped={false} />
        </mesh>
      </group>

      <mesh ref={sphereRef} position={[0, 0, 1]}>
        <sphereGeometry args={[0.06, 16, 16]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
    </group>
  );
}
