<template>
  <div class="waveform-chart-container">
    <div ref="chartRef" class="main-chart"></div>
    <div ref="sliderRef" class="slider-chart" v-show="!realtimeMode"></div>
    <div v-if="isZooming" class="zooming-indicator">
      <i class="el-icon-loading"></i> 正在加载数据...
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'
import * as echarts from 'echarts'

const props = defineProps({
  data: {
    type: Array,
    default: () => []
  },
  anomalies: {
    type: Array,
    default: () => []
  },
  realtimeMode: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['time-range-change'])

const chartRef = ref(null)
const sliderRef = ref(null)
const isZooming = ref(false)

let mainChart = null
let sliderChart = null
let debounceTimer = null
let isUserInteracting = false
const DEBOUNCE_DELAY = 800
const REALTIME_UPDATE_THROTTLE = 100

let lastRealtimeUpdate = 0

const downsampleData = (data, maxPoints = 5000) => {
  if (data.length <= maxPoints) return data
  const ratio = Math.ceil(data.length / maxPoints)
  return data.filter((_, i) => i % ratio === 0)
}

const formatTime = (timeVal) => {
  if (!timeVal) return ''
  const date = new Date(timeVal)
  const pad = (n) => n.toString().padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

const initCharts = () => {
  mainChart = echarts.init(chartRef.value)
  
  const baseOption = {
    grid: {
      left: 60,
      right: 40,
      top: 30,
      bottom: props.realtimeMode ? 10 : 10,
      height: props.realtimeMode ? 420 : 280
    },
    xAxis: {
      type: 'time',
      axisLabel: {
        formatter: (value) => {
          const date = new Date(value)
          return `${date.getHours()}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}`
        }
      }
    },
    yAxis: {
      type: 'value',
      name: '振幅',
      nameLocation: 'middle',
      nameGap: 40
    },
    dataZoom: props.realtimeMode ? [] : [
      {
        type: 'inside',
        xAxisIndex: 0,
        start: 0,
        end: 100,
        zoomOnMouseWheel: true,
        moveOnMouseMove: true
      }
    ],
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        type: 'cross'
      },
      formatter: (params) => {
        let result = ''
        params.forEach(p => {
          if (p.seriesName === '异常点') {
            result += `<br/>${p.marker} ${p.seriesName}: ${p.value[1]?.toFixed(4)}`
          } else if (p.seriesName === '波形') {
            result = p.axisValueLabel
            result += `<br/>${p.marker} ${p.seriesName}: ${p.value[1]?.toFixed(4)}`
          }
        })
        return result
      }
    },
    legend: {
      data: ['波形', '异常点'],
      top: 0
    },
    series: [
      {
        name: '波形',
        type: 'line',
        showSymbol: false,
        lineStyle: {
          width: 1,
          color: '#409EFF'
        },
        data: [],
        z: 1,
        animation: props.realtimeMode
      },
      {
        name: '异常点',
        type: 'scatter',
        symbolSize: 8,
        itemStyle: {
          color: '#F56C6C'
        },
        data: [],
        z: 2,
        animation: props.realtimeMode
      }
    ]
  }
  
  mainChart.setOption(baseOption)
  
  if (!props.realtimeMode) {
    sliderChart = echarts.init(sliderRef.value)
    
    const sliderOption = {
      grid: {
        left: 60,
        right: 40,
        top: 10,
        bottom: 30,
        height: 60
      },
      xAxis: {
        type: 'time',
        axisLabel: {
          show: true,
          fontSize: 10
        }
      },
      yAxis: {
        type: 'value',
        show: false
      },
      dataZoom: [
        {
          type: 'slider',
          show: true,
          start: 0,
          end: 100,
          height: 25,
          bottom: 5,
          handleSize: 24,
          brushSelect: false,
          moveHandleSize: 8,
          fillerColor: 'rgba(64, 158, 255, 0.2)',
          borderColor: '#409EFF'
        }
      ],
      series: [{
        type: 'line',
        showSymbol: false,
        lineStyle: {
          width: 1,
          color: '#909399'
        },
        areaStyle: {
          color: 'rgba(144, 147, 153, 0.2)'
        },
        data: []
      }]
    }
    
    sliderChart.setOption(sliderOption)
    
    mainChart.on('dataZoom', handleMainChartZoom)
    sliderChart.on('dataZoom', handleSliderChartZoom)
    
    mainChart.getZr().on('mousedown', () => {
      isUserInteracting = true
    })
    
    sliderChart.getZr().on('mousedown', () => {
      isUserInteracting = true
    })
  }
}

