import { useRef, useEffect, useState, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Environment } from '@react-three/drei';
import * as THREE from 'three';
import { useDeviceStore } from '../store/deviceStore';
import type { Device, AnomalyEvent, VirtualLimit, DeviceTelemetry, RoboticArmState } from '../types';

export default function Scene3D() {
  return (
    <Canvas
      shadows
      camera={{ position: [5, 3, 5], fov: 50 }}
      style={{ width: '100%', height: '100%' }}
    >
      <ambientLight intensity={0.4} />
      <directionalLight
        position={[10, 15, 10]}
        intensity={1}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
      />
      <directionalLight position={[-5, 5, -5]} intensity={0.3} />

      <PerspectiveCamera makeDefault position={[8, 6, 8]} fov={50} />
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.05}
        minDistance={3}
        maxDistance={20}
        maxPolarAngle={Math.PI / 2.1}
        enablePan={true}
        enableZoom={true}
        enableRotate={true}
        screenSpacePanning={false}
        keys={{
          left: null,
          middle: null,
          right: null
        }}
      />

      <gridHelper args={[20, 40, '#444444', '#222222']} position={[0, 0, 0]} />
      <Floor />

      <SceneContent />
    </Canvas>
  );
}

function Floor() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
      <planeGeometry args={[20, 20]} />
      <meshStandardMaterial color="#1a1a2e" metalness={0.3} roughness={0.8} />
    </mesh>
  );
}

function SceneContent() {
  const devices = useDeviceStore((s) => s.devices);
  const telemetry = useDeviceStore((s) => s.telemetry);
  const roboticArmStates = useDeviceStore((s) => s.roboticArmStates);
  const anomalies = useDeviceStore((s) => s.anomalies);
  const virtualLimits = useDeviceStore((s) => s.virtualLimits);
  const isCalibrating = useDeviceStore((s) => s.isCalibrating);

  return (
    <>
      {devices.map((device) => (
        <DeviceModel
          key={device.id}
          device={device}
          telemetry={telemetry.get(device.id)}
          roboticArmState={roboticArmStates.get(device.id)}
          anomalies={anomalies.filter((a) => a.device_id === device.id)}
        />
      ))}

      {virtualLimits.map((limit) => (
        <VirtualLimitVisual key={limit.id} limit={limit} />
      ))}

      {anomalies.filter((a) => !a.acknowledged).slice(0, 20).map((anomaly) => (
        <AnomalyParticle key={anomaly.id} anomaly={anomaly} />
      ))}

      {isCalibrating && <CalibrationPicker />}
      <CalibrationPointsDisplay />
    </>
  );
}

function DeviceModel({
  device,
  telemetry,
  roboticArmState,
  anomalies
}: {
  device: Device;
  telemetry?: DeviceTelemetry;
  roboticArmState?: RoboticArmState;
  anomalies: AnomalyEvent[];
}) {
  const groupRef = useRef<THREE.Group>(null);
  const hasActiveAnomaly = anomalies.some((a) => !a.acknowledged);

  useFrame((_, delta) => {
    if (groupRef.current && telemetry) {
      const targetY = device.position.y;
      groupRef.current.position.y = THREE.MathUtils.lerp(
        groupRef.current.position.y,
        targetY,
        delta * 5
      );
    }
  });

  const renderDevice = () => {
    switch (device.type) {
      case 'robotic_arm':
        return <RoboticArmModel device={device} state={roboticArmState} />;
      case 'conveyor_belt':
        return <ConveyorBeltModel device={device} />;
      case 'vision_inspector':
        return <VisionInspectorModel device={device} />;
      default:
        return <PlaceholderModel device={device} />;
    }
  };

  return (
    <group
      ref={groupRef}
      position={[device.position.x, device.position.y, device.position.z]}
      rotation={[device.rotation.x, device.rotation.y, device.rotation.z]}
    >
      {renderDevice()}
      {hasActiveAnomaly && <AnomalyRing />}
      <DeviceLabel name={device.name} />
    </group>
  );
}

