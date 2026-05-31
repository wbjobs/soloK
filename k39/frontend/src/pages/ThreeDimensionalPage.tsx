import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../store';
import { fetchMatches } from '../store/matchSlice';
import * as THREE from 'three';

const ThreeDimensionalPage = () => {
  const { matchId } = useParams<{ matchId: string }>();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const animationIdRef = useRef<number>(0);
  const playersRef = useRef<THREE.Mesh[]>([]);
  const ballRef = useRef<THREE.Mesh | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [selectedView, setSelectedView] = useState<'top' | 'side' | 'tactical'>('tactical');
  const [showPitch, setShowPitch] = useState(true);

  const { matches } = useAppSelector((state) => state.match);
  const currentMatch = matches.find((m) => m.id === matchId);

  useEffect(() => {
    dispatch(fetchMatches());
  }, [dispatch]);

  useEffect(() => {
    if (!containerRef.current) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a472a);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(
      60,
      containerRef.current.clientWidth / containerRef.current.clientHeight,
      0.1,
      1000
    );
    camera.position.set(0, 80, 120);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(50, 100, 50);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    scene.add(directionalLight);

    const pitchWidth = 105;
    const pitchHeight = 68;

    const pitchGeometry = new THREE.PlaneGeometry(pitchWidth, pitchHeight);
    const pitchMaterial = new THREE.MeshStandardMaterial({
      color: 0x2d8a3e,
      roughness: 0.8,
    });
    const pitch = new THREE.Mesh(pitchGeometry, pitchMaterial);
    pitch.rotation.x = -Math.PI / 2;
    pitch.receiveShadow = true;
    scene.add(pitch);

    const lineMaterial = new THREE.LineBasicMaterial({ color: 0xffffff });

    const points: THREE.Vector3[] = [];
    for (let i = -pitchWidth / 2; i <= pitchWidth / 2; i += pitchWidth) {
      for (let j = -pitchHeight / 2; j <= pitchHeight / 2; j += pitchHeight) {
        points.push(new THREE.Vector3(i, 0.01, j));
      }
    }
    const perimeterGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-pitchWidth / 2, 0.01, -pitchHeight / 2),
      new THREE.Vector3(pitchWidth / 2, 0.01, -pitchHeight / 2),
      new THREE.Vector3(pitchWidth / 2, 0.01, pitchHeight / 2),
      new THREE.Vector3(-pitchWidth / 2, 0.01, pitchHeight / 2),
      new THREE.Vector3(-pitchWidth / 2, 0.01, -pitchHeight / 2),
    ]);
    const perimeter = new THREE.Line(perimeterGeometry, lineMaterial);
    scene.add(perimeter);

    const centerLineGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0.01, -pitchHeight / 2),
      new THREE.Vector3(0, 0.01, pitchHeight / 2),
    ]);
    const centerLine = new THREE.Line(centerLineGeometry, lineMaterial);
    scene.add(centerLine);

    const centerCirclePoints: THREE.Vector3[] = [];
    for (let i = 0; i <= 64; i++) {
      const angle = (i / 64) * Math.PI * 2;
      centerCirclePoints.push(new THREE.Vector3(
        Math.cos(angle) * 9.15,
        0.01,
        Math.sin(angle) * 9.15
      ));
    }
    const centerCircleGeometry = new THREE.BufferGeometry().setFromPoints(centerCirclePoints);
    const centerCircle = new THREE.Line(centerCircleGeometry, lineMaterial);
    scene.add(centerCircle);

    const createGoalArea = (x: number) => {
      const goalAreaPoints = [
        new THREE.Vector3(x, 0.01, -20.16),
        new THREE.Vector3(x + (x > 0 ? -16.5 : 16.5), 0.01, -20.16),
        new THREE.Vector3(x + (x > 0 ? -16.5 : 16.5), 0.01, 20.16),
        new THREE.Vector3(x, 0.01, 20.16),
      ];
      const goalAreaGeometry = new THREE.BufferGeometry().setFromPoints(goalAreaPoints);
      const goalArea = new THREE.Line(goalAreaGeometry, lineMaterial);
      scene.add(goalArea);

      const goalPoints = [
        new THREE.Vector3(x, 2.44, -3.66),
        new THREE.Vector3(x, 0, -3.66),
        new THREE.Vector3(x, 0, 3.66),
        new THREE.Vector3(x, 2.44, 3.66),
        new THREE.Vector3(x + (x > 0 ? -2 : 2), 2.44, -3.66),
        new THREE.Vector3(x + (x > 0 ? -2 : 2), 0, -3.66),
        new THREE.Vector3(x + (x > 0 ? -2 : 2), 0, 3.66),
        new THREE.Vector3(x + (x > 0 ? -2 : 2), 2.44, 3.66),
      ];
      const goalGeometry = new THREE.BufferGeometry().setFromPoints(goalPoints);
      const goalMaterial = new THREE.LineBasicMaterial({ color: 0xffffff });
      const goal = new THREE.LineSegments(goalGeometry, goalMaterial);
      scene.add(goal);
    };

    createGoalArea(-pitchWidth / 2);
    createGoalArea(pitchWidth / 2);

    const homeFormation = [
      { x: -45, z: 0, num: 1 },
      { x: -30, z: -20, num: 2 },
      { x: -30, z: -7, num: 4 },
      { x: -30, z: 7, num: 5 },
      { x: -30, z: 20, num: 3 },
      { x: -15, z: -25, num: 7 },
      { x: -15, z: -8, num: 6 },
      { x: -15, z: 8, num: 8 },
      { x: -15, z: 25, num: 11 },
      { x: 0, z: -10, num: 10 },
      { x: 0, z: 10, num: 9 },
    ];

    const awayFormation = [
      { x: 45, z: 0, num: 1 },
      { x: 30, z: -20, num: 2 },
      { x: 30, z: -7, num: 4 },
      { x: 30, z: 7, num: 5 },
      { x: 30, z: 20, num: 3 },
      { x: 15, z: -25, num: 7 },
      { x: 15, z: -8, num: 6 },
      { x: 15, z: 8, num: 8 },
      { x: 15, z: 25, num: 11 },
      { x: 0, z: -10, num: 10 },
      { x: 0, z: 10, num: 9 },
    ];

    const players: THREE.Mesh[] = [];

    homeFormation.forEach((pos) => {
      const playerGeometry = new THREE.CylinderGeometry(1.5, 1.5, 4, 16);
      const playerMaterial = new THREE.MeshStandardMaterial({ color: 0x3b82f6 });
      const player = new THREE.Mesh(playerGeometry, playerMaterial);
      player.position.set(pos.x, 2, pos.z);
      player.castShadow = true;
      player.userData = { team: 'home', number: pos.num, originalX: pos.x, originalZ: pos.z };
      scene.add(player);
      players.push(player);

      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 64;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 32px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(pos.num.toString(), 32, 32);
      const texture = new THREE.CanvasTexture(canvas);
      const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
      const sprite = new THREE.Sprite(spriteMaterial);
      sprite.position.set(pos.x, 5, pos.z);
      sprite.scale.set(3, 3, 1);
      scene.add(sprite);
    });

    awayFormation.forEach((pos) => {
      const playerGeometry = new THREE.CylinderGeometry(1.5, 1.5, 4, 16);
      const playerMaterial = new THREE.MeshStandardMaterial({ color: 0xef4444 });
      const player = new THREE.Mesh(playerGeometry, playerMaterial);
      player.position.set(pos.x, 2, pos.z);
      player.castShadow = true;
      player.userData = { team: 'away', number: pos.num, originalX: pos.x, originalZ: pos.z };
      scene.add(player);
      players.push(player);

      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 64;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 32px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(pos.num.toString(), 32, 32);
      const texture = new THREE.CanvasTexture(canvas);
      const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
      const sprite = new THREE.Sprite(spriteMaterial);
      sprite.position.set(pos.x, 5, pos.z);
      sprite.scale.set(3, 3, 1);
      scene.add(sprite);
    });

    playersRef.current = players;

    const ballGeometry = new THREE.SphereGeometry(1.2, 32, 32);
    const ballMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const ball = new THREE.Mesh(ballGeometry, ballMaterial);
    ball.position.set(0, 1.2, 0);
    ball.castShadow = true;
    scene.add(ball);
    ballRef.current = ball;

    let isDragging = false;
    let previousMousePosition = { x: 0, y: 0 };
    let cameraAngle = { theta: 0, phi: Math.PI / 4 };
    let cameraDistance = 140;

    const onMouseDown = (e: MouseEvent) => {
      isDragging = true;
      previousMousePosition = { x: e.clientX, y: e.clientY };
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;

      const deltaX = e.clientX - previousMousePosition.x;
      const deltaY = e.clientY - previousMousePosition.y;

      cameraAngle.theta -= deltaX * 0.01;
      cameraAngle.phi = Math.max(0.1, Math.min(Math.PI / 2 - 0.1, cameraAngle.phi + deltaY * 0.01));

      updateCameraPosition();

      previousMousePosition = { x: e.clientX, y: e.clientY };
    };

    const onMouseUp = () => {
      isDragging = false;
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      cameraDistance = Math.max(50, Math.min(300, cameraDistance + e.deltaY * 0.3));
      updateCameraPosition();
    };

    const updateCameraPosition = () => {
      if (!camera) return;
      camera.position.x = cameraDistance * Math.sin(cameraAngle.phi) * Math.cos(cameraAngle.theta);
      camera.position.y = cameraDistance * Math.cos(cameraAngle.phi);
      camera.position.z = cameraDistance * Math.sin(cameraAngle.phi) * Math.sin(cameraAngle.theta);
      camera.lookAt(0, 0, 0);
    };

    renderer.domElement.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    renderer.domElement.addEventListener('wheel', onWheel, { passive: false });

    let time = 0;
    const animate = () => {
      animationIdRef.current = requestAnimationFrame(animate);
      time += 0.016 * playbackSpeed;

      if (isPlaying) {
        setCurrentTime((prev) => prev + 0.016 * playbackSpeed);

        players.forEach((player) => {
          const { originalX, originalZ, team } = player.userData;
          const direction = team === 'home' ? 1 : -1;
          player.position.x = originalX + Math.sin(time + originalZ * 0.1) * 5 * direction;
          player.position.z = originalZ + Math.cos(time * 0.7 + originalX * 0.05) * 3;
        });

        if (ballRef.current) {
          ballRef.current.position.x = Math.sin(time * 0.5) * 30;
          ballRef.current.position.z = Math.cos(time * 0.7) * 20;
          ballRef.current.position.y = 1.2 + Math.abs(Math.sin(time * 2)) * 2;
        }
      }

      renderer.render(scene, camera);
    };

    animate();

    const handleResize = () => {
      if (!containerRef.current || !camera || !renderer) return;
      camera.aspect = containerRef.current.clientWidth / containerRef.current.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      renderer.domElement.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      renderer.domElement.removeEventListener('wheel', onWheel);
      cancelAnimationFrame(animationIdRef.current);
      if (containerRef.current && renderer.domElement) {
        containerRef.current.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, [isPlaying, playbackSpeed]);

  useEffect(() => {
    if (!cameraRef.current) return;

    switch (selectedView) {
      case 'top':
        cameraRef.current.position.set(0, 200, 0.1);
        cameraRef.current.lookAt(0, 0, 0);
        break;
      case 'side':
        cameraRef.current.position.set(0, 50, 150);
        cameraRef.current.lookAt(0, 0, 0);
        break;
      case 'tactical':
        cameraRef.current.position.set(0, 80, 120);
        cameraRef.current.lookAt(0, 0, 0);
        break;
    }
  }, [selectedView]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => navigate(matchId ? `/matches/${matchId}` : '/matches')}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-800">3D战术动画</h1>
            {currentMatch && (
              <p className="text-sm text-gray-500 mt-1">
                {currentMatch.homeTeam} vs {currentMatch.awayTeam}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => navigate(`/tactical/${matchId}`)}
            className="bg-purple-100 text-purple-700 px-4 py-2 rounded-lg font-medium hover:bg-purple-200 transition-colors flex items-center space-x-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
            </svg>
            <span>战术板</span>
          </button>
          <button
            onClick={() => navigate(`/analysis/${matchId}`)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center space-x-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <span>分析报告</span>
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className="w-12 h-12 bg-blue-600 text-white rounded-full flex items-center justify-center hover:bg-blue-700 transition-colors"
            >
              {isPlaying ? (
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                </svg>
              ) : (
                <svg className="w-6 h-6 ml-1" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>

            <div className="text-lg font-mono font-bold text-gray-800">
              {formatTime(currentTime)} / {formatTime(5400)}
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <span className="text-sm text-gray-500">速度:</span>
              {[0.5, 1, 2, 4].map((speed) => (
                <button
                  key={speed}
                  onClick={() => setPlaybackSpeed(speed)}
                  className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                    playbackSpeed === speed
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {speed}x
                </button>
              ))}
            </div>

            <div className="flex items-center space-x-2">
              <span className="text-sm text-gray-500">视角:</span>
              {[
                { id: 'tactical', label: '战术' },
                { id: 'top', label: '俯视' },
                { id: 'side', label: '侧面' },
              ].map((view) => (
                <button
                  key={view.id}
                  onClick={() => setSelectedView(view.id as typeof selectedView)}
                  className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                    selectedView === view.id
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {view.label}
                </button>
              ))}
            </div>

            <button
              onClick={() => setShowPitch(!showPitch)}
              className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                showPitch
                  ? 'bg-green-100 text-green-700'
                  : 'bg-gray-100 text-gray-700'
              }`}
            >
              显示场地
            </button>
          </div>
        </div>

        <div
          ref={containerRef}
          className="w-full"
          style={{ height: 'calc(100vh - 320px)' }}
        ></div>

        <div className="px-6 py-4 border-t border-gray-200">
          <input
            type="range"
            min="0"
            max="5400"
            value={currentTime}
            onChange={(e) => setCurrentTime(Number(e.target.value))}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
          />
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-6">
        <h3 className="font-semibold text-gray-800 mb-4">图例</h3>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-8">
            <div className="flex items-center space-x-3">
              <div className="w-6 h-6 bg-blue-600 rounded-full"></div>
              <span className="text-gray-700">{currentMatch?.homeTeam || '主队'}</span>
            </div>
            <div className="flex items-center space-x-3">
              <div className="w-6 h-6 bg-red-600 rounded-full"></div>
              <span className="text-gray-700">{currentMatch?.awayTeam || '客队'}</span>
            </div>
            <div className="flex items-center space-x-3">
              <div className="w-6 h-6 bg-white border-2 border-gray-300 rounded-full"></div>
              <span className="text-gray-700">足球</span>
            </div>
          </div>
          <div className="text-sm text-gray-500">
            鼠标拖拽旋转视角 | 滚轮缩放
          </div>
        </div>
      </div>
    </div>
  );
};

export default ThreeDimensionalPage;
