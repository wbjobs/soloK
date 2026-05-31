<template>
  <div class="spectrum-view">
    <div class="top-panel">
      <div class="panel">
        <div class="panel-header">
          <span><DataAnalysis :size="16" /> 频谱分析 - Welch PSD</span>
          <div class="controls">
            <span class="vortex-detected" v-if="fftData.vortexFrequency">
              <Warning /> 涡脱频率: <strong>{{ fftData.vortexFrequency.toFixed(1) }} Hz</strong>
            </span>
          </div>
        </div>
        <div class="spectrum-controls">
          <div class="control-group">
            <label>算法:</label>
            <select v-model="fftConfig.method" class="control-select">
              <option value="welch">Welch PSD</option>
              <option value="fft">加窗FFT</option>
              <option value="stft">STFT时频图</option>
            </select>
          </div>
          <div class="control-group">
            <label>窗函数:</label>
            <select v-model="fftConfig.windowType" class="control-select">
              <option value="hann">汉宁窗 (Hann)</option>
              <option value="hamming">汉明窗 (Hamming)</option>
              <option value="blackman">布莱克曼窗</option>
              <option value="rectangular">矩形窗</option>
            </select>
          </div>
          <div class="control-group">
            <label>FFT点数:</label>
            <select v-model="fftConfig.nperseg" class="control-select">
              <option :value="256">256</option>
              <option :value="512">512</option>
              <option :value="1024">1024</option>
              <option :value="2048">2048</option>
              <option :value="4096">4096</option>
            </select>
          </div>
          <div class="control-group">
            <label>重叠率:</label>
            <el-slider 
              v-model="fftConfig.overlapPercent" 
              :min="0" 
              :max="75" 
              :step="25"
              style="width: 100px"
            />
            <span>{{ fftConfig.overlapPercent }}%</span>
          </div>
          <div class="control-group">
            <label>
              <input type="checkbox" v-model="fftConfig.detrend" /> 
              去趋势
            </label>
          </div>
          <div class="control-group">
            <label>显示峰值:</label>
            <select v-model="fftConfig.showPeaks" class="control-select">
              <option :value="0">关闭</option>
              <option :value="1">主峰值</option>
              <option :value="3">前3峰值</option>
              <option :value="5">前5峰值</option>
            </select>
          </div>
        </div>
        <div class="panel-content">
          <v-chart class="fft-chart" :option="fftChartOption" autoresize />
        </div>
      </div>
    </div>
    
    <div class="bottom-panels">
      <div class="panel">
        <div class="panel-header">
          <span><TrendCharts :size="16" /> 通道频谱对比</span>
          <select v-model="compareMode" class="control-select">
            <option value="multi">多通道叠加</option>
            <option value="single">单通道</option>
          </select>
        </div>
        <div class="panel-content">
          <div class="channel-selector-horizontal" v-if="compareMode === 'multi'">
            <div 
              v-for="ch in displayChannels" 
              :key="ch"
              class="channel-tag"
              :class="{ active: selectedMultiChannels.includes(ch) }"
              :style="{ '--channel-color': getChannelColor(ch) }"
              @click="toggleChannel(ch)"
            >
              CH{{ ch }}
            </div>
          </div>
          <div class="channel-single" v-else>
            <el-slider 
              v-model="singleChannel" 
              :min="1" 
              :max="128" 
              :step="1"
              :show-input="true"
            />
          </div>
          <v-chart class="compare-chart" :option="compareChartOption" autoresize />
        </div>
      </div>
      
      <div class="panel">
        <div class="panel-header">
          <span><PieChart :size="16" /> 频谱参数</span>
        </div>
        <div class="panel-content params-grid">
          <div class="param-item">
            <span class="param-label">采样率</span>
            <span class="param-value">2000 Hz</span>
          </div>
          <div class="param-item">
            <span class="param-label">FFT点数</span>
            <span class="param-value">{{ fftConfig.nperseg }}</span>
          </div>
          <div class="param-item">
            <span class="param-label">频率分辨率</span>
            <span class="param-value">{{ (2000/fftConfig.nperseg).toFixed(2) }} Hz</span>
          </div>
          <div class="param-item">
            <span class="param-label">奈奎斯特频率</span>
            <span class="param-value">1000 Hz</span>
          </div>
          <div class="param-item">
            <span class="param-label">窗函数</span>
            <span class="param-value">{{ windowTypeName }}</span>
          </div>
          <div class="param-item">
            <span class="param-label">重叠样本</span>
            <span class="param-value">{{ Math.floor(fftConfig.nperseg * fftConfig.overlapPercent / 100) }}</span>
          </div>
          <div class="param-item">
            <span class="param-label">平均次数</span>
            <span class="param-value">{{ averageCount }}</span>
          </div>
          <div class="param-item">
            <span class="param-label">算法类型</span>
            <span class="param-value">{{ algorithmName }}</span>
          </div>
          <div class="param-item" v-if="fftData.vortexFrequency">
            <span class="param-label">涡脱频率</span>
            <span class="param-value highlight">{{ fftData.vortexFrequency.toFixed(2) }} Hz</span>
          </div>
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
import { LineChart, BarChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, LegendComponent, MarkLineComponent, MarkPointComponent } from 'echarts/components'
import { DataAnalysis, TrendCharts, PieChart, Warning } from '@element-plus/icons-vue'

