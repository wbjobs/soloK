import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useWebSocket } from '@/utils/websocket'

export const useSystemStore = defineStore('system', () => {
  const currentState = ref('idle')
  const currentAngle = ref(0)
  const runTime = ref(0)
  const showStatusPanel = ref(false)
  const dataRate = ref(0)
  const alerts = ref([])
  
  const pressureData = ref(Array(128).fill(0).map((_, i) => ({
    channel: i + 1,
    value: 0,
    status: 'normal',
    mean: 0,
    rms: 0
  })))
  
  const balanceData = ref({
    Fx: 0, Fy: 0, Fz: 0,
    Mx: 0, My: 0, Mz: 0
  })
  
  const aeroCoeff = ref({
    CL: 0, CD: 0, CM: 0
  })
  
  const fftData = ref({
    frequencies: [],
    amplitudes: [],
    vortexFrequency: null,
    peaks: [],
    windowType: 'hann',
    nperseg: 1024,
    noverlap: 512
  })
  
  const flutterData = ref({
    flutter_speed: 0,
    flutter_margin: 100,
    damping_ratio: 0.05,
    natural_frequency: 50,
    confidence: 0,
    velocity_history: [],
    damping_history: [],
    is_stable: true,
    warning_level: 'safe'
  })
  
  const dmdData = ref({
    modes: [],
    reconstruction_error: 0,
    reconstruction_quality: 1,
    optimal_rank: 0,
    dominant_modes: [],
    flow_structures: {
      stable_modes_count: 0,
      unstable_modes_count: 0
    },
    animation_frames: []
  })
  
  const pressureHistory = ref([])
  const balanceHistory = ref([])
  const aeroHistory = ref([])
  const flutterHistory = ref([])
  
  const testCases = ref([
    { id: 1, angle: -5, active: false, color: '#FF6B6B' },
    { id: 2, angle: 0, active: true, color: '#4ECDC4' },
    { id: 3, angle: 5, active: true, color: '#45B7D1' },
    { id: 4, angle: 10, active: true, color: '#96CEB4' },
    { id: 5, angle: 15, active: false, color: '#FFEAA7' },
    { id: 6, angle: 20, active: false, color: '#DDA0DD' },
    { id: 7, angle: 25, active: false, color: '#98D8C8' },
    { id: 8, angle: 30, active: false, color: '#F7DC6F' }
  ])
  
  const pressureLimit = ref(5000)
  
  let ws = null
  let packetCount = 0
  let rateTimer = null
  
  const connectWebSocket = () => {
    ws = useWebSocket({
      onMessage: handleWebSocketMessage,
      onOpen: () => console.log('WebSocket connected'),
      onClose: () => console.log('WebSocket disconnected')
    })
    ws.connect()
    
    rateTimer = setInterval(() => {
      dataRate.value = packetCount
      packetCount = 0
    }, 1000)
  }
  
  const disconnectWebSocket = () => {
    if (ws) ws.disconnect()
    if (rateTimer) clearInterval(rateTimer)
  }
  
  const handleWebSocketMessage = (data) => {
    packetCount++
    
    switch (data.type) {
      case 'pressure':
        updatePressureData(data.data)
        break
      case 'balance':
        updateBalanceData(data.data)
        break
      case 'aero':
        updateAeroData(data.data)
        break
      case 'fft':
        updateFFTData(data.data)
        break
      case 'flutter':
        updateFlutterData(data.data)
        break
      case 'dmd':
        updateDMDData(data.data)
        break
      case 'status':
        updateSystemStatus(data.data)
        break
      case 'alert':
        addAlert(data.data)
        break
    }
  }
  
  const updatePressureData = (data) => {
    data.forEach(item => {
      const idx = item.channel - 1
      if (idx >= 0 && idx < 128) {
        pressureData.value[idx] = {
          ...pressureData.value[idx],
          value: item.value,
          status: item.status || 'normal',
          mean: item.mean || pressureData.value[idx].mean,
          rms: item.rms || pressureData.value[idx].rms
        }
        
        if (Math.abs(item.value) > pressureLimit.value && item.status !== 'error') {
          addAlert({
            type: 'warning',
            message: `通道 ${item.channel} 压力超标: ${item.value.toFixed(1)} Pa`,
            timestamp: Date.now()
          })
        }
      }
    })
    
    pressureHistory.value.push({
      timestamp: Date.now(),
      data: data.map(d => d.value)
    })
    
    if (pressureHistory.value.length > 1000) {
      pressureHistory.value.shift()
    }
  }
  
  const updateBalanceData = (data) => {
    balanceData.value = { ...data }
    
    balanceHistory.value.push({
      timestamp: Date.now(),
      ...data
    })
    
    if (balanceHistory.value.length > 1000) {
      balanceHistory.value.shift()
    }
  }
  
  const updateAeroData = (data) => {
    aeroCoeff.value = { ...data }
    
    aeroHistory.value.push({
      timestamp: Date.now(),
      ...data
    })
    
    if (aeroHistory.value.length > 1000) {
      aeroHistory.value.shift()
    }
  }
  
  const updateFFTData = (data) => {
    fftData.value = { ...data }
  }
  
  const updateFlutterData = (data) => {
    flutterData.value = { ...flutterData.value, ...data }
    
    flutterHistory.value.push({
      timestamp: Date.now(),
      ...data
    })
    
    if (flutterHistory.value.length > 500) {
      flutterHistory.value.shift()
    }
    
    if (data.flutter_margin !== undefined && data.flutter_margin < 10) {
      addAlert({
        type: data.flutter_margin < 5 ? 'danger' : 'warning',
        message: `颤振裕度低: ${data.flutter_margin.toFixed(1)}% (${data.warning_level})`,
        timestamp: Date.now()
      })
    }
  }
  
  const updateDMDData = (data) => {
    dmdData.value = { ...dmdData.value, ...data }
  }
  
  const updateSystemStatus = (data) => {
    if (data.state) currentState.value = data.state
    if (data.angle !== undefined) currentAngle.value = data.angle
  }
  
  const addAlert = (alert) => {
    alerts.value.unshift({
      id: Date.now(),
      ...alert
    })
    
    if (alerts.value.length > 50) {
      alerts.value.pop()
    }
  }
  
  const clearAlerts = () => {
    alerts.value = []
  }
  
  const incrementRunTime = () => {
    runTime.value++
  }
  
  const toggleStatusPanel = () => {
    showStatusPanel.value = !showStatusPanel.value
  }
  
  const startAcquisition = () => {
    if (ws) ws.send({ type: 'command', action: 'start' })
    currentState.value = 'acquiring'
    runTime.value = 0
  }
  
  const stopAcquisition = () => {
    if (ws) ws.send({ type: 'command', action: 'stop' })
    currentState.value = 'stable'
  }
  
  const setAttackAngle = (angle) => {
    if (ws) ws.send({ type: 'command', action: 'setAngle', angle })
    currentAngle.value = angle
  }
  
  const toggleTestCase = (id) => {
    const testCase = testCases.value.find(t => t.id === id)
    if (testCase) {
      testCase.active = !testCase.active
    }
  }
  
  return {
    currentState,
    currentAngle,
    runTime,
    showStatusPanel,
    dataRate,
    alerts,
    pressureData,
    balanceData,
    aeroCoeff,
    fftData,
    flutterData,
    dmdData,
    pressureHistory,
    balanceHistory,
    aeroHistory,
    flutterHistory,
    testCases,
    pressureLimit,
    connectWebSocket,
    disconnectWebSocket,
    incrementRunTime,
    toggleStatusPanel,
    startAcquisition,
    stopAcquisition,
    setAttackAngle,
    clearAlerts,
    toggleTestCase,
    updateFlutterData,
    updateDMDData
  }
})
