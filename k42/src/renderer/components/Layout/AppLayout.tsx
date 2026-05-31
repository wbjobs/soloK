import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import TitleBar from './TitleBar'
import Sidebar from './Sidebar'
import { ServiceStatus, IpcChannel } from '@shared/index'

interface AppLayoutProps {
  children: React.ReactNode
}

export default function AppLayout({ children }: AppLayoutProps) {
  const [serviceStatus, setServiceStatus] = useState<ServiceStatus>({
    running: false,
    deviceConnected: false,
    activeMappings: 0,
    totalMappings: 0,
    connectedDevices: [],
  })

  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.send(IpcChannel.SERVICE_STATUS)

      const handleStatusChange = (...args: unknown[]) => {
        const status = args[1] as ServiceStatus
        setServiceStatus(status)
      }

      window.electronAPI.on(IpcChannel.SERVICE_STATUS_CHANGED, handleStatusChange)

      return () => {
        if (window.electronAPI) {
          window.electronAPI.removeListener(IpcChannel.SERVICE_STATUS_CHANGED, handleStatusChange)
        }
      }
    }
  }, [])

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      <TitleBar />

      <div className="flex-1 flex overflow-hidden">
        <Sidebar
          deviceConnected={serviceStatus.deviceConnected}
          serviceRunning={serviceStatus.running}
        />

        <main className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-6 grid-bg">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5 }}
              className="h-full max-w-7xl mx-auto"
            >
              {children}
            </motion.div>
          </div>
        </main>
      </div>
    </div>
  )
}
