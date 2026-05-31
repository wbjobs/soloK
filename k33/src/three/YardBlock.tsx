import React, { useMemo } from 'react';
import { YardBlock as YardBlockType } from '../types';

interface YardBlockProps {
  block: YardBlockType;
}

export const YardBlock: React.FC<YardBlockProps> = ({ block }) => {
  const containers = useMemo(() => {
    const result: { x: number; z: number; y: number }[] = [];
    const containerWidth = 2.5;
    const containerLength = 6.1;
    const containerHeight = 2.6;

    for (let bay = 0; bay < block.bays && result.length < block.currentContainers; bay++) {
      for (let row = 0; row < block.rows && result.length < block.currentContainers; row++) {
        for (let tier = 0; tier < block.tiers && result.length < block.currentContainers; tier++) {
          if (Math.random() < block.currentContainers / block.capacity) {
            result.push({
              x: block.position.x - block.position.width / 2 + bay * containerWidth + containerWidth / 2,
              z: block.position.y - block.position.height / 2 + row * containerLength + containerLength / 2,
              y: tier * containerHeight + containerHeight / 2 + 0.1,
            });
          }
        }
      }
    }
    return result;
  }, [block]);

  return (
    <group>
      <mesh position={[block.position.x, 0.05, block.position.y]} receiveShadow>
        <boxGeometry args={[block.position.width, 0.1, block.position.height]} />
        <meshStandardMaterial color="#424242" roughness={0.9} />
      </mesh>

      <mesh position={[block.position.x, 0.1, block.position.y - block.position.height / 2]}>
        <boxGeometry args={[block.position.width + 0.5, 0.3, 0.5]} />
        <meshStandardMaterial color="#FFD54F" />
      </mesh>

      {containers.map((pos, i) => (
        <mesh key={i} position={[pos.x, pos.y, pos.z]} castShadow receiveShadow>
          <boxGeometry args={[2.4, 2.5, 6.0]} />
          <meshStandardMaterial
            color={i % 3 === 0 ? '#1565C0' : i % 3 === 1 ? '#C62828' : '#2E7D32'}
            metalness={0.3}
            roughness={0.7}
          />
        </mesh>
      ))}
    </group>
  );
};
