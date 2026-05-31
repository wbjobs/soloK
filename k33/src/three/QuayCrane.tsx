import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { QuayCrane as QuayCraneType } from '../types';

interface QuayCraneProps {
  crane: QuayCraneType;
}

export const QuayCrane: React.FC<QuayCraneProps> = ({ crane }) => {
  const groupRef = useRef<THREE.Group>(null);
  const trolleyRef = useRef<THREE.Group>(null);
  const spreaderRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (trolleyRef.current) {
      const targetX = crane.status === 'working' ? Math.sin(state.clock.elapsedTime) * 5 : 0;
      trolleyRef.current.position.x = THREE.MathUtils.lerp(
        trolleyRef.current.position.x,
        targetX,
        0.05
      );
    }

    if (spreaderRef.current) {
      const targetY = crane.status === 'working' ? 3 + Math.sin(state.clock.elapsedTime * 2) * 2 : 8;
      spreaderRef.current.position.y = THREE.MathUtils.lerp(
        spreaderRef.current.position.y,
        targetY,
        0.05
      );
    }
  });

  return (
    <group ref={groupRef} position={[crane.position.x, 0, crane.position.y]}>
      <mesh position={[0, 15, 0]} castShadow>
        <boxGeometry args={[1.5, 30, 1.5]} />
        <meshStandardMaterial color="#455A64" metalness={0.8} roughness={0.3} />
      </mesh>

      <mesh position={[0, 15, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <boxGeometry args={[1.5, 30, 1.5]} />
        <meshStandardMaterial color="#455A64" metalness={0.8} roughness={0.3} />
      </mesh>

      <mesh position={[0, 31, 0]} castShadow>
        <boxGeometry args={[35, 1.5, 3]} />
        <meshStandardMaterial color="#37474F" metalness={0.7} roughness={0.4} />
      </mesh>

      <mesh position={[0, 31, 2.5]} castShadow>
        <boxGeometry args={[35, 0.5, 0.5]} />
        <meshStandardMaterial color="#FF5722" emissive="#FF5722" emissiveIntensity={0.3} />
      </mesh>

      <mesh position={[0, 31, -2.5]} castShadow>
        <boxGeometry args={[35, 0.5, 0.5]} />
        <meshStandardMaterial color="#FF5722" emissive="#FF5722" emissiveIntensity={0.3} />
      </mesh>

      <group ref={trolleyRef} position={[0, 30, 0]}>
        <mesh castShadow>
          <boxGeometry args={[4, 2, 4]} />
          <meshStandardMaterial color="#546E7A" metalness={0.6} roughness={0.5} />
        </mesh>

        <mesh position={[0, -1, 0]} castShadow>
          <cylinderGeometry args={[0.2, 0.2, 6, 8]} />
          <meshStandardMaterial color="#78909C" metalness={0.9} roughness={0.2} />
        </mesh>

        <group ref={spreaderRef} position={[0, -4, 0]}>
          <mesh castShadow>
            <boxGeometry args={[3, 0.5, 1.5]} />
            <meshStandardMaterial color="#263238" metalness={0.5} roughness={0.6} />
          </mesh>
        </group>
      </group>

      <mesh position={[0, 0.5, 0]} castShadow receiveShadow>
        <boxGeometry args={[8, 1, 8]} />
        <meshStandardMaterial color="#263238" metalness={0.8} roughness={0.3} />
      </mesh>

      {crane.status === 'working' && (
        <mesh position={[0, 32, 0]}>
          <pointLight color="#FFEB3B" intensity={0.5} distance={20} />
        </mesh>
      )}
    </group>
  );
};