function RoboticArmModel({ device, state }: { device: Device; state?: RoboticArmState }) {
  const joint1Ref = useRef<THREE.Group>(null);
  const joint2Ref = useRef<THREE.Group>(null);
  const joint3Ref = useRef<THREE.Group>(null);
  const joint4Ref = useRef<THREE.Group>(null);
  const joint5Ref = useRef<THREE.Group>(null);
  const joint6Ref = useRef<THREE.Group>(null);

  const targetAnglesRef = useRef<number[]>([0, 0, 0, 0, 0, 0]);

  if (state?.joint_angles) {
    targetAnglesRef.current = state.joint_angles;
  }

  useFrame((_, delta) => {
    const lerpFactor = Math.min(delta * 15, 1);
    const targets = targetAnglesRef.current;

    if (joint1Ref.current) {
      joint1Ref.current.rotation.y = THREE.MathUtils.lerp(joint1Ref.current.rotation.y, targets[0] || 0, lerpFactor);
    }
    if (joint2Ref.current) {
      joint2Ref.current.rotation.z = THREE.MathUtils.lerp(joint2Ref.current.rotation.z, targets[1] || 0, lerpFactor);
    }
    if (joint3Ref.current) {
      joint3Ref.current.rotation.z = THREE.MathUtils.lerp(joint3Ref.current.rotation.z, targets[2] || 0, lerpFactor);
    }
    if (joint4Ref.current) {
      joint4Ref.current.rotation.x = THREE.MathUtils.lerp(joint4Ref.current.rotation.x, targets[3] || 0, lerpFactor);
    }
    if (joint5Ref.current) {
      joint5Ref.current.rotation.z = THREE.MathUtils.lerp(joint5Ref.current.rotation.z, targets[4] || 0, lerpFactor);
    }
    if (joint6Ref.current) {
      joint6Ref.current.rotation.x = THREE.MathUtils.lerp(joint6Ref.current.rotation.x, targets[5] || 0, lerpFactor);
    }
  });

  return (
    <group>
      <mesh castShadow receiveShadow position={[0, 0.15, 0]}>
        <cylinderGeometry args={[0.4, 0.5, 0.3, 32]} />
        <meshStandardMaterial color="#374151" metalness={0.8} roughness={0.3} />
      </mesh>

      <group ref={joint1Ref} position={[0, 0.3, 0]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.15, 0.2, 0.4, 16]} />
          <meshStandardMaterial color="#3b82f6" metalness={0.7} roughness={0.3} />
        </mesh>

        <group ref={joint2Ref} position={[0, 0.3, 0]}>
          <mesh castShadow>
            <boxGeometry args={[0.15, 0.6, 0.15]} />
            <meshStandardMaterial color="#3b82f6" metalness={0.7} roughness={0.3} />
          </mesh>

          <group ref={joint3Ref} position={[0, 0.4, 0]}>
            <mesh castShadow>
              <boxGeometry args={[0.12, 0.5, 0.12]} />
              <meshStandardMaterial color="#60a5fa" metalness={0.7} roughness={0.3} />
            </mesh>

            <group ref={joint4Ref} position={[0, 0.35, 0]}>
              <mesh castShadow>
                <sphereGeometry args={[0.1, 16, 16]} />
                <meshStandardMaterial color="#60a5fa" metalness={0.7} roughness={0.3} />
              </mesh>

              <group ref={joint5Ref} position={[0, 0, 0.2]}>
                <mesh castShadow>
                  <boxGeometry args={[0.08, 0.08, 0.3]} />
                  <meshStandardMaterial color="#93c5fd" metalness={0.7} roughness={0.3} />
                </mesh>

                <group ref={joint6Ref} position={[0, 0, 0.2]}>
                  <mesh castShadow>
                    <sphereGeometry args={[0.08, 16, 16]} />
                    <meshStandardMaterial color="#93c5fd" metalness={0.7} roughness={0.3} />
                  </mesh>
                  <mesh castShadow position={[0, 0, 0.1]}>
                    <cylinderGeometry args={[0.03, 0.06, 0.15, 16]} />
                    <meshStandardMaterial color="#1e40af" metalness={0.8} roughness={0.2} />
                  </mesh>
                </group>
              </group>
            </group>
          </group>
        </group>
      </group>
    </group>
  );
}

