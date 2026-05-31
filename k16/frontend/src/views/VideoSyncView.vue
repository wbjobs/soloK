<template>
  <div class="video-sync-view">
    <div class="video-panel panel">
      <div class="panel-header">
        <span><VideoCamera :size="16" /> 高速摄像机视频 (200fps)</span>
        <div class="video-info">
          <span class="fps-badge">200 FPS</span>
          <span class="resolution">1920x1080</span>
        </div>
      </div>
      <div class="panel-content">
        <div class="video-container">
          <div class="video-placeholder">
            <canvas ref="videoCanvas" class="video-canvas"></canvas>
            <div class="video-overlay">
              <div class="overlay-info">
                <span class="timestamp">{{ formatTime(currentTime) }}</span>
                <span class="frame-count">帧: {{ currentFrame }}</span>
              </div>
            </div>
            <div class="play-pause-overlay" @click="togglePlay" v-if="!isPlaying">
              <VideoPlay :size="64" />
            </div>
          </div>
        </div>
        
        <div class="timeline-container">
          <div class="timeline-track">
            <div class="timeline-progress" :style="{ width: progressPercent + '%' }"></div>
            <div 
              class="timeline-handle" 
              :style="{ left: progressPercent + '%' }"
              @mousedown="startDrag"
            ></div>
            <div 
              class="timeline-marker"
              v-for="m in markers"
              :key="m.id"
              :style="{ left: m.position + '%' }"
              :title="m.label"
            ></div>
          </div>
          <div class="timeline-labels">
            <span v-for="t in timeLabels" :key="t" :style="{ left: (t / duration) * 100 + '%' }">
              {{ formatTime(t) }}
            </span>
          </div>
        </div>
        
        <div class="playback-controls">
          <button class="control-btn" @click="skipBackward">
            <DArrowLeft />
          </button>
          <button class="control-btn" @click="stepBackward">
            <ArrowLeft />
          </button>
          <button class="control-btn play-btn" @click="togglePlay">
            <VideoPlay v-if="!isPlaying" />
            <VideoPause v-else />
          </button>
          <button class="control-btn" @click="stepForward">
            <ArrowRight />
          </button>
          <button class="control-btn" @click="skipForward">
            <DArrowRight />
          </button>
          
          <div class="speed-control">
            <span class="speed-label">速度:</span>
            <select v-model="playbackSpeed" class="speed-select">
              <option :value="0.25">0.25x</option>
              <option :value="0.5">0.5x</option>
              <option :value="1">1x</option>
              <option :value="2">2x</option>
              <option :value="4">4x</option>
            </select>
          </div>
        </div>
      </div>
    </div>
    
    <div class="data-panel panel">
      <div class="panel-header">
        <span><TrendCharts :size="16" /> 同步数据曲线</span>
        <select v-model="selectedData" class="control-select">
          <option value="pressure">压力分布</option>
          <option value="aero">气动力系数</option>
          <option value="both">全部显示</option>
        </select>
      </div>
      <div class="panel-content">
        <v-chart class="sync-chart" :option="syncChartOption" autoresize />
        
        <div class="sync-cursor" :style="{ left: progressPercent + '%' }">
          <div class="cursor-line"></div>
          <div class="cursor-label">{{ formatTime(currentTime) }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { LineChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, MarkLineComponent } from 'echarts/components'
import {
  VideoCamera,
  VideoPlay,
  VideoPause,
  ArrowLeft,
  ArrowRight,
  DArrowLeft,
  DArrowRight,
  TrendCharts
} from '@element-plus/icons-vue'

use([
  CanvasRenderer,
  LineChart,
  GridComponent,
  TooltipComponent,
  MarkLineComponent
])

const videoCanvas = ref(null)
const isPlaying = ref(false)
const currentTime = ref(0)
const duration = ref(10)
const playbackSpeed = ref(1)
const selectedData = ref('both')

const fps = 200
const currentFrame = computed(() => Math.floor(currentTime.value * fps))
const progressPercent = computed(() => (currentTime.value / duration.value) * 100)

const timeLabels = computed(() => {
  const labels = []
  for (let t = 0; t <= duration.value; t += 2) {
    labels.push(t)
  }
  return labels
})

const markers = ref([
  { id: 1, position: 20, label: '攻角切换' },
  { id: 2, position: 50, label: '涡脱开始' },
  { id: 3, position: 80, label: '攻角复位' }
])

let animationFrame = null
let canvasCtx = null

const syncChartOption = ref({
  backgroundColor: 'transparent',
  tooltip: {
    trigger: 'axis',
    backgroundColor: 'rgba(10, 22, 40, 0.9)',
    borderColor: '#2D4A6F',
    textStyle: { color: '#E8F4FF' }
  },
  legend: {
    data: ['CL', '压力均值'],
    textStyle: { color: '#8FA3BF', fontSize: 11 },
    top: 5
  },
  grid: {
    left: 50,
    right: 20,
    top: 40,
    bottom: 40
  },
  xAxis: {
    type: 'value',
    min: 0,
    max: 10,
    axisLine: { lineStyle: { color: '#2D4A6F' } },
    axisLabel: { color: '#8FA3BF', fontSize: 10 },
    name: '时间 (s)',
    nameTextStyle: { color: '#8FA3BF', fontSize: 11 }
  },
  yAxis: [
    {
      type: 'value',
      name: 'CL',
      position: 'left',
      axisLine: { lineStyle: { color: '#2D4A6F' } },
      axisLabel: { color: '#8FA3BF', fontSize: 10 },
      splitLine: { lineStyle: { color: '#1A2D47' } }
    },
    {
      type: 'value',
      name: 'Pressure',
      position: 'right',
      axisLine: { lineStyle: { color: '#2D4A6F' } },
      axisLabel: { color: '#8FA3BF', fontSize: 10 },
      splitLine: { show: false }
    }
  ],
  series: [
    {
      name: 'CL',
      type: 'line',
      data: [],
      smooth: true,
      lineStyle: { color: '#00D4FF', width: 2 },
      showSymbol: false
    },
    {
      name: '压力均值',
      type: 'line',
      yAxisIndex: 1,
      data: [],
      smooth: true,
      lineStyle: { color: '#FF6B35', width: 2 },
      showSymbol: false
    }
  ]
})

const formatTime = (seconds) => {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  const ms = Math.floor((seconds % 1) * 1000)
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`
}

const generateChartData = () => {
  const clData = []
  const pressureData = []
  
  for (let t = 0; t <= duration.value; t += 0.1) {
    const cl = 0.5 + Math.sin(t * 0.8) * 0.2 + Math.random() * 0.05
    const pressure = 1000 + Math.sin(t * 2) * 500 + Math.random() * 100
    clData.push([t, cl])
    pressureData.push([t, pressure])
  }
  
  syncChartOption.value.series[0].data = clData
  syncChartOption.value.series[1].data = pressureData
}

const drawVideoFrame = () => {
  if (!canvasCtx) return
  
  const canvas = videoCanvas.value
  const w = canvas.width
  const h = canvas.height
  
  canvasCtx.fillStyle = '#0A1628'
  canvasCtx.fillRect(0, 0, w, h)
  
  const time = currentTime.value
  const wingOffset = Math.sin(time * 3) * 20
  const flapAngle = Math.sin(time * 5) * 0.2
  
  canvasCtx.save()
  canvasCtx.translate(w / 2 + wingOffset, h / 2)
  canvasCtx.rotate(flapAngle)
  
  canvasCtx.fillStyle = '#1A2D47'
  canvasCtx.beginPath()
  canvasCtx.moveTo(-200, 0)
  canvasCtx.quadraticCurveTo(-100, -40, 0, -30)
  canvasCtx.quadraticCurveTo(100, -20, 200, -10)
  canvasCtx.quadraticCurveTo(100, 10, 0, 15)
  canvasCtx.quadraticCurveTo(-100, 25, -200, 5)
  canvasCtx.closePath()
  canvasCtx.fill()
  
  canvasCtx.strokeStyle = 'rgba(0, 212, 255, 0.3)'
  canvasCtx.lineWidth = 1
  for (let i = 0; i < 20; i++) {
    const y = (i - 10) * 20 + Math.sin(time * 2 + i) * 10
    canvasCtx.beginPath()
    canvasCtx.moveTo(-250, y)
    canvasCtx.lineTo(250, y)
    canvasCtx.stroke()
  }
  
  canvasCtx.restore()
  
  canvasCtx.fillStyle = 'rgba(10, 22, 40, 0.8)'
  canvasCtx.fillRect(10, 10, 80, 25)
  canvasCtx.fillStyle = '#00C853'
  canvasCtx.font = '12px Roboto Mono'
  canvasCtx.fillText('REC', 20, 27)
  
  canvasCtx.beginPath()
  canvasCtx.arc(270, 30, 4, 0, Math.PI * 2)
  canvasCtx.fillStyle = '#FF5252'
  canvasCtx.fill()
}

const animate = () => {
  if (!isPlaying.value) return
  
  currentTime.value += 0.016 * playbackSpeed.value
  if (currentTime.value >= duration.value) {
    currentTime.value = 0
  }
  
  drawVideoFrame()
  animationFrame = requestAnimationFrame(animate)
}

const togglePlay = () => {
  isPlaying.value = !isPlaying.value
  if (isPlaying.value) {
    animate()
  }
}

const stepForward = () => {
  currentTime.value = Math.min(duration.value, currentTime.value + 1/fps)
  drawVideoFrame()
}

const stepBackward = () => {
  currentTime.value = Math.max(0, currentTime.value - 1/fps)
  drawVideoFrame()
}

const skipForward = () => {
  currentTime.value = Math.min(duration.value, currentTime.value + 1)
  drawVideoFrame()
}

const skipBackward = () => {
  currentTime.value = Math.max(0, currentTime.value - 1)
  drawVideoFrame()
}

const startDrag = (e) => {
  isPlaying.value = false
  
  const track = e.target.parentElement
  const rect = track.getBoundingClientRect()
  
  const onMove = (moveEvent) => {
    const percent = (moveEvent.clientX - rect.left) / rect.width
    currentTime.value = Math.max(0, Math.min(duration.value, percent * duration.value))
    drawVideoFrame()
  }
  
  const onUp = () => {
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
  }
  
  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
}

onMounted(() => {
  nextTick(() => {
    const canvas = videoCanvas.value
    if (canvas) {
      canvas.width = canvas.offsetWidth
      canvas.height = canvas.offsetHeight
      canvasCtx = canvas.getContext('2d')
      drawVideoFrame()
      generateChartData()
    }
  })
})

onUnmounted(() => {
  if (animationFrame) {
    cancelAnimationFrame(animationFrame)
  }
})
</script>

<style scoped lang="scss">
.video-sync-view {
  display: grid;
  grid-template-rows: 1fr 1fr;
  gap: 16px;
  padding: 16px;
  height: 100%;
}

.video-panel,
.data-panel {
  display: flex;
  flex-direction: column;
  animation: fadeIn 0.5s ease;
  
  .panel-content {
    flex: 1;
    display: flex;
    flex-direction: column;
  }
}

.video-info {
  display: flex;
  gap: 12px;
}

.fps-badge,
.resolution {
  padding: 2px 8px;
  background: rgba(0, 212, 255, 0.1);
  border: 1px solid rgba(0, 212, 255, 0.3);
  border-radius: 2px;
  font-size: 11px;
  color: var(--color-accent);
}

.video-container {
  flex: 1;
  position: relative;
  background: #000;
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 16px;
}

.video-placeholder {
  width: 100%;
  height: 100%;
  min-height: 250px;
  position: relative;
}

.video-canvas {
  width: 100%;
  height: 100%;
}

.video-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  padding: 12px;
  
  .overlay-info {
    display: flex;
    gap: 16px;
    font-family: var(--font-display);
    font-size: 14px;
    color: #fff;
    text-shadow: 0 0 4px rgba(0, 0, 0, 0.8);
  }
}

.play-pause-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.3);
  color: rgba(255, 255, 255, 0.8);
  cursor: pointer;
  transition: all var(--transition-fast);
  
  &:hover {
    background: rgba(0, 0, 0, 0.5);
    color: #fff;
  }
}

.timeline-container {
  margin-bottom: 16px;
}

.timeline-track {
  position: relative;
  height: 8px;
  background: var(--color-border);
  border-radius: 4px;
  cursor: pointer;
}

.timeline-progress {
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  background: linear-gradient(90deg, var(--color-accent), rgba(0, 212, 255, 0.5));
  border-radius: 4px;
}

.timeline-handle {
  position: absolute;
  top: 50%;
  width: 16px;
  height: 16px;
  background: var(--color-accent);
  border: 2px solid #fff;
  border-radius: 50%;
  transform: translate(-50%, -50%);
  cursor: grab;
  box-shadow: var(--glow-accent);
  z-index: 10;
}

.timeline-marker {
  position: absolute;
  top: -4px;
  width: 4px;
  height: 16px;
  background: #FF6B35;
  border-radius: 2px;
  transform: translateX(-50%);
  cursor: pointer;
}

.timeline-labels {
  position: relative;
  margin-top: 8px;
  height: 16px;
  
  span {
    position: absolute;
    transform: translateX(-50%);
    font-size: 10px;
    color: var(--color-text-secondary);
  }
}

.playback-controls {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
}

.control-btn {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px solid var(--color-border);
  color: var(--color-text-primary);
  border-radius: 50%;
  cursor: pointer;
  transition: all var(--transition-fast);
  
  &:hover {
    border-color: var(--color-accent);
    color: var(--color-accent);
  }
  
  &.play-btn {
    width: 56px;
    height: 56px;
    background: linear-gradient(135deg, var(--color-accent), rgba(0, 212, 255, 0.5));
    border: none;
    color: #fff;
    box-shadow: var(--glow-accent);
  }
}

.speed-control {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: 24px;
  
  .speed-label {
    font-size: 12px;
    color: var(--color-text-secondary);
  }
}

.speed-select,
.control-select {
  background: var(--color-primary);
  border: 1px solid var(--color-border);
  color: var(--color-text-primary);
  padding: 4px 10px;
  font-size: 11px;
  border-radius: 2px;
  cursor: pointer;
  
  &:focus {
    outline: none;
    border-color: var(--color-accent);
  }
}

.sync-chart {
  flex: 1;
  min-height: 200px;
}

.data-panel {
  animation-delay: 0.1s;
  
  .panel-content {
    position: relative;
    padding: 10px;
  }
}

.sync-cursor {
  position: absolute;
  top: 10px;
  bottom: 0;
  width: 2px;
  pointer-events: none;
  z-index: 10;
  
  .cursor-line {
    width: 2px;
    height: 100%;
    background: #FF6B35;
    box-shadow: 0 0 8px rgba(255, 107, 53, 0.5);
  }
  
  .cursor-label {
    position: absolute;
    top: 0;
    right: -40px;
    padding: 2px 6px;
    background: #FF6B35;
    color: #fff;
    font-size: 10px;
    border-radius: 2px;
    white-space: nowrap;
  }
}
</style>
