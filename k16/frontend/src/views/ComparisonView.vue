<template>
  <div class="comparison-view">
    <div class="test-cases-panel panel">
      <div class="panel-header">
        <span><Files :size="16" /> 试验工况</span>
        <button class="btn btn-primary small" @click="loadTestCases">
          <Refresh /> 刷新
        </button>
      </div>
      <div class="panel-content">
        <div 
          v-for="tc in testCases" 
          :key="tc.id"
          class="test-case-item"
          :class="{ active: tc.active }"
          :style="{ '--case-color': tc.color }"
          @click="toggleTestCase(tc.id)"
        >
          <span class="case-color"></span>
          <span class="case-angle">{{ tc.angle }}°</span>
          <span class="case-status" :class="tc.active ? 'active' : 'inactive'">
            {{ tc.active ? '显示' : '隐藏' }}
          </span>
        </div>
      </div>
    </div>
    
    <div class="charts-panel">
      <div class="panel">
        <div class="panel-header">
          <span><TrendCharts :size="16" /> 升力系数对比 (CL)</span>
        </div>
        <div class="panel-content">
          <v-chart class="comparison-chart" :option="clChartOption" autoresize />
        </div>
      </div>
      
      <div class="panel">
        <div class="panel-header">
          <span><TrendCharts :size="16" /> 阻力系数对比 (CD)</span>
        </div>
        <div class="panel-content">
          <v-chart class="comparison-chart" :option="cdChartOption" autoresize />
        </div>
      </div>
      
      <div class="panel">
        <div class="panel-header">
          <span><DataAnalysis :size="16" /> CL-α 曲线</span>
        </div>
        <div class="panel-content">
          <v-chart class="cl-alpha-chart" :option="clAlphaChartOption" autoresize />
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
import { Files, Refresh, TrendCharts, DataAnalysis } from '@element-plus/icons-vue'

use([
  CanvasRenderer,
  LineChart,
  ScatterChart,
  GridComponent,
  TooltipComponent,
  LegendComponent
])

const systemStore = useSystemStore()
const testCases = computed(() => systemStore.testCases)

const toggleTestCase = (id) => {
  systemStore.toggleTestCase(id)
}

const loadTestCases = () => {
  console.log('Loading test cases...')
}

const generateCaseData = (angle, type) => {
  const base = type === 'CL' ? 0.3 + angle * 0.03 : 0.03 + Math.abs(angle) * 0.003
  return Array.from({ length: 50 }, (_, i) => {
    const noise = (Math.random() - 0.5) * (type === 'CL' ? 0.05 : 0.005)
    return base + Math.sin(i * 0.2) * (type === 'CL' ? 0.1 : 0.01) + noise
  })
}

