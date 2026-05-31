import { useRef, useMemo, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Stars } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import * as THREE from 'three';
import { positionsBuffer, speedsBuffer } from '../hooks/useSimulation';
import useSimulationStore from '../store/useSimulationStore';

const N_PARTICLES = 1000;
const MAX_SPEED = 3.0;

function lerpColor(t: number, outRgb: Float32Array) {
  const clampedT = Math.max(0, Math.min(1, t));
  const cold = { r: 0.1, g: 0.3, b: 1.0 };
  const hot = { r: 1.0, g: 0.2, b: 0.2 };
  outRgb[0] = cold.r + (hot.r - cold.r) * clampedT;
  outRgb[1] = cold.g + (hot.g - cold.g) * clampedT;
  outRgb[2] = cold.b + (hot.b - cold.b) * clampedT;
}

function Particles() {
  const pointsRef = useRef<THREE.Points>(null);
  const posBufferRef = useRef<Float32Array>(positionsBuffer);
  const speedBufferRef = useRef<Float32Array>(speedsBuffer);
  const rgbWork = useRef(new Float32Array(3));

  const geometry = useMemo(() => {
    const pos = new Float32Array(N_PARTICLES * 3);
    const col = new Float32Array(N_PARTICLES * 3);

    for (let i = 0; i < N_PARTICLES; i++) {
      const t = i / N_PARTICLES;
      const hue = 0.5 + t * 0.2;
      const color = new THREE.Color().setHSL(hue, 0.8, 0.6);
      col[i * 3] = color.r;
      col[i * 3 + 1] = color.g;
      col[i * 3 + 2] = color.b;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return geo;
  }, []);

  useFrame(() => {
    if (!pointsRef.current) return;
    const geom = pointsRef.current.geometry;
    const posAttr = geom.getAttribute('position') as THREE.BufferAttribute;
    const colAttr = geom.getAttribute('color') as THREE.BufferAttribute;
    const posArr = posAttr.array as Float32Array;
    const colArr = colAttr.array as Float32Array;
    const srcPos = posBufferRef.current;
    const srcSpeed = speedBufferRef.current;

    posArr.set(srcPos);
    posAttr.needsUpdate = true;

    const work = rgbWork.current;
    for (let i = 0; i < N_PARTICLES; i++) {
      const speed = srcSpeed[i] || 0;
      const t = speed / MAX_SPEED;
      lerpColor(t, work);
      const idx = i * 3;
      colArr[idx] = work[0];
      colArr[idx + 1] = work[1];
      colArr[idx + 2] = work[2];
    }
    colAttr.needsUpdate = true;
  });

  return (
    <points ref={pointsRef} geometry={geometry}>
      <pointsMaterial
        size={0.12}
        vertexColors
        transparent
        opacity={0.9}
        sizeAttenuation
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  );
}

function SimulationBox() {
  const edges = useMemo(() => {
    const geometry = new THREE.BoxGeometry(10, 10, 10);
    return new THREE.EdgesGeometry(geometry);
  }, []);

  return (
    <lineSegments geometry={edges}>
      <lineBasicMaterial color="#00f5ff" transparent opacity={0.15} />
    </lineSegments>
  );
}

function ElectricFieldIndicator() {
  const electricField = useSimulationStore((s) => s.electricField);
  const groupRef = useRef<THREE.Group>(null);

  const hasField = Math.abs(electricField.E_x) > 0.01 ||
                   Math.abs(electricField.E_y) > 0.01 ||
                   Math.abs(electricField.E_z) > 0.01;

  const { dir, length } = useMemo(() => {
    const ex = electricField.E_x;
    const ey = electricField.E_y;
    const ez = electricField.E_z;
    const len = Math.sqrt(ex * ex + ey * ey + ez * ez);
    if (len < 0.01) return { dir: new THREE.Vector3(1, 0, 0), length: 0 };
    return {
      dir: new THREE.Vector3(ex / len, ey / len, ez / len),
      length: Math.min(len * 0.5, 5),
    };
  }, [electricField]);

  if (!hasField || length <= 0) return null;

  return (
    <group ref={groupRef}>
      <arrowHelper
        args={[dir, new THREE.Vector3(-5, 5, 5), length, 0xff0000, 0.5, 0.2]}
      />
    </group>
  );
}

function SceneContent() {
  return (
    <>
      <ambientLight intensity={0.3} />
      <pointLight position={[10, 10, 10]} intensity={1} color="#4da6ff" />
      <pointLight position={[-10, -10, -10]} intensity={0.5} color="#a855f7" />

      <SimulationBox />
      <Particles />
      <ElectricFieldIndicator />

      <Stars
        radius={100}
        depth={50}
        count={3000}
        factor={4}
        saturation={0}
        fade
        speed={0.5}
      />

      <OrbitControls
        enableDamping
        dampingFactor={0.05}
        minDistance={5}
        maxDistance={50}
        enablePan
        enableZoom
        enableRotate
      />

      <EffectComposer>
        <Bloom
          luminanceThreshold={0.2}
          luminanceSmoothing={0.9}
          intensity={1.5}
          mipmapBlur
        />
      </EffectComposer>
    </>
  );
}

export default function ParticleScene() {
  const { connect } = useSimulationStore();

  useEffect(() => {
    connect();
  }, [connect]);

  return (
    <div className="canvas-container">
      <Canvas
        camera={{ position: [0, 0, 18], fov: 60 }}
        gl={{ antialias: false, alpha: true, powerPreference: 'high-performance' }}
        style={{ background: 'transparent' }}
        dpr={[1, 1.5]}
      >
        <color attach="background" args={['#050510']} />
        <fog attach="fog" args={['#050510', 20, 60]} />
        <SceneContent />
      </Canvas>
    </div>
  );
}
