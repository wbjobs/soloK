import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Slider } from '@react-three/drei';
import useAIStore from '../store/aiStore';
import { Box, RotateCcw, Layers, Move, ZoomIn, ZoomOut } from 'lucide-react';

function VolumeSlice({ volume, sliceIndex, orientation, onSliceClick }) {
  const meshRef = useRef();
  const textureRef = useRef();

  const texture = useMemo(() => {
    if (!volume || !volume.data) return null;

    const { width, height, depth } = volume.dimensions;
    let sliceData;

    if (orientation === 'axial') {
      const z = Math.min(sliceIndex, depth - 1);
      sliceData = new Uint8Array(width * height * 4);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const srcIdx = (z * height + y) * width + x;
          const dstIdx = (y * width + x) * 4;
          const value = volume.data[srcIdx];
          sliceData[dstIdx] = value;
          sliceData[dstIdx + 1] = value;
          sliceData[dstIdx + 2] = value;
          sliceData[dstIdx + 3] = 255;
        }
      }
    } else if (orientation === 'coronal') {
      const y = Math.min(sliceIndex, height - 1);
      sliceData = new Uint8Array(width * depth * 4);
      for (let z = 0; z < depth; z++) {
        for (let x = 0; x < width; x++) {
          const srcIdx = (z * height + y) * width + x;
          const dstIdx = (z * width + x) * 4;
          const value = volume.data[srcIdx];
          sliceData[dstIdx] = value;
          sliceData[dstIdx + 1] = value;
          sliceData[dstIdx + 2] = value;
          sliceData[dstIdx + 3] = 255;
        }
      }
    } else if (orientation === 'sagittal') {
      const x = Math.min(sliceIndex, width - 1);
      sliceData = new Uint8Array(height * depth * 4);
      for (let z = 0; z < depth; z++) {
        for (let y = 0; y < height; y++) {
          const srcIdx = (z * height + y) * width + x;
          const dstIdx = (z * height + y) * 4;
          const value = volume.data[srcIdx];
          sliceData[dstIdx] = value;
          sliceData[dstIdx + 1] = value;
          sliceData[dstIdx + 2] = value;
          sliceData[dstIdx + 3] = 255;
        }
      }
    }

    const tex = new THREE.DataTexture(
      sliceData,
      orientation === 'axial' ? width : orientation === 'coronal' ? width : height,
      orientation === 'axial' ? height : depth,
      THREE.RGBAFormat
    );
    tex.needsUpdate = true;
    return tex;
  }, [volume, sliceIndex, orientation]);

  if (!texture) return null;

  const dimensions = volume.dimensions;
  let planeWidth, planeHeight, planePosition;

  if (orientation === 'axial') {
    planeWidth = dimensions.width / 100;
    planeHeight = dimensions.height / 100;
    planePosition = [0, 0, (sliceIndex / dimensions.depth - 0.5) * dimensions.depth / 50];
  } else if (orientation === 'coronal') {
    planeWidth = dimensions.width / 100;
    planeHeight = dimensions.depth / 100;
    planePosition = [0, (sliceIndex / dimensions.height - 0.5) * dimensions.height / 50, 0];
  } else if (orientation === 'sagittal') {
    planeWidth = dimensions.height / 100;
    planeHeight = dimensions.depth / 100;
    planePosition = [(sliceIndex / dimensions.width - 0.5) * dimensions.width / 50, 0, 0];
  }

  return (
    <mesh
      ref={meshRef}
      position={planePosition}
      onClick={(e) => {
        e.stopPropagation();
        onSliceClick?.(e.point);
      }}
    >
      <planeGeometry args={[planeWidth, planeHeight]} />
      <meshBasicMaterial map={texture} side={THREE.DoubleSide} transparent />
    </mesh>
  );
}

