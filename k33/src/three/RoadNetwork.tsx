import React from 'react';
import { Line } from '@react-three/drei';
import { RoadNode, RoadSegment } from '../types';
import { COLORS } from '../utils/constants';

interface RoadNetworkProps {
  nodes: RoadNode[];
  segments: RoadSegment[];
  showNodes?: boolean;
}

export const RoadNetwork: React.FC<RoadNetworkProps> = ({ nodes, segments, showNodes = true }) => {
  const getCongestionColor = (congestion: number): string => {
    if (congestion < 0.3) return COLORS.heatmap.low;
    if (congestion < 0.6) return COLORS.heatmap.medium;
    return COLORS.heatmap.high;
  };

  return (
    <group>
      {segments.map((segment) => {
        const fromNode = nodes.find(n => n.id === segment.from);
        const toNode = nodes.find(n => n.id === segment.to);
        if (!fromNode || !toNode) return null;

        const avgCongestion = (fromNode.congestion + toNode.congestion) / 2;

        return (
          <React.Fragment key={segment.id}>
            <Line
              points={[
                [fromNode.position.x, 0.1, fromNode.position.y],
                [toNode.position.x, 0.1, toNode.position.y],
              ]}
              color={getCongestionColor(avgCongestion)}
              lineWidth={3}
              transparent
              opacity={0.8}
            />
            <mesh
              position={[
                (fromNode.position.x + toNode.position.x) / 2,
                0.05,
                (fromNode.position.y + toNode.position.y) / 2,
              ]}
              rotation={[-Math.PI / 2, 0, 0]}
            >
              <planeGeometry args={[3, Math.hypot(
                toNode.position.x - fromNode.position.x,
                toNode.position.y - fromNode.position.y
              )]} />
              <meshBasicMaterial color="#212121" transparent opacity={0.3} />
            </mesh>
          </React.Fragment>
        );
      })}

      {showNodes && nodes.map((node) => (
        <mesh key={node.id} position={[node.position.x, 0.2, node.position.y]}>
          <cylinderGeometry args={[0.5, 0.5, 0.2, 16]} />
          <meshStandardMaterial
            color={node.type === 'charging' ? '#4CAF50' : node.type === 'quay' ? '#FF9800' : node.type === 'yard' ? '#2196F3' : '#607D8B'}
            metalness={0.5}
            roughness={0.5}
          />
        </mesh>
      ))}
    </group>
  );
};
