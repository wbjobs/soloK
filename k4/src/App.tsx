import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { FileUpload } from './components/FileUpload';
import { OffsideCanvas } from './components/OffsideCanvas';
import { VideoControls } from './components/VideoControls';
import { FieldPlan } from './components/FieldPlan';
import { ControlPanel } from './components/ControlPanel';
import { CalibrationPanel } from './components/CalibrationPanel';
import { CameraAngleSelector } from './components/CameraAngleSelector';
import { useVideoPlayer } from './hooks/useVideoPlayer';
import { useOpticalTracking, useFrameProcessor } from './hooks/useOpticalTracking';
import { Point, AttackDirection, PlayerMark, CameraAngle, FieldCalibration, FIELD_DIMENSIONS } from './types';
import { computeHomographyRANSAC, inverseHomography, transformPoint } from './utils/homography';
import { calculateOffsideLine, checkOffside } from './utils/offside';
import './App.css';

const MAX_CAMERA_ANGLES = 3;
const CANVAS_WIDTH = 960;
const CANVAS_HEIGHT = 540;

function getRealWorldCoords(point: Point, H: CameraAngle['homographyMatrix']): Point | null {
  if (!H) return null;
  const invH = inverseHomography(H);
  if (!invH) return null;
  return transformPoint(point, invH);
}

function getScreenCoords(realPoint: Point, H: CameraAngle['homographyMatrix']): Point | null {
  if (!H) return null;
  return transformPoint(realPoint, H);
}

