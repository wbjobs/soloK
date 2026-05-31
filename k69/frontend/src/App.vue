<template>
  <div class="app-container">
    <el-container>
      <el-header class="header">
        <div class="header-left">
          <h1>地震波形监测系统</h1>
          <el-tag v-if="realTimeMode" type="success" effect="dark" class="realtime-tag">
            <span class="live-dot"></span> 实时模式
          </el-tag>
        </div>
        <div class="header-actions">
          <el-button type="primary" @click="loadData" :loading="loading">刷新数据</el-button>
          <el-button @click="showStats = !showStats">
            {{ showStats ? '隐藏统计' : '显示统计' }}
          </el-button>
          <el-button type="danger" @click="generatePDFReport" :loading="generatingPDF">
            生成PDF报告
          </el-button>
        </div>
      </el-header>
      
      <el-main class="main-content">
        <el-row :gutter="20">
          <el-col :span="24">
            <el-card class="control-panel">
              <el-form :inline="true" :model="queryForm" label-position="left">
                <el-form-item label="检测算法">
                  <el-select v-model="selectedAlgorithm" @change="handleAlgorithmChange" style="width: 220px;">
                    <el-option
                      v-for="alg in algorithms"
                      :key="alg.id"
                      :label="alg.name"
                      :value="alg.id"
                    >
                      <span style="float: left;">{{ alg.name }}</span>
                      <span style="float: right; color: #8492a6; font-size: 12px;">
                        {{ alg.id === selectedAlgorithm ? '● 当前' : '' }}
                      </span>
                    </el-option>
                  </el-select>
                </el-form-item>
                
                <el-form-item label="异常阈值">
                  <el-slider
                    v-model="sigmaThreshold"
                    :min="1"
                    :max="10"
                    :step="0.5"
                    :disabled="selectedAlgorithm === 'isolation_forest'"
                    style="width: 150px;"
                    show-input
                  />
                </el-form-item>
                
                <el-form-item label="异常比例">
                  <el-slider
                    v-model="contamination"
                    :min="0.001"
                    :max="0.1"
                    :step="0.001"
                    :disabled="selectedAlgorithm === 'stl_3sigma'"
                    style="width: 150px;"
                    show-input
                  />
                </el-form-item>
                
                <el-form-item>
                  <el-switch
                    v-model="realTimeMode"
                    active-text="实时模式"
                    inactive-text="历史模式"
                    @change="handleRealTimeToggle"
                  />
                </el-form-item>
                
                <el-form-item>
                  <el-switch v-model="autoDetect" active-text="自动检测" />
                </el-form-item>
                
                <el-form-item>
                  <el-switch v-model="autoReloadOnZoom" active-text="拖拽加载" />
                </el-form-item>
              </el-form>
              
              <el-divider style="margin: 10px 0;" />
              
              <el-form :inline="true" :model="queryForm">
                <el-form-item label="开始时间">
                  <el-date-picker
                    v-model="queryForm.startTime"
                    type="datetime"
                    placeholder="选择开始时间"
                    format="YYYY-MM-DD HH:mm:ss"
                    value-format="YYYY-MM-DDTHH:mm:ss"
                    :disabled="realTimeMode"
                  />
                </el-form-item>
                <el-form-item label="结束时间">
                  <el-date-picker
                    v-model="queryForm.endTime"
                    type="datetime"
                    placeholder="选择结束时间"
                    format="YYYY-MM-DD HH:mm:ss"
                    value-format="YYYY-MM-DDTHH:mm:ss"
                    :disabled="realTimeMode"
                  />
                </el-form-item>
                <el-form-item label="快速选择">
                  <el-select v-model="timeRange" @change="setTimeRange" :disabled="realTimeMode">
                    <el-option label="5分钟" value="5min" />
                    <el-option label="30分钟" value="30min" />
                    <el-option label="1小时" value="1hour" />
                    <el-option label="6小时" value="6hour" />
                    <el-option label="1天" value="1day" />
                  </el-select>
                </el-form-item>
                <el-form-item>
                  <el-button type="primary" @click="loadData" :loading="loading" :disabled="realTimeMode">
                    查询
                  </el-button>
                  <el-button type="success" @click="detectAnomalies" :loading="detecting">
                    异常检测
                  </el-button>
                  <el-button type="warning" @click="exportCSV" :disabled="!hasData">
                    导出CSV
                  </el-button>
                </el-form-item>
              </el-form>
              
              <el-alert
                v-if="wasTruncated"
                title="数据已被截断"
                type="warning"
                :closable="false"
                show-icon
                style="margin-top: 10px;"
              >
                <template #default>
                  查询时间范围超过7天或数据量过大，系统已自动进行降采样处理。
                </template>
              </el-alert>
              
              <el-alert
                v-if="realTimeMode && wsConnected"
                :title="'实时数据连接正常 - 采样率: ' + realtimeStatus.sampling_rate + '点/秒'"
                type="success"
                :closable="false"
                show-icon
                style="margin-top: 10px;"
              />
              
              <el-alert
                v-if="realTimeMode && !wsConnected"
                title="实时数据连接断开，正在重连..."
                type="error"
                :closable="false"
                show-icon
                style="margin-top: 10px;"
              />
            </el-card>
          </el-col>
        </el-row>

        <el-row :gutter="20" style="margin-top: 20px;">
          <el-col :span="showStats ? 18 : 24">
            <el-card class="chart-card">
              <template #header>
                <div class="card-header">
                  <span>波形数据</span>
                  <div class="header-info">
                    <span class="data-points">数据点: {{ waveformData.length.toLocaleString() }}</span>
                    <span v-if="realTimeMode" class="data-points">
                      | 接收: {{ realtimePointsReceived.toLocaleString() }}
                    </span>
                    <span v-if="anomalyCount > 0" class="anomaly-badge">
                      异常点: {{ anomalyCount }}
                    </span>
                  </div>
                </div>
              </template>
              <WaveformChart
                ref="waveformChart"
                :data="waveformData"
                :anomalies="anomalies"
                :realtime-mode="realTimeMode"
                @time-range-change="handleTimeRangeChange"
              />
            </el-card>
          </el-col>
          
          <el-col :span="6" v-if="showStats">
            <el-card class="stats-card">
              <template #header>
                <span>每日异常统计</span>
              </template>
              <StatsPanel :daily-stats="dailyStats" />
            </el-card>
          </el-col>
        </el-row>

        <el-row :gutter="20" style="margin-top: 20px;" v-if="anomalySegments.length > 0">
          <el-col :span="24">
            <el-card class="segments-card">
              <template #header>
                <div class="card-header">
                  <span>异常片段列表</span>
                  <div>
                    <el-tag v-if="selectedAlgorithm" style="margin-right: 10px;">
                      算法: {{ getAlgorithmName(selectedAlgorithm) }}
                    </el-tag>
                    <el-button size="small" type="warning" @click="exportSegmentsCSV">
                      导出片段
                    </el-button>
                  </div>
                </div>
              </template>
              <el-table :data="anomalySegments" stripe style="width: 100%" max-height="300">
                <el-table-column prop="segment_id" label="ID" width="80" />
                <el-table-column prop="start_time" label="开始时间" min-width="180">
                  <template #default="{ row }">
                    {{ formatTimestamp(row.start_time) }}
                  </template>
                </el-table-column>
                <el-table-column prop="end_time" label="结束时间" min-width="180">
                  <template #default="{ row }">
                    {{ formatTimestamp(row.end_time) }}
                  </template>
                </el-table-column>
                <el-table-column prop="anomaly_count" label="异常点数" width="100" align="center" />
                <el-table-column prop="max_deviation" label="最大偏离" width="120" align="center">
                  <template #default="{ row }">
                    <el-tag type="danger" size="small">
                      {{ row.max_deviation?.toFixed(2) }}σ
                    </el-tag>
                  </template>
                </el-table-column>
                <el-table-column prop="avg_deviation" label="平均偏离" width="120" align="center">
                  <template #default="{ row }">
                    {{ row.avg_deviation?.toFixed(2) }}σ
                  </template>
                </el-table-column>
                <el-table-column prop="algorithms" label="检测算法" width="150">
                  <template #default="{ row }">
                    <el-tag size="small" v-if="row.algorithms">
                      {{ row.algorithms }}
                    </el-tag>
                  </template>
                </el-table-column>
              </el-table>
            </el-card>
          </el-col>
        </el-row>
      </el-main>
    </el-container>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { ElMessage, ElLoading } from 'element-plus'
