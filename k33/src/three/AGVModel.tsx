import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { AGV } from '../types';
import { COLORS } from '../utils/constants';

interface AGVModelProps {
  agv: AGV;
  selected?: boolean;
  onClick?: () => void;
}

export const AGVModel: React.FC<AGVModelProps> = ({ agv, selected, onClick }) => {
  const groupRef = useRef<THREE.Group>(null);
  const bodyRef = useRef<THREE.Mesh>(null);
  const statusLightRef = useRef<THREE.Mesh>(null);

  const getStatusColor = (status: AGV['status']): string => {
    return COLORS.agv[status] || COLORS.agv.idle;
  };

  useFrame((state, delta) => {
    if (groupRef.current) {
      groupRef.current.position.x = agv.position.x;
      groupRef.current.position.z = agv.position.y;
      groupRef.current.rotation.y = -agv.position.angle;
    }

    if (statusLightRef.current) {
      const material = statusLightRef.current.material as THREE.MeshStandardMaterial;
      material.emissive.setHex(parseInt(getStatusColor(agv.status).slice(1), 16));
      material.emissiveIntensity = 0.5 + Math.sin(state.clock.elapsedTime * 3) * 0.3;
    }
  });

  return (
    <group ref={groupRef} onClick={onClick}>
      <mesh ref={bodyRef} position={[0, 0.75, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.5, 1.5, 4.0]} />
        <meshStandardMaterial
          color={selected ? '#4FC3F7' : '#37474F'}
          metalness={0.7}
          roughness={0.3}
        />
      </mesh>

      <mesh position={[0, 1.6, 0]} castShadow>
        <boxGeometry args={[2.0, 0.3, 3.5]} />
        <meshStandardMaterial
          color={selected ? '#81D4FA' : '#546E7A'}
          metalness={0.5}
          roughness={0.5}
        />
      </mesh>

      <mesh ref={statusLightRef} position={[0, 2.0, 0]}>
        <sphereGeometry args={[0.15, 16, 16]} />
        <meshStandardMaterial
          color={getStatusColor(agv.status)}
          emissive={getStatusColor(agv.status)}
          emissiveIntensity={0.8}
        />
      </mesh>

      {[-1.0, 1.0].map((x, i) =>
        [-1.5, 1.5].map((z, j) => (
          <mesh key={`wheel-${i}-${j}`} position={[x, 0.3, z]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.3, 0.3, 0.2, 16]} />
            <meshStandardMaterial color="#212121" metalness={0.8} roughness={0.4} />
          </mesh>
        ))
      )}

      {selected && (
        <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[2.5, 3.0, 32]} />
          <meshBasicMaterial color="#4FC3F7" transparent opacity={0.6} side={THREE.DoubleSide} />
        </mesh>
      )}

      {agv.battery < 20 && (
        <group position={[0, 2.5, 0]}>
          <mesh position={[0, 0.1, 0]}>
            <cylinderGeometry args={[0.08, 0.08, 0.4, 8]} />
            <meshBasicMaterial color="#FF5722" />
          </mesh>
          <mesh position={[0, -0.2, 0]}>
            <sphereGeometry args={[0.08, 16, 16]} />
            <meshBasicMaterial color="#FF5722" />
          </mesh>
        </group>
      )}
    </group>
  );
};