function ConveyorBeltModel({ device }: { device: Device }) {
  const beltRef = useRef<THREE.Mesh>(null);
  const [isRunning, setIsRunning] = useState(true);

  useFrame((_, delta) => {
    if (beltRef.current && isRunning) {
      const material = beltRef.current.material as THREE.MeshStandardMaterial;
      if (material.map) {
        material.map.offset.x += delta * 0.5;
      }
    }
  });

  const beltTexture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#374151';
    ctx.fillRect(0, 0, 256, 64);

    for (let i = 0; i < 16; i++) {
      ctx.fillStyle = i % 2 === 0 ? '#4b5563' : '#374151';
      ctx.fillRect(i * 16, 0, 16, 64);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(4, 1);
    return texture;
  }, []);

  return (
    <group>
      <mesh castShadow receiveShadow position={[0, 0.3, 0]}>
        <boxGeometry args={[4, 0.6, 1]} />
        <meshStandardMaterial color="#1f2937" metalness={0.6} roughness={0.4} />
      </mesh>

      <mesh ref={beltRef} castShadow position={[0, 0.62, 0]}>
        <boxGeometry args={[3.9, 0.05, 0.9]} />
        <meshStandardMaterial map={beltTexture} metalness={0.3} roughness={0.8} />
      </mesh>

      {[-2, -1, 0, 1, 2].map((x, i) => (
        <mesh key={i} castShadow position={[x * 0.8, 0.55, 0]}>
          <cylinderGeometry args={[0.08, 0.08, 0.8, 16]} />
          <meshStandardMaterial color="#6b7280" metalness={0.8} roughness={0.3} />
        </mesh>
      ))}

      {[-1.95, 1.95].map((x, i) => (
        <group key={i} position={[x, 0.1, 0]}>
          <mesh castShadow>
            <cylinderGeometry args={[0.1, 0.15, 0.6, 16]} />
            <meshStandardMaterial color="#1f2937" metalness={0.7} roughness={0.3} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function VisionInspectorModel({ device }: { device: Device }) {
  return (
    <group>
      <mesh castShadow receiveShadow position={[0, 0.4, 0]}>
        <boxGeometry args={[0.6, 0.8, 0.6]} />
        <meshStandardMaterial color="#1f2937" metalness={0.6} roughness={0.4} />
      </mesh>

      <mesh castShadow position={[0, 0.85, 0]}>
        <cylinderGeometry args={[0.12, 0.15, 0.15, 16]} />
        <meshStandardMaterial color="#374151" metalness={0.7} roughness={0.3} />
      </mesh>

      <group position={[0, 1.1, 0]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.05, 0.08, 0.3, 16]} />
          <meshStandardMaterial color="#1e293b" metalness={0.8} roughness={0.2} />
        </mesh>
        <mesh castShadow position={[0, 0.2, 0]}>
          <sphereGeometry args={[0.08, 16, 16]} />
          <meshStandardMaterial
            color="#0f172a"
            metalness={0.9}
            roughness={0.1}
            emissive="#38bdf8"
            emissiveIntensity={0.3}
          />
        </mesh>
        <mesh position={[0, 0.15, 0]} rotation={[0, 0, 0]}>
          <ringGeometry args={[0.08, 0.12, 16]} />
          <meshBasicMaterial color="#f59e0b" transparent opacity={0.8} side={THREE.DoubleSide} />
        </mesh>
      </group>

      <mesh position={[0, 0.3, 0]}>
        <boxGeometry args={[0.4, 0.02, 0.4]} />
        <meshStandardMaterial color="#1e293b" metalness={0.5} roughness={0.5} />
      </mesh>
    </group>
  );
}

function PlaceholderModel({ device }: { device: Device }) {
  return (
    <group>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[0.5, 0.5, 0.5]} />
        <meshStandardMaterial color="#4b5563" metalness={0.5} roughness={0.5} />
      </mesh>
    </group>
  );
}

function DeviceLabel({ name }: { name: string }) {
  const { camera } = useThree();
  const ref = useRef<THREE.Sprite>(null);

  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
    ctx.fillRect(0, 0, 256, 64);

    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, 256, 64);

    ctx.fillStyle = '#e2e8f0';
    ctx.font = 'bold 24px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, 128, 32);

    const texture = new THREE.CanvasTexture(canvas);
    return texture;
  }, [name]);

  useFrame(() => {
    if (ref.current) {
      ref.current.lookAt(camera.position);
    }
  });

  return (
    <sprite ref={ref} position={[0, 2.2, 0]} scale={[2, 0.5, 1]}>
      <spriteMaterial map={texture} transparent />
    </sprite>
  );
}

function AnomalyRing() {
  const ref = useRef<THREE.Mesh>(null);

  useFrame((_, delta) => {
    if (ref.current) {
      ref.current.rotation.y += delta * 2;
    }
  });

  return (
    <mesh ref={ref} position={[0, 1.5, 0]} rotation={[Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.8, 1.0, 32]} />
      <meshBasicMaterial color="#ef4444" transparent opacity={0.6} side={THREE.DoubleSide} />
    </mesh>
  );
}