import axios from 'axios'
import WaveformChart from './components/WaveformChart.vue'
import StatsPanel from './components/StatsPanel.vue'

const loading = ref(false)
const detecting = ref(false)
const generatingPDF = ref(false)
const showStats = ref(true)
const autoDetect = ref(true)
const autoReloadOnZoom = ref(false)
const timeRange = ref('5min')
const wasTruncated = ref(false)

const selectedAlgorithm = ref('stl_3sigma')
const sigmaThreshold = ref(3.0)
const contamination = ref(0.01)
const algorithms = ref([])

const realTimeMode = ref(false)
const wsConnected = ref(false)
const realtimeStatus = ref({ sampling_rate: 100 })
const realtimePointsReceived = ref(0)

const queryForm = ref({
  startTime: '',
  endTime: ''
})

const waveformData = ref([])
const anomalies = ref([])
const anomalySegments = ref([])
const dailyStats = ref([])
const anomalyCount = ref(0)

const dataCache = new Map()
const CACHE_MAX_SIZE = 10
const DEBOUNCE_DELAY = 500

let loadDataDebounceTimer = null
let currentLoadDataRequest = null
let currentDetectRequest = null
let ws = null
let wsReconnectTimer = null
let realtimeBuffer = []
const REALTIME_MAX_POINTS = 5000

