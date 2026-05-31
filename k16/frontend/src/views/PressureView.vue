<template>
  <div class="pressure-view">
    <div class="main-panel">
      <div class="panel-header">
        <span><PieChart :size="16" /> 压力分布云图 - 翼型截面</span>
        <div class="view-controls">
          <select v-model="displayMode" class="control-select">
            <option value="instant">瞬时压力</option>
            <option value="mean">时均压力</option>
            <option value="rms">脉动均方根</option>
          </select>
          <button class="btn btn-primary" @click="toggleLegend">
            <Setting /> 图例
          </button>
        </div>
      </div>
      <div class="panel-content">
        <canvas ref="canvasRef" class="pressure-canvas"></canvas>
        <div class="color-bar" :class="{ visible: showLegend }">
          <div class="color-gradient"></div>
          <div class="color-labels">
            <span>{{ maxPressure.toFixed(0) }}</span>
            <span>{{ (maxPressure + minPressure) / 2 }}</span>
            <span>{{ minPressure.toFixed(0) }}</span>
          </div>
          <div class="color-unit">Pa</div>
        </div>
      </div>
    </div>
    
    <div class="side-panel">
      <div class="panel statistics-panel">
        <div class="panel-header">
          <span><DataAnalysis :size="16" /> 脉动压力分析</span>
        </div>
        <div class="panel-content">
          <div class="stat-grid">
            <div class="stat-item">
              <span class="stat-label">时均压力 (Mean)</span>
              <span class="stat-value">{{ meanPressure.toFixed(2) }} Pa</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">脉动均方根 (RMS)</span>
              <span class="stat-value">{{ rmsPressure.toFixed(2) }} Pa</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">压力峰值</span>
              <span class="stat-value">{{ peakPressure.toFixed(2) }} Pa</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">压力系数 Cp</span>
              <span class="stat-value">{{ pressureCoeff.toFixed(4) }}</span>
            </div>
          </div>
        </div>
      </div>
      
      <div class="panel channel-panel">
        <div class="panel-header">
          <span><TrendCharts :size="16" /> 通道详情</span>
        </div>
        <div class="panel-content">
          <div class="channel-selector">
            <label>选择通道:</label>
            <el-slider 
              v-model="selectedChannel" 
              :min="1" 
              :max="128" 
              :step="1"
              :show-input="true"
              class="channel-slider"
            />
          </div>
          <v-chart class="channel-chart" :option="channelChartOption" autoresize />
          <div class="channel-info">
            <div class="info-row">
              <span>通道编号:</span>
              <span class="highlight">#{{ selectedChannel }}</span>
            </div>
            <div class="info-row">
              <span>当前值:</span>
              <span class="highlight">{{ currentChannelValue.toFixed(2) }} Pa</span>
            </div>
            <div class="info-row">
              <span>状态:</span>
              <span class="status-tag" :class="currentChannelStatus">
                {{ currentChannelStatus === 'normal' ? '正常' : currentChannelStatus === 'warning' ? '告警' : '异常' }}
              </span>
            </div>
          </div>
        </div>
      </div>
      
      <div class="panel psd-panel">
        <div class="panel-header">
          <span><TrendCharts :size="16" /> 功率谱密度 (PSD)</span>
        </div>
        <div class="panel-content">
          <v-chart class="psd-chart" :option="psdChartOption" autoresize />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useSystemStore } from '@/stores/system'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { LineChart } from 'echarts/charts'
import { GridComponent, TooltipComponent } from 'echarts/components'
import { PieChart, DataAnalysis, TrendCharts, Setting } from '@element-plus/icons-vue'

use([
  CanvasRenderer,
  LineChart,
  GridComponent,
  TooltipComponent
])

const systemStore = useSystemStore()
const canvasRef = ref(null)
const pressureData = computed(() => systemStore.pressureData)

const displayMode = ref('instant')
const showLegend = ref(true)
const selectedChannel = ref(64)

const channelHistory = ref([])

const maxPressure = computed(() => 5000)
const minPressure = computed(() => -5000)