function AnnotationMarker({ position, color, label, isSelected, onClick }) {
  const labelTexture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 256, 64);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 28px Arial';
    ctx.fillText(label, 10, 42);
    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }, [color, label]);

  return (
    <group position={position}>
      <mesh onClick={(e) => { e.stopPropagation(); onClick?.(); }}>
        <sphereGeometry args={[0.15, 16, 16]} />
        <meshBasicMaterial color={color} />
      </mesh>
      {isSelected && (
        <mesh>
          <sphereGeometry args={[0.25, 16, 16]} />
          <meshBasicMaterial color={color} transparent opacity={0.3} />
        </mesh>
      )}
      <sprite position={[0.3, 0.3, 0]} scale={[2, 0.5, 1]}>
        <spriteMaterial map={labelTexture} transparent />
      </sprite>
    </group>
  );
}

function VolumeBoundingBox({ dimensions, color = '#4a5568' }) {
  const geometry = useMemo(() => {
    const w = dimensions.width / 100;
    const h = dimensions.height / 100;
    const d = dimensions.depth / 100;
    return new THREE.BoxGeometry(w, h, d);
  }, [dimensions]);

  return (
    <lineSegments geometry={new THREE.EdgesGeometry(geometry)}>
      <lineBasicMaterial color={color} />
    </lineSegments>
  );
}

function CrosshairLine({ orientation, position, dimensions }) {
  const points = useMemo(() => {
    const w = dimensions.width / 100;
    const h = dimensions.height / 100;
    const d = dimensions.depth / 100;

    if (orientation === 'axial') {
      return [
        new THREE.Vector3(-w / 2, position[1], position[2]),
        new THREE.Vector3(w / 2, position[1], position[2]),
      ];
    } else if (orientation === 'coronal') {
      return [
        new THREE.Vector3(-w / 2, position[1], -d / 2),
        new THREE.Vector3(w / 2, position[1], d / 2),
      ];
    }
    return [];
  }, [orientation, position, dimensions]);

  return (
    <line>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={points.length}
          array={new Float32Array(points.flatMap(p => [p.x, p.y, p.z]))}
          itemSize={3}
        />
      </bufferGeometry>
      <lineBasicMaterial color="#ff0000" />
    </line>
  );
}

function Scene({ volume, slices, annotations, selectedAnnotation, onSelectAnnotation, onSliceClick }) {
  if (!volume) return null;

  return (
    <>
      <ambientLight intensity={0.5} />
      <pointLight position={[10, 10, 10]} />

      <VolumeBoundingBox dimensions={volume.dimensions} />

      <VolumeSlice
        volume={volume}
        sliceIndex={slices.axial}
        orientation="axial"
        onSliceClick={onSliceClick}
      />
      <VolumeSlice
        volume={volume}
        sliceIndex={slices.coronal}
        orientation="coronal"
        onSliceClick={onSliceClick}
      />
      <VolumeSlice
        volume={volume}
        sliceIndex={slices.sagittal}
        orientation="sagittal"
        onSliceClick={onSliceClick}
      />

      {annotations.map((ann) => (
        <AnnotationMarker
          key={ann.id}
          position={ann.position}
          color={ann.color}
          label={ann.label}
          isSelected={selectedAnnotation?.id === ann.id}
          onClick={() => onSelectAnnotation?.(ann)}
        />
      ))}

      <OrbitControls
        enableDamping
        dampingFactor={0.05}
        minDistance={1}
        maxDistance={20}
      />
    </>
  );
}