const debouncedEmitTimeRange = (start, end) => {
  if (props.realtimeMode) return
  
  if (debounceTimer) {
    clearTimeout(debounceTimer)
  }
  isZooming.value = true
  debounceTimer = setTimeout(() => {
    const option = mainChart.getOption()
    const seriesData = option.series[0]?.data || []
    if (seriesData.length >= 2) {
      const totalPoints = seriesData.length
      const startIdx = Math.floor((start / 100) * (totalPoints - 1))
      const endIdx = Math.ceil((end / 100) * (totalPoints - 1))
      const startTime = seriesData[Math.max(0, startIdx)]?.[0]
      const endTime = seriesData[Math.min(totalPoints - 1, endIdx)]?.[0]
      if (startTime && endTime) {
        emit('time-range-change', {
          startTime: formatTime(startTime),
          endTime: formatTime(endTime)
        })
      }
    }
    isZooming.value = false
    isUserInteracting = false
  }, DEBOUNCE_DELAY)
}

const handleMainChartZoom = (params) => {
  if (props.realtimeMode || !mainChart || !sliderChart) return
  const option = mainChart.getOption()
  const start = option.dataZoom[0].start
  const end = option.dataZoom[0].end
  
  sliderChart.setOption({
    dataZoom: [{ start, end }]
  })
  
  if (params.batch?.[0]?.behavior !== 'setOption') {
    debouncedEmitTimeRange(start, end)
  }
}

const handleSliderChartZoom = (params) => {
  if (props.realtimeMode || !mainChart || !sliderChart) return
  const option = sliderChart.getOption()
  const start = option.dataZoom[0].start
  const end = option.dataZoom[0].end
  
  mainChart.setOption({
    dataZoom: [{ start, end }]
  })
  
  if (params.batch?.[0]?.behavior !== 'setOption') {
    debouncedEmitTimeRange(start, end)
  }
}

const updateCharts = () => {
  if (!mainChart) return
  
  const now = Date.now()
  
  if (props.realtimeMode && now - lastRealtimeUpdate < REALTIME_UPDATE_THROTTLE) {
    return
  }
  lastRealtimeUpdate = now
  
  const waveformData = props.data.map(d => [d.timestamp, d.amplitude])
  const sampledData = props.realtimeMode ? waveformData : downsampleData(waveformData, 5000)
  
  const anomalyData = props.anomalies.map(a => [a.timestamp, a.amplitude])
  
  const updateOption = {
    series: [
      {
        name: '波形',
        data: sampledData
      },
      {
        name: '异常点',
        data: anomalyData
      }
    ]
  }
  
  if (!props.realtimeMode) {
    updateOption.dataZoom = [{ start: 0, end: 100 }]
  }
  
  mainChart.setOption(updateOption, !props.realtimeMode, true)
  
  if (!props.realtimeMode && sliderChart) {
    const overviewData = downsampleData(waveformData, 1000)
    sliderChart.setOption({
      series: [{
        data: overviewData
      }],
      dataZoom: [{ start: 0, end: 100 }]
    }, false, true)
  }
}

const resizeCharts = () => {
  mainChart?.resize()
  sliderChart?.resize()
}

watch(() => props.data, () => {
  updateCharts()
  isZooming.value = false
}, { deep: true })

watch(() => props.anomalies, () => {
  if (!mainChart) return
  const anomalyData = props.anomalies.map(a => [a.timestamp, a.amplitude])
  mainChart.setOption({
    series: [
      {},
      {
        name: '异常点',
        data: anomalyData
      }
    ]
  })
}, { deep: true })

watch(() => props.realtimeMode, () => {
  if (mainChart) {
    mainChart.dispose()
    mainChart = null
  }
  if (sliderChart) {
    sliderChart.dispose()
    sliderChart = null
  }
  initCharts()
  updateCharts()
})

onMounted(() => {
  initCharts()
  updateCharts()
  window.addEventListener('resize', resizeCharts)
})

onUnmounted(() => {
  window.removeEventListener('resize', resizeCharts)
  if (debounceTimer) {
    clearTimeout(debounceTimer)
  }
  mainChart?.dispose()
  sliderChart?.dispose()
})
</script>

<style scoped>
.waveform-chart-container {
  width: 100%;
  height: 500px;
  display: flex;
  flex-direction: column;
  position: relative;
}

.main-chart {
  flex: 1;
  min-height: 300px;
}

.slider-chart {
  height: 120px;
}

.zooming-indicator {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: rgba(255, 255, 255, 0.9);
  padding: 10px 20px;
  border-radius: 4px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
  z-index: 100;
  display: flex;
  align-items: center;
  gap: 8px;
  color: #409EFF;
}
</style>
