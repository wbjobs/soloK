import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Target,
  Eye,
  EyeOff,
  Settings2,
  Sliders,
  Move,
  Ruler,
} from 'lucide-react'
import { missionAPI, detectAPI } from '../services/api'
import { CLASS_COLORS, CLASS_NAMES_CN, getClassColor, getClassCN } from '../utils/helpers'
import { loadOpenCV, histogramEqualization, medianFilter, claheEnhance } from '../utils/cvHelper'

export default function Detection() {
  const [missions, setMissions] = useState([])
  const [selectedMission, setSelectedMission] = useState(null)
  const [waterfallImage, setWaterfallImage] = useState(null)
  const [detections, setDetections] = useState([])
  const [tracks, setTracks] = useState([])
  const [measurements, setMeasurements] = useState([])
  const [loading, setLoading] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [cvLoaded, setCvLoaded] = useState(false)
  const [showDetectionOverlay, setShowDetectionOverlay] = useState(true)
  const [showTrackOverlay, setShowTrackOverlay] = useState(true)
  const [showMeasurement, setShowMeasurement] = useState(true)

  const [enhanceSettings, setEnhanceSettings] = useState({
    equalization: true,
    medianFilter: true,
    medianKernel: 3,
    claheClip: 2.0,
    claheTiles: 8,
  })

  const [confThreshold, setConfThreshold] = useState(0.3)
  const [frameIndex, setFrameIndex] = useState(0)
  const [totalFrames, setTotalFrames] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 400 })

  const canvasRef = useRef(null)
  const playIntervalRef = useRef(null)

  useEffect(() => {
    loadMissions()
    initOpenCV()
  }, [])

  const initOpenCV = async () => {
    try {
      await loadOpenCV()
      setCvLoaded(true)
    } catch (e) {
      console.warn('OpenCV.js not loaded, using backend enhancement')
    }
  }

  const loadMissions = async () => {
    try {
      const res = await missionAPI.list({ limit: 50 })
      setMissions(res || [])
    } catch (err) {
      console.error('Failed to load missions:', err)
    }
  }

  const handleMissionSelect = async (mission) => {
    setSelectedMission(mission)
    setDetections([])
    setTracks([])
    setMeasurements([])
    setWaterfallImage(null)
    setFrameIndex(0)

    try {
      const [detRes, trkRes, measRes] = await Promise.all([
        missionAPI.getDetections(mission.id),
        missionAPI.getTracks(mission.id),
        missionAPI.getMeasurements(mission.id),
      ])
      setDetections(detRes || [])
      setTracks(trkRes || [])
      setMeasurements(measRes || [])
    } catch (err) {
      console.error('Failed to load mission data:', err)
    }
  }

  const runDetection = async () => {
    if (!selectedMission) return

    setProcessing(true)
    try {
      const result = await detectAPI.detectMission(selectedMission.id)
      if (result) {
        setDetections(result.detections || [])
        setTracks(result.tracks || [])

        const measRes = await detectAPI.measureDetections(selectedMission.id)
        setMeasurements(measRes?.measurements || [])
      }
    } catch (err) {
      console.error('Detection failed:', err)
    } finally {
      setProcessing(false)
    }
  }

  const runTracking = async () => {
    if (!selectedMission) return

    setProcessing(true)
    try {
      const result = await detectAPI.trackObjects(selectedMission.id, {
        start_frame: 0,
        step: 5,
        conf_threshold: confThreshold,
      })
      if (result) {
        setTotalFrames(result.total_frames_processed || 0)
      }
    } catch (err) {
      console.error('Tracking failed:', err)
    } finally {
      setProcessing(false)
    }
  }

  const togglePlay = () => {
    if (isPlaying) {
      setIsPlaying(false)
      if (playIntervalRef.current) {
        clearInterval(playIntervalRef.current)
      }
    } else {
      setIsPlaying(true)
      playIntervalRef.current = setInterval(() => {
        setFrameIndex((prev) => {
          if (prev >= totalFrames - 1) {
            setIsPlaying(false)
            if (playIntervalRef.current) {
              clearInterval(playIntervalRef.current)
            }
            return 0
          }
          return prev + 1
        })
      }, 100)
    }
  }

  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    if (waterfallImage) {
      ctx.drawImage(waterfallImage, 0, 0, canvas.width, canvas.height)
    } else {
      const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height)
      gradient.addColorStop(0, '#0a1628')
      gradient.addColorStop(1, '#122240')
      ctx.fillStyle = gradient
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      ctx.fillStyle = '#666'
      ctx.font = '16px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('请选择任务并运行检测', canvas.width / 2, canvas.height / 2)
    }

    const scaleX = canvas.width / canvasSize.width
    const scaleY = canvas.height / canvasSize.height

    if (showDetectionOverlay && detections.length > 0) {
      detections.forEach((det) => {
        const color = getClassColor(det.class_name)
        ctx.strokeStyle = color
        ctx.lineWidth = 2
        ctx.strokeRect(
          det.bbox_x * scaleX,
          det.bbox_y * scaleY,
          det.bbox_w * scaleX,
          det.bbox_h * scaleY
        )

        ctx.fillStyle = color
        ctx.fillRect(
          det.bbox_x * scaleX,
          (det.bbox_y - 20) * scaleY,
          ctx.measureText(`${getClassCN(det.class_name)} ${det.confidence.toFixed(2)}`).width + 8,
          18
        )

        ctx.fillStyle = '#fff'
        ctx.font = '10px sans-serif'
        ctx.fillText(
          `${getClassCN(det.class_name)} ${det.confidence.toFixed(2)}`,
          det.bbox_x * scaleX + 4,
          (det.bbox_y - 6) * scaleY
        )
      })
    }

    if (showTrackOverlay && tracks.length > 0) {
      tracks.forEach((track) => {
        if (!track.trajectory || track.trajectory.length < 2) return

        const color = getClassColor(track.class_name)
        ctx.strokeStyle = color
        ctx.lineWidth = 2
        ctx.setLineDash([5, 5])

        ctx.beginPath()
        const traj = Array.isArray(track.trajectory) ? track.trajectory : track.trajectory.points || []
        traj.forEach((point, i) => {
          if (i === 0) {
            ctx.moveTo(point.x * scaleX, point.y * scaleY)
          } else {
            ctx.lineTo(point.x * scaleX, point.y * scaleY)
          }
        })
        ctx.stroke()
        ctx.setLineDash([])

        ctx.fillStyle = color
        ctx.beginPath()
        ctx.arc(traj[0].x * scaleX, traj[0].y * scaleY, 4, 0, Math.PI * 2)
        ctx.fill()

        ctx.fillStyle = '#fff'
        ctx.font = '10px sans-serif'
        ctx.fillText(
          `ID:${track.track_id}`,
          traj[0].x * scaleX + 8,
          traj[0].y * scaleY + 4
        )
      })
    }
  }, [waterfallImage, detections, tracks, showDetectionOverlay, showTrackOverlay, canvasSize])

  useEffect(() => {
    drawCanvas()
  }, [drawCanvas])

  const classStats = detections.reduce((acc, det) => {
    acc[det.class_name] = (acc[det.class_name] || 0) + 1
    return acc
  }, {})

  return (
    <div className="h-full flex flex-col gap-4">
      <div className="flex gap-4">
        <div className="card w-72 flex-shrink-0">
          <h3 className="section-title">任务选择</h3>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {missions.map((mission) => (
              <div
                key={mission.id}
                className={`p-3 rounded-lg cursor-pointer transition-all ${
                  selectedMission?.id === mission.id
                    ? 'bg-sonar-accent/20 border border-sonar-accent'
                    : 'bg-sonar-bg border border-sonar-border hover:border-sonar-accent/50'
                }`}
                onClick={() => handleMissionSelect(mission)}
              >
                <p className="font-medium text-white text-sm truncate">{mission.name}</p>
                <p className="text-xs text-gray-400">{mission.file_name}</p>
                <span className={`inline-block mt-1 px-2 py-0.5 text-xs rounded ${
                  mission.status === 'processed' ? 'bg-green-500/20 text-green-400' :
                  mission.status === 'uploaded' ? 'bg-blue-500/20 text-blue-400' :
                  'bg-gray-500/20 text-gray-400'
                }`}>
                  {mission.status}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="card flex-1">
          <div className="flex items-center justify-between mb-4">
            <h3 className="section-title mb-0">声呐图像显示</h3>
            <div className="flex gap-2">
              <button
                className={`btn-secondary text-sm ${showDetectionOverlay ? 'bg-sonar-accent/20' : ''}`}
                onClick={() => setShowDetectionOverlay(!showDetectionOverlay)}
              >
                <Target className="w-4 h-4 inline mr-1" />
                检测框
              </button>
              <button
                className={`btn-secondary text-sm ${showTrackOverlay ? 'bg-sonar-accent/20' : ''}`}
                onClick={() => setShowTrackOverlay(!showTrackOverlay)}
              >
                <Move className="w-4 h-4 inline mr-1" />
                轨迹
              </button>
            </div>
          </div>

          <div className="relative rounded-lg overflow-hidden bg-sonar-bg border border-sonar-border">
            <canvas
              ref={canvasRef}
              width={800}
              height={400}
              className="w-full"
            />
          </div>

          <div className="mt-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                className="btn-secondary"
                onClick={() => setFrameIndex(Math.max(0, frameIndex - 1))}
                disabled={!totalFrames}
              >
                <SkipBack className="w-4 h-4" />
              </button>
              <button
                className="btn-primary"
                onClick={togglePlay}
                disabled={!totalFrames}
              >
                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              </button>
              <button
                className="btn-secondary"
                onClick={() => setFrameIndex(Math.min(totalFrames - 1, frameIndex + 1))}
                disabled={!totalFrames}
              >
                <SkipForward className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-400">
                帧: {frameIndex + 1} / {totalFrames || '-'}
              </span>
              <input
                type="range"
                min="0"
                max={Math.max(0, totalFrames - 1)}
                value={frameIndex}
                onChange={(e) => setFrameIndex(Number(e.target.value))}
                className="w-48 accent-sonar-accent"
                disabled={!totalFrames}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="flex gap-4 flex-1">
        <div className="card w-80">
          <h3 className="section-title">检测参数</h3>
          <div className="space-y-4">
            <div>
              <label className="label-text">置信度阈值</label>
              <input
                type="range"
                min="0.1"
                max="0.9"
                step="0.05"
                value={confThreshold}
                onChange={(e) => setConfThreshold(Number(e.target.value))}
                className="w-full accent-sonar-accent"
              />
              <span className="text-sm text-sonar-accent">{confThreshold.toFixed(2)}</span>
            </div>

            <div className="pt-2 border-t border-sonar-border">
              <p className="label-text flex items-center gap-2">
                <Sliders className="w-4 h-4" />
                图像增强
              </p>
              <div className="space-y-2 mt-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={enhanceSettings.equalization}
                    onChange={(e) =>
                      setEnhanceSettings({
                        ...enhanceSettings,
                        equalization: e.target.checked,
                      })
                    }
                    className="accent-sonar-accent"
                  />
                  直方图均衡化
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={enhanceSettings.medianFilter}
                    onChange={(e) =>
                      setEnhanceSettings({
                        ...enhanceSettings,
                        medianFilter: e.target.checked,
                      })
                    }
                    className="accent-sonar-accent"
                  />
                  中值滤波去噪
                </label>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                className="btn-primary flex-1"
                onClick={runDetection}
                disabled={!selectedMission || processing}
              >
                {processing ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    处理中...
                  </span>
                ) : (
                  <>
                    <Target className="w-4 h-4 inline mr-1" />
                    开始检测
                  </>
                )}
              </button>
              <button
                className="btn-secondary"
                onClick={runTracking}
                disabled={!selectedMission || processing}
              >
                跟踪
              </button>
            </div>
          </div>
        </div>

        <div className="card flex-1">
          <div className="flex items-center justify-between mb-4">
            <h3 className="section-title mb-0">检测结果统计</h3>
            <span className="text-sm text-gray-400">共 {detections.length} 个检测</span>
          </div>

          <div className="grid grid-cols-4 gap-3 mb-4">
            {Object.entries(classStats).map(([cls, count]) => (
              <div
                key={cls}
                className="p-3 rounded-lg border"
                style={{ borderColor: getClassColor(cls), backgroundColor: `${getClassColor(cls)}15` }}
              >
                <p className="text-2xl font-bold" style={{ color: getClassColor(cls) }}>
                  {count}
                </p>
                <p className="text-xs text-gray-400">{getClassCN(cls)}</p>
              </div>
            ))}
            {Object.keys(classStats).length === 0 && (
              <p className="text-gray-400 col-span-4 text-center py-4">暂无检测数据</p>
            )}
          </div>

          {detections.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-sonar-border">
                    <th className="text-left py-2 px-2">类型</th>
                    <th className="text-left py-2 px-2">置信度</th>
                    <th className="text-left py-2 px-2">位置</th>
                    <th className="text-left py-2 px-2">尺寸</th>
                  </tr>
                </thead>
                <tbody>
                  {detections.slice(0, 10).map((det, idx) => (
                    <tr key={idx} className="border-b border-sonar-border/50">
                      <td className="py-2 px-2">
                        <span
                          className="px-2 py-1 rounded text-xs"
                          style={{ backgroundColor: `${getClassColor(det.class_name)}30`, color: getClassColor(det.class_name) }}
                        >
                          {getClassCN(det.class_name)}
                        </span>
                      </td>
                      <td className="py-2 px-2">{(det.confidence * 100).toFixed(1)}%</td>
                      <td className="py-2 px-2 font-mono text-xs">
                        ({det.bbox_x}, {det.bbox_y})
                      </td>
                      <td className="py-2 px-2 font-mono text-xs">
                        {det.bbox_w} × {det.bbox_h}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card w-80">
          <h3 className="section-title">尺寸测量</h3>
          {showMeasurement && measurements.length > 0 ? (
            <div className="space-y-3 max-h-64 overflow-y-auto">
              {measurements.slice(0, 10).map((meas, idx) => (
                <div key={idx} className="p-3 rounded-lg bg-sonar-bg border border-sonar-border">
                  <div className="flex items-center justify-between mb-2">
                    <Ruler className="w-4 h-4 text-sonar-accent" />
                    <span className="text-xs text-gray-400">#{meas.detection_id}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-gray-400">长度: </span>
                      <span className="text-white">{meas.actual_length?.toFixed(2) || '-'}m</span>
                    </div>
                    <div>
                      <span className="text-gray-400">宽度: </span>
                      <span className="text-white">{meas.actual_width?.toFixed(2) || '-'}m</span>
                    </div>
                    <div className="col-span-2">
                      <span className="text-gray-400">距离: </span>
                      <span className="text-white">{meas.range_distance?.toFixed(2) || '-'}m</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-400 text-center py-8">暂无测量数据</p>
          )}
        </div>
      </div>
    </div>
  )
}
