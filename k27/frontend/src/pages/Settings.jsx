import React, { useState, useEffect } from 'react'
import { Card, Form, Input, InputNumber, Switch, Button, Row, Col, Table, Tag, message, Divider, Select } from 'antd'

const { Option } = Select
import { SaveOutlined, SyncOutlined } from '@ant-design/icons'
import { diagnosisAPI } from '../services/api'

const Settings = () => {
  const [form] = Form.useForm()
  const [thresholds, setThresholds] = useState({})
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetchThresholds()
  }, [])

  const fetchThresholds = async () => {
    try {
      const response = await diagnosisAPI.getThresholds()
      setThresholds(response.data.thresholds || {})
    } catch (error) {
      console.error('Fetch thresholds error:', error)
    }
  }

  const handleSaveSystemSettings = async (values) => {
    setLoading(true)
    try {
      await new Promise(resolve => setTimeout(resolve, 1000))
      message.success('系统设置已保存')
    } catch (error) {
      console.error('Save settings error:', error)
      message.error('保存失败')
    } finally {
      setLoading(false)
    }
  }

  const handleSaveThreshold = async (values) => {
    try {
      await diagnosisAPI.updateThresholds({
        motor_id: 'MOTOR-001',
        features: values,
      })
      message.success('阈值已更新')
      fetchThresholds()
    } catch (error) {
      console.error('Update threshold error:', error)
      message.error('更新失败')
    }
  }

  const thresholdColumns = [
    {
      title: '特征名称',
      dataIndex: 'name',
      key: 'name',
      render: (text, record) => <span style={{ fontWeight: 'bold' }}>{record.key}</span>,
    },
    {
      title: '均值',
      dataIndex: 'mean',
      key: 'mean',
      render: (value) => value?.toFixed(4),
    },
    {
      title: '标准差',
      dataIndex: 'std',
      key: 'std',
      render: (value) => value?.toFixed(4),
    },
    {
      title: '上控制限 (UCL)',
      dataIndex: 'ucl',
      key: 'ucl',
      render: (value) => <span style={{ color: '#f5222d' }}>{value?.toFixed(4)}</span>,
    },
    {
      title: '下控制限 (LCL)',
      dataIndex: 'lcl',
      key: 'lcl',
      render: (value) => <span style={{ color: '#1890ff' }}>{value?.toFixed(4)}</span>,
    },
    {
      title: '样本数',
      dataIndex: 'sample_size',
      key: 'sample_size',
    },
  ]

  const thresholdData = Object.entries(thresholds).map(([key, value]) => ({
    key,
    ...value,
  }))

  return (
    <div>
      <Card title="系统设置" style={{ marginBottom: 24 }}>
        <Form
          form={form}
          layout="horizontal"
          onFinish={handleSaveSystemSettings}
          initialValues={{
            influxdbUrl: 'http://localhost:8086',
            influxdbOrg: 'motor-diagnosis',
            influxdbBucket: 'sensor-data',
            vibrationSampleRate: 20000,
            currentSampleRate: 10000,
            confidenceLevel: 0.997,
            autoUpdateThreshold: true,
            enableAlert: true,
          }}
        >
          <Row gutter={[16, 16]}>
            <Col span={12}>
              <Divider orientation="left">InfluxDB 配置</Divider>
              <Form.Item name="influxdbUrl" label="URL">
                <Input />
              </Form.Item>
              <Form.Item name="influxdbOrg" label="组织">
                <Input />
              </Form.Item>
              <Form.Item name="influxdbBucket" label="存储桶">
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Divider orientation="left">采样配置</Divider>
              <Form.Item name="vibrationSampleRate" label="振动采样率 (Hz)">
                <InputNumber min={1000} max={50000} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="currentSampleRate" label="电流采样率 (Hz)">
                <InputNumber min={1000} max={20000} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>

          <Divider orientation="left">报警配置</Divider>
          <Row gutter={[16, 16]}>
            <Col span={8}>
              <Form.Item name="confidenceLevel" label="置信水平">
                <Select>
                  <Option value={0.90}>90%</Option>
                  <Option value={0.95}>95%</Option>
                  <Option value={0.99}>99%</Option>
                  <Option value={0.997}>99.7% (3σ)</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="autoUpdateThreshold" label="自动更新阈值" valuePropName="checked">
                <Switch />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="enableAlert" label="启用报警" valuePropName="checked">
                <Switch />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item>
            <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={loading}>
              保存设置
            </Button>
          </Form.Item>
        </Form>
      </Card>

      <Card 
        title="自适应阈值" 
        extra={
          <Button icon={<SyncOutlined />} onClick={fetchThresholds}>
            刷新
          </Button>
        }
        style={{ marginBottom: 24 }}
      >
        <Table
          columns={thresholdColumns}
          dataSource={thresholdData}
          pagination={false}
          locale={{ emptyText: '暂无阈值数据，请先运行诊断以收集数据' }}
        />
        <div style={{ marginTop: 16, padding: 16, background: '#f5f5f5', borderRadius: 8 }}>
          <h4 style={{ marginBottom: 8 }}>阈值说明:</h4>
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            <li>阈值基于统计过程控制(SPC)原理自动计算</li>
            <li>上控制限(UCL) = 均值 + 3 × 标准差</li>
            <li>下控制限(LCL) = 均值 - 3 × 标准差</li>
            <li>当特征值超出控制限时会触发报警</li>
          </ul>
        </div>
      </Card>

      <Card title="手动调整阈值">
        <Form layout="horizontal" onFinish={handleSaveThreshold}>
          <Row gutter={[16, 16]}>
            <Col span={6}>
              <Form.Item name="RMS" label="RMS 阈值">
                <InputNumber step={0.001} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="Peak_to_Peak" label="峰峰值阈值">
                <InputNumber step={0.001} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="Kurtosis" label="峭度阈值">
                <InputNumber step={0.1} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item>
                <Button type="primary" htmlType="submit" icon={<SaveOutlined />}>
                  更新阈值
                </Button>
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Card>
    </div>
  )
}

export default Settings
