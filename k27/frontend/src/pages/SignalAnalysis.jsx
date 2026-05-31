import React, { useState } from 'react'
import { Card, Row, Col, Select, Button, Form, InputNumber, Tabs, message } from 'antd'
import { PlayCircleOutlined, DownloadOutlined } from '@ant-design/icons'
import SpectrumChart from '../components/SpectrumChart'
import WaveformChart from '../components/WaveformChart'
import { diagnosisAPI, signalUtils } from '../services/api'

const { Option } = Select
const { TabPane } = Tabs

const SignalAnalysis = () => {
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [analysisResult, setAnalysisResult] = useState(null)

  const handleAnalyze = async (values) => {
    setLoading(true)
    try {
      const signal = signalUtils.generateSyntheticVibration(1, 20000, values.faultType)
      
      const fftResult = signalUtils.computeFFT(signal, 20000)
      
      const response = await diagnosisAPI.getFaultFrequencies(values.rotationalFreq, values.supplyFreq)
      
      const markedFreqs = []
      const faultData = response.data
      
      if (faultData.bearing) {
        Object.entries(faultData.bearing).forEach(([name, freq]) => {
          markedFreqs.push({
            type: 'bearing',
            name,
            theoretical_freq: freq,
            actual_freq: freq,
            amplitude: 0.1,
            tolerance: freq * 0.05,
          })
        })
      }
      
      setAnalysisResult({
        signal,
        freqs: fftResult.freqs,
        spectrum: fftResult.spectrum,
        markedFreqs,
        faultFrequencies: faultData,
      })
      
      message.success('分析完成')
    } catch (error) {
      console.error('Analysis error:', error)
      message.error('分析失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <Card title="信号分析" style={{ marginBottom: 24 }}>
        <Form form={form} layout="horizontal" onFinish={handleAnalyze} initialValues={{
          faultType: 'normal',
          rotationalFreq: 25,
          supplyFreq: 50,
          sampleRate: 20000,
        }}>
          <Row gutter={16}>
            <Col span={6}>
              <Form.Item name="faultType" label="故障类型">
                <Select>
                  <Option value="normal">正常</Option>
                  <Option value="bearing_inner">轴承内圈故障</Option>
                  <Option value="bearing_outer">轴承外圈故障</Option>
                  <Option value="rotor_broken">转子断条</Option>
                  <Option value="eccentricity">转子偏心</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={4}>
              <Form.Item name="rotationalFreq" label="转速(Hz)">
                <InputNumber min={10} max={100} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={4}>
              <Form.Item name="supplyFreq" label="电源(Hz)">
                <InputNumber min={50} max={60} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={4}>
              <Form.Item name="sampleRate" label="采样率(kHz)">
                <InputNumber min={1} max={50} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item>
                <Button type="primary" htmlType="submit" icon={<PlayCircleOutlined />} loading={loading}>
                  开始分析
                </Button>
                <Button icon={<DownloadOutlined />} style={{ marginLeft: 8 }}>
                  导出数据
                </Button>
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Card>

      {analysisResult && (
        <>
          <Card title="故障特征频率理论值" style={{ marginBottom: 24 }}>
            <Tabs defaultActiveKey="1">
              <TabPane tab="轴承故障" key="1">
                <Row gutter={[16, 16]}>
                  {analysisResult.faultFrequencies.bearing && Object.entries(analysisResult.faultFrequencies.bearing).map(([name, freq]) => (
                    <Col span={6} key={name}>
                      <Card size="small">
                        <div style={{ fontWeight: 'bold' }}>{name}</div>
                        <div style={{ fontSize: 24, color: '#f5222d' }}>{freq.toFixed(2)} Hz</div>
                      </Card>
                    </Col>
                  ))}
                </Row>
              </TabPane>
              <TabPane tab="转子故障" key="2">
                <Row gutter={[16, 16]}>
                  <Col span={8}>
                    <Card size="small">
                      <div style={{ fontWeight: 'bold' }}>转频</div>
                      <div style={{ fontSize: 24, color: '#1890ff' }}>{analysisResult.faultFrequencies.rotor?.rotational_freq?.toFixed(2) || '0.00'} Hz</div>
                    </Card>
                  </Col>
                  <Col span={8}>
                    <Card size="small">
                      <div style={{ fontWeight: 'bold' }}>转差频率</div>
                      <div style={{ fontSize: 24, color: '#1890ff' }}>{analysisResult.faultFrequencies.rotor?.slip_frequency?.toFixed(2) || '0.00'} Hz</div>
                    </Card>
                  </Col>
                </Row>
                <div style={{ marginTop: 16 }}>
                  <div style={{ fontWeight: 'bold', marginBottom: 8 }}>边带频率:</div>
                  <Row gutter={[8, 8]}>
                    {analysisResult.faultFrequencies.rotor?.sideband_frequencies?.map((freq, index) => (
                      <Col span={4} key={index}>
                        <Tag color="blue" style={{ width: '100%', textAlign: 'center' }}>{freq.toFixed(2)} Hz</Tag>
                      </Col>
                    ))}
                  </Row>
                </div>
              </TabPane>
              <TabPane tab="偏心故障" key="3">
                <Row gutter={[8, 8]}>
                  {analysisResult.faultFrequencies.eccentricity?.eccentricity_frequencies?.map((freq, index) => (
                    <Col span={6} key={index}>
                      <Card size="small">
                        <div style={{ fontWeight: 'bold' }}>频率 {index + 1}</div>
                        <div style={{ fontSize: 20, color: '#52c41a' }}>{freq.toFixed(2)} Hz</div>
                      </Card>
                    </Col>
                  ))}
                </Row>
              </TabPane>
            </Tabs>
          </Card>

          <Card title="时域波形" style={{ marginBottom: 24 }}>
            <WaveformChart data={analysisResult.signal} sampleRate={20000} />
          </Card>

          <Card title="频谱分析" style={{ marginBottom: 24 }}>
            <SpectrumChart
              freqs={analysisResult.freqs}
              spectrum={analysisResult.spectrum}
              markedFreqs={analysisResult.markedFreqs}
              title="频谱图"
            />
          </Card>
        </>
      )}
    </div>
  )
}

export default SignalAnalysis