use([
  CanvasRenderer,
  LineChart,
  BarChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  MarkLineComponent,
  MarkPointComponent
])

const systemStore = useSystemStore()
const fftData = computed(() => systemStore.fftData)
const pressureData = computed(() => systemStore.pressureData)

const fftConfig = reactive({
  method: 'welch',
  windowType: 'hann',
  nperseg: 1024,
  overlapPercent: 50,
  detrend: true,
  showPeaks: 1
})

const windowTypeName = computed(() => {
  const names = {
    'hann': '汉宁窗',
    'hamming': '汉明窗',
    'blackman': '布莱克曼窗',
    'rectangular': '矩形窗'
  }
  return names[fftConfig.windowType] || '汉宁窗'
})

const algorithmName = computed(() => {
  const names = {
    'welch': 'Welch PSD',
    'fft': '加窗FFT',
    'stft': 'STFT时频分析'
  }
  return names[fftConfig.method] || 'Welch PSD'
})

const averageCount = computed(() => {
  const signalLength = 2000
  const overlap = Math.floor(fftConfig.nperseg * fftConfig.overlapPercent / 100)
  const step = fftConfig.nperseg - overlap
  if (step <= 0) return 1
  return Math.max(1, Math.floor((signalLength - overlap) / step))
})

const compareMode = ref('multi')
const displayChannels = [1, 16, 32, 48, 64, 80, 96, 112, 128]
const selectedMultiChannels = ref([1, 64, 128])
const singleChannel = ref(64)

const channelColors = [
  '#00D4FF', '#FF6B35', '#96CEB4', '#FFEAA7', 
  '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9'
]

const getChannelColor = (ch) => {
  const idx = displayChannels.indexOf(ch)
  return channelColors[idx % channelColors.length]
}

const toggleChannel = (ch) => {
  const idx = selectedMultiChannels.value.indexOf(ch)
  if (idx > -1) {
    selectedMultiChannels.value.splice(idx, 1)
  } else {
    selectedMultiChannels.value.push(ch)
  }
}