const hasData = computed(() => waveformData.value.length > 0)
const waveformChart = ref(null)
let loadingInstance = null

const setTimeRange = (range) => {
  const end = new Date()
  const start = new Date()
  
  switch(range) {
    case '5min':
      start.setMinutes(start.getMinutes() - 5)
      break
    case '30min':
      start.setMinutes(start.getMinutes() - 30)
      break
    case '1hour':
      start.setHours(start.getHours() - 1)
      break
    case '6hour':
      start.setHours(start.getHours() - 6)
      break
    case '1day':
      start.setDate(start.getDate() - 1)
      break
  }
  
  queryForm.value.startTime = formatDateTime(start)
  queryForm.value.endTime = formatDateTime(end)
}

const formatDateTime = (date) => {
  const pad = (n) => n.toString().padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

const formatTimestamp = (ts) => {
  if (!ts) return ''
  return ts.replace('T', ' ').substring(0, 19)
}

const getAlgorithmName = (id) => {
  const alg = algorithms.value.find(a => a.id === id)
  return alg ? alg.name : id
}

const getCacheKey = (startTime, endTime, withDetection, algorithm) => {
  return `${startTime}_${endTime}_${withDetection}_${algorithm}`
}

const getCachedData = (key) => {
  return dataCache.get(key)
}

const setCachedData = (key, data) => {
  if (dataCache.size >= CACHE_MAX_SIZE) {
    const firstKey = dataCache.keys().next().value
    dataCache.delete(firstKey)
  }
  dataCache.set(key, data)
}

const cancelCurrentRequest = () => {
  if (currentLoadDataRequest) {
    currentLoadDataRequest.cancel('用户取消请求')
    currentLoadDataRequest = null
  }
  if (currentDetectRequest) {
    currentDetectRequest.cancel('用户取消请求')
    currentDetectRequest = null
  }
}

const loadAlgorithms = async () => {
  try {
    const response = await axios.get('/api/algorithms')
    algorithms.value = response.data.algorithms
  } catch (error) {
    console.error('加载算法列表失败:', error)
  }
}

const loadData = async () => {
  if (realTimeMode.value) return
  
  if (!queryForm.value.startTime || !queryForm.value.endTime) {
    ElMessage.warning('请选择时间范围')
    return
  }
  
  const cacheKey = getCacheKey(
    queryForm.value.startTime,
    queryForm.value.endTime,
    autoDetect.value,
    selectedAlgorithm.value
  )
  
  const cachedData = getCachedData(cacheKey)
  
  if (cachedData) {
    waveformData.value = cachedData.data
    anomalies.value = cachedData.anomalies || []
    anomalyCount.value = cachedData.anomalyCount || 0
    wasTruncated.value = cachedData.wasTruncated || false
    anomalySegments.value = cachedData.segments || []
    ElMessage.info('使用缓存数据')
    return
  }
  
  cancelCurrentRequest()
  
  loading.value = true
  loadingInstance = ElLoading.service({
    lock: true,
    text: '正在加载数据...',
    background: 'rgba(0, 0, 0, 0.1)'
  })
  
  const CancelToken = axios.CancelToken
  const source = CancelToken.source()
  currentLoadDataRequest = source
  
  try {
    const response = await axios.get('/api/seismic/data', {
      params: {
        start_time: queryForm.value.startTime,
        end_time: queryForm.value.endTime,
        with_detection: autoDetect.value,
        algorithm: selectedAlgorithm.value,
        max_points: 30000
      },
      cancelToken: source.token
    })
    
    waveformData.value = response.data.data
    anomalies.value = response.data.anomalies || []
    anomalyCount.value = response.data.anomaly_count || 0
    wasTruncated.value = response.data.was_truncated || false
    
    setCachedData(cacheKey, {
      data: waveformData.value,
      anomalies: anomalies.value,
      anomalyCount: anomalyCount.value,
      wasTruncated: wasTruncated.value,
      segments: anomalySegments.value
    })
    
    ElMessage.success(`加载了 ${waveformData.value.length.toLocaleString()} 个数据点`)
    
    if (wasTruncated.value) {
      ElMessage.warning('数据已被降采样处理')
    }
    
    if (showStats.value) {
      loadDailyStats()
    }
  } catch (error) {
    if (!axios.isCancel(error)) {
      ElMessage.error('加载数据失败: ' + (error.response?.data?.detail || error.message))
    }
  } finally {
    loading.value = false
    currentLoadDataRequest = null
    if (loadingInstance) {
      loadingInstance.close()
      loadingInstance = null
    }
  }
}

const debouncedLoadData = () => {
  if (loadDataDebounceTimer) {
    clearTimeout(loadDataDebounceTimer)
  }
  loadDataDebounceTimer = setTimeout(() => {
    loadData()
  }, DEBOUNCE_DELAY)
}

const detectAnomalies = async () => {
  if (!queryForm.value.startTime || !queryForm.value.endTime) {
    ElMessage.warning('请选择时间范围')
    return
  }
  
  cancelCurrentRequest()
  
  detecting.value = true
  loadingInstance = ElLoading.service({
    lock: true,
    text: '正在检测异常...',
    background: 'rgba(0, 0, 0, 0.1)'
  })
  
  const CancelToken = axios.CancelToken
  const source = CancelToken.source()
  currentDetectRequest = source
  
  try {
    const response = await axios.get('/api/seismic/detect', {
      params: {
        start_time: queryForm.value.startTime,
        end_time: queryForm.value.endTime,
        algorithm: selectedAlgorithm.value,
        sigma_threshold: sigmaThreshold.value,
        contamination: contamination.value,
        max_points: 30000
      },
      cancelToken: source.token
    })
    
    anomalies.value = response.data.anomalies
    anomalySegments.value = response.data.anomaly_segments.map((s, i) => ({
      segment_id: i + 1,
      ...s
    }))
    anomalyCount.value = response.data.anomaly_count
    
    ElMessage.success(`检测到 ${anomalyCount.value} 个异常点`)
  } catch (error) {
    if (!axios.isCancel(error)) {
      ElMessage.error('异常检测失败: ' + (error.response?.data?.detail || error.message))
    }
  } finally {
    detecting.value = false
    currentDetectRequest = null
    if (loadingInstance) {
      loadingInstance.close()
      loadingInstance = null
    }
  }
}

const loadDailyStats = async () => {
  try {
    const end = new Date()
    const start = new Date()
    start.setDate(start.getDate() - 7)
    
    const response = await axios.get('/api/seismic/stats/daily', {
      params: {
        start_time: formatDateTime(start),
        end_time: formatDateTime(end),
        algorithm: selectedAlgorithm.value
      },
      timeout: 30000
    })
    
    dailyStats.value = response.data.daily_stats
  } catch (error) {
    console.error('加载统计数据失败:', error)
  }
}

const exportCSV = () => {
  if (!queryForm.value.startTime || !queryForm.value.endTime) {
    ElMessage.warning('请选择时间范围')
    return
  }
  
  const url = `/api/seismic/export/csv?start_time=${queryForm.value.startTime}&end_time=${queryForm.value.endTime}&algorithm=${selectedAlgorithm.value}&anomalies_only=false`
  window.open(url, '_blank')
  ElMessage.success('开始导出CSV')
}

const exportSegmentsCSV = () => {
  if (!queryForm.value.startTime || !queryForm.value.endTime) {
    ElMessage.warning('请选择时间范围')
    return
  }
  
  const url = `/api/seismic/export/segments/csv?start_time=${queryForm.value.startTime}&end_time=${queryForm.value.endTime}&algorithm=${selectedAlgorithm.value}`
  window.open(url, '_blank')
  ElMessage.success('开始导出异常片段')
}

const generatePDFReport = async () => {
  if (!queryForm.value.startTime || !queryForm.value.endTime) {
    ElMessage.warning('请选择时间范围')
    return
  }
  
  generatingPDF.value = true
  loadingInstance = ElLoading.service({
    lock: true,
    text: '正在生成PDF报告...',
    background: 'rgba(0, 0, 0, 0.1)'
  })
  
  try {
    const params = new URLSearchParams({
      start_time: queryForm.value.startTime,
      end_time: queryForm.value.endTime,
      algorithm: selectedAlgorithm.value,
      sigma_threshold: sigmaThreshold.value,
      contamination: contamination.value,
      max_points: 30000
    })
    
    const url = `/api/seismic/export/report/pdf?${params.toString()}`
    window.open(url, '_blank')
    ElMessage.success('PDF报告生成完成，正在下载...')
  } catch (error) {
    ElMessage.error('生成PDF失败: ' + (error.response?.data?.detail || error.message))
  } finally {
    generatingPDF.value = false
    if (loadingInstance) {
      loadingInstance.close()
      loadingInstance = null
    }
  }
}

const handleAlgorithmChange = () => {
  if (!realTimeMode.value && hasData.value) {
    loadData()
  }
  if (showStats.value) {
    loadDailyStats()
  }
}

const handleTimeRangeChange = ({ startTime, endTime }) => {
  if (realTimeMode.value) return
  
  const oldStartTime = queryForm.value.startTime
  const oldEndTime = queryForm.value.endTime
  
  if (startTime === oldStartTime && endTime === oldEndTime) {
    return
  }
  
  queryForm.value.startTime = startTime
  queryForm.value.endTime = endTime
  
  if (autoReloadOnZoom.value) {
    debouncedLoadData()
  }
}

const connectWebSocket = () => {
  if (ws) {
    ws.close()
  }
  
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const wsUrl = `${protocol}//${window.location.host}/ws/realtime`
  
  try {
    ws = new WebSocket(wsUrl)
    
    ws.onopen = () => {
      console.log('WebSocket 连接已建立')
      wsConnected.value = true
      ws.send(JSON.stringify({ type: 'config', sampling_rate: 100 }))
    }
    
    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data)
        
        if (message.type === 'waveform_data') {
          handleRealtimeData(message.data)
        } else if (message.type === 'config_ack') {
          realtimeStatus.value = message.status
        } else if (message.type === 'heartbeat') {
          realtimeStatus.value = message.status
        }
      } catch (e) {
        console.error('解析WebSocket消息失败:', e)
      }
    }
    
    ws.onerror = (error) => {
      console.error('WebSocket 错误:', error)
      wsConnected.value = false
    }
    
    ws.onclose = () => {
      console.log('WebSocket 连接已关闭')
      wsConnected.value = false
      if (realTimeMode.value) {
        scheduleReconnect()
      }
    }
  } catch (error) {
    console.error('WebSocket 连接失败:', error)
    wsConnected.value = false
    if (realTimeMode.value) {
      scheduleReconnect()
    }
  }
}

