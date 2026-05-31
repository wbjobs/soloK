import ReconnectingWebSocket from 'reconnecting-websocket'

export function useWebSocket({ onMessage, onOpen, onClose }) {
  let ws = null
  const url = import.meta.env.VITE_WS_URL || 'ws://localhost:5000/ws'
  let isMockMode = true
  
  let mockTimer = null
  let mockDataInterval = null
  
  const connect = () => {
    if (isMockMode) {
      console.log('Running in mock data mode')
      onOpen?.()
      startMockData()
      return
    }
    
    ws = new ReconnectingWebSocket(url, [], {
      maxReconnectionDelay: 10000,
      minReconnectionDelay: 1000,
      reconnectionDelayGrowFactor: 1.3,
      connectionTimeout: 4000,
      maxRetries: Infinity,
      debug: false
    })
    
    ws.onopen = () => {
      console.log('WebSocket connected')
      onOpen?.()
    }
    
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        onMessage?.(data)
      } catch (e) {
        console.error('Failed to parse WebSocket message:', e)
      }
    }
    
    ws.onclose = () => {
      console.log('WebSocket disconnected')
      onClose?.()
    }
    
    ws.onerror = (error) => {
      console.error('WebSocket error:', error)
    }
  }
  
  const disconnect = () => {
    if (ws) {
      ws.close()
      ws = null
    }
    stopMockData()
  }
  
  const send = (data) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data))
    }
  }
  
  const startMockData = () => {
    let time = 0
    const generatePressure = () => {
      return Array(128).fill(0).map((_, i) => {
        const basePressure = Math.sin(time * 0.05 + i * 0.1) * 1000 + Math.sin(time * 0.02) * 500
        const noise = (Math.random() - 0.5) * 200
        const value = basePressure + noise
        
        let status = 'normal'
        if (Math.abs(value) > 4500) status = 'warning'
        if (Math.abs(value) > 5000) status = 'error'
        
        return {
          channel: i + 1,
          value,
          status,
          mean: value * 0.95,
          rms: Math.abs(value * 0.1)
        }
      })
    }
    
    const generateBalance = () => {
      const Fx = Math.sin(time * 0.03) * 50
      const Fy = Math.cos(time * 0.02) * 200 + 500
      const Fz = Math.sin(time * 0.04) * 100
      const Mx = Math.sin(time * 0.03) * 10
      const My = Math.cos(time * 0.02) * 50
      const Mz = Math.sin(time * 0.01) * 5
      
      return { Fx, Fy, Fz, Mx, My, Mz }
    }
    
    const generateAero = () => {
      const CL = Math.sin(time * 0.02) * 0.3 + 0.5
      const CD = Math.cos(time * 0.02) * 0.02 + 0.05
      const CM = Math.sin(time * 0.015) * 0.05
      return { CL, CD, CM }
    }
    
    const generateFFT = () => {
      const frequencies = Array.from({ length: 200 }, (_, i) => i * 5)
      const vortexFreq = 45 + Math.sin(time * 0.01) * 5
      const harmonicFreq = vortexFreq * 2
      
      const amplitudes = frequencies.map(f => {
        const mainPeak = Math.exp(-Math.pow(f - vortexFreq, 2) / 100) * 0.8
        const harmonic = Math.exp(-Math.pow(f - harmonicFreq, 2) / 200) * 0.3
        const noise = Math.random() * 0.05
        return mainPeak + harmonic + noise
      })
      
      const peaks = [
        { frequency: vortexFreq, magnitude: 0.8 },
        { frequency: harmonicFreq, magnitude: 0.3 },
        { frequency: vortexFreq * 3, magnitude: 0.15 }
      ]
      
      return {
        frequencies,
        amplitudes,
        vortexFrequency: vortexFreq,
        peaks,
        windowType: 'hann',
        nperseg: 1024,
        noverlap: 512
      }
    }
    
    const generateFlutter = () => {
      const velocity = 50 + Math.sin(time * 0.02) * 20
      const damping = 0.08 - velocity * 0.001 + (Math.random() - 0.5) * 0.01
      const flutterSpeed = 120
      const margin = ((flutterSpeed - velocity) / flutterSpeed) * 100
      
      return {
        flutter_speed: flutterSpeed,
        flutter_margin: margin,
        damping_ratio: damping,
        natural_frequency: 45 + Math.sin(time * 0.01) * 2,
        confidence: 0.6 + Math.random() * 0.3,
        is_stable: damping > 0,
        warning_level: margin > 20 ? 'safe' : margin > 10 ? 'caution' : margin > 5 ? 'warning' : 'danger'
      }
    }
    
    const generateDMD = () => {
      const modes = []
      const frequencies = [15, 30, 45, 60, 75]
      const growthRates = [-0.001, -0.0005, 0.0002, -0.002, -0.0015]
      
      for (let i = 0; i < 5; i++) {
        const freq = frequencies[i] + Math.sin(time * 0.005) * 0.5
        const growth = growthRates[i] + (Math.random() - 0.5) * 0.0001
        
        const frames = []
        for (let f = 0; f < 30; f++) {
          const phase = 2 * Math.PI * freq * f / 2000
          const frame = Array(4).fill(0).map(() => 
            Array(32).fill(0).map((_, j) => 
              Math.sin(phase + j * 0.3 + i) * (0.5 + Math.random() * 0.5)
            )
          )
          frames.push(frame)
        }
        
        modes.push({
          frequency: freq,
          growth_rate: growth,
          amplitude: 0.8 - i * 0.15,
          is_stable: growth <= 0,
          energy_ratio: 0.4 - i * 0.08,
          animation_frames: frames
        })
      }
      
      return {
        modes,
        reconstruction_error: 0.05,
        reconstruction_quality: 0.95,
        optimal_rank: 5,
        flow_structures: {
          stable_modes_count: 4,
          unstable_modes_count: 1,
          total_energy: 0.92
        }
      }
    }
    
    mockDataInterval = setInterval(() => {
      time++
      
      onMessage({
        type: 'pressure',
        data: generatePressure()
      })
      
      onMessage({
        type: 'balance',
        data: generateBalance()
      })
      
      onMessage({
        type: 'aero',
        data: generateAero()
      })
      
      if (time % 10 === 0) {
        onMessage({
          type: 'fft',
          data: generateFFT()
        })
      }
      
      if (time % 20 === 0) {
        onMessage({
          type: 'flutter',
          data: generateFlutter()
        })
      }
      
      if (time % 30 === 0) {
        onMessage({
          type: 'dmd',
          data: generateDMD()
        })
      }
      
      if (time % 50 === 0 && Math.random() > 0.7) {
        onMessage({
          type: 'alert',
          data: {
            type: Math.random() > 0.5 ? 'warning' : 'info',
            message: `系统状态更新: 数据正常运行中`,
            timestamp: Date.now()
          }
        })
      }
    }, 100)
  }
  
  const stopMockData = () => {
    if (mockDataInterval) {
      clearInterval(mockDataInterval)
      mockDataInterval = null
    }
  }
  
  return { connect, disconnect, send }
}
