<template>
  <div class="flutter-view">
    <div class="top-panel">
      <div class="panel flutter-status-panel">
        <div class="panel-header">
          <span><Warning :size="16" /> 颤振裕度监测</span>
          <div class="status-badges">
            <span class="badge" :class="flutterData.warning_level">
              {{ warningLevelText }}
            </span>
          </div>
        </div>
        <div class="panel-content">
          <div class="margin-gauge-container">
            <div class="margin-gauge">
              <svg viewBox="0 0 200 120" class="gauge-svg">
                <path d="M 20 100 A 80 80 0 0 1 180 100" 
                      fill="none" stroke="#1a2d47" stroke-width="20" />
                <path d="M 20 100 A 80 80 0 0 1 180 100" 
                      fill="none" 
                      :stroke="marginColor" 
                      stroke-width="20"
                      :stroke-dasharray="gaugeArcLength"
                      :stroke-dashoffset="gaugeDashOffset" />
                <text x="100" y="70" class="gauge-value" :fill="marginColor">
                  {{ flutterData.flutter_margin.toFixed(1) }}%
                </text>
                <text x="100" y="90" class="gauge-label">颤振裕度</text>
              </svg>
            </div>
            <div class="margin-info">
              <div class="info-item">
                <span class="info-label">当前速度</span>
                <span class="info-value">{{ currentVelocity.toFixed(1) }} m/s</span>
              </div>
              <div class="info-item">
                <span class="info-label">预测颤振速度</span>
                <span class="info-value" :class="{ 'danger': flutterData.flutter_speed > 0 }">
                  {{ flutterData.flutter_speed > 0 ? flutterData.flutter_speed.toFixed(1) + ' m/s' : '--' }}
                </span>
              </div>
              <div class="info-item">
                <span class="info-label">阻尼比</span>
                <span class="info-value" :class="{ 'danger': flutterData.damping_ratio <= 0 }">
                  {{ (flutterData.damping_ratio * 100).toFixed(2) }}%
                </span>
              </div>
              <div class="info-item">
                <span class="info-label">固有频率</span>
                <span class="info-value">{{ flutterData.natural_frequency.toFixed(1) }} Hz</span>
              </div>
              <div class="info-item">
                <span class="info-label">置信度</span>
                <span class="info-value">{{ (flutterData.confidence * 100).toFixed(0) }}%</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <div class="panel">
        <div class="panel-header">
          <span><TrendCharts :size="16" /> 阻尼比-速度趋势</span>
        </div>
        <div class="panel-content">
          <v-chart class="history-chart" :option="dampingHistoryChartOption" autoresize />
        </div>
      </div>
    </div>
    
    <div class="bottom-panels">
      <div class="panel">
        <div class="panel-header">
          <span><DataAnalysis :size="16" /> ARMA模型分析</span>
        </div>
        <div class="panel-content">
          <div class="arma-config">
            <div class="config-item">
              <label>AR阶数</label>
              <el-select v-model="armaConfig.arOrder" size="small" style="width: 80px">
                <el-option :value="10" label="10" />
                <el-option :value="15" label="15" />
                <el-option :value="20" label="20" />
                <el-option :value="30" label="30" />
              </el-select>
            </div>
            <div class="config-item">
              <label>MA阶数</label>
              <el-select v-model="armaConfig.maOrder" size="small" style="width: 80px">
                <el-option :value="3" label="3" />
                <el-option :value="5" label="5" />
                <el-option :value="10" label="10" />
              </el-select>
            </div>
            <div class="config-item">
              <label>分析通道</label>
              <el-select v-model="armaConfig.channelIdx" size="small" style="width: 100px">
                <el-option v-for="ch in [1, 16, 32, 48, 64, 80, 96, 112, 128]" :key="ch" 
                          :value="ch - 1" :label="'CH' + ch" />
              </el-select>
            </div>
            <el-button type="primary" size="small" @click="runAnalysis">
              <RefreshLeft /> 重新分析
            </el-button>
          </div>
          <v-chart class="decay-chart" :option="decayChartOption" autoresize />
        </div>
      </div>
      
      <div class="panel">
        <div class="panel-header">
          <span><PieChart :size="16" /> 颤振边界预测</span>
        </div>
        <div class="panel-content">
          <v-chart class="boundary-chart" :option="boundaryChartOption" autoresize />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, reactive } from 'vue'
import { useSystemStore } from '@/stores/system'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { LineChart, ScatterChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, LegendComponent, MarkLineComponent } from 'echarts/components'
import { Warning, TrendCharts, DataAnalysis, PieChart, RefreshLeft } from '@element-plus/icons-vue'

use([
  CanvasRenderer,
  LineChart,
  ScatterChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  MarkLineComponent
])

const systemStore = useSystemStore()
const flutterData = computed(() => systemStore.flutterData)
const flutterHistory = computed(() => systemStore.flutterHistory)

