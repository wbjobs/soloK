import { NavLink } from 'react-router-dom'
import { motion } from 'framer-motion'
import { LayoutDashboard, GitBranch, Settings, Usb, Activity } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SidebarProps {
  deviceConnected: boolean
  serviceRunning: boolean
}

const navItems = [
  {
    path: '/',
    label: '主控台',
    icon: LayoutDashboard,
    description: '实时监控与控制',
  },
  {
    path: '/mappings',
    label: '映射配置',
    icon: GitBranch,
    description: '管理MIDI映射规则',
  },
  {
    path: '/settings',
    label: '系统设置',
    icon: Settings,
    description: '应用配置与选项',
  },
]

export default function Sidebar({ deviceConnected, serviceRunning }: SidebarProps) {
  return (
    <aside className="w-64 bg-surface border-r border-border flex flex-col flex-shrink-0">
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-3 mb-4">
          <div className="relative">
            <Usb className={cn('w-5 h-5', deviceConnected ? 'text-primary' : 'text-text-muted')} />
            <span className={cn('absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 border-surface', deviceConnected ? 'bg-success animate-pulse' : 'bg-text-muted')} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-text truncate">
              {deviceConnected ? '设备已连接' : '未连接设备'}
            </div>
            <div className="text-xs text-text-muted">
              MIDI控制器
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Activity className={cn('w-5 h-5', serviceRunning ? 'text-success' : 'text-text-muted')} />
            <span className={cn('absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 border-surface', serviceRunning ? 'bg-success animate-pulse' : 'bg-text-muted')} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-text truncate">
              {serviceRunning ? '服务运行中' : '服务已停止'}
            </div>
            <div className="text-xs text-text-muted">
              映射引擎
            </div>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {navItems.map((item, index) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/'}
            className={({ isActive }) =>
              cn('nav-item group', isActive && 'nav-item-active')
            }
          >
            {({ isActive }) => (
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
                className="flex items-center gap-3 w-full"
              >
                <item.icon
                  className={cn(
                    'w-5 h-5 flex-shrink-0 transition-colors duration-200',
                    isActive ? 'text-primary' : 'group-hover:text-text'
                  )}
                />
                <div className="flex-1 min-w-0">
                  <div
                    className={cn(
                      'text-sm font-medium transition-colors duration-200',
                      isActive ? 'text-primary' : ''
                    )}
                  >
                    {item.label}
                  </div>
                  <div className="text-xs text-text-muted truncate">
                    {item.description}
                  </div>
                </div>
                {isActive && (
                  <motion.div
                    layoutId="activeIndicator"
                    className="w-1 h-6 rounded-full bg-primary"
                  />
                )}
              </motion.div>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="p-4 border-t border-border">
        <div className="glass-card rounded-lg p-3">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            <span className="text-xs font-medium text-primary">系统状态</span>
          </div>
          <div className="text-xs text-text-muted space-y-1">
            <div className="flex justify-between">
              <span>活动映射</span>
              <span className="font-mono text-text">0</span>
            </div>
            <div className="flex justify-between">
              <span>总映射数</span>
              <span className="font-mono text-text">0</span>
            </div>
          </div>
        </div>
      </div>
    </aside>
  )
}