const meanPressure = computed(() => {
  const values = pressureData.value.map(p => p.mean)
  return values.reduce((a, b) => a + b, 0) / values.length
})

const rmsPressure = computed(() => {
  const values = pressureData.value.map(p => p.rms)
  return values.reduce((a, b) => a + b, 0) / values.length
})

const peakPressure = computed(() => {
  const values = pressureData.value.map(p => Math.abs(p.value))
  return Math.max(...values)
})

const pressureCoeff = computed(() => {
  return (meanPressure.value / 100000).toFixed(4)
})

const currentChannelValue = computed(() => {
  const idx = selectedChannel.value - 1
  return pressureData.value[idx]?.value || 0
})

const currentChannelStatus = computed(() => {
  const idx = selectedChannel.value - 1
  return pressureData.value[idx]?.status || 'normal'
})

const channelChartOption = ref({
  backgroundColor: 'transparent',
  tooltip: {
    trigger: 'axis',
    backgroundColor: 'rgba(10, 22, 40, 0.9)',
    borderColor: '#2D4A6F',
    textStyle: { color: '#E8F4FF' }
  },
  grid: {
    left: 40,
    right: 20,
    top: 10,
    bottom: 30
  },
  xAxis: {
    type: 'category',
    data: [],
    axisLine: { lineStyle: { color: '#2D4A6F' } },
    axisLabel: { color: '#8FA3BF', fontSize: 10 }
  },
  yAxis: {
    type: 'value',
    name: 'Pa',
    axisLine: { lineStyle: { color: '#2D4A6F' } },
    axisLabel: { color: '#8FA3BF', fontSize: 10 },
    splitLine: { lineStyle: { color: '#1A2D47' } }
  },
  series: [{
    type: 'line',
    data: [],
    smooth: true,
    lineStyle: { color: '#00D4FF', width: 2 },
    areaStyle: {
      color: {
        type: 'linear',
        x: 0, y: 0, x2: 0, y2: 1,
        colorStops: [
          { offset: 0, color: 'rgba(0, 212, 255, 0.3)' },
          { offset: 1, color: 'rgba(0, 212, 255, 0)' }
        ]
      }
    },
    showSymbol: false
  }]
})

const psdChartOption = ref({
  backgroundColor: 'transparent',
  tooltip: {
    trigger: 'axis',
    backgroundColor: 'rgba(10, 22, 40, 0.9)',
    borderColor: '#2D4A6F',
    textStyle: { color: '#E8F4FF' }
  },
  grid: {
    left: 40,
    right: 20,
    top: 10,
    bottom: 30
  },
  xAxis: {
    type: 'category',
    data: Array.from({ length: 50 }, (_, i) => (i * 10).toString()),
    axisLine: { lineStyle: { color: '#2D4A6F' } },
    axisLabel: { color: '#8FA3BF', fontSize: 10 },
    name: 'Hz'
  },
  yAxis: {
    type: 'value',
    name: 'PSD',
    axisLine: { lineStyle: { color: '#2D4A6F' } },
    axisLabel: { color: '#8FA3BF', fontSize: 10 },
    splitLine: { lineStyle: { color: '#1A2D47' } }
  },
  series: [{
    type: 'line',
    data: Array.from({ length: 50 }, () => Math.random() * 100),
    smooth: true,
    lineStyle: { color: '#FF6B35', width: 2 },
    showSymbol: false
  }]
})

const toggleLegend = () => {
  showLegend.value = !showLegend.value
}

const generateAirfoil = (x) => {
  const t = 0.12
  const c = 1.0
  const yt = 5 * t * c * (
    0.2969 * Math.sqrt(x/c) -
    0.1260 * (x/c) -
    0.3516 * Math.pow(x/c, 2) +
    0.2843 * Math.pow(x/c, 3) -
    0.1015 * Math.pow(x/c, 4)
  )
  return yt
}

const pressureToColor = (pressure) => {
  const normalized = (pressure - minPressure.value) / (maxPressure.value - minPressure.value)
  const clamped = Math.max(0, Math.min(1, normalized))
  
  const r = Math.floor(255 * clamped)
  const g = Math.floor(255 * (1 - Math.abs(clamped - 0.5) * 2))
  const b = Math.floor(255 * (1 - clamped))
  
  return `rgb(${r}, ${g}, ${b})`
}