const currentVelocity = ref(50.0)

const armaConfig = reactive({
  arOrder: 20,
  maOrder: 5,
  channelIdx: 63
})

const warningLevelText = computed(() => {
  const levels = {
    safe: '安全',
    caution: '注意',
    warning: '警告',
    danger: '危险'
  }
  return levels[flutterData.value.warning_level] || '未知'
})

const marginColor = computed(() => {
  const margin = flutterData.value.flutter_margin
  if (margin > 20) return '#4ECDC4'
  if (margin > 10) return '#FFEAA7'
  if (margin > 5) return '#FF6B35'
  return '#FF4757'
})

const gaugeArcLength = computed(() => {
  const margin = Math.max(0, Math.min(100, flutterData.value.flutter_margin))
  return margin / 100 * 251.3
})

const gaugeDashOffset = computed(() => {
  return 251.3 - gaugeArcLength.value
})

const dampingHistoryChartOption = ref({
  grid: { left: '10%', right: '5%', top: '15%', bottom: '20%' },
  tooltip: {
    trigger: 'axis',
    backgroundColor: 'rgba(10, 22, 40, 0.9)',
    borderColor: '#00D4FF',
    textStyle: { color: '#ffffff' }
  },
  xAxis: {
    type: 'category',
    data: [],
    name: '速度 (m/s)',
    nameTextStyle: { color: '#8899AA' },
    axisLine: { lineStyle: { color: '#1a2d47' } },
    axisLabel: { color: '#8899AA', fontSize: 10 }
  },
  yAxis: {
    type: 'value',
    name: '阻尼比 (%)',
    nameTextStyle: { color: '#8899AA' },
    axisLine: { lineStyle: { color: '#1a2d47' } },
    axisLabel: { color: '#8899AA', fontSize: 10 },
    splitLine: { lineStyle: { color: 'rgba(26, 45, 71, 0.5)' } }
  },
  series: [{
    name: '阻尼比',
    type: 'scatter',
    data: [],
    symbolSize: 10,
    itemStyle: { color: '#00D4FF' }
  }, {
    name: '拟合曲线',
    type: 'line',
    data: [],
    smooth: true,
    lineStyle: { color: '#FF6B35', width: 2 },
    symbol: 'none'
  }, {
    name: '零阻尼线',
    type: 'line',
    data: [],
    lineStyle: { color: '#FF4757', width: 2, type: 'dashed' },
    markLine: {
      data: [{ yAxis: 0 }],
      lineStyle: { color: '#FF4757', width: 1, type: 'dashed' }
    }
  }]
})

const decayChartOption = ref({
  grid: { left: '10%', right: '5%', top: '15%', bottom: '20%' },
  tooltip: {
    trigger: 'axis',
    backgroundColor: 'rgba(10, 22, 40, 0.9)',
    borderColor: '#00D4FF',
    textStyle: { color: '#ffffff' }
  },
  xAxis: {
    type: 'category',
    data: Array.from({ length: 100 }, (_, i) => (i * 0.5).toFixed(1)),
    name: '时间 (ms)',
    nameTextStyle: { color: '#8899AA' },
    axisLine: { lineStyle: { color: '#1a2d47' } },
    axisLabel: { color: '#8899AA', fontSize: 10 }
  },
  yAxis: {
    type: 'value',
    name: '响应',
    nameTextStyle: { color: '#8899AA' },
    axisLine: { lineStyle: { color: '#1a2d47' } },
    axisLabel: { color: '#8899AA', fontSize: 10 },
    splitLine: { lineStyle: { color: 'rgba(26, 45, 71, 0.5)' } }
  },
  series: [{
    name: '衰减响应',
    type: 'line',
    data: generateDecayResponse(),
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
    symbol: 'none'
  }]
})

const boundaryChartOption = ref({
  grid: { left: '12%', right: '5%', top: '15%', bottom: '20%' },
  tooltip: {
    trigger: 'axis',
    backgroundColor: 'rgba(10, 22, 40, 0.9)',
    borderColor: '#00D4FF',
    textStyle: { color: '#ffffff' }
  },
  xAxis: {
    type: 'value',
    name: '速度 (m/s)',
    nameTextStyle: { color: '#8899AA' },
    axisLine: { lineStyle: { color: '#1a2d47' } },
    axisLabel: { color: '#8899AA', fontSize: 10 }
  },
  yAxis: {
    type: 'value',
    name: '阻尼比 (%)',
    nameTextStyle: { color: '#8899AA' },
    axisLine: { lineStyle: { color: '#1a2d47' } },
    axisLabel: { color: '#8899AA', fontSize: 10 },
    splitLine: { lineStyle: { color: 'rgba(26, 45, 71, 0.5)' } }
  },
  series: [{
    name: '试验数据',
    type: 'scatter',
    data: [],
    symbolSize: 12,
    itemStyle: { color: '#00D4FF' }
  }, {
    name: '外推曲线',
    type: 'line',
    data: [],
    smooth: true,
    lineStyle: { color: '#FF6B35', width: 2, type: 'dashed' },
    symbol: 'none'
  }, {
    name: '颤振点',
    type: 'scatter',
    data: [],
    symbolSize: 15,
    itemStyle: { color: '#FF4757' },
    symbol: 'triangle'
  }]
})

