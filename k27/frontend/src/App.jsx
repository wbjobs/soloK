import React, { useState } from 'react'
import { Layout, Menu, theme } from 'antd'
import {
  DashboardOutlined,
  BarChartOutlined,
  FileTextOutlined,
  SettingOutlined,
  AlertOutlined
} from '@ant-design/icons'
import { Routes, Route, useNavigate } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import SignalAnalysis from './pages/SignalAnalysis'
import Report from './pages/Report'
import Settings from './pages/Settings'

const { Header, Sider, Content } = Layout

const App = () => {
  const [collapsed, setCollapsed] = useState(false)
  const navigate = useNavigate()
  const {
    token: { colorBgContainer, borderRadiusLG },
  } = theme.useToken()

  const menuItems = [
    {
      key: '/',
      icon: <DashboardOutlined />,
      label: '故障诊断',
    },
    {
      key: '/analysis',
      icon: <BarChartOutlined />,
      label: '信号分析',
    },
    {
      key: '/report',
      icon: <FileTextOutlined />,
      label: '诊断报告',
    },
    {
      key: '/settings',
      icon: <SettingOutlined />,
      label: '系统设置',
    },
  ]

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider trigger={null} collapsible collapsed={collapsed} theme="dark">
        <div style={{ height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: collapsed ? 12 : 16, fontWeight: 'bold', background: '#1a365d' }}>
          {collapsed ? '电机诊断' : '异步电机故障诊断'}
        </div>
        <Menu
          theme="dark"
          mode="inline"
          defaultSelectedKeys={['/']}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>
      <Layout>
        <Header style={{ padding: '0 24px', background: 'linear-gradient(135deg, #1a365d 0%, #2d5a87 100%)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ color: '#fff', fontSize: 20, fontWeight: 'bold' }}>
            异步电机故障诊断系统
          </div>
          <div style={{ color: '#fff', display: 'flex', alignItems: 'center', gap: 16 }}>
            <AlertOutlined style={{ fontSize: 20 }} />
            <span>系统正常</span>
          </div>
        </Header>
        <Content
          style={{
            margin: '24px 16px',
            padding: 24,
            minHeight: 280,
            background: colorBgContainer,
            borderRadius: borderRadiusLG,
          }}
        >
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/analysis" element={<SignalAnalysis />} />
            <Route path="/report" element={<Report />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </Content>
      </Layout>
    </Layout>
  )
}

export default App