const fftChartOption = ref({
  backgroundColor: 'transparent',
  tooltip: {
    trigger: 'axis',
    backgroundColor: 'rgba(10, 22, 40, 0.9)',
    borderColor: '#2D4A6F',
    textStyle: { color: '#E8F4FF' },
    formatter: (params) => {
      const p = params[0]
      return `频率: ${p.name} Hz<br/>幅值: ${p.value.toFixed(4)}`
    }
  },
  grid: {
    left: 60,
    right: 30,
    top: 40,
    bottom: 50
  },
  xAxis: {
    type: 'category',
    data: [],
    axisLine: { lineStyle: { color: '#2D4A6F' } },
    axisLabel: { color: '#8FA3BF', fontSize: 11 },
    name: '频率 (Hz)',
    nameTextStyle: { color: '#8FA3BF', fontSize: 12 }
  },
  yAxis: {
    type: 'value',
    name: '幅值',
    axisLine: { lineStyle: { color: '#2D4A6F' } },
    axisLabel: { color: '#8FA3BF', fontSize: 11 },
    splitLine: { lineStyle: { color: '#1A2D47' } },
    nameTextStyle: { color: '#8FA3BF', fontSize: 12 }
  },
  series: [{
    type: 'bar',
    data: [],
    itemStyle: {
      color: {
        type: 'linear',
        x: 0, y: 0, x2: 0, y2: 1,
        colorStops: [
          { offset: 0, color: '#00D4FF' },
          { offset: 1, color: 'rgba(0, 212, 255, 0.3)' }
        ]
      }
    },
    markLine: {
      symbol: 'none',
      data: [],
      lineStyle: {
        color: '#FF6B35',
        type: 'dashed',
        width: 2
      },
      label: {
        formatter: '涡脱频率',
        color: '#FF6B35',
        fontSize: 11
      }
    }
  }]
})

const compareChartOption = ref({
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
    data: Array.from({ length: 100 }, (_, i) => (i * 10).toString()),
    axisLine: { lineStyle: { color: '#2D4A6F' } },
    axisLabel: { color: '#8FA3BF', fontSize: 10 },
    name: '频率 (Hz)',
    nameTextStyle: { color: '#8FA3BF', fontSize: 11 }
  },
  yAxis: {
    type: 'value',
    name: 'PSD',
    axisLine: { lineStyle: { color: '#2D4A6F' } },
    axisLabel: { color: '#8FA3BF', fontSize: 10 },
    splitLine: { lineStyle: { color: '#1A2D47' } },
    nameTextStyle: { color: '#8FA3BF', fontSize: 11 }
  },
  series: []
})

watch([fftData, () => fftConfig.showPeaks], () => {
  const data = fftData.value
  if (data.frequencies && data.frequencies.length > 0) {
    fftChartOption.value.xAxis.data = data.frequencies.map(f => f.toFixed(0))
    fftChartOption.value.series[0].data = data.amplitudes
    
    if (data.vortexFrequency) {
      fftChartOption.value.series[0].markLine.data = [
        { xAxis: data.vortexFrequency.toFixed(0) }
      ]
    }
    
    if (fftConfig.showPeaks > 0 && data.peaks && data.peaks.length > 0) {
      const peaksToShow = data.peaks.slice(0, fftConfig.showPeaks)
      fftChartOption.value.series[0].markPoint = {
        symbol: 'circle',
        symbolSize: 8,
        itemStyle: { color: '#FF6B35' },
        label: {
          show: true,
          formatter: (params) => `${params.data.freq.toFixed(0)} Hz`,
          color: '#FF6B35',
          fontSize: 10,
          position: 'top'
        },
        data: peaksToShow.map(p => ({
          xAxis: p.frequency.toFixed(0),
          yAxis: p.magnitude,
          freq: p.frequency,
          value: p.magnitude.toFixed(4)
        }))
      }
    } else {
      fftChartOption.value.series[0].markPoint = { data: [] }
    }
  }
}, { deep: true })

