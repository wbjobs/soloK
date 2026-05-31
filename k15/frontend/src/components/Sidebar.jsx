import React from 'react'
import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Upload,
  ScanSearch,
  FolderOpen,
  FileText,
  Anchor,
} from 'lucide-react'

const navItems = [
  { path: '/dashboard', icon: LayoutDashboard, label: '仪表盘' },
  { path: '/upload', icon: Upload, label: '文件上传' },
  { path: '/detection', icon: ScanSearch, label: '目标检测' },
  { path: '/missions', icon: FolderOpen, label: '任务管理' },
  { path: '/report', icon: FileText, label: '报告输出' },
]

export default function Sidebar() {
  return (
    <aside className="w-64 bg-sonar-panel border-r border-sonar-border flex flex-col">
      <div className="p-6 border-b border-sonar-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-sonar-accent rounded-lg flex items-center justify-center">
            <Anchor className="w-6 h-6 text-sonar-bg" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">声呐检测平台</h1>
            <p className="text-xs text-gray-400">Sonar Detection System</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 ${
                isActive
                  ? 'bg-sonar-accent/20 text-sonar-accent border-l-2 border-sonar-accent'
                  : 'text-gray-400 hover:bg-sonar-border/50 hover:text-gray-200'
              }`
            }
          >
            <item.icon className="w-5 h-5" />
            <span className="font-medium">{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="p-4 border-t border-sonar-border">
        <div className="text-xs text-gray-500 text-center">
          <p>v1.0.0</p>
          <p className="mt-1">水下声呐图像检测跟踪</p>
        </div>
      </div>
    </aside>
  )
}
