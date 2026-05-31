import React, { useState } from 'react'
import { Card, Table, Button, Select, DatePicker, Space, Tag, message, Modal } from 'antd'
import { FilePdfOutlined, EyeOutlined, DownloadOutlined } from '@ant-design/icons'
import { diagnosisAPI } from '../services/api'

const { Option } = Select
const { RangePicker } = DatePicker

const Report = () => {
  const [reports, setReports] = useState([
    {
      id: 1,
      motorId: 'MOTOR-001',
      motorName: '1号电机 - 水泵',
      reportTime: '2024-01-15 14:30:00',
      diagnosis: '正常',
      severity: 5.2,
      status: 'normal',
    },
    {
      id: 2,
      motorId: 'MOTOR-002',
      motorName: '2号电机 - 风机',
      reportTime: '2024-01-15 10:15:00',
      diagnosis: '轴承内圈故障',
      severity: 45.6,
      status: 'warning',
    },
    {
      id: 3,
      motorId: 'MOTOR-003',
      motorName: '3号电机 - 压缩机',
      reportTime: '2024-01-14 16:45:00',
      diagnosis: '转子断条',
      severity: 72.3,
      status: 'danger',
    },
  ])
  const [previewVisible, setPreviewVisible] = useState(false)
  const [currentReport, setCurrentReport] = useState(null)

  const columns = [
    {
      title: '电机编号',
      dataIndex: 'motorId',
      key: 'motorId',
    },
    {
      title: '电机名称',
      dataIndex: 'motorName',
      key: 'motorName',
    },
    {
      title: '报告时间',
      dataIndex: 'reportTime',
      key: 'reportTime',
    },
    {
      title: '诊断结果',
      dataIndex: 'diagnosis',
      key: 'diagnosis',
      render: (text, record) => (
        <Tag color={record.status === 'normal' ? 'green' : record.status === 'warning' ? 'orange' : 'red'}>
          {text}
        </Tag>
      ),
    },
    {
      title: '严重程度',
      dataIndex: 'severity',
      key: 'severity',
      render: (value) => (
        <span style={{ color: value < 30 ? '#52c41a' : value < 60 ? '#faad14' : '#ff4d4f', fontWeight: 'bold' }}>
          {value.toFixed(1)}%
        </span>
      ),
    },
    {
      title: '操作',
      key: 'action',
      render: (_, record) => (
        <Space>
          <Button type="link" icon={<EyeOutlined />} onClick={() => handlePreview(record)}>
            预览
          </Button>
          <Button type="link" icon={<DownloadOutlined />} onClick={() => handleDownload(record)}>
            下载
          </Button>
        </Space>
      ),
    },
  ]

  const handlePreview = (record) => {
    setCurrentReport(record)
    setPreviewVisible(true)
  }

  const handleDownload = async (record) => {
    try {
      const response = await diagnosisAPI.generateReport({
        motor_id: record.motorId,
        diagnosis_result: {
          class_name: record.diagnosis,
          confidence: 0.95,
          severity: record.severity,
          recommendation: record.severity < 30 ? '建议继续监测' : record.severity < 60 ? '建议安排维护' : '建议立即检修',
        },
        features: {
          RMS: 0.123,
          Peak_to_Peak: 0.567,
          Kurtosis: 3.5,
          Crest_Factor: 4.2,
        },
      })
      
      window.open(`/api/v1${response.data.report_url}`, '_blank')
      message.success('报告下载中...')
    } catch (error) {
      console.error('Download error:', error)
      message.error('下载失败')
    }
  }

  return (
    <div>
      <Card title="诊断报告" style={{ marginBottom: 24 }}>
        <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
          <Col span={6}>
            <Select placeholder="选择电机" style={{ width: '100%' }}>
              <Option value="all">全部电机</Option>
              <Option value="MOTOR-001">1号电机 - 水泵</Option>
              <Option value="MOTOR-002">2号电机 - 风机</Option>
              <Option value="MOTOR-003">3号电机 - 压缩机</Option>
            </Select>
          </Col>
          <Col span={6}>
            <RangePicker style={{ width: '100%' }} />
          </Col>
          <Col span={6}>
            <Select placeholder="诊断状态" style={{ width: '100%' }}>
              <Option value="all">全部状态</Option>
              <Option value="normal">正常</Option>
              <Option value="warning">警告</Option>
              <Option value="danger">严重</Option>
            </Select>
          </Col>
          <Col span={6}>
            <Space>
              <Button type="primary">查询</Button>
              <Button>重置</Button>
            </Space>
          </Col>
        </Row>

        <Table
          columns={columns}
          dataSource={reports}
          rowKey="id"
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total) => `共 ${total} 条记录`,
          }}
        />
      </Card>

      <Modal
        title="报告预览"
        open={previewVisible}
        onCancel={() => setPreviewVisible(false)}
        footer={[
          <Button key="download" icon={<FilePdfOutlined />} onClick={() => handleDownload(currentReport)}>
            下载PDF
          </Button>,
          <Button key="close" onClick={() => setPreviewVisible(false)}>
            关闭
          </Button>,
        ]}
        width={800}
      >
        {currentReport && (
          <div>
            <Card title="诊断信息" size="small" style={{ marginBottom: 16 }}>
              <p><strong>电机编号:</strong> {currentReport.motorId}</p>
              <p><strong>电机名称:</strong> {currentReport.motorName}</p>
              <p><strong>报告时间:</strong> {currentReport.reportTime}</p>
            </Card>
            <Card title="诊断结果" size="small" style={{ marginBottom: 16 }}>
              <p><strong>故障类型:</strong> 
                <Tag color={currentReport.status === 'normal' ? 'green' : currentReport.status === 'warning' ? 'orange' : 'red'}>
                  {currentReport.diagnosis}
                </Tag>
              </p>
              <p><strong>严重程度:</strong> {currentReport.severity.toFixed(1)}%</p>
              <p><strong>置信度:</strong> 95.0%</p>
            </Card>
            <Card title="维护建议" size="small">
              <p>
                {currentReport.severity < 30 
                  ? '设备运行正常，建议继续监测，按计划进行例行维护。' 
                  : currentReport.severity < 60 
                    ? '检测到早期故障迹象，建议尽快安排详细检查和预防性维护。'
                    : '检测到严重故障，建议立即停机检修，避免造成更大损失。'}
              </p>
            </Card>
          </div>
        )}
      </Modal>
    </div>
  )
}

export default Report
