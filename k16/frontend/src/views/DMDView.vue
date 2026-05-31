<template>
  <div class="dmd-view">
    <div class="top-panel">
      <div class="panel dmd-status-panel">
        <div class="panel-header">
          <span><DataAnalysis :size="16" /> 动态模态分解 (DMD)</span>
          <div class="status-info">
            <span class="quality">重构质量: {{ (dmdData.reconstruction_quality * 100).toFixed(1) }}%</span>
          </div>
        </div>
        <div class="panel-content">
          <div class="modes-list">
            <div 
              v-for="(mode, idx) in displayModes" 
              :key="idx"
              class="mode-item"
              :class="{ active: selectedModeIdx === idx }"
              @click="selectMode(idx)"
            >
              <div class="mode-header">
                <span class="mode-index">模态 #{{ idx + 1 }}</span>
                <span class="mode-status" :class="{ stable: mode.is_stable, unstable: !mode.is_stable }">
                  {{ mode.is_stable ? '稳定' : '增长' }}
                </span>
              </div>
              <div class="mode-body">
                <div class="mode-param">
                  <span class="param-label">频率</span>
                  <span class="param-value">{{ mode.frequency.toFixed(2) }} Hz</span>
                </div>
                <div class="mode-param">
                  <span class="param-label">增长率</span>
                  <span class="param-value" :class="{ danger: mode.growth_rate > 0 }">
                    {{ mode.growth_rate.toFixed(4) }}
                  </span>
                </div>
                <div class="mode-param">
                  <span class="param-label">能量占比</span>
                  <span class="param-value">{{ (mode.energy_ratio * 100).toFixed(1) }}%</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <div class="panel">
        <div class="panel-header">
          <span><PieChart :size="16" /> 模态空间结构动画</span>
          <div class="controls">
            <el-button-group>
              <el-button size="small" @click="toggleAnimation">
                <component :is="isPlaying ? VideoPause : VideoPlay" :size="14" />
                {{ isPlaying ? '暂停' : '播放' }}
              </el-button>
              <el-button size="small" @click="stepForward">
                <VideoPause /> 步进
              </el-button>
            </el-button-group>
            <span class="frame-info">帧: {{ currentFrame }}/{{ totalFrames }}</span>
          </div>
        </div>
        <div class="panel-content">
          <div class="mode-animation-container">
            <canvas ref="modeCanvas" class="mode-canvas" width="640" height="320"></canvas>
            <div class="animation-controls">
              <el-slider 
                v-model="currentFrame" 
                :min="0" 
                :max="totalFrames - 1"
                :step="1"
                style="flex: 1"
              />
              <el-select v-model="animationSpeed" size="small" style="width: 100px">
                <el-option :value="0.5" label="0.5x" />
                <el-option :value="1" label="1x" />
                <el-option :value="2" label="2x" />
                <el-option :value="4" label="4x" />
              </el-select>
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <div class="bottom-panels">
      <div class="panel">
        <div class="panel-header">
          <span><TrendCharts :size="16" /> 模态频率-增长率分布</span>
        </div>
        <div class="panel-content">
          <v-chart class="mode-chart" :option="modeChartOption" autoresize />
        </div>
      </div>
      
      <div class="panel">
        <div class="panel-header">
          <span><Monitor :size="16" /> 流场结构分析</span>
        </div>
        <div class="panel-content">
          <div class="flow-stats">
            <div class="stat-item">
              <span class="stat-label">主要模态数</span>
              <span class="stat-value">{{ displayModes.length }}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">稳定模态</span>
              <span class="stat-value success">{{ dmdData.flow_structures?.stable_modes_count || 0 }}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">增长模态</span>
              <span class="stat-value warning">{{ dmdData.flow_structures?.unstable_modes_count || 0 }}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">累计能量</span>
              <span class="stat-value">{{ (totalEnergy * 100).toFixed(1) }}%</span>
            </div>
          </div>
          <v-chart class="energy-chart" :option="energyChartOption" autoresize />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useSystemStore } from '@/stores/system'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { BarChart, ScatterChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components'
import { DataAnalysis, TrendCharts, PieChart, Monitor, VideoPlay, VideoPause } from '@element-plus/icons-vue'

use([
  CanvasRenderer,
  BarChart,
  ScatterChart,
  GridComponent,
  TooltipComponent,
  LegendComponent
])

const systemStore = useSystemStore()
const dmdData = computed(() => systemStore.dmdData)

const modeCanvas = ref(null)
const selectedModeIdx = ref(0)
const currentFrame = ref(0)
const isPlaying = ref(false)
const animationSpeed = ref(1)
let animationTimer = null

const displayModes = computed(() => {
  return dmdData.value.modes?.slice(0, 5) || []
})

const currentMode = computed(() => {
  return displayModes.value[selectedModeIdx.value] || null
})

const totalFrames = computed(() => {
  return currentMode.value?.animation_frames?.length || 30
})

const totalEnergy = computed(() => {
  return displayModes.value.reduce((sum, m) => sum + (m.energy_ratio || 0), 0)
})

const modeChartOption = ref({
  grid: { left: '10%', right: '5%', top: '10%', bottom: '15%' },
  tooltip: {
    trigger: 'item',
    backgroundColor: 'rgba(10, 22, 40, 0.9)',
    borderColor: '#00D4FF',
    textStyle: { color: '#ffffff' }
  },
  xAxis: {
    type: 'value',
    name: '频率 (Hz)',
    nameTextStyle: { color: '#8899AA' },
    axisLine: { lineStyle: { color: '#1a2d47' },
    axisLabel: { color: '#8899AA', fontSize: 10 },
    splitLine: { lineStyle: { color: 'rgba(26, 45, 71, 0.5)' } }
  },
  yAxis: {
    type: 'value',
    name: '增长率',
    nameTextStyle: { color: '#8899AA' },
    axisLine: { lineStyle: { color: '#1a2d47' },
    axisLabel: { color: '#8899AA', fontSize: 10 },
    splitLine: { lineStyle: { color: 'rgba(26, 45, 71, 0.5)' } }
  },
  series: [{
    name: '模态',
    type: 'scatter',
    data: [],
    symbolSize: (data) => Math.max(10, data[2] * 50),
    itemStyle: {
      color: (params) => {
        return params.data[1] > 0 ? '#FF4757' : '#4ECDC4'
      }
    }
  }]
})

const energyChartOption = ref({
  grid: { left: '10%', right: '5%', top: '10%', bottom: '15%' },
  tooltip: {
    trigger: 'axis',
    backgroundColor: 'rgba(10, 22, 40, 0.9)',
    borderColor: '#00D4FF',
    textStyle: { color: '#ffffff' }
  },
  xAxis: {
    type: 'category',
    data: [],
    name: '模态',
    nameTextStyle: { color: '#8899AA' },
    axisLine: { lineStyle: { color: '#1a2d47' } },
    axisLabel: { color: '#8899AA', fontSize: 10 }
  },
  yAxis: {
    type: 'value',
    name: '能量占比 (%)',
    nameTextStyle: { color: '#8899AA' },
    axisLine: { lineStyle: { color: '#1a2d47' } },
    axisLabel: { color: '#8899AA', fontSize: 10 },
    splitLine: { lineStyle: { color: 'rgba(26, 45, 71, 0.5)' } }
  },
  series: [{
    name: '能量占比',
    type: 'bar',
    data: [],
    itemStyle: {
      color: {
        type: 'linear',
        x: 0, y: 0, x2: 0, y2: 1,
        colorStops: [
          { offset: 0, color: '#00D4FF' },
          { offset: 1, color: '#0088AA' }
        ]
      }
    }
  }]
})

function selectMode(idx) {
  selectedModeIdx.value = idx
  currentFrame.value = 0
  drawModeFrame()
}

function drawModeFrame() {
  const canvas = modeCanvas.value
  if (!canvas || !currentMode.value) return
  
  const ctx = canvas.getContext('2d')
  const frames = currentMode.value.animation_frames || []
  const frame = frames[currentFrame.value] || frames[0]
  
  if (!frame) return
  
  const width = canvas.width
  const height = canvas.height
  
  ctx.fillStyle = '#0A1628'
  ctx.fillRect(0, 0, width, height)
  
  const gridRows = frame.length
  const gridCols = frame[0]?.length || 32
  
  const cellWidth = width / gridCols
  const cellHeight = height / gridRows
  
  let maxVal = 0
  for (let i = 0; i < gridRows; i++) {
    for (let j = 0; j < gridCols; j++) {
      maxVal = Math.max(maxVal, Math.abs(frame[i][j]))
    }
  }
  maxVal = maxVal || 1
  
  for (let i = 0; i < gridRows; i++) {
    for (let j = 0; j < gridCols; j++) {
      const value = frame[i][j] / maxVal
      const x = j * cellWidth
      const y = i * cellHeight
      
      const hue = value >= 0 ? 200 - value * 200 : 0 - value * 60
      const saturation = 80
      const lightness = 40 + Math.abs(value) * 30
      
      ctx.fillStyle = `hsl(${hue}, ${saturation}%, ${lightness}%)`
      ctx.fillRect(x, y, cellWidth - 1, cellHeight - 1)
    }
  }
  
  ctx.strokeStyle = '#1a2d47'
  ctx.lineWidth = 1
  for (let i = 0; i <= gridRows; i++) {
    ctx.beginPath()
    ctx.moveTo(0, i * cellHeight)
    ctx.lineTo(width, i * cellHeight)
    ctx.stroke()
  }
  for (let j = 0; j <= gridCols; j++) {
    ctx.beginPath()
    ctx.moveTo(j * cellWidth, 0)
    ctx.lineTo(j * cellWidth, height)
    ctx.stroke()
  }
}

function toggleAnimation() {
  isPlaying.value = !isPlaying.value
  
  if (isPlaying.value) {
    startAnimation()
  } else {
    stopAnimation()
  }
}

function startAnimation() {
  stopAnimation()
  animationTimer = setInterval(() => {
    currentFrame.value = (currentFrame.value + 1) % totalFrames.value
    drawModeFrame()
  }, 1000 / (30 * animationSpeed.value))
}

function stopAnimation() {
  if (animationTimer) {
    clearInterval(animationTimer)
    animationTimer = null
  }
}

function stepForward() {
  currentFrame.value = (currentFrame.value + 1) % totalFrames.value
  drawModeFrame()
}

function updateCharts() {
  if (displayModes.value.forEach((mode, idx) => {
    modeChartOption.value.series[0].data.push([
      mode.frequency,
      mode.growth_rate,
      mode.energy_ratio
    ])
  })
  
  energyChartOption.value.xAxis.data = displayModes.value.map((_, i) => `模态${i + 1}`)
  energyChartOption.value.series[0].data = displayModes.value.map(m => (m.energy_ratio * 100).toFixed(2))
  
  modeChartOption.value.series[0].data = displayModes.value.map(mode => [
    mode.frequency,
    mode.growth_rate,
    mode.energy_ratio
  ])
}

watch([currentFrame, selectedModeIdx, displayModes], () => {
  drawModeFrame()
}, { deep: true })

watch(displayModes, () => {
  updateCharts()
  drawModeFrame()
}, { deep: true })

onMounted(() => {
  updateCharts()
  drawModeFrame()
})

onUnmounted(() => {
  stopAnimation()
})
</script>

<style scoped lang="scss">
.dmd-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 16px;
  gap: 16px;
}

.top-panel {
  display: grid;
  grid-template-columns: 1fr 2fr;
  gap: 16px;
  flex: 1;
}

.bottom-panels {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  flex: 1;
}

.panel {
  display: flex;
  flex-direction: column;
  background: rgba(20, 35, 55, 0.8);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  overflow: hidden;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: rgba(26, 45, 71, 0.5);
  border-bottom: 1px solid var(--color-border);
  
  span {
    display: flex;
    align-items: center;
    gap: 8px;
    font-family: var(--font-display);
    font-size: 13px;
    color: var(--color-accent);
  }
  
  .status-info {
    .quality {
      font-family: var(--font-display);
      font-size: 14px;
      color: #4ECDC4;
    }
  }
  
  .controls {
    display: flex;
    align-items: center;
    gap: 12px;
    
    .frame-info {
      font-family: var(--font-display);
      font-size: 12px;
      color: var(--color-text-secondary);
    }
  }
}

.panel-content {
  padding: 16px;
  flex: 1;
  overflow: hidden;
}

.dmd-status-panel {
  .modes-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
    height: 100%;
    overflow-y: auto;
    
    .mode-item {
      padding: 12px;
      background: rgba(26, 45, 71, 0.3);
      border: 1px solid var(--color-border);
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.3s ease;
      
      &:hover {
        background: rgba(0, 212, 255, 0.1);
        border-color: var(--color-accent);
      }
      
      &.active {
        background: rgba(0, 212, 255, 0.2);
        border-color: var(--color-accent);
        box-shadow: 0 0 10px rgba(0, 212, 255, 0.3);
      }
      
      .mode-header {
        display: flex;
        justify-content: space-between;
        margin-bottom: 8px;
        
        .mode-index {
          font-family: var(--font-display);
          font-size: 13px;
          font-weight: 600;
          color: var(--color-text-primary);
        }
        
        .mode-status {
          padding: 2px 8px;
          border-radius: 4px;
          font-size: 10px;
          font-weight: 600;
          
          &.stable {
            background: rgba(78, 205, 196, 0.2);
            color: #4ECDC4;
          }
          
          &.unstable {
            background: rgba(255, 71, 87, 0.2);
            color: #FF4757;
          }
        }
      }
      
      .mode-body {
        display: grid;
        grid-template-columns: 1fr 1fr 1fr;
        gap: 8px;
        
        .mode-param {
          display: flex;
          flex-direction: column;
          gap: 2px;
          
          .param-label {
            font-size: 10px;
            color: var(--color-text-secondary);
          }
          
          .param-value {
            font-family: var(--font-display);
            font-size: 12px;
            color: var(--color-accent);
            
            &.danger {
              color: var(--color-warning);
            }
          }
        }
      }
    }
  }
}

.mode-animation-container {
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
  
  .mode-canvas {
    width: 100%;
    height: calc(100% - 50px);
    border: 1px solid var(--color-border);
    border-radius: 4px;
  }
  
  .animation-controls {
    display: flex;
    gap: 12px;
    align-items: center;
  }
}

.flow-stats {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 16px;
  
  .stat-item {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 12px;
    background: var(--color-primary);
    border-radius: 6px;
    
    .stat-label {
      font-size: 11px;
      color: var(--color-text-secondary);
    }
    
    .stat-value {
      font-family: var(--font-display);
      font-size: 20px;
      font-weight: 600;
      color: var(--color-accent);
      
      &.success {
        color: #4ECDC4;
      }
      
      &.warning {
        color: #FF4757;
      }
    }
  }
}

.mode-chart,
.energy-chart {
  width: 100%;
  height: calc(100% - 100px);
}
</style>