function AnomalyParticle({ anomaly }: { anomaly: AnomalyEvent }) {
  const ref = useRef<THREE.Points>(null);
  const particleCount = 100;

  const positions = useMemo(() => {
    const pos = new Float32Array(particleCount * 3);
    const center = anomaly.position || { x: 0, y: 1, z: 0 };

    for (let i = 0; i < particleCount; i++) {
      const i3 = i * 3;
      pos[i3] = center.x + (Math.random() - 0.5) * 0.5;
      pos[i3 + 1] = center.y + Math.random() * 0.5;
      pos[i3 + 2] = center.z + (Math.random() - 0.5) * 0.5;
    }
    return pos;
  }, [anomaly.id]);

  const colors = useMemo(() => {
    const col = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
      const i3 = i * 3;
      col[i3] = 1.0;
      col[i3 + 1] = 0.2 + Math.random() * 0.3;
      col[i3 + 2] = 0.2;
    }
    return col;
  }, []);

  useFrame((_, delta) => {
    if (ref.current) {
      const posArray = ref.current.geometry.attributes.position.array as Float32Array;
      for (let i = 0; i < particleCount; i++) {
        const i3 = i * 3;
        posArray[i3 + 1] += delta * (0.2 + Math.random() * 0.3);
        if (posArray[i3 + 1] > 2) {
          const center = anomaly.position || { x: 0, y: 1, z: 0 };
          posArray[i3] = center.x + (Math.random() - 0.5) * 0.5;
          posArray[i3 + 1] = center.y;
          posArray[i3 + 2] = center.z + (Math.random() - 0.5) * 0.5;
        }
      }
      ref.current.geometry.attributes.position.needsUpdate = true;
    }
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={particleCount}
          array={positions}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-color"
          count={particleCount}
          array={colors}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.05}
        vertexColors
        transparent
        opacity={0.8}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

function VirtualLimitVisual({ limit }: { limit: VirtualLimit }) {
  const { bounds } = limit;
  const size = {
    x: bounds.x_max - bounds.x_min,
    y: bounds.y_max - bounds.y_min,
    z: bounds.z_max - bounds.z_min,
  };
  const center = {
    x: (bounds.x_max + bounds.x_min) / 2,
    y: (bounds.y_max + bounds.y_min) / 2,
    z: (bounds.z_max + bounds.z_min) / 2,
  };

  const color = limit.color || '#00ff00';
  const opacity = limit.opacity || 0.2;

  const boxGeometry = useMemo(
    () => new THREE.BoxGeometry(size.x, size.y, size.z),
    [size.x, size.y, size.z]
  );

  const edgesGeometry = useMemo(
    () => new THREE.EdgesGeometry(boxGeometry),
    [boxGeometry]
  );

  return (
    <group position={[center.x, center.y, center.z]}>
      <mesh geometry={boxGeometry} pointerEvents="none">
        <meshBasicMaterial
          color={color}
          transparent
          opacity={opacity}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      <lineSegments geometry={edgesGeometry} pointerEvents="none">
        <lineBasicMaterial color={color} linewidth={2} />
      </lineSegments>

      <mesh position={[0, size.y / 2 + 0.05, 0]} pointerEvents="none">
        <planeGeometry args={[size.x * 0.3, 0.15]} />
        <meshBasicMaterial color={color} transparent opacity={0.8} />
      </mesh>
    </group>
  );
}

function CalibrationPicker() {
  const { camera, gl } = useThree();
  const addCalibrationPoint = useDeviceStore((s) => s.addCalibrationPoint);

  useEffect(() => {
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    const handleClick = (event: MouseEvent) => {
      const rect = gl.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersectPoint = new THREE.Vector3();
      if (raycaster.ray.intersectPlane(plane, intersectPoint)) {
        const pos = {
          x: Math.round(intersectPoint.x * 1000) / 1000,
          y: Math.round(intersectPoint.y * 1000) / 1000,
          z: Math.round(intersectPoint.z * 1000) / 1000,
        };
        addCalibrationPoint(pos, pos);
      }
    };

    gl.domElement.addEventListener('click', handleClick);
    return () => gl.domElement.removeEventListener('click', handleClick);
  }, [camera, gl, addCalibrationPoint]);

  return null;
}

function CalibrationPointsDisplay() {
  const calibrationPoints = useDeviceStore((s) => s.calibrationPoints);

  return (
    <>
      {calibrationPoints.measured.map((point, index) => (
        <group key={index} position={[point.x, point.y, point.z]}>
          <mesh>
            <sphereGeometry args={[0.04, 16, 16]} />
            <meshBasicMaterial color="#10b981" />
          </mesh>
          <mesh position={[0, 0.08, 0]}>
            <ringGeometry args={[0.05, 0.08, 16]} />
            <meshBasicMaterial color="#10b981" transparent opacity={0.6} side={THREE.DoubleSide} />
          </mesh>
        </group>
      ))}
    </>
  );
}