let animationId = null
const drawPressureCloud = () => {
  const canvas = canvasRef.value
  if (!canvas) return
  
  const ctx = canvas.getContext('2d')
  const width = canvas.width
  const height = canvas.height
  const padding = 60
  
  ctx.fillStyle = '#0A1628'
  ctx.fillRect(0, 0, width, height)
  
  const scaleX = (width - padding * 2) / 1.1
  const scaleY = (height - padding * 2) / 0.3
  const centerY = height / 2
  
  const sensorPositions = []
  for (let i = 0; i < 128; i++) {
    const xRatio = (i % 32) / 31
    const isUpper = i < 64
    const row = Math.floor(i / 32)
    
    const x = padding + xRatio * (width - padding * 2)
    const baseY = generateAirfoil(xRatio)
    const yOffset = (row - 1) * 0.05 * scaleY
    
    sensorPositions.push({
      x,
      y: centerY + (isUpper ? -1 : 1) * (baseY * scaleY + yOffset)
    })
  }
  
  for (let i = 0; i < sensorPositions.length - 1; i++) {
    for (let j = i + 1; j < Math.min(i + 33, sensorPositions.length); j++) {
      const p1 = sensorPositions[i]
      const p2 = sensorPositions[j]
      const dist = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2))
      
      if (dist < 80) {
        const avgPressure = (pressureData.value[i].value + pressureData.value[j].value) / 2
        ctx.beginPath()
        ctx.moveTo(p1.x, p1.y)
        ctx.lineTo(p2.x, p2.y)
        ctx.strokeStyle = pressureToColor(avgPressure)
        ctx.lineWidth = 3
        ctx.globalAlpha = 0.6
        ctx.stroke()
        ctx.globalAlpha = 1
      }
    }
  }
  
  sensorPositions.forEach((pos, i) => {
    const pressure = pressureData.value[i].value
    const status = pressureData.value[i].status
    
    ctx.beginPath()
    ctx.arc(pos.x, pos.y, 8, 0, Math.PI * 2)
    ctx.fillStyle = pressureToColor(pressure)
    ctx.fill()
    
    if (status === 'warning' || status === 'error') {
      ctx.strokeStyle = status === 'warning' ? '#FF6B35' : '#FF5252'
      ctx.lineWidth = 2
      ctx.stroke()
    }
  })
  
  ctx.beginPath()
  ctx.moveTo(padding, centerY)
  for (let x = 0; x <= 1; x += 0.01) {
    const y = generateAirfoil(x)
    ctx.lineTo(padding + x * (width - padding * 2), centerY - y * scaleY)
  }
  for (let x = 1; x >= 0; x -= 0.01) {
    const y = generateAirfoil(x)
    ctx.lineTo(padding + x * (width - padding * 2), centerY + y * scaleY)
  }
  ctx.closePath()
  ctx.strokeStyle = 'rgba(0, 212, 255, 0.8)'
  ctx.lineWidth = 2
  ctx.stroke()
  
  ctx.fillStyle = '#8FA3BF'
  ctx.font = '11px Roboto Mono'
  ctx.textAlign = 'center'
  ctx.fillText('弦向位置 (x/c)', width / 2, height - 20)
  
  animationId = requestAnimationFrame(drawPressureCloud)
}

watch(pressureData, () => {
  const idx = selectedChannel.value - 1
  channelHistory.value.push({
    time: Date.now(),
    value: pressureData.value[idx]?.value || 0
  })
  
  if (channelHistory.value.length > 200) {
    channelHistory.value.shift()
  }
  
  const data = channelHistory.value.slice(-100)
  channelChartOption.value.xAxis.data = data.map((_, i) => i)
  channelChartOption.value.series[0].data = data.map(d => d.value)
}, { deep: true })

watch(displayMode, () => {
  console.log('Display mode changed:', displayMode.value)
})