watch([selectedMultiChannels, compareMode], () => {
  if (compareMode.value === 'multi') {
    compareChartOption.value.legend.data = selectedMultiChannels.value.map(ch => `CH${ch}`)
    compareChartOption.value.series = selectedMultiChannels.value.map((ch, idx) => ({
      name: `CH${ch}`,
      type: 'line',
      data: generateFFTData(ch),
      smooth: true,
      lineStyle: { color: getChannelColor(ch), width: 2 },
      showSymbol: false
    }))
  } else {
    compareChartOption.value.legend.data = [`CH${singleChannel.value}`]
    compareChartOption.value.series = [{
      name: `CH${singleChannel.value}`,
      type: 'line',
      data: generateFFTData(singleChannel.value),
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
  }
}, { deep: true, immediate: true })

watch(singleChannel, () => {
  if (compareMode.value === 'single') {
    compareChartOption.value.legend.data = [`CH${singleChannel.value}`]
    compareChartOption.value.series = [{
      name: `CH${singleChannel.value}`,
      type: 'line',
      data: generateFFTData(singleChannel.value),
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
  }
})

const generateFFTData = (channel) => {
  const baseFreq = 45 + (channel % 10) * 5
  return Array.from({ length: 100 }, (_, i) => {
    const freq = i * 10
    const peak = Math.exp(-Math.pow(freq - baseFreq, 2) / 500) * (0.5 + Math.random() * 0.5)
    const noise = Math.random() * 0.1
    return peak + noise
  })
}

onMounted(() => {
  if (fftData.value.frequencies.length === 0) {
    const freqs = Array.from({ length: 100 }, (_, i) => i * 10)
    const amps = freqs.map(f => {
      const peak = Math.exp(-Math.pow(f - 45, 2) / 200) * 0.8
      const noise = Math.random() * 0.1
      return peak + noise
    })
    
    fftChartOption.value.xAxis.data = freqs.map(f => f.toString())
    fftChartOption.value.series[0].data = amps
  }
})
</script>

<style scoped lang="scss">
.spectrum-view {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px;
  height: 100%;
}

.top-panel {
  flex: 1;
  
  .panel {
    height: 100%;
    display: flex;
    flex-direction: column;
    animation: fadeIn 0.5s ease;
    
    .panel-content {
      flex: 1;
      padding: 10px;
    }
  }
}

.fft-chart {
  width: 100%;
  height: 100%;
  min-height: 250px;
}

.bottom-panels {
  display: grid;
  grid-template-columns: 1fr 300px;
  gap: 16px;
  height: 320px;
  
  .panel {
    display: flex;
    flex-direction: column;
    animation: fadeIn 0.5s ease 0.1s both;
    
    .panel-content {
      flex: 1;
      display: flex;
      flex-direction: column;
    }
  }
}

.controls {
  display: flex;
  align-items: center;
  gap: 16px;
}

.vortex-detected {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #FF6B35;
  padding: 4px 12px;
  background: rgba(255, 107, 53, 0.1);
  border: 1px solid rgba(255, 107, 53, 0.3);
  border-radius: 4px;
  
  strong {
    font-family: var(--font-display);
    font-size: 14px;
  }
}

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

.channel-selector-horizontal {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}

.channel-tag {
  padding: 4px 12px;
  background: var(--color-primary);
  border: 1px solid var(--color-border);
  color: var(--color-text-secondary);
  font-size: 11px;
  border-radius: 2px;
  cursor: pointer;
  transition: all var(--transition-fast);
  
  &:hover {
    border-color: var(--color-accent);
  }
  
  &.active {
    background: var(--channel-color);
    border-color: var(--channel-color);
    color: var(--color-primary);
    font-weight: 600;
  }
}

.channel-single {
  margin-bottom: 12px;
  padding: 0 10px;
}

.compare-chart {
  flex: 1;
  min-height: 180px;
}

.params-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  padding: 8px;
}

.param-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px;
  background: var(--color-primary);
  border-radius: 4px;
  
  .param-label {
    font-size: 11px;
    color: var(--color-text-secondary);
  }
  
  .param-value {
    font-family: var(--font-display);
    font-size: 15px;
    font-weight: 600;
    color: var(--color-accent);
  }
  
  .param-value.highlight {
    color: var(--color-warning);
  }
}

.spectrum-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  padding: 12px 16px;
  background: rgba(26, 45, 71, 0.5);
  border-bottom: 1px solid var(--color-border);
  
  .control-group {
    display: flex;
    align-items: center;
    gap: 8px;
    
    label {
      font-size: 11px;
      color: var(--color-text-secondary);
      white-space: nowrap;
      
      input[type="checkbox"] {
        margin-right: 4px;
        vertical-align: middle;
      }
    }
    
    .control-select {
      min-width: 120px;
    }
    
    .el-slider {
      flex: 1;
    }
    
    span {
      font-size: 11px;
      color: var(--color-accent);
      font-family: var(--font-display);
      min-width: 40px;
    }
  }
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
