import React, { useRef, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Environment, Sky } from '@react-three/drei';
import * as THREE from 'three';
import { Scene as SceneType } from '../types';
import { AGVModel } from './AGVModel';
import { QuayCrane } from './QuayCrane';
import { YardCrane } from './YardCrane';
import { YardBlock } from './YardBlock';
import { RoadNetwork } from './RoadNetwork';
import { useSimulationStore } from '../store/useSimulationStore';

interface SceneProps {
  scene: SceneType;
}

const CameraController: React.FC<{ agvId: string | null; agvs: SceneType['agvs'] }> = ({ agvId, agvs }) => {
  const { camera } = useThree();
  const controlsRef = useRef<any>(null);
  const cameraMode = useSimulationStore(state => state.cameraMode);

  useFrame(() => {
    if (cameraMode === 'follow' && agvId) {
      const agv = agvs.find(a => a.id === agvId);
      if (agv && controlsRef.current) {
        const targetX = agv.position.x;
        const targetZ = agv.position.y;
        const targetY = 15;
        const distance = 20;
        
        camera.position.lerp(
          new THREE.Vector3(
            targetX + distance * Math.sin(agv.position.angle),
            targetY,
            targetZ + distance * Math.cos(agv.position.angle)
          ),
          0.05
        );
        controlsRef.current.target.lerp(new THREE.Vector3(targetX, 0, targetZ), 0.05);
      }
    }
  });

  return (
    <OrbitControls
      ref={controlsRef}
      enableDamping
      dampingFactor={0.05}
      maxPolarAngle={Math.PI / 2.1}
      minDistance={10}
      maxDistance={200}
    />
  );
};

const TerminalGround: React.FC = () => {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[300, 400]} />
        <meshStandardMaterial color="#37474F" roughness={0.9} />
      </mesh>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, -180]} receiveShadow>
        <planeGeometry args={[300, 40]} />
        <meshStandardMaterial color="#1A237E" roughness={0.8} />
      </mesh>

      <mesh position={[0, 10, -195]}>
        <boxGeometry args={[300, 20, 10]} />
        <meshStandardMaterial color="#0D47A1" metalness={0.3} roughness={0.7} />
      </mesh>

      <mesh position={[0, 0.1, 0]}>
        <gridHelper args={[400, 40, '#455A64', '#37474F']} />
      </mesh>
    </group>
  );
};

const ChargingStationModel: React.FC<{ position: { x: number; y: number } }> = ({ position }) => {
  return (
    <group position={[position.x, 0, position.y]}>
      <mesh position={[0, 1.5, 0]} castShadow>
        <boxGeometry args={[3, 3, 3]} />
        <meshStandardMaterial color="#2E7D32" emissive="#1B5E20" emissiveIntensity={0.3} />
      </mesh>
      <mesh position={[0, 3.5, 0]}>
        <cylinderGeometry args={[0.5, 0.5, 0.2, 16]} />
        <meshStandardMaterial color="#4CAF50" emissive="#4CAF50" emissiveIntensity={0.8} />
      </mesh>
    </group>
  );
};

const AGVPaths: React.FC<{ agvs: SceneType['agvs'] }> = ({ agvs }) => {
  const showPaths = useSimulationStore(state => state.showPaths);

  if (!showPaths) return null;

  return (
    <group>
      {agvs.map(agv => {
        if (agv.path.length === 0) return null;
        
        const points = agv.path.slice(agv.pathIndex).map(p => 
          new THREE.Vector3(p.x, 0.15, p.y)
        );
        
        if (points.length < 2) return null;
        
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        
        return (
          <line key={`path-${agv.id}`}>
            <bufferGeometry attach="geometry" {...geometry} />
            <lineBasicMaterial attach="material" color="#4FC3F7" transparent opacity={0.6} />
          </line>
        );
      })}
    </group>
  );
};

const SceneContent: React.FC<{ scene: SceneType }> = ({ scene }) => {
  const selectedAGVId = useSimulationStore(state => state.selectedAGVId);
  const selectAGV = useSimulationStore(state => state.selectAGV);
  const showRoadNetwork = useSimulationStore(state => state.showRoadNetwork);

  return (
    <>
      <TerminalGround />

      {showRoadNetwork && (
        <RoadNetwork nodes={scene.roadNetwork} segments={scene.roadSegments} />
      )}

      {scene.yardBlocks.map(block => (
        <YardBlock key={block.id} block={block} />
      ))}

      {scene.chargingStations.map(station => (
        <ChargingStationModel key={station.id} position={station.position} />
      ))}

      {scene.quayCranes.map(crane => (
        <QuayCrane key={crane.id} crane={crane} />
      ))}

      {scene.yardCranes.map(crane => (
        <YardCrane key={crane.id} crane={crane} />
      ))}

      <AGVPaths agvs={scene.agvs} />

      {scene.agvs.map(agv => (
        <AGVModel
          key={agv.id}
          agv={agv}
          selected={selectedAGVId === agv.id}
          onClick={() => selectAGV(agv.id)}
        />
      ))}

      <CameraController agvId={selectedAGVId} agvs={scene.agvs} />
    </>
  );
};

export const TerminalScene: React.FC<SceneProps> = ({ scene }) => {
  const update = useSimulationStore(state => state.update);
  const lastTimeRef = useRef<number>(performance.now());

  useEffect(() => {
    let animationId: number;
    
    const animate = () => {
      const currentTime = performance.now();
      const deltaTime = (currentTime - lastTimeRef.current) / 1000;
      lastTimeRef.current = currentTime;
      
      update(deltaTime);
      animationId = requestAnimationFrame(animate);
    };
    
    animationId = requestAnimationFrame(animate);
    
    return () => cancelAnimationFrame(animationId);
  }, [update]);

  return (
    <Canvas
      shadows
      camera={{ position: [0, 80, 80], fov: 60 }}
      gl={{ antialias: true, alpha: false }}
    >
      <color attach="background" args={['#0A1929']} />
      <fog attach="fog" args={['#0A1929', 150, 350]} />

      <ambientLight intensity={0.4} />
      <directionalLight
        position={[100, 150, 100]}
        intensity={1.2}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-150}
        shadow-camera-right={150}
        shadow-camera-top={150}
        shadow-camera-bottom={-150}
      />
      <hemisphereLight args={['#87CEEB', '#37474F', 0.3]} />

      <Sky sunPosition={[100, 50, 100]} turbidity={10} rayleigh={2} />

      <SceneContent scene={scene} />
    </Canvas>
  );
};
