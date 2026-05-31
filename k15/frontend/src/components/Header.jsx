import React from 'react'
import { useLocation } from 'react-router-dom'
import { Wifi, WifiOff } from 'lucide-react'

const pageTitles = {
  '/dashboard': '仪表盘',
  '/upload': '文件上传',
  '/detection': '目标检测与跟踪',
  '/missions': '任务管理',
  '/report': '报告输出',
}

export default function Header({ backendStatus }) {
  const location = useLocation()
  const title = pageTitles[location.pathname] || '声呐检测平台'

  return (
    <header className="h-16 bg-sonar-panel border-b border-sonar-border flex items-center justify-between px-6">
      <div>
        <h2 className="text-xl font-semibold text-white">{title}</h2>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-sonar-border/50">
          {backendStatus === 'online' ? (
            <>
              <Wifi className="w-4 h-4 text-sonar-success" />
              <span className="text-sm text-sonar-success">后端已连接</span>
            </>
          ) : backendStatus === 'checking' ? (
            <>
              <Wifi className="w-4 h-4 text-sonar-warning animate-pulse" />
              <span className="text-sm text-sonar-warning">连接中...</span>
            </>
          ) : (
            <>
              <WifiOff className="w-4 h-4 text-sonar-danger" />
              <span className="text-sm text-sonar-danger">后端未连接</span>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
