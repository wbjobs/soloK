<template>
  <div class="aerodynamic-view">
    <div class="main-chart panel">
      <div class="panel-header">
        <span><TrendCharts :size="16" /> 气动力系数实时曲线</span>
        <div class="chart-controls">
          <button 
            v-for="coeff in coefficients" 
            :key="coeff.key"
            class="toggle-btn"
            :class="{ active: visibleCoeffs.includes(coeff.key) }"
            :style="{ '--coeff-color': coeff.color }"
            @click="toggleCoeff(coeff.key)"
          >
            {{ coeff.label }}
          </button>
        </div>
      </div>
      <div class="panel-content">
        <v-chart class="main-chart-canvas" :option="aeroChartOption" autoresize />
      </div>
    </div>
    
    <div class="side-panels">
      <div class="panel realtime-panel">
        <div class="panel-header">
          <span><DataAnalysis :size="16" /> 实时数值</span>
        </div>
        <div class="panel-content">
          <div class="realtime-item cl">
            <span class="coeff-label">CL (升力系数)</span>
            <span class="coeff-value">{{ aeroCoeff.CL.toFixed(4) }}</span>
            <span class="coeff-trend up" v-if="aeroCoeff.CL > lastValues.CL">↑</span>
            <span class="coeff-trend down" v-else-if="aeroCoeff.CL < lastValues.CL">↓</span>
          </div>
          <div class="realtime-item cd">
            <span class="coeff-label">CD (阻力系数)</span>
            <span class="coeff-value">{{ aeroCoeff.CD.toFixed(4) }}</span>
            <span class="coeff-trend up" v-if="aeroCoeff.CD > lastValues.CD">↑</span>
            <span class="coeff-trend down" v-else-if="aeroCoeff.CD < lastValues.CD">↓</span>
          </div>
          <div class="realtime-item cm">
            <span class="coeff-label">CM (俯仰力矩系数)</span>
            <span class="coeff-value">{{ aeroCoeff.CM.toFixed(4) }}</span>
            <span class="coeff-trend up" v-if="aeroCoeff.CM > lastValues.CM">↑</span>
            <span class="coeff-trend down" v-else-if="aeroCoeff.CM < lastValues.CM">↓</span>
          </div>
          <div class="ratio-item">
            <span class="ratio-label">升阻比 L/D</span>
            <span class="ratio-value">{{ (aeroCoeff.CL / aeroCoeff.CD).toFixed(2) }}</span>
          </div>
        </div>
      </div>
      
      <div class="panel polar-panel">
        <div class="panel-header">
          <span><PieChart :size="16" /> 极曲线</span>
        </div>
        <div class="panel-content">
          <v-chart class="polar-chart" :option="polarChartOption" autoresize />
        </div>
      </div>
      
      <div class="panel stats-panel">
        <div class="panel-header">
          <span><DataAnalysis :size="16" /> 统计数据</span>
        </div>
        <div class="panel-content">
          <div class="stat-row">
            <span class="stat-name">CL 最大值</span>
            <span class="stat-value">{{ stats.CL_max.toFixed(4) }}</span>
          </div>
          <div class="stat-row">
            <span class="stat-name">CL 最小值</span>
            <span class="stat-value">{{ stats.CL_min.toFixed(4) }}</span>
          </div>
          <div class="stat-row">
            <span class="stat-name">CD 平均值</span>
            <span class="stat-value">{{ stats.CD_mean.toFixed(4) }}</span>
          </div>
          <div class="stat-row">
            <span class="stat-name">CM 标准差</span>
            <span class="stat-value">{{ stats.CM_std.toFixed(4) }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useSystemStore } from '@/stores/system'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { LineChart, ScatterChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components'
import { TrendCharts, DataAnalysis, PieChart } from '@element-plus/icons-vue'

use([
  CanvasRenderer,
  LineChart,
  ScatterChart,
  GridComponent,
  TooltipComponent,
  LegendComponent
])

const systemStore = useSystemStore()
const aeroCoeff = computed(() => systemStore.aeroCoeff)
const aeroHistory = computed(() => systemStore.aeroHistory)

const coefficients = [
  { key: 'CL', label: 'CL', color: '#00D4FF' },
  { key: 'CD', label: 'CD', color: '#FF6B35' },
  { key: 'CM', label: 'CM', color: '#96CEB4' }
]

const visibleCoeffs = ref(['CL', 'CD', 'CM'])
const lastValues = ref({ CL: 0, CD: 0, CM: 0 })

const polarData = ref([])

const stats = ref({
  CL_max: 0,
  CL_min: 0,
  CD_mean: 0,
  CM_std: 0
})

const toggleCoeff = (key) => {
  const idx = visibleCoeffs.value.indexOf(key)
  if (idx > -1) {
    visibleCoeffs.value.splice(idx, 1)
  } else {
    visibleCoeffs.value.push(key)
  }
}

const aeroChartOption = ref({
  backgroundColor: 'transparent',
  tooltip: {
    trigger: 'axis',
    backgroundColor: 'rgba(10, 22, 40, 0.9)',
    borderColor: '#2D4A6F',
    textStyle: { color: '#E8F4FF' }
  },
  legend: {
    show: false
  },
  grid: {
    left: 60,
    right: 60,
    top: 30,
    bottom: 50
  },
  xAxis: {
    type: 'category',
    data: [],
    axisLine: { lineStyle: { color: '#2D4A6F' } },
    axisLabel: { color: '#8FA3BF', fontSize: 10 },
    name: '时间 (s)',
    nameTextStyle: { color: '#8FA3BF', fontSize: 12 }
  },
  yAxis: [
    {
      type: 'value',
      name: 'CL / CM',
      position: 'left',
      axisLine: { lineStyle: { color: '#2D4A6F' } },
      axisLabel: { color: '#8FA3BF', fontSize: 10 },
      splitLine: { lineStyle: { color: '#1A2D47' } },
      nameTextStyle: { color: '#8FA3BF', fontSize: 12 }
    },
    {
      type: 'value',
      name: 'CD',
      position: 'right',
      axisLine: { lineStyle: { color: '#2D4A6F' } },
      axisLabel: { color: '#8FA3BF', fontSize: 10 },
      splitLine: { show: false },
      nameTextStyle: { color: '#8FA3BF', fontSize: 12 }
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
      name: 'CD',
      type: 'line',
      yAxisIndex: 1,
      data: [],
      smooth: true,
      lineStyle: { color: '#FF6B35', width: 2 },
      showSymbol: false
    },
    {
      name: 'CM',
      type: 'line',
      data: [],
      smooth: true,
      lineStyle: { color: '#96CEB4', width: 2 },
      showSymbol: false
    }
  ]
})

const polarChartOption = ref({
  backgroundColor: 'transparent',
  tooltip: {
    trigger: 'item',
    backgroundColor: 'rgba(10, 22, 40, 0.9)',
    borderColor: '#2D4A6F',
    textStyle: { color: '#E8F4FF' },
    formatter: (params) => {
      return `CL: ${params.value[0].toFixed(4)}<br/>CD: ${params.value[1].toFixed(4)}`
    }
  },
  grid: {
    left: 50,
    right: 20,
    top: 20,
    bottom: 40
  },
  xAxis: {
    type: 'value',
    name: 'CD',
    axisLine: { lineStyle: { color: '#2D4A6F' } },
    axisLabel: { color: '#8FA3BF', fontSize: 10 },
    splitLine: { lineStyle: { color: '#1A2D47' } },
    nameTextStyle: { color: '#8FA3BF', fontSize: 11 }
  },
  yAxis: {
    type: 'value',
    name: 'CL',
    axisLine: { lineStyle: { color: '#2D4A6F' } },
    axisLabel: { color: '#8FA3BF', fontSize: 10 },
    splitLine: { lineStyle: { color: '#1A2D47' } },
    nameTextStyle: { color: '#8FA3BF', fontSize: 11 }
  },
  series: [{
    type: 'line',
    data: [],
    smooth: true,
    lineStyle: { color: '#00D4FF', width: 2 },
    itemStyle: { color: '#00D4FF' },
    showSymbol: false
  }]
})

watch(aeroHistory, (history) => {
  if (history.length > 0) {
    lastValues.value = {
      CL: history[history.length - 2]?.CL || 0,
      CD: history[history.length - 2]?.CD || 0,
      CM: history[history.length - 2]?.CM || 0
    }
    
    const data = history.slice(-200)
    aeroChartOption.value.xAxis.data = data.map((_, i) => (i * 0.1).toFixed(1))
    aeroChartOption.value.series[0].data = visibleCoeffs.value.includes('CL') ? data.map(d => d.CL) : []
    aeroChartOption.value.series[1].data = visibleCoeffs.value.includes('CD') ? data.map(d => d.CD) : []
    aeroChartOption.value.series[2].data = visibleCoeffs.value.includes('CM') ? data.map(d => d.CM) : []
    
    if (history.length % 10 === 0) {
      polarData.value.push([aeroCoeff.value.CL, aeroCoeff.value.CD])
      if (polarData.value.length > 50) {
        polarData.value.shift()
      }
      polarChartOption.value.series[0].data = polarData.value
    }
    
    const clValues = data.map(d => d.CL)
    const cdValues = data.map(d => d.CD)
    const cmValues = data.map(d => d.CM)
    
    stats.value = {
      CL_max: Math.max(...clValues),
      CL_min: Math.min(...clValues),
      CD_mean: cdValues.reduce((a, b) => a + b, 0) / cdValues.length,
      CM_std: Math.sqrt(cmValues.reduce((acc, val) => acc + Math.pow(val - (cmValues.reduce((a, b) => a + b, 0) / cmValues.length), 2), 0) / cmValues.length)
    }
  }
}, { deep: true })

onMounted(() => {
  for (let i = 0; i < 20; i++) {
    const cl = 0.3 + Math.random() * 0.4
    const cd = 0.02 + Math.random() * 0.06
    polarData.value.push([cl, cd])
  }
  polarChartOption.value.series[0].data = polarData.value
})
</script>

<style scoped lang="scss">
.aerodynamic-view {
  display: grid;
  grid-template-columns: 1fr 320px;
  gap: 16px;
  padding: 16px;
  height: 100%;
}

.main-chart {
  display: flex;
  flex-direction: column;
  animation: fadeIn 0.5s ease;
  
  .panel-content {
    flex: 1;
    padding: 10px;
  }
}

.main-chart-canvas {
  width: 100%;
  height: 100%;
  min-height: 300px;
}

.chart-controls {
  display: flex;
  gap: 8px;
}

.toggle-btn {
  padding: 4px 12px;
  background: transparent;
  border: 1px solid var(--color-border);
  color: var(--color-text-secondary);
  font-size: 11px;
  border-radius: 2px;
  cursor: pointer;
  transition: all var(--transition-fast);
  
  &:hover {
    border-color: var(--coeff-color);
    color: var(--coeff-color);
  }
  
  &.active {
    background: var(--coeff-color);
    border-color: var(--coeff-color);
    color: var(--color-primary);
    font-weight: 600;
  }
}

.side-panels {
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow-y: auto;
}

.realtime-panel {
  animation: fadeIn 0.5s ease 0.1s both;
}

.realtime-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  margin-bottom: 8px;
  background: var(--color-primary);
  border-radius: 4px;
  border-left: 3px solid var(--color-border);
  
  &.cl { border-left-color: #00D4FF; }
  &.cd { border-left-color: #FF6B35; }
  &.cm { border-left-color: #96CEB4; }
  
  &:last-child { margin-bottom: 0; }
  
  .coeff-label {
    font-size: 12px;
    color: var(--color-text-secondary);
  }
  
  .coeff-value {
    font-family: var(--font-display);
    font-size: 22px;
    font-weight: 700;
  }
  
  .cl .coeff-value { color: #00D4FF; }
  .cd .coeff-value { color: #FF6B35; }
  .cm .coeff-value { color: #96CEB4; }
  
  .coeff-trend {
    font-size: 14px;
    
    &.up { color: #00C853; }
    &.down { color: #FF5252; }
  }
}

.ratio-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  margin-top: 12px;
  background: linear-gradient(90deg, rgba(0, 212, 255, 0.1) 0%, transparent 100%);
  border-radius: 4px;
  border: 1px solid rgba(0, 212, 255, 0.3);
  
  .ratio-label {
    font-size: 13px;
    color: var(--color-text-primary);
  }
  
  .ratio-value {
    font-family: var(--font-display);
    font-size: 28px;
    font-weight: 700;
    color: var(--color-accent);
  }
}

.polar-panel,
.stats-panel {
  animation: fadeIn 0.5s ease 0.2s both;
  
  .panel-content {
    padding: 10px;
  }
}

.polar-chart {
  height: 200px;
}

.stat-row {
  display: flex;
  justify-content: space-between;
  padding: 10px 0;
  border-bottom: 1px solid var(--color-border);
  font-size: 12px;
  
  &:last-child {
    border-bottom: none;
  }
  
  .stat-name {
    color: var(--color-text-secondary);
  }
  
  .stat-value {
    font-family: var(--font-display);
    font-weight: 600;
    color: var(--color-accent);
  }
}
</style>