function generateDecayResponse() {
  const damping = Math.max(0.01, flutterData.value.damping_ratio || 0.05)
  const freq = flutterData.value.natural_frequency || 50
  return Array.from({ length: 100 }, (_, i) => {
    const t = i * 0.0005
    return Math.exp(-2 * Math.PI * damping * freq * t) * Math.cos(2 * Math.PI * freq * t)
  })
}

function updateCharts() {
  const history = flutterHistory.value
  
  if (history.length > 0) {
    const velocities = history.map(h => h.velocity?.toFixed(1) || '0')
    const dampings = history.map(h => (h.damping_ratio * 100) || 0)
    
    dampingHistoryChartOption.value.xAxis.data = velocities
    dampingHistoryChartOption.value.series[0].data = dampings
    
    if (dampings.length >= 2) {
      const fitted = dampings.map((_, i) => {
        const t = i / Math.max(1, dampings.length - 1)
        return dampings[0] * (1 - t) + dampings[dampings.length - 1] * t
      })
      dampingHistoryChartOption.value.series[1].data = fitted
    }
    
    boundaryChartOption.value.series[0].data = history.map(h => [h.velocity || 0, (h.damping_ratio * 100) || 0])
    
    if (flutterData.value.flutter_speed > 0) {
      const maxV = Math.max(flutterData.value.flutter_speed * 1.2, ...history.map(h => h.velocity || 0))
      const extrap = []
      for (let v = 0; v <= maxV; v += maxV / 20) {
        const d = flutterData.value.damping_ratio * (1 - v / flutterData.value.flutter_speed) * 100
        extrap.push([v, d])
      }
      boundaryChartOption.value.series[1].data = extrap
      boundaryChartOption.value.series[2].data = [[flutterData.value.flutter_speed, 0]]
    }
  }
  
  decayChartOption.value.series[0].data = generateDecayResponse()
}

function runAnalysis() {
  console.log('Running ARMA analysis with config:', armaConfig)
}

watch([flutterData, flutterHistory], updateCharts, { deep: true })

onMounted(() => {
  updateCharts()
})
</script>

<style scoped lang="scss">
.flutter-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 16px;
  gap: 16px;
}

.top-panel {
  display: grid;
  grid-template-columns: 1fr 1fr;
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
  
  .status-badges {
    display: flex;
    gap: 8px;
    
    .badge {
      padding: 4px 12px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
      
      &.safe { background: rgba(78, 205, 196, 0.2); color: #4ECDC4; }
      &.caution { background: rgba(255, 234, 167, 0.2); color: #FFEAA7; }
      &.warning { background: rgba(255, 107, 53, 0.2); color: #FF6B35; }
      &.danger { background: rgba(255, 71, 87, 0.2); color: #FF4757; }
    }
  }
}

.panel-content {
  padding: 16px;
  flex: 1;
  overflow: hidden;
}

.flutter-status-panel {
  .margin-gauge-container {
    display: grid;
    grid-template-columns: 200px 1fr;
    gap: 24px;
    align-items: center;
    height: 100%;
  }
  
  .margin-gauge {
    display: flex;
    align-items: center;
    justify-content: center;
    
    .gauge-svg {
      width: 100%;
      height: auto;
      
      .gauge-value {
        font-family: var(--font-display);
        font-size: 28px;
        font-weight: 700;
        text-anchor: middle;
      }
      
      .gauge-label {
        font-size: 12px;
        fill: #8899AA;
        text-anchor: middle;
      }
    }
  }
  
  .margin-info {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    
    .info-item {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 12px;
      background: var(--color-primary);
      border-radius: 6px;
      
      .info-label {
        font-size: 11px;
        color: var(--color-text-secondary);
      }
      
      .info-value {
        font-family: var(--font-display);
        font-size: 18px;
        font-weight: 600;
        color: var(--color-accent);
        
        &.danger {
          color: var(--color-warning);
        }
      }
    }
  }
}

.arma-config {
  display: flex;
  gap: 16px;
  margin-bottom: 16px;
  padding: 12px;
  background: rgba(26, 45, 71, 0.5);
  border-radius: 6px;
  
  .config-item {
    display: flex;
    align-items: center;
    gap: 8px;
    
    label {
      font-size: 11px;
      color: var(--color-text-secondary);
    }
  }
}

.history-chart,
.decay-chart,
.boundary-chart {
  width: 100%;
  height: calc(100% - 60px);
}
</style>