const handleRealtimeData = (data) => {
  if (!realTimeMode.value) return
  
  realtimePointsReceived.value += data.length
  
  realtimeBuffer = realtimeBuffer.concat(data)
  
  if (realtimeBuffer.length > REALTIME_MAX_POINTS) {
    realtimeBuffer = realtimeBuffer.slice(-REALTIME_MAX_POINTS)
  }
  
  waveformData.value = [...realtimeBuffer]
  
  if (autoDetect.value && realtimeBuffer.length >= 1000) {
    detectRealtimeAnomalies()
  }
}

const detectRealtimeAnomalies = () => {
  if (realtimeBuffer.length < 100) return
  
  const values = realtimeBuffer.map(d => d.amplitude)
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const std = Math.sqrt(values.reduce((sq, n) => sq + Math.pow(n - mean, 2), 0) / values.length)
  
  if (std === 0) return
  
  const threshold = mean + sigmaThreshold.value * std
  const lowerThreshold = mean - sigmaThreshold.value * std
  
  const detectedAnomalies = realtimeBuffer
    .filter(d => d.amplitude > threshold || d.amplitude < lowerThreshold)
    .map(d => ({
      timestamp: d.timestamp,
      amplitude: d.amplitude,
      deviation: Math.abs(d.amplitude - mean) / std,
      type: d.amplitude > mean ? 'spike' : 'dip',
      algorithm: selectedAlgorithm.value
    }))
  
  anomalies.value = detectedAnomalies.slice(-100)
  anomalyCount.value = detectedAnomalies.length
}