export default function VolumeRenderer({
  volumeData,
  onAnnotationAdd,
  onAnnotationRemove,
}) {
  const containerRef = useRef(null);
  const [slices, setSlices] = useState({
    axial: 0,
    coronal: 0,
    sagittal: 0,
  });
  const [annotations, setAnnotations] = useState([]);
  const [selectedAnnotation, setSelectedAnnotation] = useState(null);
  const [showPanel, setShowPanel] = useState(true);
  const [annotationMode, setAnnotationMode] = useState(false);
  const [currentLabel, setCurrentLabel] = useState('病灶');
  const [currentColor, setCurrentColor] = useState('#FF6B6B');

  const volume = useMemo(() => {
    if (!volumeData) return null;
    return volumeData;
  }, [volumeData]);

  useEffect(() => {
    if (volume) {
      const { width, height, depth } = volume.dimensions;
      setSlices({
        axial: Math.floor(depth / 2),
        coronal: Math.floor(height / 2),
        sagittal: Math.floor(width / 2),
      });
    }
  }, [volume]);

  const handleSliceClick = useCallback((point) => {
    if (!annotationMode || !volume) return;

    const dimensions = volume.dimensions;
    const position = [
      (point.x / (dimensions.width / 100)) * dimensions.width,
      (point.y / (dimensions.height / 100)) * dimensions.height,
      (point.z / (dimensions.depth / 100)) * dimensions.depth,
    ];

    const newAnnotation = {
      id: `3d-ann-${Date.now()}`,
      position,
      label: currentLabel,
      color: currentColor,
      timestamp: Date.now(),
    };

    setAnnotations([...annotations, newAnnotation]);
    onAnnotationAdd?.(newAnnotation);
  }, [annotationMode, volume, currentLabel, currentColor, annotations, onAnnotationAdd]);

  const handleRemoveAnnotation = useCallback((annotationId) => {
    setAnnotations(annotations.filter((a) => a.id !== annotationId));
    onAnnotationRemove?.(annotationId);
    if (selectedAnnotation?.id === annotationId) {
      setSelectedAnnotation(null);
    }
  }, [annotations, onAnnotationRemove, selectedAnnotation]);

  const handleResetView = useCallback(() => {
    if (volume) {
      const { width, height, depth } = volume.dimensions;
      setSlices({
        axial: Math.floor(depth / 2),
        coronal: Math.floor(height / 2),
        sagittal: Math.floor(width / 2),
      });
    }
  }, [volume]);

  if (!volume) {
    return (
      <div className="w-full h-full bg-gray-800 rounded-lg flex items-center justify-center">
        <div className="text-center">
          <Box size={48} className="mx-auto text-gray-500 mb-3" />
          <p className="text-gray-400">加载3D容积数据...</p>
        </div>
      </div>
    );
  }

  const { width, height, depth } = volume.dimensions;

  return (
    <div className="w-full h-full flex">
      <div ref={containerRef} className="flex-1 relative">
        <Canvas
          camera={{ position: [0, 0, 8], fov: 50 }}
          gl={{ antialias: true, alpha: false }}
          style={{ background: '#1a1a2e' }}
        >
          <Scene
            volume={volume}
            slices={slices}
            annotations={annotations}
            selectedAnnotation={selectedAnnotation}
            onSelectAnnotation={setSelectedAnnotation}
            onSliceClick={handleSliceClick}
          />
        </Canvas>

        <div className="absolute top-4 left-4 z-10">
          <div className="bg-gray-900/90 px-3 py-2 rounded-lg text-white text-sm">
            <span className="text-gray-400">尺寸: </span>
            {width} × {height} × {depth}
          </div>
        </div>

        {annotationMode && (
          <div className="absolute top-4 right-4 z-10">
            <div className="bg-blue-600 px-3 py-2 rounded-lg text-white text-sm flex items-center gap-2">
              <Move size={16} />
              点击3D视图添加标注
            </div>
          </div>
        )}
      </div>

      {showPanel && (
        <div className="w-72 bg-gray-900 border-l border-gray-700 flex flex-col">
          <div className="p-3 border-b border-gray-700 flex items-center justify-between">
            <h3 className="text-white font-semibold flex items-center gap-2">
              <Layers size={18} />
              3D 容积视图
            </h3>
            <button
              onClick={() => setShowPanel(false)}
              className="text-gray-400 hover:text-white"
            >
              <X size={16} />
            </button>
          </div>

          <div className="p-3 border-b border-gray-700">
            <div className="flex gap-2 mb-3">
              <button
                onClick={() => setAnnotationMode(!annotationMode)}
                className={`flex-1 py-2 rounded text-sm ${
                  annotationMode
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                {annotationMode ? '标注中...' : '添加标注'}
              </button>
              <button
                onClick={handleResetView}
                className="p-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded"
                title="重置切面"
              >
                <RotateCcw size={18} />
              </button>
            </div>

            <div className="space-y-2">
              <div>
                <label className="block text-gray-300 text-xs mb-1">
                  横切面 (Axial): {slices.axial} / {depth}
                </label>
                <input
                  type="range"
                  min="0"
                  max={depth - 1}
                  value={slices.axial}
                  onChange={(e) => setSlices({ ...slices, axial: parseInt(e.target.value) })}
                  className="w-full h-1 bg-gray-600 rounded"
                />
              </div>

              <div>
                <label className="block text-gray-300 text-xs mb-1">
                  冠状面 (Coronal): {slices.coronal} / {height}
                </label>
                <input
                  type="range"
                  min="0"
                  max={height - 1}
                  value={slices.coronal}
                  onChange={(e) => setSlices({ ...slices, coronal: parseInt(e.target.value) })}
                  className="w-full h-1 bg-gray-600 rounded"
                />
              </div>

              <div>
                <label className="block text-gray-300 text-xs mb-1">
                  矢状面 (Sagittal): {slices.sagittal} / {width}
                </label>
                <input
                  type="range"
                  min="0"
                  max={width - 1}
                  value={slices.sagittal}
                  onChange={(e) => setSlices({ ...slices, sagittal: parseInt(e.target.value) })}
                  className="w-full h-1 bg-gray-600 rounded"
                />
              </div>
            </div>
          </div>

          {annotationMode && (
            <div className="p-3 border-b border-gray-700">
              <div className="mb-2">
                <label className="block text-gray-300 text-xs mb-1">标注名称</label>
                <input
                  type="text"
                  value={currentLabel}
                  onChange={(e) => setCurrentLabel(e.target.value)}
                  className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white text-sm"
                />
              </div>
              <div>
                <label className="block text-gray-300 text-xs mb-1">标注颜色</label>
                <div className="flex gap-1">
                  {['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFEAA7', '#DDA0DD'].map((color) => (
                    <button
                      key={color}
                      onClick={() => setCurrentColor(color)}
                      className={`w-6 h-6 rounded-full border-2 ${
                        currentColor === color ? 'border-white' : 'border-transparent'
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-3">
            <h4 className="text-gray-300 text-sm mb-2">3D 标注 ({annotations.length})</h4>
            {annotations.length === 0 ? (
              <p className="text-gray-500 text-xs">暂无标注</p>
            ) : (
              <div className="space-y-2">
                {annotations.map((ann) => (
                  <div
                    key={ann.id}
                    className={`p-2 rounded text-sm cursor-pointer ${
                      selectedAnnotation?.id === ann.id
                        ? 'bg-blue-600'
                        : 'bg-gray-700 hover:bg-gray-600'
                    }`}
                    onClick={() => setSelectedAnnotation(ann)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: ann.color }}
                        />
                        <span className="text-white">{ann.label}</span>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveAnnotation(ann.id);
                        }}
                        className="text-gray-400 hover:text-red-400"
                      >
                        <X size={14} />
                      </button>
                    </div>
                    <div className="text-gray-400 text-xs mt-1">
                      ({ann.position[0]?.toFixed(0)}, {ann.position[1]?.toFixed(0)}, {ann.position[2]?.toFixed(0)})
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {!showPanel && (
        <button
          onClick={() => setShowPanel(true)}
          className="absolute right-4 top-4 z-10 p-2 bg-gray-800 hover:bg-gray-700 text-white rounded"
        >
          <Layers size={20} />
        </button>
      )}
    </div>
  );
}
