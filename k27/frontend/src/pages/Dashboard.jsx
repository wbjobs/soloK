import React, { useState } from 'react'
import {
  Row,
  Col,
  Card,
  Button,
  Select,
  InputNumber,
  Form,
  Space,
  Statistic,
  Progress,
  Alert,
  Tag,
  Divider,
  message,
  Spin
} from 'antd'
import {
  PlayCircleOutlined,
  SafetyOutlined,
  WarningOutlined,
  ThunderboltOutlined,
  LineChartOutlined
} from '@ant-design/icons'
import SpectrumChart from '../components/SpectrumChart'
import WaveformChart from '../components/WaveformChart'
import TrendPrediction from '../components/TrendPrediction'
import { diagnosisAPI, signalUtils } from '../services/api'

const { Option } = Select

const Dashboard = () => {
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [diagnosisResult, setDiagnosisResult] = useState(null)
  const [signalData, setSignalData] = useState(null)

  const motorOptions = [
    { value: 'MOTOR-001', label: '1号电机 - 水泵' },
    { value: 'MOTOR-002', label: '2号电机 - 风机' },
    { value: 'MOTOR-003', label: '3号电机 - 压缩机' },
  ]

  const faultOptions = [
    { value: 'normal', label: '正常' },
    { value: 'bearing_inner', label: '轴承内圈故障' },
    { value: 'bearing_outer', label: '轴承外圈故障' },
    { value: 'rotor_broken', label: '转子断条' },
    { value: 'eccentricity', label: '转子偏心' },
  ]

  const handleDiagnose = async (values) => {
    setLoading(true)
    try {
      const vibrationX = signalUtils.generateSyntheticVibration(1, 20000, values.faultType)
      const vibrationY = signalUtils.generateSyntheticVibration(1, 20000, values.faultType)
      const vibrationZ = signalUtils.generateSyntheticVibration(1, 20000, values.faultType)
      
      const currentA = signalUtils.generateSyntheticCurrent(1, 10000, values.faultType)
      const currentB = signalUtils.generateSyntheticCurrent(1, 10000, values.faultType)
      const currentC = signalUtils.generateSyntheticCurrent(1, 10000, values.faultType)

      const response = await diagnosisAPI.diagnose({
        motor_id: values.motorId,
        vibration_x: vibrationX,
        vibration_y: vibrationY,
        vibration_z: vibrationZ,
        current_a: currentA,
        current_b: currentB,
        current_c: currentC,
        rotational_freq: values.rotationalFreq,
        supply_freq: values.supplyFreq,
        slip: values.slip,
      })

      setDiagnosisResult(response.data)
      setSignalData({
        vibration: {
          signal: vibrationX,
          freqs: response.data.vibration_analysis?.frequencies || [],
          spectrum: response.data.vibration_analysis?.spectrum || [],
        },
        current: {
          signal: currentA,
        },
        sampleRate: 20000,
      })

      message.success('诊断完成')
    } catch (error) {
      console.error('Diagnosis error:', error)
      message.error('诊断失败')
    } finally {
      setLoading(false)
    }
  }

  const getSeverityColor = (severity) => {
    if (severity < 30) return '#52c41a'
    if (severity < 60) return '#faad14'
    return '#ff4d4f'
  }

  const getStatusIcon = (className) => {
    if (className.includes('正常')) return <SafetyOutlined style={{ color: '#52c41a', fontSize: 48 }} />
    if (className.includes('轴承')) return <WarningOutlined style={{ color: '#fa8c16', fontSize: 48 }} />
    if (className.includes('转子') || className.includes('定子')) return <ThunderboltOutlined style={{ color: '#f5222d', fontSize: 48 }} />
    return <LineChartOutlined style={{ color: '#1890ff', fontSize: 48 }} />
  }

  return (
    <div>
      <Card title="故障诊断" style={{ marginBottom: 24 }}>
        <Form form={form} layout="horizontal" onFinish={handleDiagnose} initialValues={{
          motorId: 'MOTOR-001',
          faultType: 'normal',
          rotationalFreq: 25,
          supplyFreq: 50,
          slip: 0.02,
        }}>
          <Row gutter={16}>
            <Col span={6}>
              <Form.Item name="motorId" label="电机编号">
                <Select>
                  {motorOptions.map(opt => (
                    <Option key={opt.value} value={opt.value}>{opt.label}</Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="faultType" label="模拟故障类型">
                <Select>
                  {faultOptions.map(opt => (
                    <Option key={opt.value} value={opt.value}>{opt.label}</Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={4}>
              <Form.Item name="rotationalFreq" label="转速(Hz)">
                <InputNumber min={10} max={100} step={1} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={4}>
              <Form.Item name="supplyFreq" label="电源(Hz)">
                <InputNumber min={50} max={60} step={1} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={4}>
              <Form.Item name="slip" label="转差率">
                <InputNumber min={0} max={0.1} step={0.001} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item>
            <Button type="primary" htmlType="submit" icon={<PlayCircleOutlined />} loading={loading} size="large">
              开始诊断
            </Button>
          </Form.Item>
        </Form>
      </Card>

      {loading && (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spin size="large" />
          <div style={{ marginTop: 16 }}>正在分析信号...</div>
        </div>
      )}

      {diagnosisResult && !loading && (
        <>
          <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
            <Col span={8}>
              <Card className="feature-card">
                <div style={{ textAlign: 'center' }}>
                  {getStatusIcon(diagnosisResult.class_name)}
                  <div style={{ fontSize: 18, fontWeight: 'bold', marginTop: 12 }}>
                    {diagnosisResult.class_name}
                  </div>
                  <Tag color={diagnosisResult.class_name.includes('正常') ? 'green' : 'orange'} style={{ marginTop: 8 }}>
                    置信度: {(diagnosisResult.confidence * 100).toFixed(1)}%
                  </Tag>
                </div>
              </Card>
            </Col>
            <Col span={8}>
              <Card className="feature-card">
                <div style={{ textAlign: 'center' }}>
                  <Statistic
                    title="故障严重程度"
                    value={diagnosisResult.severity}
                    suffix="%"
                    valueStyle={{ color: getSeverityColor(diagnosisResult.severity) }}
                  />
                  <Progress
                    percent={diagnosisResult.severity}
                    strokeColor={getSeverityColor(diagnosisResult.severity)}
                    style={{ marginTop: 12 }}
                  />
                </div>
              </Card>
            </Col>
            <Col span={8}>
              <Card className="feature-card">
                <div style={{ textAlign: 'center' }}>
                  <Statistic
                    title="故障概率分布"
                    value={Math.max(...diagnosisResult.probabilities) * 100}
                    suffix="%"
                    precision={1}
                  />
                  <div style={{ marginTop: 12, fontSize: 12, color: '#666' }}>
                    {diagnosisResult.recommendation}
                  </div>
                </div>
              </Card>
            </Col>
          </Row>

          {diagnosisResult.alerts && diagnosisResult.alerts.length > 0 && (
            <Card title="报警信息" style={{ marginBottom: 24 }}>
              {diagnosisResult.alerts.map((alert, index) => (
                <Alert
                  key={index}
                  message={`${alert.feature} - ${alert.status === 'high' ? '偏高' : '偏低'}`}
                  description={`当前值: ${alert.value.toFixed(4)}, 偏离程度: ${alert.deviation.toFixed(2)}σ`}
                  type={alert.status === 'high' ? 'warning' : 'error'}
                  showIcon
                  style={{ marginBottom: 8 }}
                />
              ))}
            </Card>
          )}

          {signalData && (
            <>
              <Card title="振动波形" style={{ marginBottom: 24 }}>
                <WaveformChart data={signalData.vibration.signal} sampleRate={signalData.sampleRate} />
              </Card>

              <Card title="包络频谱分析" style={{ marginBottom: 24 }}>
                <SpectrumChart
                  freqs={signalData.vibration.freqs}
                  spectrum={signalData.vibration.spectrum}
                  markedFreqs={diagnosisResult.marked_frequencies}
                  title="振动包络谱"
                />
              </Card>

              {diagnosisResult.marked_frequencies && diagnosisResult.marked_frequencies.length > 0 && (
                <Card title="检测到的故障特征频率" style={{ marginBottom: 24 }}>
                  <Row gutter={[8, 8]}>
                    {diagnosisResult.marked_frequencies.map((freq, index) => (
                      <Col span={8} key={index}>
                        <Tag
                          className={`fault-tag fault-${freq.type}`}
                          style={{ width: '100%', padding: '8px 12px' }}
                        >
                          <div style={{ fontWeight: 'bold' }}>
                            {freq.type === 'bearing' ? '轴承故障' : freq.type === 'rotor' ? '转子故障' : '偏心故障'} - {freq.name}
                          </div>
                          <div>
                            理论: {freq.theoretical_freq.toFixed(2)} Hz | 实际: {freq.actual_freq.toFixed(2)} Hz
                          </div>
                          <div>
                            幅值: {freq.amplitude.toFixed(4)} | 容差: ±{(freq.tolerance).toFixed(2)} Hz
                          </div>
                        </Tag>
                      </Col>
                    ))}
                  </Row>
                </Card>
              )}
            </>
          )}

          {diagnosisResult.features && (
            <Card title="特征参数" style={{ marginBottom: 24 }}>
              <Row gutter={[16, 16]}>
                {Object.entries(diagnosisResult.features).map(([key, value]) => (
                  <Col span={6} key={key}>
                    <Card size="small" className="feature-card">
                      <Statistic
                        title={key.replace(/_/g, ' ')}
                        value={typeof value === 'number' ? value : 0}
                        precision={4}
                      />
                    </Card>
                  </Col>
                ))}
              </Row>
            </Card>
          )}

          <Card title="趋势预测" style={{ marginBottom: 24 }}>
            <TrendPrediction motorId={form.getFieldValue('motorId')} />
          </Card>
        </>
      )}
    </div>
  )
}

export default Dashboard
