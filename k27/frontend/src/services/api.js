import axios from 'axios'

const api = axios.create({
  baseURL: '/api/v1',
  timeout: 30000,
})

export const diagnosisAPI = {
  diagnose: (data) => api.post('/diagnose', data),
  
  sendVibrationData: (data) => api.post('/data/vibration', data),
  
  sendCurrentData: (data) => api.post('/data/current', data),
  
  sendTemperatureData: (data) => api.post('/data/temperature', data),
  
  predictTrend: (data) => api.post('/predict-trend', data),
  
  getThresholds: () => api.get('/thresholds'),
  
  updateThresholds: (data) => api.post('/thresholds/update', data),
  
  generateReport: (data) => api.post('/report/generate', data),
  
  getFaultFrequencies: (rotationalFreq, supplyFreq) => 
    api.get('/fault-frequencies', { params: { rotational_freq: rotationalFreq, supply_freq: supplyFreq } }),
  
  healthCheck: () => api.get('/health'),
}

export const signalUtils = {
  generateSyntheticVibration: (duration = 1, sampleRate = 20000, faultType = 'normal') => {
    const n = duration * sampleRate
    const t = Array.from({ length: n }, (_, i) => i / sampleRate)
    let signal = []
    
    const noise = () => (Math.random() - 0.5) * 0.1
    
    if (faultType === 'normal') {
      signal = t.map(() => noise())
    } else if (faultType === 'bearing_inner') {
      signal = t.map((_, i) => {
        const freq = 5.43 * 25
        return Math.sin(2 * Math.PI * freq * t[i]) * 0.5 + noise()
      })
    } else if (faultType === 'bearing_outer') {
      signal = t.map((_, i) => {
        const freq = 3.57 * 25
        return Math.sin(2 * Math.PI * freq * t[i]) * 0.5 + noise()
      })
    } else if (faultType === 'rotor_broken') {
      signal = t.map((_, i) => {
        const freq = 50
        const slip = 0.02
        const sideband = 50 * (1 - 2 * slip)
        return Math.sin(2 * Math.PI * freq * t[i]) + 0.3 * Math.sin(2 * Math.PI * sideband * t[i]) + noise()
      })
    } else if (faultType === 'eccentricity') {
      signal = t.map((_, i) => {
        const freq = 50
        const rotFreq = 25
        return Math.sin(2 * Math.PI * freq * t[i]) + 0.4 * Math.sin(2 * Math.PI * (freq + rotFreq) * t[i]) + noise()
      })
    } else {
      signal = t.map(() => noise())
    }
    
    return signal
  },
  
  generateSyntheticCurrent: (duration = 1, sampleRate = 10000, faultType = 'normal') => {
    const n = duration * sampleRate
    const t = Array.from({ length: n }, (_, i) => i / sampleRate)
    let signal = []
    
    const noise = () => (Math.random() - 0.5) * 0.05
    
    if (faultType === 'normal') {
      signal = t.map((_, i) => Math.sin(2 * Math.PI * 50 * t[i]) + noise())
    } else if (faultType === 'rotor_broken') {
      const slip = 0.02
      signal = t.map((_, i) => {
        return Math.sin(2 * Math.PI * 50 * t[i]) + 0.2 * Math.sin(2 * Math.PI * 50 * (1 - 2 * slip) * t[i]) + noise()
      })
    } else {
      signal = t.map((_, i) => Math.sin(2 * Math.PI * 50 * t[i]) + noise())
    }
    
    return signal
  },
  
  computeFFT: (signal, sampleRate) => {
    const n = signal.length
    const fft = []
    const freqs = []
    
    for (let k = 0; k < n / 2; k++) {
      let real = 0
      let imag = 0
      for (let t = 0; t < n; t++) {
        const angle = -2 * Math.PI * k * t / n
        real += signal[t] * Math.cos(angle)
        imag += signal[t] * Math.sin(angle)
      }
      const magnitude = Math.sqrt(real * real + imag * imag) * 2 / n
      fft.push(magnitude)
      freqs.push(k * sampleRate / n)
    }
    
    return { freqs, spectrum: fft }
  }
}

export default api
