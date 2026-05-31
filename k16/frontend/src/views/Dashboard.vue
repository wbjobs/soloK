<template>
  <div class="dashboard">
    <div class="dashboard-grid">
      <div class="panel panel-controls">
        <div class="panel-header">
          <span><VideoPlay :size="16" /> 试验控制</span>
        </div>
        <div class="panel-content">
          <div class="state-machine">
            <div 
              v-for="state in states" 
              :key="state.id"
              class="state-node"
              :class="{ active: currentState === state.id, pulse: currentState === state.id }"
            >
              <span class="state-icon">
                <component :is="state.icon" :size="18" />
              </span>
              <span class="state-label">{{ state.label }}</span>
            </div>
            <div class="state-connector" v-for="i in 4" :key="'c'+i"></div>
          </div>
          
          <div class="control-buttons">
            <button 
              class="btn btn-primary" 
              @click="handleStart"
              :disabled="currentState === 'acquiring'"
            >
              <VideoPlay /> 开始采集
            </button>
            <button 
              class="btn btn-warning" 
              @click="handleStop"
              :disabled="currentState !== 'acquiring'"
            >
              <VideoPause /> 停止采集
            </button>
          </div>
          
          <div class="angle-control">
            <label class="control-label">攻角控制 (°)</label>
            <el-slider 
              v-model="targetAngle" 
              :min="-5" 
              :max="30" 
              :step="1"
              :show-input="true"
              @change="handleAngleChange"
              class="angle-slider"
            />
          </div>
          
          <div class="system-info">
            <div class="info-item">
              <span class="info-label">数据速率</span>
              <span class="info-value">{{ dataRate }} Hz</span>
            </div>
            <div class="info-item">
              <span class="info-label">当前攻角</span>
              <span class="info-value">{{ currentAngle }}°</span>
            </div>
          </div>
        </div>
      </div>
      
      <div class="panel panel-pressure">
        <div class="panel-header">
          <span><Grid :size="16" /> 压力传感器阵列 (128通道)</span>
          <span class="header-badge">
            <span class="status-dot normal"></span> {{ normalCount }} 正常
            <span class="status-dot warning"></span> {{ warningCount }} 告警
            <span class="status-dot error"></span> {{ errorCount }} 异常
          </span>
        </div>
        <div class="panel-content pressure-grid">
          <div 
            v-for="sensor in pressureData" 
            :key="sensor.channel"
            class="sensor-cell"
            :class="sensor.status"
            :title="'通道 ' + sensor.channel + ': ' + sensor.value.toFixed(1) + ' Pa'"
          >
            <span class="channel-num">{{ sensor.channel }}</span>
            <span class="pressure-value">{{ sensor.value.toFixed(0) }}</span>
          </div>
        </div>
      </div>
      
      <div class="panel panel-balance">
        <div class="panel-header">
          <span><Scale :size="16" /> 天平六分量力</span>
        </div>
        <div class="panel-content balance-grid">
          <div class="balance-item">
            <span class="balance-label">Fx (X向力)</span>
            <span class="balance-value">{{ balanceData.Fx.toFixed(2) }} N</span>
          </div>
          <div class="balance-item">
            <span class="balance-label">Fy (Y向力)</span>
            <span class="balance-value">{{ balanceData.Fy.toFixed(2) }} N</span>
          </div>
          <div class="balance-item">
            <span class="balance-label">Fz (Z向力)</span>
            <span class="balance-value">{{ balanceData.Fz.toFixed(2) }} N</span>
          </div>
          <div class="balance-item">
            <span class="balance-label">Mx (X向力矩)</span>
            <span class="balance-value">{{ balanceData.Mx.toFixed(3) }} N·m</span>
          </div>
          <div class="balance-item">
            <span class="balance-label">My (Y向力矩)</span>
            <span class="balance-value">{{ balanceData.My.toFixed(3) }} N·m</span>
          </div>
          <div class="balance-item">
            <span class="balance-label">Mz (Z向力矩)</span>
            <span class="balance-value">{{ balanceData.Mz.toFixed(3) }} N·m</span>
          </div>
        </div>
      </div>
      
      <div class="panel panel-aero">
        <div class="panel-header">
          <span><TrendCharts :size="16" /> 气动力系数</span>
        </div>
        <div class="panel-content aero-content">
          <div class="aero-values">
            <div class="aero-item">
              <span class="aero-label">CL (升力系数)</span>
              <span class="aero-value cl">{{ aeroCoeff.CL.toFixed(4) }}</span>
            </div>
            <div class="aero-item">
              <span class="aero-label">CD (阻力系数)</span>
              <span class="aero-value cd">{{ aeroCoeff.CD.toFixed(4) }}</span>
            </div>
            <div class="aero-item">
              <span class="aero-label">CM (俯仰力矩系数)</span>
              <span class="aero-value cm">{{ aeroCoeff.CM.toFixed(4) }}</span>
            </div>
          </div>
          <v-chart class="aero-chart" :option="aeroChartOption" autoresize />
        </div>
      </div>
      
      <div class="panel panel-alerts">
        <div class="panel-header">
          <span><Warning :size="16" /> 告警信息</span>
          <button class="btn small" @click="clearAlerts">清除</button>
        </div>
        <div class="panel-content alerts-list">
          <div 
            v-for="alert in alerts" 
            :key="alert.id"
            class="alert-item"
            :class="alert.type"
          >
            <span class="alert-icon">
              <Info v-if="alert.type === 'info'" />
              <WarningFilled v-else-if="alert.type === 'warning'" />
              <Close v-else />
            </span>
            <span class="alert-message">{{ alert.message }}</span>
            <span class="alert-time">{{ formatTime(alert.timestamp) }}</span>
          </div>
          <div v-if="alerts.length === 0" class="no-alerts">
            <Check /> 暂无告警信息
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useSystemStore } from '@/stores/system'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { LineChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components'
import {
  VideoPlay,
  VideoPause,
  Grid,
  Scale,
  TrendCharts,
  Warning,
  Info,
  WarningFilled,
  Close,
  Check,
  Clock,
  MagicStick,
  CircleCheck,
  ArrowRight
} from '@element-plus/icons-vue'

use([
  CanvasRenderer,
  LineChart,
  GridComponent,
  TooltipComponent,
  LegendComponent
])

const systemStore = useSystemStore()

const currentState = computed(() => systemStore.currentState)
const currentAngle = computed(() => systemStore.currentAngle)
const dataRate = computed(() => systemStore.dataRate)
const pressureData = computed(() => systemStore.pressureData)
const balanceData = computed(() => systemStore.balanceData)
const aeroCoeff = computed(() => systemStore.aeroCoeff)
const alerts = computed(() => systemStore.alerts)
const aeroHistory = computed(() => systemStore.aeroHistory)

const targetAngle = ref(0)

const states = [
  { id: 'idle', label: '待机', icon: Clock },
  { id: 'starting', label: '启动', icon: MagicStick },
  { id: 'stable', label: '稳定', icon: CircleCheck },
  { id: 'acquiring', label: '采集', icon: VideoPlay },
  { id: 'stopped', label: '结束', icon: ArrowRight }
]

const normalCount = computed(() => pressureData.value.filter(p => p.status === 'normal').length)
const warningCount = computed(() => pressureData.value.filter(p => p.status === 'warning').length)
const errorCount = computed(() => pressureData.value.filter(p => p.status === 'error').length)

const aeroChartOption = ref({
  backgroundColor: 'transparent',
  tooltip: {
    trigger: 'axis',
    backgroundColor: 'rgba(10, 22, 40, 0.9)',
    borderColor: '#2D4A6F',
    textStyle: { color: '#E8F4FF' }
  },
  legend: {
    data: ['CL', 'CD', 'CM'],
    textStyle: { color: '#8FA3BF', fontSize: 11 },
    top: 5
  },
  grid: {
    left: 50,
    right: 20,
    top: 40,
    bottom: 30
  },
  xAxis: {
    type: 'category',
    data: [],
    axisLine: { lineStyle: { color: '#2D4A6F' } },
    axisLabel: { color: '#8FA3BF', fontSize: 10 }
  },
  yAxis: [
    {
      type: 'value',
      name: 'CL/CM',
      position: 'left',
      axisLine: { lineStyle: { color: '#2D4A6F' } },
      axisLabel: { color: '#8FA3BF', fontSize: 10 },
      splitLine: { lineStyle: { color: '#1A2D47' } }
    },
    {
      type: 'value',
      name: 'CD',
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

watch(aeroHistory, (history) => {
  if (history.length > 0) {
    const data = history.slice(-100)
    aeroChartOption.value.xAxis.data = data.map((_, i) => i)
    aeroChartOption.value.series[0].data = data.map(d => d.CL)
    aeroChartOption.value.series[1].data = data.map(d => d.CD)
    aeroChartOption.value.series[2].data = data.map(d => d.CM)
  }
}, { deep: true })

const handleStart = () => {
  systemStore.startAcquisition()
}

const handleStop = () => {
  systemStore.stopAcquisition()
}

const handleAngleChange = (value) => {
  systemStore.setAttackAngle(value)
}

const clearAlerts = () => {
  systemStore.clearAlerts()
}

const formatTime = (timestamp) => {
  const d = new Date(timestamp)
  return d.toLocaleTimeString()
}

onMounted(() => {
  targetAngle.value = currentAngle.value
})
</script>

<style scoped lang="scss">
.dashboard {
  width: 100%;
  height: 100%;
  padding: 16px;
  overflow: auto;
}

.dashboard-grid {
  display: grid;
  grid-template-columns: 300px 1fr 350px;
  grid-template-rows: auto auto 1fr;
  gap: 16px;
  height: 100%;
  min-height: 600px;
}

.panel {
  display: flex;
  flex-direction: column;
  animation: fadeIn 0.5s ease;
  
  &-controls {
    grid-column: 1;
    grid-row: 1 / 3;
  }
  
  &-pressure {
    grid-column: 2;
    grid-row: 1;
  }
  
  &-balance {
    grid-column: 3;
    grid-row: 1;
  }
  
  &-aero {
    grid-column: 2;
    grid-row: 2 / 4;
  }
  
  &-alerts {
    grid-column: 3;
    grid-row: 2 / 4;
  }
}

.header-badge {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 11px;
  color: var(--color-text-secondary);
  
  .status-dot {
    margin-right: 4px;
    animation: none;
  }
}

.state-machine {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
  position: relative;
}

.state-node {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  z-index: 1;
  
  .state-icon {
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-secondary);
    border: 2px solid var(--color-border);
    border-radius: 50%;
    color: var(--color-text-secondary);
    transition: all var(--transition-normal);
  }
  
  .state-label {
    font-size: 11px;
    color: var(--color-text-secondary);
    transition: all var(--transition-normal);
  }
  
  &.active {
    .state-icon {
      border-color: var(--color-accent);
      color: var(--color-accent);
      background: rgba(0, 212, 255, 0.1);
      box-shadow: var(--glow-accent);
    }
    
    .state-label {
      color: var(--color-accent);
    }
  }
  
  &.pulse .state-icon {
    animation: pulse-glow 1s infinite;
  }
}

@keyframes pulse-glow {
  0%, 100% { box-shadow: 0 0 10px rgba(0, 212, 255, 0.3); }
  50% { box-shadow: 0 0 25px rgba(0, 212, 255, 0.6); }
}

.state-connector {
  position: absolute;
  top: 20px;
  height: 2px;
  background: var(--color-border);
  width: calc(20% - 40px);
  
  &:nth-child(6) { left: calc(20% - 10px); }
  &:nth-child(7) { left: calc(40% - 10px); }
  &:nth-child(8) { left: calc(60% - 10px); }
  &:nth-child(9) { left: calc(80% - 10px); }
}

.control-buttons {
  display: flex;
  gap: 10px;
  margin-bottom: 24px;
  
  .btn {
    flex: 1;
  }
}

.angle-control {
  margin-bottom: 24px;
  
  .control-label {
    display: block;
    font-size: 12px;
    color: var(--color-text-secondary);
    margin-bottom: 12px;
  }
}

:deep(.angle-slider) {
  .el-slider__runway {
    background: var(--color-border);
  }
  .el-slider__bar {
    background: linear-gradient(90deg, #FF6B35, #00D4FF);
  }
  .el-slider__input input {
    background: var(--color-secondary);
    border-color: var(--color-border);
    color: var(--color-text-primary);
  }
}

.system-info {
  background: var(--color-primary);
  border-radius: 4px;
  padding: 16px;
}

.info-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  
  &:last-child { margin-bottom: 0; }
  
  .info-label {
    font-size: 12px;
    color: var(--color-text-secondary);
  }
  
  .info-value {
    font-family: var(--font-display);
    font-size: 18px;
    font-weight: 700;
    color: var(--color-accent);
  }
}

.pressure-grid {
  display: grid;
  grid-template-columns: repeat(16, 1fr);
  gap: 4px;
  padding: 12px;
}

.sensor-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 4px 2px;
  background: var(--color-primary);
  border: 1px solid var(--color-border);
  border-radius: 2px;
  cursor: pointer;
  transition: all var(--transition-fast);
  
  &:hover {
    border-color: var(--color-accent);
    transform: scale(1.1);
    z-index: 1;
  }
  
  &.warning {
    border-color: var(--color-warning);
    background: rgba(255, 107, 53, 0.1);
  }
  
  &.error {
    border-color: var(--color-error);
    background: rgba(255, 82, 82, 0.2);
    animation: error-pulse 0.5s infinite;
  }
  
  .channel-num {
    font-size: 8px;
    color: var(--color-text-secondary);
  }
  
  .pressure-value {
    font-size: 10px;
    font-weight: 600;
    color: var(--color-text-primary);
  }
}

@keyframes error-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}

.balance-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.balance-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px;
  background: var(--color-primary);
  border-radius: 4px;
  border-left: 2px solid var(--color-accent);
  
  .balance-label {
    font-size: 11px;
    color: var(--color-text-secondary);
  }
  
  .balance-value {
    font-family: var(--font-display);
    font-size: 16px;
    font-weight: 700;
    color: var(--color-accent);
  }
}

.aero-content {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.aero-values {
  display: flex;
  gap: 24px;
  margin-bottom: 16px;
}

.aero-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  
  .aero-label {
    font-size: 11px;
    color: var(--color-text-secondary);
  }
  
  .aero-value {
    font-family: var(--font-display);
    font-size: 24px;
    font-weight: 700;
    
    &.cl { color: #00D4FF; }
    &.cd { color: #FF6B35; }
    &.cm { color: #96CEB4; }
  }
}

.aero-chart {
  flex: 1;
  min-height: 200px;
}

.alerts-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 300px;
  overflow-y: auto;
}

.alert-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: var(--color-primary);
  border-radius: 4px;
  border-left: 3px solid var(--color-border);
  
  &.info {
    border-left-color: var(--color-accent);
    .alert-icon { color: var(--color-accent); }
  }
  
  &.warning {
    border-left-color: var(--color-warning);
    .alert-icon { color: var(--color-warning); }
  }
  
  &.error {
    border-left-color: var(--color-error);
    .alert-icon { color: var(--color-error); }
  }
  
  .alert-message {
    flex: 1;
    font-size: 12px;
    color: var(--color-text-primary);
  }
  
  .alert-time {
    font-size: 10px;
    color: var(--color-text-secondary);
  }
}

.no-alerts {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 40px;
  color: var(--color-text-secondary);
  font-size: 13px;
}

.btn.small {
  padding: 4px 10px;
  font-size: 11px;
}
</style>
