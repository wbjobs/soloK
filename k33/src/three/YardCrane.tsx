import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { YardCrane as YardCraneType } from '../types';

interface YardCraneProps {
  crane: YardCraneType;
}

export const YardCrane: React.FC<YardCraneProps> = ({ crane }) => {
  const groupRef = useRef<THREE.Group>(null);
  const trolleyRef = useRef<THREE.Group>(null);
  const hoistRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (trolleyRef.current) {
      const targetX = crane.status === 'working' ? Math.sin(state.clock.elapsedTime * 0.8) * 3 : 0;
      trolleyRef.current.position.x = THREE.MathUtils.lerp(
        trolleyRef.current.position.x,
        targetX,
        0.05
      );
    }

    if (hoistRef.current) {
      const targetY = crane.status === 'working' ? 1.5 + Math.sin(state.clock.elapsedTime * 1.5) * 1.5 : 5;
      hoistRef.current.position.y = THREE.MathUtils.lerp(
        hoistRef.current.position.y,
        targetY,
        0.05
      );
    }
  });

  return (
    <group ref={groupRef} position={[crane.position.x, 0, crane.position.y]}>
      <mesh position={[-5, 6, 0]} castShadow>
        <boxGeometry args={[1, 12, 1]} />
        <meshStandardMaterial color="#546E7A" metalness={0.8} roughness={0.3} />
      </mesh>

      <mesh position={[5, 6, 0]} castShadow>
        <boxGeometry args={[1, 12, 1]} />
        <meshStandardMaterial color="#546E7A" metalness={0.8} roughness={0.3} />
      </mesh>

      <mesh position={[0, 12, 0]} castShadow>
        <boxGeometry args={[12, 1, 2]} />
        <meshStandardMaterial color="#455A64" metalness={0.7} roughness={0.4} />
      </mesh>

      <mesh position={[-5, 0.5, 0]} castShadow receiveShadow>
        <boxGeometry args={[3, 1, 3]} />
        <meshStandardMaterial color="#37474F" metalness={0.8} roughness={0.3} />
      </mesh>

      <mesh position={[5, 0.5, 0]} castShadow receiveShadow>
        <boxGeometry args={[3, 1, 3]} />
        <meshStandardMaterial color="#37474F" metalness={0.8} roughness={0.3} />
      </mesh>

      <group ref={trolleyRef} position={[0, 11, 0]}>
        <mesh castShadow>
          <boxGeometry args={[2.5, 1.5, 3]} />
          <meshStandardMaterial color="#607D8B" metalness={0.6} roughness={0.5} />
        </mesh>

        <mesh position={[0, -1, 0]} castShadow>
          <cylinderGeometry args={[0.15, 0.15, 4, 8]} />
          <meshStandardMaterial color="#90A4AE" metalness={0.9} roughness={0.2} />
        </mesh>

        <group ref={hoistRef} position={[0, -3, 0]}>
          <mesh castShadow>
            <boxGeometry args={[2, 0.3, 1]} />
            <meshStandardMaterial color="#263238" metalness={0.5} roughness={0.6} />
          </mesh>
        </group>
      </group>

      {crane.status === 'working' && (
        <mesh position={[0, 13, 0]}>
          <pointLight color="#4CAF50" intensity={0.5} distance={15} />
        </mesh>
      )}
    </group>
  );
};