const scheduleReconnect = () => {
  if (wsReconnectTimer) {
    clearTimeout(wsReconnectTimer)
  }
  wsReconnectTimer = setTimeout(() => {
    if (realTimeMode.value && !wsConnected.value) {
      console.log('尝试重新连接WebSocket...')
      connectWebSocket()
    }
  }, 3000)
}

const disconnectWebSocket = () => {
  if (ws) {
    ws.close()
    ws = null
  }
  if (wsReconnectTimer) {
    clearTimeout(wsReconnectTimer)
    wsReconnectTimer = null
  }
  wsConnected.value = false
}

const handleRealTimeToggle = (enabled) => {
  if (enabled) {
    realtimeBuffer = []
    realtimePointsReceived.value = 0
    waveformData.value = []
    anomalies.value = []
    anomalyCount.value = 0
    anomalySegments.value = []
    connectWebSocket()
    ElMessage.success('已进入实时模式')
  } else {
    disconnectWebSocket()
    setTimeRange(timeRange.value)
    setTimeout(() => loadData(), 500)
    ElMessage.info('已退出实时模式')
  }
}

watch(selectedAlgorithm, () => {
  if (showStats.value && !realTimeMode.value) {
    loadDailyStats()
  }
})

onMounted(() => {
  loadAlgorithms()
  setTimeRange('5min')
  setTimeout(() => loadData(), 500)
})