const clChartOption = ref({
  backgroundColor: 'transparent',
  tooltip: {
    trigger: 'axis',
    backgroundColor: 'rgba(10, 22, 40, 0.9)',
    borderColor: '#2D4A6F',
    textStyle: { color: '#E8F4FF' }
  },
  legend: {
    data: [],
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
    type: 'category',
    data: Array.from({ length: 50 }, (_, i) => (i * 0.1).toFixed(1)),
    axisLine: { lineStyle: { color: '#2D4A6F' } },
    axisLabel: { color: '#8FA3BF', fontSize: 10 },
    name: '时间 (s)',
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
  series: []
})

const cdChartOption = ref({
  backgroundColor: 'transparent',
  tooltip: {
    trigger: 'axis',
    backgroundColor: 'rgba(10, 22, 40, 0.9)',
    borderColor: '#2D4A6F',
    textStyle: { color: '#E8F4FF' }
  },
  legend: {
    data: [],
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
    type: 'category',
    data: Array.from({ length: 50 }, (_, i) => (i * 0.1).toFixed(1)),
    axisLine: { lineStyle: { color: '#2D4A6F' } },
    axisLabel: { color: '#8FA3BF', fontSize: 10 },
    name: '时间 (s)',
    nameTextStyle: { color: '#8FA3BF', fontSize: 11 }
  },
  yAxis: {
    type: 'value',
    name: 'CD',
    axisLine: { lineStyle: { color: '#2D4A6F' } },
    axisLabel: { color: '#8FA3BF', fontSize: 10 },
    splitLine: { lineStyle: { color: '#1A2D47' } },
    nameTextStyle: { color: '#8FA3BF', fontSize: 11 }
  },
  series: []
})

const clAlphaChartOption = ref({
  backgroundColor: 'transparent',
  tooltip: {
    trigger: 'axis',
    backgroundColor: 'rgba(10, 22, 40, 0.9)',
    borderColor: '#2D4A6F',
    textStyle: { color: '#E8F4FF' },
    formatter: (params) => {
      return `攻角: ${params[0].name}°<br/>CL: ${params[0].value.toFixed(4)}`
    }
  },
  grid: {
    left: 50,
    right: 20,
    top: 30,
    bottom: 40
  },
  xAxis: {
    type: 'category',
    data: ['-5', '0', '5', '10', '15', '20', '25', '30'],
    axisLine: { lineStyle: { color: '#2D4A6F' } },
    axisLabel: { color: '#8FA3BF', fontSize: 11 },
    name: '攻角 α (°)',
    nameTextStyle: { color: '#8FA3BF', fontSize: 12 }
  },
  yAxis: {
    type: 'value',
    name: 'CL',
    axisLine: { lineStyle: { color: '#2D4A6F' } },
    axisLabel: { color: '#8FA3BF', fontSize: 10 },
    splitLine: { lineStyle: { color: '#1A2D47' } },
    nameTextStyle: { color: '#8FA3BF', fontSize: 12 }
  },
  series: [{
    type: 'line',
    data: [0.1, 0.35, 0.55, 0.72, 0.85, 0.92, 0.95, 0.93],
    smooth: true,
    lineStyle: { color: '#00D4FF', width: 3 },
    itemStyle: { color: '#00D4FF' },
    symbol: 'circle',
    symbolSize: 8
  }]
})

watch(testCases, (cases) => {
  const activeCases = cases.filter(c => c.active)
  
  clChartOption.value.legend.data = activeCases.map(c => `${c.angle}°`)
  clChartOption.value.series = activeCases.map(c => ({
    name: `${c.angle}°`,
    type: 'line',
    data: generateCaseData(c.angle, 'CL'),
    smooth: true,
    lineStyle: { color: c.color, width: 2 },
    showSymbol: false
  }))
  
  cdChartOption.value.legend.data = activeCases.map(c => `${c.angle}°`)
  cdChartOption.value.series = activeCases.map(c => ({
    name: `${c.angle}°`,
    type: 'line',
    data: generateCaseData(c.angle, 'CD'),
    smooth: true,
    lineStyle: { color: c.color, width: 2 },
    showSymbol: false
  }))
}, { deep: true, immediate: true })

onMounted(() => {
})
</script>

<style scoped lang="scss">
.comparison-view {
  display: grid;
  grid-template-columns: 240px 1fr;
  gap: 16px;
  padding: 16px;
  height: 100%;
}

.test-cases-panel {
  display: flex;
  flex-direction: column;
  animation: fadeIn 0.5s ease;
  
  .panel-content {
    flex: 1;
    overflow-y: auto;
    padding: 12px;
  }
}

.test-case-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  margin-bottom: 8px;
  background: var(--color-primary);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  cursor: pointer;
  transition: all var(--transition-fast);
  
  &:hover {
    border-color: var(--case-color);
  }
  
  &.active {
    background: color-mix(in srgb, var(--case-color) 15%, var(--color-primary));
    border-color: var(--case-color);
  }
  
  .case-color {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--case-color);
  }
  
  .case-angle {
    flex: 1;
    font-family: var(--font-display);
    font-size: 16px;
    font-weight: 600;
    color: var(--color-text-primary);
  }
  
  .case-status {
    font-size: 11px;
    padding: 2px 8px;
    border-radius: 2px;
    
    &.active {
      background: rgba(0, 200, 83, 0.2);
      color: #00C853;
    }
    
    &.inactive {
      background: rgba(143, 163, 191, 0.2);
      color: #8FA3BF;
    }
  }
}

.charts-panel {
  display: grid;
  grid-template-rows: repeat(2, 1fr) 1fr;
  gap: 16px;
  
  .panel {
    display: flex;
    flex-direction: column;
    animation: fadeIn 0.5s ease 0.1s both;
    
    .panel-content {
      flex: 1;
      padding: 10px;
    }
  }
}

.comparison-chart,
.cl-alpha-chart {
  width: 100%;
  height: 100%;
  min-height: 150px;
}

.btn.small {
  padding: 4px 10px;
  font-size: 11px;
}
</style>
