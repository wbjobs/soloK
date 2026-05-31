import React, { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'

const WaveformChart = ({ data = [], sampleRate = 20000, title = '时域波形' }) => {
  const displayData = useMemo(() => {
    if (!data || data.length === 0) return { time: [], amplitude: [] }

    const maxPoints = 5000
    const step = Math.ceil(data.length / maxPoints)
    const sampledData = []
    const sampledTime = []

    for (let i = 0; i < data.length; i += step) {
      sampledData.push(data[i])
      sampledTime.push((i / sampleRate).toFixed(6))
    }

    return {
      time: sampledTime,
      amplitude: sampledData,
    }
  }, [data, sampleRate])

  const option = {
    title: {
      text: title,
      left: 'center',
      textStyle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#fff',
      },
    },
    tooltip: {
      trigger: 'axis',
      formatter: (params) => {
        const point = params[0]
        return `时间: ${point.name} s<br/>幅值: ${point.value.toFixed(6)}`
      },
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      textStyle: {
        color: '#fff',
      },
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      containLabel: true,
    },
    xAxis: {
      type: 'category',
      data: displayData.time,
      name: '时间 (s)',
      nameTextStyle: {
        color: '#aaa',
      },
      axisLabel: {
        color: '#aaa',
        interval: Math.floor(displayData.time.length / 10),
      },
      axisLine: {
        lineStyle: {
          color: '#444',
        },
      },
      splitLine: {
        lineStyle: {
          color: '#222',
        },
      },
    },
    yAxis: {
      type: 'value',
      name: '幅值',
      nameTextStyle: {
        color: '#aaa',
      },
      axisLabel: {
        color: '#aaa',
      },
      axisLine: {
        lineStyle: {
          color: '#444',
        },
      },
      splitLine: {
        lineStyle: {
          color: '#222',
        },
      },
    },
    series: [
      {
        data: displayData.amplitude,
        type: 'line',
        smooth: false,
        symbol: 'none',
        lineStyle: {
          width: 1,
          color: '#1890ff',
        },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(24, 144, 255, 0.6)' },
              { offset: 1, color: 'rgba(24, 144, 255, 0.05)' },
            ],
          },
        },
      },
    ],
    backgroundColor: '#0d1117',
    dataZoom: [
      {
        type: 'inside',
        start: 0,
        end: 100,
      },
      {
        type: 'slider',
        start: 0,
        end: 100,
        backgroundColor: '#1e293b',
        dataBackground: {
          lineStyle: {
            color: '#1890ff',
          },
          areaStyle: {
            color: 'rgba(24, 144, 255, 0.3)',
          },
        },
      },
    ],
  }

  const stats = useMemo(() => {
    if (!data || data.length === 0) return null

    const rms = Math.sqrt(data.reduce((sum, val) => sum + val * val, 0) / data.length)
    const max = Math.max(...data)
    const min = Math.min(...data)
    const mean = data.reduce((sum, val) => sum + val, 0) / data.length
    const peakToPeak = max - min

    return { rms, max, min, mean, peakToPeak }
  }, [data])

  return (
    <div>
      <ReactECharts
        option={option}
        style={{ height: 300, width: '100%', background: '#0d1117', borderRadius: 8 }}
        opts={{ renderer: 'canvas' }}
      />
      {stats && (
        <div style={{ marginTop: 16, padding: 16, background: '#f5f5f5', borderRadius: 8, display: 'flex', justifyContent: 'space-around' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 12, color: '#666' }}>RMS</div>
            <div style={{ fontSize: 18, fontWeight: 'bold', color: '#1890ff' }}>{stats.rms.toFixed(6)}</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 12, color: '#666' }}>峰值</div>
            <div style={{ fontSize: 18, fontWeight: 'bold', color: '#52c41a' }}>{stats.max.toFixed(6)}</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 12, color: '#666' }}>谷值</div>
            <div style={{ fontSize: 18, fontWeight: 'bold', color: '#f5222d' }}>{stats.min.toFixed(6)}</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 12, color: '#666' }}>峰峰值</div>
            <div style={{ fontSize: 18, fontWeight: 'bold', color: '#fa8c16' }}>{stats.peakToPeak.toFixed(6)}</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 12, color: '#666' }}>均值</div>
            <div style={{ fontSize: 18, fontWeight: 'bold', color: '#722ed1' }}>{stats.mean.toFixed(6)}</div>
          </div>
        </div>
      )}
    </div>
  )
}

export default WaveformChart