function App() {
  const [cameraAngles, setCameraAngles] = useState<CameraAngle[]>([
    {
      id: 1,
      name: '机位 1',
      mediaType: null,
      mediaUrl: null,
      calibration: {},
      homographyMatrix: null,
      calibrationConfidence: 'low',
      reprojectionError: Infinity,
    },
  ]);
  const [currentAngleId, setCurrentAngleId] = useState(1);
  const [attackDirection, setAttackDirection] = useState<AttackDirection>('left-to-right');
  const [playerMarks, setPlayerMarks] = useState<PlayerMark[]>([]);
  const [markMode, setMarkMode] = useState<'attacker' | 'defender' | null>(null);
  const [calibrationMode, setCalibrationMode] = useState(false);
  const [activeCalibrationPoint, setActiveCalibrationPoint] = useState<keyof FieldCalibration | null>(null);
  const [syncMarks, setSyncMarks] = useState(true);
  
  const [show3DPlane, setShow3DPlane] = useState(false);
  const [showDepthGrid, setShowDepthGrid] = useState(false);
  const [autoTracking, setAutoTracking] = useState(false);

  const imageRef = useRef<HTMLImageElement | null>(null);
  const [, setImageLoaded] = useState(false);

  const {
    videoRef,
    isPlaying,
    currentTime,
    duration,
    togglePlay,
    seekTo,
    stepFrame,
    handleTimeUpdate,
    handleLoadedMetadata,
    handleEnded,
  } = useVideoPlayer();

  const currentAngle = cameraAngles.find(a => a.id === currentAngleId)!;

  const displayedMarks = useMemo(() => {
    if (!syncMarks) {
      return playerMarks.filter(m => m.sourceCameraAngle === currentAngleId);
    }

    return playerMarks.map(mark => {
      if (mark.sourceCameraAngle === currentAngleId) {
        return mark;
      }

      if (mark.realWorldPosition && currentAngle.homographyMatrix) {
        const screenPos = getScreenCoords(mark.realWorldPosition, currentAngle.homographyMatrix);
        if (screenPos) {
          return {
            ...mark,
            position: screenPos,
          };
        }
      }

      const sourceAngle = cameraAngles.find(a => a.id === mark.sourceCameraAngle);
      if (sourceAngle?.homographyMatrix && currentAngle.homographyMatrix) {
        const realPos = getRealWorldCoords(mark.position, sourceAngle.homographyMatrix);
        if (realPos) {
          const screenPos = getScreenCoords(realPos, currentAngle.homographyMatrix);
          if (screenPos) {
            return {
              ...mark,
              position: screenPos,
              realWorldPosition: realPos,
            };
          }
        }
      }

      return mark;
    });
  }, [playerMarks, currentAngleId, currentAngle.homographyMatrix, cameraAngles, syncMarks]);

  const currentMarks = displayedMarks.filter(m => {
    if (syncMarks) return true;
    return m.sourceCameraAngle === currentAngleId;
  });

  const opticalTracking = useOpticalTracking({
    enabled: autoTracking,
    canvasWidth: CANVAS_WIDTH,
    canvasHeight: CANVAS_HEIGHT,
    searchWindow: 35,
    minConfidence: 0.35,
    maxTrackingFrames: 500,
  });

  const handleTrackedFrame = useCallback((frame: ImageData) => {
    if (!autoTracking) return;
    
    const newTrackedPoints = opticalTracking.updateTracking(frame);
    
    setPlayerMarks(prev => prev.map(mark => {
      const tracked = newTrackedPoints.find(tp => tp.id === mark.id);
      if (tracked) {
        const realWorldPos = getRealWorldCoords(tracked.position, currentAngle.homographyMatrix);
        return {
          ...mark,
          position: tracked.position,
          realWorldPosition: realWorldPos,
        };
      }
      return mark;
    }));
  }, [autoTracking, opticalTracking, currentAngle.homographyMatrix]);

  useFrameProcessor(videoRef, handleTrackedFrame, autoTracking && isPlaying);

  const handleFileUpload = useCallback((file: File, type: 'image' | 'video') => {
    const url = URL.createObjectURL(file);
    
    setCameraAngles(prev => prev.map(angle => {
      if (angle.id === currentAngleId) {
        return {
          ...angle,
          mediaType: type,
          mediaUrl: url,
        };
      }
      return angle;
    }));

    opticalTracking.resetTracking();

    if (type === 'image') {
      const img = new Image();
      img.onload = () => {
        imageRef.current = img;
        setImageLoaded(true);
      };
      img.src = url;
    } else {
      setImageLoaded(false);
    }
  }, [currentAngleId, opticalTracking]);

  const getMediaElement = useCallback((): HTMLVideoElement | HTMLImageElement | null => {
    if (currentAngle.mediaType === 'video' && videoRef.current) {
      return videoRef.current;
    }
    if (currentAngle.mediaType === 'image' && imageRef.current) {
      return imageRef.current;
    }
    return null;
  }, [currentAngle.mediaType]);

  const handleStartTracking = useCallback(() => {
    const media = getMediaElement();
    if (!media || currentMarks.length === 0) return;

    const frame = opticalTracking.captureFrame(media);
    if (frame) {
      opticalTracking.initializeTracking(currentMarks, frame);
    }
  }, [getMediaElement, currentMarks, opticalTracking]);

  const handleStopTracking = useCallback(() => {
    opticalTracking.stopTracking();
  }, [opticalTracking]);

  const handleCanvasClick = useCallback((point: Point) => {
    if (calibrationMode && activeCalibrationPoint) {
      setCameraAngles(prev => prev.map(angle => {
        if (angle.id === currentAngleId) {
          return {
            ...angle,
            calibration: {
              ...angle.calibration,
              [activeCalibrationPoint]: point,
            },
          };
        }
        return angle;
      }));
      setActiveCalibrationPoint(null);
      return;
    }

    if (markMode) {
      const realWorldPosition = getRealWorldCoords(point, currentAngle.homographyMatrix);
      
      const newMark: PlayerMark = {
        id: Date.now().toString(),
        position: point,
        realWorldPosition,
        type: markMode,
        sourceCameraAngle: currentAngleId,
      };
      
      setPlayerMarks(prev => [...prev, newMark]);
      
      if (autoTracking) {
        opticalTracking.addTrackedPoint(newMark);
      }
    }
  }, [calibrationMode, activeCalibrationPoint, markMode, currentAngleId, currentAngle.homographyMatrix, autoTracking, opticalTracking]);

  const defenders = currentMarks.filter(m => m.type === 'defender');
  const attackers = currentMarks.filter(m => m.type === 'attacker');

  const useHomography = currentAngle.calibrationConfidence !== 'low' && currentAngle.homographyMatrix;

  const offsideLinePosition = defenders.length >= 2
    ? calculateOffsideLine(defenders, attackDirection, useHomography ? currentAngle.homographyMatrix : null, CANVAS_WIDTH)
    : null;

  const isOffside = offsideLinePosition !== null && attackers.length > 0
    ? attackers.some(attacker => checkOffside(attacker, offsideLinePosition, attackDirection, useHomography ? currentAngle.homographyMatrix : null))
    : null;

  useEffect(() => {
    const calibration = currentAngle.calibration;
    const srcPoints: Point[] = [];
    const dstPoints: Point[] = [];

    const padding = 20;
    const fieldWidth = CANVAS_WIDTH - padding * 2;
    const fieldHeight = CANVAS_HEIGHT - padding * 2;
    const scaleX = fieldWidth / FIELD_DIMENSIONS.width;
    const scaleY = fieldHeight / FIELD_DIMENSIONS.height;

    const toCanvasX = (x: number) => padding + x * scaleX;
    const toCanvasY = (y: number) => padding + y * scaleY;

    if (calibration.topLeft) {
      srcPoints.push(calibration.topLeft);
      dstPoints.push({ x: toCanvasX(0), y: toCanvasY(0) });
    }
    if (calibration.topRight) {
      srcPoints.push(calibration.topRight);
      dstPoints.push({ x: toCanvasX(FIELD_DIMENSIONS.width), y: toCanvasY(0) });
    }
    if (calibration.bottomLeft) {
      srcPoints.push(calibration.bottomLeft);
      dstPoints.push({ x: toCanvasX(0), y: toCanvasY(FIELD_DIMENSIONS.height) });
    }
    if (calibration.bottomRight) {
      srcPoints.push(calibration.bottomRight);
      dstPoints.push({ x: toCanvasX(FIELD_DIMENSIONS.width), y: toCanvasY(FIELD_DIMENSIONS.height) });
    }
    if (calibration.centerSpot) {
      srcPoints.push(calibration.centerSpot);
      dstPoints.push({ x: toCanvasX(FIELD_DIMENSIONS.width / 2), y: toCanvasY(FIELD_DIMENSIONS.height / 2) });
    }
    if (calibration.penaltySpotLeft) {
      srcPoints.push(calibration.penaltySpotLeft);
      dstPoints.push({ x: toCanvasX(FIELD_DIMENSIONS.penaltySpotDistance), y: toCanvasY(FIELD_DIMENSIONS.height / 2) });
    }
    if (calibration.penaltySpotRight) {
      srcPoints.push(calibration.penaltySpotRight);
      dstPoints.push({ x: toCanvasX(FIELD_DIMENSIONS.width - FIELD_DIMENSIONS.penaltySpotDistance), y: toCanvasY(FIELD_DIMENSIONS.height / 2) });
    }

    if (srcPoints.length >= 4) {
      const result = computeHomographyRANSAC(srcPoints, dstPoints, 8.0, 500);
      setCameraAngles(prev => prev.map(angle => {
        if (angle.id === currentAngleId) {
          return {
            ...angle,
            homographyMatrix: result.homography,
            calibrationConfidence: result.confidence,
            reprojectionError: result.reprojectionError,
          };
        }
        return angle;
      }));

      if (result.homography && syncMarks) {
        setPlayerMarks(prev => prev.map(mark => {
          if (mark.sourceCameraAngle === currentAngleId && !mark.realWorldPosition) {
            return {
              ...mark,
              realWorldPosition: getRealWorldCoords(mark.position, result.homography),
            };
          }
          return mark;
        }));
      }
    }
  }, [currentAngle.calibration, currentAngleId, syncMarks]);

  const handleClearMarks = useCallback(() => {
    if (syncMarks) {
      setPlayerMarks([]);
    } else {
      setPlayerMarks(prev => prev.filter(m => m.sourceCameraAngle !== currentAngleId));
    }
    opticalTracking.resetTracking();
  }, [currentAngleId, syncMarks, opticalTracking]);

  const handleDeleteMark = useCallback((id: string) => {
    setPlayerMarks(prev => prev.filter(m => m.id !== id));
    opticalTracking.removeTrackedPoint(id);
  }, [opticalTracking]);

  const handleClearCalibration = useCallback(() => {
    setCameraAngles(prev => prev.map(angle => {
      if (angle.id === currentAngleId) {
        return {
          ...angle,
          calibration: {},
          homographyMatrix: null,
          calibrationConfidence: 'low',
          reprojectionError: Infinity,
        };
      }
      return angle;
    }));
    setActiveCalibrationPoint(null);
  }, [currentAngleId]);

  const handleExport = useCallback(() => {
    const canvas = document.querySelector('.offside-canvas') as HTMLCanvasElement;
    if (!canvas) return;

    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = canvas.width;
    exportCanvas.height = canvas.height + 100;
    const ctx = exportCanvas.getContext('2d')!;

    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);

    ctx.drawImage(canvas, 0, 0);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px Arial';
    ctx.textAlign = 'center';
    
    const resultText = isOffside === null 
      ? '未完成判定' 
      : isOffside 
        ? '越位 OFFSIDE' 
        : '不越位 ONSIDE';
    ctx.fillStyle = isOffside === null ? '#888' : isOffside ? '#ff4444' : '#44ff44';
    ctx.fillText(resultText, exportCanvas.width / 2, canvas.height + 40);

    if (currentAngle.calibrationConfidence !== 'low') {
      ctx.fillStyle = '#aaaaaa';
      ctx.font = '14px Arial';
      ctx.fillText(
        `校准质量: ${currentAngle.calibrationConfidence === 'high' ? '高' : '中'} | 误差: ${currentAngle.reprojectionError.toFixed(2)}px`,
        exportCanvas.width / 2,
        canvas.height + 65
      );
    }

    if (opticalTracking.isTracking) {
      ctx.fillStyle = '#4ade80';
      ctx.font = '12px Arial';
      ctx.fillText(
        `光流追踪中 | 帧数: ${opticalTracking.frameCount} | 置信度: ${(opticalTracking.getAverageConfidence() * 100).toFixed(0)}%`,
        exportCanvas.width / 2,
        canvas.height + 85
      );
    }

    const link = document.createElement('a');
    link.download = `offside-decision-${Date.now()}.png`;
    link.href = exportCanvas.toDataURL('image/png');
    link.click();
  }, [isOffside, currentAngle.calibrationConfidence, currentAngle.reprojectionError, opticalTracking]);

  const handleAddAngle = useCallback(() => {
    if (cameraAngles.length >= MAX_CAMERA_ANGLES) return;
    
    const newId = Math.max(...cameraAngles.map(a => a.id)) + 1;
    setCameraAngles(prev => [...prev, {
      id: newId,
      name: `机位 ${newId}`,
      mediaType: null,
      mediaUrl: null,
      calibration: {},
      homographyMatrix: null,
      calibrationConfidence: 'low',
      reprojectionError: Infinity,
    }]);
    setCurrentAngleId(newId);
  }, [cameraAngles]);

  const handleRemoveAngle = useCallback((id: number) => {
    if (cameraAngles.length <= 1) return;
    
    setCameraAngles(prev => prev.filter(a => a.id !== id));
    setPlayerMarks(prev => prev.filter(m => m.sourceCameraAngle !== id));
    
    if (currentAngleId === id) {
      const remaining = cameraAngles.filter(a => a.id !== id);
      if (remaining.length > 0) {
        setCurrentAngleId(remaining[0].id);
      }
    }
  }, [cameraAngles, currentAngleId]);

  const trackingConfidence = opticalTracking.getAverageConfidence();

  return (
    <div className="app">
      <header className="app-header">
        <h1>⚽ 足球越位线绘制工具</h1>
        <div className="header-right">
          <CameraAngleSelector
            angles={cameraAngles}
            currentAngle={currentAngleId}
            onAngleChange={setCurrentAngleId}
            onAddAngle={handleAddAngle}
            onRemoveAngle={handleRemoveAngle}
            maxAngles={MAX_CAMERA_ANGLES}
          />
          <label className="sync-toggle">
            <input
              type="checkbox"
              checked={syncMarks}
              onChange={(e) => setSyncMarks(e.target.checked)}
            />
            <span>同步标记</span>
          </label>
        </div>
      </header>

      <main className="app-main">
        <div className="main-content">
          {!currentAngle.mediaUrl ? (
            <div className="upload-container">
              <FileUpload onFileUpload={handleFileUpload} />
            </div>
          ) : (
            <div className="canvas-container">
              {currentAngle.mediaType === 'video' && (
                <video
                  ref={videoRef}
                  src={currentAngle.mediaUrl!}
                  style={{ display: 'none' }}
                  onTimeUpdate={handleTimeUpdate}
                  onLoadedMetadata={handleLoadedMetadata}
                  onEnded={handleEnded}
                />
              )}
              
              <OffsideCanvas
                width={CANVAS_WIDTH}
                height={CANVAS_HEIGHT}
                mediaElement={getMediaElement()}
                playerMarks={currentMarks}
                offsideLinePosition={offsideLinePosition}
                isOffside={isOffside}
                attackDirection={attackDirection}
                calibrationMode={calibrationMode}
                calibrationPoints={currentAngle.calibration}
                activeCalibrationPoint={activeCalibrationPoint}
                onCanvasClick={handleCanvasClick}
                homographyMatrix={currentAngle.homographyMatrix}
                trackedPoints={opticalTracking.isTracking ? opticalTracking.trackedPoints : []}
                show3DPlane={show3DPlane}
                showDepthGrid={showDepthGrid}
                showTrackingIndicator={autoTracking}
              />

              {currentAngle.mediaType === 'video' && (
                <VideoControls
                  isPlaying={isPlaying}
                  currentTime={currentTime}
                  duration={duration}
                  onTogglePlay={togglePlay}
                  onSeek={seekTo}
                  onStepFrame={stepFrame}
                />
              )}

              {currentAngle.calibrationConfidence !== 'low' && (
                <div className={`calibration-badge ${currentAngle.calibrationConfidence}`}>
                  <span className="badge-icon">✓</span>
                  <span className="badge-text">
                    透视校正已启用 ({currentAngle.calibrationConfidence === 'high' ? '高精度' : '中等精度'})
                  </span>
                </div>
              )}

              {opticalTracking.isTracking && (
                <div className="tracking-badge">
                  <span className="pulse-dot" />
                  <span className="badge-text">
                    光流追踪中 | 置信度: {(trackingConfidence * 100).toFixed(0)}% | 帧: {opticalTracking.frameCount}
                  </span>
                </div>
              )}
            </div>
          )}

          <FieldPlan
            width={300}
            height={200}
            attackDirection={attackDirection}
            onAttackDirectionChange={setAttackDirection}
          />
        </div>

        <aside className="sidebar">
          {calibrationMode ? (
            <CalibrationPanel
              activePoint={activeCalibrationPoint}
              calibrationPoints={currentAngle.calibration}
              onSelectPoint={setActiveCalibrationPoint}
              onClearCalibration={handleClearCalibration}
              calibrationQuality={currentAngle.calibrationConfidence}
              reprojectionError={currentAngle.reprojectionError}
            />
          ) : (
            <ControlPanel
              markMode={markMode}
              onMarkModeChange={setMarkMode}
              playerMarks={currentMarks}
              onClearMarks={handleClearMarks}
              onDeleteMark={handleDeleteMark}
              calibrationMode={calibrationMode}
              onCalibrationModeChange={setCalibrationMode}
              onExport={handleExport}
              isOffside={isOffside}
              syncMarks={syncMarks}
              onSyncMarksChange={setSyncMarks}
              calibrationQuality={currentAngle.calibrationConfidence}
              autoTracking={autoTracking}
              onAutoTrackingChange={setAutoTracking}
              isTracking={opticalTracking.isTracking}
              trackingConfidence={trackingConfidence}
              onStartTracking={handleStartTracking}
              onStopTracking={handleStopTracking}
              show3DPlane={show3DPlane}
              onShow3DPlaneChange={setShow3DPlane}
              showDepthGrid={showDepthGrid}
              onShowDepthGridChange={setShowDepthGrid}
              hasMarks={currentMarks.length > 0}
            />
          )}
        </aside>
      </main>

      <footer className="app-footer">
        <p>使用说明: 上传视频/图片 → 选择进攻方向 → 标记球员位置 → 查看越位判定结果</p>
        <p className="footer-hint">
          💡 提示：开启"光流追踪"后，播放视频时系统会自动追踪已标记的球员移动；开启"3D越位平面"可显示立体辅助线
        </p>
      </footer>
    </div>
  );
}

export default App;
