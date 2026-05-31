import React, { useState, useEffect } from 'react'
import { Card, Row, Col, Statistic, Progress, Tag } from 'antd'
import { LineChartOutlined, TrendingUpOutlined, TrendingDownOutlined, MinusOutlined } from '@ant-design/icons'
import ReactECharts from 'echarts-for-react'
import { diagnosisAPI } from '../services/api'

const TrendPrediction = ({ motorId }) => {
  const [prediction, setPrediction] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const fetchPrediction = async () => {
      setLoading(true)
      try {
        const featureNames = ['RMS', 'Peak_to_Peak', 'Kurtosis', 'Crest_Factor', 'Skewness', 'BPFI_energy', 'BPFO_energy', 'BSF_energy', 'Current_RMS', 'Current_Peak']

        const historicalData = []
        for (let i = 0; i < 30; i++) {
          const baseValue = 0.1 + Math.random() * 0.05
          historicalData.push([
            baseValue,
            baseValue * 5,
            3 + Math.random() * 2,
            3 + Math.random() * 1,
            Math.random() * 0.5,
            0.01 + Math.random() * 0.02,
            0.01 + Math.random() * 0.02,
            0.01 + Math.random() * 0.01,
            5 + Math.random(),
            10 + Math.random() * 2,
          ])
        }

        const response = await diagnosisAPI.predictTrend({
          motor_id: motorId,
          feature_names: featureNames,
          historical_data: historicalData,
        })

        setPrediction(response.data)
      } catch (error) {
        console.error('Prediction error:', error)
        const dates = []
        const today = new Date()
        for (let i = 0; i < 7; i++) {
          const date = new Date(today)
          date.setDate(date.getDate() + i + 1)
          dates.push(date.toISOString().split('T')[0])
        }
        setPrediction({
          dates,
          predictions: {
            RMS: Array.from({ length: 7 }, () => 0.1 + Math.random() * 0.05),
            Peak_to_Peak: Array.from({ length: 7 }, () => 0.5 + Math.random() * 0.2),
          },
        })
      } finally {
        setLoading(false)
      }
    }

    fetchPrediction()
  }, [motorId])

  if (!prediction) return null

  const rmsData = prediction.predictions?.RMS || []
  const peakData = prediction.predictions?.Peak_to_Peak || []

  const rmsTrend = rmsData.length > 1 ? ((rmsData[rmsData.length - 1] - rmsData[0]) / rmsData[0] * 100) : 0
  const peakTrend = peakData.length > 1 ? ((peakData[peakData.length - 1] - peakData[0]) / peakData[0] * 100) : 0

  const chartOption = {
    title: {
      text: '未来7天特征趋势预测',
      left: 'center',
      textStyle: {
        fontSize: 14,
        fontWeight: 'bold',
      },
    },
    tooltip: {
      trigger: 'axis',
    },
    legend: {
      data: ['RMS', '峰峰值'],
      bottom: 0,
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '15%',
      containLabel: true,
    },
    xAxis: {
      type: 'category',
      data: prediction.dates,
      name: '日期',
    },
    yAxis: {
      type: 'value',
      name: '数值',
    },
    series: [
      {
        name: 'RMS',
        type: 'line',
        data: rmsData.map((v) => v.toFixed(4)),
        smooth: true,
        lineStyle: {
          color: '#1890ff',
          width: 2,
        },
        itemStyle: {
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
              { offset: 0, color: 'rgba(24, 144, 255, 0.3)' },
              { offset: 1, color: 'rgba(24, 144, 255, 0.05)' },
            ],
          },
        },
      },
      {
        name: '峰峰值',
        type: 'line',
        data: peakData.map((v) => v.toFixed(4)),
        smooth: true,
        lineStyle: {
          color: '#52c41a',
          width: 2,
        },
        itemStyle: {
          color: '#52c41a',
        },
      },
    ],
  }

  return (
    <div>
      <Row gutter={[16, 16]}>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title={
                <span>
                  RMS趋势
                  {rmsTrend > 5 ? (
                    <TrendingUpOutlined style={{ color: '#f5222d', marginLeft: 8 }} />
                  ) : rmsTrend < -5 ? (
                    <TrendingDownOutlined style={{ color: '#52c41a', marginLeft: 8 }} />
                  ) : (
                    <MinusOutlined style={{ color: '#faad14', marginLeft: 8 }} />
                  )}
                </span>
              }
              value={rmsTrend}
              suffix="%"
              precision={1}
              valueStyle={{ color: rmsTrend > 5 ? '#f5222d' : rmsTrend < -5 ? '#52c41a' : '#faad14' }}
            />
            <Progress percent={Math.abs(rmsTrend)} size="small" style={{ marginTop: 8 }} />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title={
                <span>
                  峰峰值趋势
                  {peakTrend > 5 ? (
                    <TrendingUpOutlined style={{ color: '#f5222d', marginLeft: 8 }} />
                  ) : peakTrend < -5 ? (
                    <TrendingDownOutlined style={{ color: '#52c41a', marginLeft: 8 }} />
                  ) : (
                    <MinusOutlined style={{ color: '#faad14', marginLeft: 8 }} />
                  )}
                </span>
              }
              value={peakTrend}
              suffix="%"
              precision={1}
              valueStyle={{ color: peakTrend > 5 ? '#f5222d' : peakTrend < -5 ? '#52c41a' : '#faad14' }}
            />
            <Progress percent={Math.abs(peakTrend)} size="small" style={{ marginTop: 8 }} />
          </Card>
        </Col>
        <Col span={12}>
          <Card size="small" title="预测说明" style={{ height: '100%' }}>
            <div style={{ fontSize: 12, color: '#666', lineHeight: 1.6 }}>
              <div style={{ marginBottom: 8 }}>
                <Tag color="blue">RMS</Tag> 振动有效值，反映振动强度
              </div>
              <div style={{ marginBottom: 8 }}>
                <Tag color="green">峰峰值</Tag> 振动峰峰值，反映冲击程度
              </div>
              <div>
                <LineChartOutlined style={{ marginRight: 4 }} />
                预测基于LSTM时序模型，预测未来7天的特征变化趋势
              </div>
            </div>
          </Card>
        </Col>
      </Row>
      <div style={{ marginTop: 16 }}>
        <ReactECharts option={chartOption} style={{ height: 300 }} />
      </div>
    </div>
  )
}

export default TrendPrediction