onMounted(() => {
  nextTick(() => {
    const canvas = canvasRef.value
    if (canvas) {
      canvas.width = canvas.offsetWidth
      canvas.height = canvas.offsetHeight
      drawPressureCloud()
    }
  })
})

onUnmounted(() => {
  if (animationId) {
    cancelAnimationFrame(animationId)
  }
})
</script>

<style scoped lang="scss">
.pressure-view {
  display: grid;
  grid-template-columns: 1fr 380px;
  gap: 16px;
  padding: 16px;
  height: 100%;
}

.main-panel {
  display: flex;
  flex-direction: column;
  
  .panel-content {
    flex: 1;
    position: relative;
    padding: 0;
    overflow: hidden;
  }
}

.pressure-canvas {
  width: 100%;
  height: 100%;
  min-height: 400px;
}

.color-bar {
  position: absolute;
  right: 20px;
  top: 20px;
  width: 30px;
  height: 200px;
  display: flex;
  flex-direction: column;
  opacity: 0;
  transform: translateX(20px);
  transition: all var(--transition-normal);
  
  &.visible {
    opacity: 1;
    transform: translateX(0);
  }
  
  .color-gradient {
    flex: 1;
    background: linear-gradient(180deg, 
      #ff0000 0%, 
      #ffff00 50%, 
      #0000ff 100%
    );
    border: 1px solid var(--color-border);
    border-radius: 3px;
  }
  
  .color-labels {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    position: absolute;
    right: 40px;
    top: 0;
    bottom: 0;
    font-size: 10px;
    color: var(--color-text-secondary);
  }
  
  .color-unit {
    text-align: center;
    font-size: 10px;
    color: var(--color-text-secondary);
    margin-top: 8px;
  }
}

.view-controls {
  display: flex;
  align-items: center;
  gap: 10px;
}

.control-select {
  background: var(--color-primary);
  border: 1px solid var(--color-border);
  color: var(--color-text-primary);
  padding: 6px 12px;
  font-size: 12px;
  border-radius: 2px;
  cursor: pointer;
  
  &:focus {
    outline: none;
    border-color: var(--color-accent);
  }
}

.side-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow-y: auto;
}

.stat-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.stat-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px;
  background: var(--color-primary);
  border-radius: 4px;
  
  .stat-label {
    font-size: 11px;
    color: var(--color-text-secondary);
  }
  
  .stat-value {
    font-family: var(--font-display);
    font-size: 16px;
    font-weight: 700;
    color: var(--color-accent);
  }
}

.channel-selector {
  margin-bottom: 16px;
  
  label {
    display: block;
    font-size: 11px;
    color: var(--color-text-secondary);
    margin-bottom: 10px;
  }
}

:deep(.channel-slider) {
  .el-slider__runway {
    background: var(--color-border);
  }
  .el-slider__bar {
    background: var(--color-accent);
  }
  .el-slider__input input {
    background: var(--color-secondary);
    border-color: var(--color-border);
    color: var(--color-text-primary);
  }
}

.channel-chart {
  height: 150px;
  margin-bottom: 16px;
}

.channel-info {
  .info-row {
    display: flex;
    justify-content: space-between;
    padding: 8px 0;
    border-bottom: 1px solid var(--color-border);
    font-size: 12px;
    
    &:last-child {
      border-bottom: none;
    }
    
    .highlight {
      font-family: var(--font-display);
      font-weight: 600;
      color: var(--color-accent);
    }
  }
}

.status-tag {
  padding: 2px 8px;
  border-radius: 2px;
  font-size: 11px;
  
  &.normal {
    background: rgba(0, 200, 83, 0.2);
    color: #00C853;
  }
  
  &.warning {
    background: rgba(255, 107, 53, 0.2);
    color: #FF6B35;
  }
  
  &.error {
    background: rgba(255, 82, 82, 0.2);
    color: #FF5252;
  }
}

.psd-chart {
  height: 180px;
}

.panel {
  &.statistics-panel { animation: fadeIn 0.4s ease 0.1s both; }
  &.channel-panel { animation: fadeIn 0.4s ease 0.2s both; }
  &.psd-panel { animation: fadeIn 0.4s ease 0.3s both; }
}
</style>
