import React, { useState } from 'react'
import ReactECharts from 'echarts-for-react'
import { Select, Space } from 'antd'

const { Option } = Select

const SpectrumChart = ({ freqs = [], spectrum = [], markedFreqs = [], title = '频谱图' }) => {
  const [freqRange, setFreqRange] = useState('all')

  const getMarkedLines = () => {
    if (!markedFreqs || markedFreqs.length === 0) return []

    const colorMap = {
      bearing: '#f5222d',
      rotor: '#1890ff',
      eccentricity: '#52c41a',
    }

    return markedFreqs.map((freq, index) => ({
      xAxis: freq.theoretical_freq,
      lineStyle: {
        color: colorMap[freq.type] || '#fa8c16',
        width: 2,
        type: 'dashed',
      },
      label: {
        show: true,
        position: 'insideEnd',
        formatter: `${freq.name}: ${freq.theoretical_freq.toFixed(1)}Hz`,
        color: colorMap[freq.type] || '#fa8c16',
      },
    }))
  }

  const getMarkedAreas = () => {
    if (!markedFreqs || markedFreqs.length === 0) return []

    const colorMap = {
      bearing: 'rgba(245, 34, 45, 0.1)',
      rotor: 'rgba(24, 144, 255, 0.1)',
      eccentricity: 'rgba(82, 196, 26, 0.1)',
    }

    return markedFreqs.map((freq) => ({
      xAxis: [
        freq.theoretical_freq - freq.tolerance,
        freq.theoretical_freq + freq.tolerance,
      ],
      itemStyle: {
        color: colorMap[freq.type] || 'rgba(250, 140, 22, 0.1)',
      },
    }))
  }

  const filteredData = () => {
    if (!freqs || !spectrum || freqs.length === 0) return { freqs: [], spectrum: [] }

    let maxFreq = 2000

    if (freqRange === 'low') maxFreq = 500
    else if (freqRange === 'mid') maxFreq = 2000
    else if (freqRange === 'high') maxFreq = 10000

    const indices = freqs.map((f, i) => (f <= maxFreq ? i : -1)).filter((i) => i !== -1)

    return {
      freqs: indices.map((i) => freqs[i]),
      spectrum: indices.map((i) => spectrum[i]),
    }
  }

  const { freqs: filteredFreqs, spectrum: filteredSpectrum } = filteredData()

  const option = {
    title: {
      text: title,
      left: 'center',
      textStyle: {
        fontSize: 16,
        fontWeight: 'bold',
      },
    },
    tooltip: {
      trigger: 'axis',
      formatter: (params) => {
        const data = params[0]
        return `频率: ${data.name.toFixed(2)} Hz<br/>幅值: ${data.value.toFixed(6)}`
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
      data: filteredFreqs.map((f) => f.toFixed(1)),
      name: '频率 (Hz)',
      nameLocation: 'middle',
      nameGap: 30,
      axisLabel: {
        interval: Math.floor(filteredFreqs.length / 10),
        rotate: 45,
      },
    },
    yAxis: {
      type: 'value',
      name: '幅值',
      nameLocation: 'middle',
      nameGap: 50,
    },
    series: [
      {
        data: filteredSpectrum,
        type: 'line',
        smooth: true,
        symbol: 'none',
        lineStyle: {
          width: 1,
          color: '#1a365d',
        },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(26, 54, 93, 0.5)' },
              { offset: 1, color: 'rgba(26, 54, 93, 0.05)' },
            ],
          },
        },
        markLine: {
          silent: true,
          symbol: 'none',
          data: getMarkedLines(),
        },
        markArea: {
          silent: true,
          data: getMarkedAreas(),
        },
      },
    ],
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
      },
    ],
  }

  return (
    <div>
      <div style={{ marginBottom: 16, textAlign: 'right' }}>
        <Space>
          <span style={{ color: '#666' }}>频率范围:</span>
          <Select value={freqRange} onChange={setFreqRange} style={{ width: 160 }}>
            <Option value="all">全部</Option>
            <Option value="low">低频 (0-500Hz)</Option>
            <Option value="mid">中频 (0-2000Hz)</Option>
            <Option value="high">高频 (0-10000Hz)</Option>
          </Select>
        </Space>
      </div>
      <ReactECharts
        option={option}
        style={{ height: 400 }}
        opts={{ renderer: 'canvas' }}
      />
      {markedFreqs && markedFreqs.length > 0 && (
        <div style={{ marginTop: 16, padding: 12, background: '#fafafa', borderRadius: 8 }}>
          <div style={{ marginBottom: 8, fontWeight: 'bold' }}>图例说明:</div>
          <Space size="large">
            <span>
              <span style={{ display: 'inline-block', width: 12, height: 12, background: '#f5222d', marginRight: 4 }} />
              轴承故障
            </span>
            <span>
              <span style={{ display: 'inline-block', width: 12, height: 12, background: '#1890ff', marginRight: 4 }} />
              转子故障
            </span>
            <span>
              <span style={{ display: 'inline-block', width: 12, height: 12, background: '#52c41a', marginRight: 4 }} />
              偏心故障
            </span>
          </Space>
        </div>
      )}
    </div>
  )
}

export default SpectrumChart