onUnmounted(() => {
  cancelCurrentRequest()
  disconnectWebSocket()
  if (loadDataDebounceTimer) {
    clearTimeout(loadDataDebounceTimer)
  }
  if (loadingInstance) {
    loadingInstance.close()
  }
  dataCache.clear()
})
</script>

<style scoped>
.app-container {
  height: 100vh;
  background: #f5f7fa;
}

.header {
  background: #fff;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 20px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 15px;
}

.header h1 {
  margin: 0;
  font-size: 24px;
  color: #303133;
}

.realtime-tag {
  animation: pulse 2s infinite;
}

.live-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  background: #fff;
  border-radius: 50%;
  margin-right: 5px;
  animation: blink 1s infinite;
}

@keyframes blink {
  0%, 50% { opacity: 1; }
  51%, 100% { opacity: 0.3; }
}

@keyframes pulse {
  0% { box-shadow: 0 0 0 0 rgba(103, 194, 58, 0.7); }
  70% { box-shadow: 0 0 0 10px rgba(103, 194, 58, 0); }
  100% { box-shadow: 0 0 0 0 rgba(103, 194, 58, 0); }
}

.main-content {
  padding: 20px;
  overflow-y: auto;
}

.control-panel {
  margin-bottom: 20px;
}

.chart-card, .stats-card, .segments-card {
  height: 100%;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-info {
  display: flex;
  align-items: center;
  gap: 16px;
}

.data-points {
  color: #909399;
  font-size: 14px;
}

.anomaly-badge {
  background: #f56c6c;
  color: white;
  padding: 4px 12px;
  border-radius: 10px;
  font-size: 14px;
}

.segments-card .el-card__body {
  padding: 0;
}
</style>
