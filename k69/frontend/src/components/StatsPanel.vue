<template>
  <div class="stats-panel">
    <div class="stats-summary">
      <el-statistic title="总异常数" :value="totalAnomalies" value-style="color: #F56C6C" />
      <el-divider direction="vertical" />
      <el-statistic title="异常率(%)" :value="anomalyRate" :precision="2" value-style="color: #E6A23C" />
    </div>
    
    <div class="chart-container" ref="chartRef"></div>
    
    <div class="stats-table">
      <el-table :data="displayStats" size="small" stripe max-height="200">
        <el-table-column prop="date" label="日期" width="100" />
        <el-table-column prop="anomaly_count" label="异常数" width="80" align="right" />
        <el-table-column prop="anomaly_rate" label="异常率" width="90" align="right">
          <template #default="{ row }">
            {{ (row.anomaly_rate * 100).toFixed(2) }}%
          </template>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import * as echarts from 'echarts'

const props = defineProps({
  dailyStats: {
    type: Array,
    default: () => []
  }
})

const chartRef = ref(null)
let chart = null

const displayStats = computed(() => {
  return [...props.dailyStats].reverse().slice(0, 7)
})

const totalAnomalies = computed(() => {
  return props.dailyStats.reduce((sum, s) => sum + s.anomaly_count, 0)
})

const anomalyRate = computed(() => {
  const totalPoints = props.dailyStats.reduce((sum, s) => sum + s.total_points, 0)
  return totalPoints > 0 ? (totalAnomalies.value / totalPoints) * 100 : 0
})

const initChart = () => {
  chart = echarts.init(chartRef.value)
  
  const option = {
    grid: {
      left: 10,
      right: 10,
      top: 10,
      bottom: 30
    },
    xAxis: {
      type: 'category',
      data: [],
      axisLabel: {
        rotate: 45,
        fontSize: 10
      }
    },
    yAxis: {
      type: 'value',
      name: '异常数'
    },
    tooltip: {
      trigger: 'axis'
    },
    series: [{
      type: 'bar',
      data: [],
      itemStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: '#F56C6C' },
          { offset: 1, color: '#F8D7DA' }
        ])
      }
    }]
  }
  
  chart.setOption(option)
}

const updateChart = () => {
  if (!chart || !props.dailyStats.length) return
  
  const sortedStats = [...props.dailyStats].sort((a, b) => a.date.localeCompare(b.date))
  
  chart.setOption({
    xAxis: {
      data: sortedStats.map(s => s.date.slice(5))
    },
    series: [{
      data: sortedStats.map(s => s.anomaly_count)
    }]
  })
}

watch(() => props.dailyStats, updateChart, { deep: true })

onMounted(() => {
  initChart()
  updateChart()
  window.addEventListener('resize', () => chart?.resize())
})

onUnmounted(() => {
  chart?.dispose()
})
</script>

<style scoped>
.stats-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.stats-summary {
  display: flex;
  justify-content: space-around;
  padding: 15px 0;
  border-bottom: 1px solid #ebeef5;
}

.chart-container {
  height: 200px;
  margin: 10px 0;
}

.stats-table {
  flex: 1;
  overflow: auto;
}
</style>
