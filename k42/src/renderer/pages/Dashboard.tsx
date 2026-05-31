import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Zap, GitBranch, Clock, Music, Terminal, Activity } from 'lucide-react'
import { cn } from '@/lib/utils'
import { triggerToString } from '@shared/index'
import type { MidiMessage, LogEntry } from '@shared/index'
import { useAppStore } from '../store/useAppStore'
import { useMidiStore } from '../store/useMidiStore'
import { useMidiDevices } from '../hooks/useMidiDevices'
import ServiceControl from '../components/ServiceControl/ServiceControl'
import DevicePanel from '../components/DevicePanel/DevicePanel'
import { ipcService } from '../utils/ipc'

export default function Dashboard() {
  const { serviceStatus, logs, setServiceStatus, addLog } = useAppStore()
  const { messageHistory } = useMidiStore()
  const { devices, connectedDeviceIds, loading, error, refreshDevices, connectDevice, disconnectDevice } = useMidiDevices()
  
  const [uptime, setUptime] = useState(0)

  useEffect(() => {
    const handleStatusChange = (status: typeof serviceStatus) => {
      setServiceStatus(status)
    }

    const handleLogEntry = (entry: LogEntry) => {
      addLog(entry)
    }

    ipcService.onStatusChanged(handleStatusChange)
    ipcService.onLog(handleLogEntry)

    return () => {
      ipcService.removeAllListeners()
    }
  }, [setServiceStatus, addLog])

  useEffect(() => {
    let interval: NodeJS.Timeout
    if (serviceStatus.running) {
      interval = setInterval(() => {
        setUptime(prev => prev + 1)
      }, 1000)
    } else {
      setUptime(0)
    }
    return () => clearInterval(interval)
  }, [serviceStatus.running])

  const handleStartService = async () => {
    await ipcService.start()
  }

  const handleStopService = async () => {
    await ipcService.stop()
  }

  const formatUptime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  const getMidiMessageDisplay = (msg: MidiMessage) => {
    const trigger = {
      type: msg.type === 'cc' ? 'cc' : msg.type === 'pitchBend' ? 'pitchBend' : 'note',
      channel: msg.channel,
      note: msg.note,
      controlNumber: msg.controlNumber,
    } as const
    return triggerToString(trigger as Parameters<typeof triggerToString>[0])
  }

  const recentMessages = messageHistory.slice(-20).reverse()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text mb-1">主控台</h1>
          <p className="text-text-muted">实时监控与控制MIDI映射服务</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="card card-hover relative overflow-hidden"
        >
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary to-secondary" />
          <div className="flex items-center gap-4">
            <div className={cn(
              'w-12 h-12 rounded-xl flex items-center justify-center',
              serviceStatus.running ? 'bg-success/10' : 'bg-surface-light'
            )}>
              <Zap className={cn('w-6 h-6', serviceStatus.running ? 'text-success' : 'text-text-muted')} />
            </div>
            <div>
              <div className="text-3xl font-bold font-mono text-text">{serviceStatus.activeMappings}</div>
              <div className="text-sm text-text-muted">活动映射</div>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="card card-hover"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <GitBranch className="w-6 h-6 text-primary" />
            </div>
            <div>
              <div className="text-3xl font-bold font-mono text-text">{serviceStatus.totalMappings}</div>
              <div className="text-sm text-text-muted">总映射数</div>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="card card-hover"
        >
          <div className="flex items-center gap-4">
            <div className={cn(
              'w-12 h-12 rounded-xl flex items-center justify-center',
              serviceStatus.deviceConnected ? 'bg-success/10' : 'bg-surface-light'
            )}>
              <Activity className={cn('w-6 h-6', serviceStatus.deviceConnected ? 'text-success' : 'text-text-muted')} />
            </div>
            <div>
              <div className="text-lg font-bold text-text">
                {serviceStatus.deviceConnected ? '已连接' : '未连接'}
              </div>
              <div className="text-sm text-text-muted">MIDI设备</div>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="card card-hover"
        >
          <div className="flex items-center gap-4">
            <div className={cn(
              'w-12 h-12 rounded-xl flex items-center justify-center',
              serviceStatus.running ? 'bg-primary/10' : 'bg-surface-light'
            )}>
              <Clock className={cn('w-6 h-6', serviceStatus.running ? 'text-primary' : 'text-text-muted')} />
            </div>
            <div>
              <div className="text-xl font-bold font-mono text-text">{formatUptime(uptime)}</div>
              <div className="text-sm text-text-muted">运行时间</div>
            </div>
          </div>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ServiceControl
          status={serviceStatus}
          onStart={handleStartService}
          onStop={handleStopService}
        />

        <DevicePanel
          devices={devices}
          connectedDeviceIds={connectedDeviceIds}
          onConnectDevice={connectDevice}
          onDisconnectDevice={disconnectDevice}
          onRefresh={refreshDevices}
          loading={loading}
          error={error}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.5 }}
          className="card"
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-text">实时 MIDI 消息</h2>
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" />
              <span className="text-xs text-text-muted">实时</span>
            </div>
          </div>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {recentMessages.length === 0 ? (
              <div className="text-center py-8 text-text-muted">
                <Music className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>等待MIDI消息...</p>
                <p className="text-sm mt-1">操作MIDI控制器以查看消息</p>
              </div>
            ) : (
              recentMessages.map((msg, index) => (
                <motion.div
                  key={`${msg.timestamp}-${index}`}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="flex items-center justify-between p-3 rounded-lg bg-surface-light border border-border font-mono text-sm"
                >
                  <div className="flex items-center gap-3">
                    <span className={cn(
                      'px-2 py-1 rounded text-xs font-medium',
                      msg.type === 'noteOn' ? 'bg-primary/20 text-primary' :
                      msg.type === 'cc' ? 'bg-secondary/20 text-secondary' :
                      'bg-accent/20 text-accent'
                    )}>
                      {msg.type}
                    </span>
                    <span className="text-text">{getMidiMessageDisplay(msg)}</span>
                  </div>
                  <span className="text-text-muted text-xs">
                    {new Date(msg.timestamp).toLocaleTimeString()}
                  </span>
                </motion.div>
              ))
            )}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.6 }}
          className="card"
        >
          <div className="flex items-center gap-2 mb-4">
            <Terminal className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold text-text">系统日志</h2>
          </div>
          <div className="bg-background rounded-lg p-4 max-h-64 overflow-y-auto font-mono text-sm">
            {logs.length === 0 ? (
              <div className="text-text-muted">暂无日志...</div>
            ) : (
              [...logs].reverse().slice(0, 50).map((log, index) => (
                <div key={index} className="flex gap-3 py-1">
                  <span className="text-text-muted text-xs">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>
                  <span className={cn(
                    'px-2 py-0.5 rounded text-xs font-medium',
                    log.level === 'error' ? 'bg-error/20 text-error' :
                    log.level === 'warn' ? 'bg-warning/20 text-warning' :
                    log.level === 'info' ? 'bg-primary/20 text-primary' :
                    'bg-surface-light text-text-muted'
                  )}>
                    {log.level}
                  </span>
                  <span className="text-text">{log.message}</span>
                </div>
              ))
            )}
          </div>
        </motion.div>
      </div>
    </div>
  )
}
