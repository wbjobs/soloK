import { useState } from 'react';
import { motion } from 'framer-motion';
import { Usb, RefreshCw, Check, AlertCircle, X } from 'lucide-react';
import type { MidiDevice } from '@shared/index';
import { cn } from '@/lib/utils';
import StatusBadge from '../common/StatusBadge';

interface DevicePanelProps {
  devices: MidiDevice[];
  connectedDeviceIds: string[];
  onConnectDevice: (deviceId: string) => Promise<boolean>;
  onDisconnectDevice: (deviceId: string) => Promise<boolean>;
  onRefresh?: () => void;
  loading?: boolean;
  error?: string | null;
  className?: string;
}

export default function DevicePanel({
  devices,
  connectedDeviceIds,
  onConnectDevice,
  onDisconnectDevice,
  onRefresh,
  loading = false,
  error = null,
  className,
}: DevicePanelProps) {
  const [refreshing, setRefreshing] = useState(false);
  const [connectingId, setConnectingId] = useState<string | null>(null);

  const handleRefresh = async () => {
    if (!onRefresh || refreshing) return;
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setTimeout(() => setRefreshing(false), 500);
    }
  };

  const handleDeviceClick = async (device: MidiDevice) => {
    if (connectingId) return;
    
    const isConnected = connectedDeviceIds.includes(device.id);
    setConnectingId(device.id);
    
    try {
      if (isConnected) {
        await onDisconnectDevice(device.id);
      } else {
        await onConnectDevice(device.id);
      }
    } finally {
      setConnectingId(null);
    }
  };

  const availableDevices = devices.filter((d) => d.connected);
  const historicalDevices = devices.filter((d) => !d.connected);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn('card', className)}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Usb className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-text">MIDI 设备</h3>
            <p className="text-sm text-text-muted">
              选择用于接收信号的 MIDI 控制器
            </p>
          </div>
        </div>
        {onRefresh && (
          <button
            onClick={handleRefresh}
            disabled={refreshing || loading}
            className="p-2 rounded-lg bg-surface-light text-text-muted hover:text-text hover:bg-surface-hover transition-all disabled:opacity-50"
          >
            <RefreshCw
              className={cn('w-5 h-5', refreshing && 'animate-spin')}
            />
          </button>
        )}
      </div>

      <div className="mb-3 px-1">
        <div className="flex items-center justify-between text-sm">
          <span className="text-text-muted">已连接设备</span>
          <span className="text-primary font-medium">{connectedDeviceIds.length}</span>
        </div>
      </div>

      {error && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="mb-4 p-3 rounded-lg bg-error/10 border border-error/30 flex items-center gap-3"
        >
          <AlertCircle className="w-5 h-5 text-error flex-shrink-0" />
          <span className="text-sm text-error">{error}</span>
        </motion.div>
      )}

      <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
        {loading ? (
          <div className="text-center py-8 text-text-muted">
            <RefreshCw className="w-8 h-8 mx-auto mb-2 animate-spin text-primary" />
            <p>正在扫描设备...</p>
          </div>
        ) : devices.length === 0 ? (
          <div className="text-center py-8 text-text-muted">
            <Usb className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>未检测到 MIDI 设备</p>
            <p className="text-sm mt-1">请连接设备后点击刷新</p>
          </div>
        ) : (
          <>
            {availableDevices.length > 0 && (
              <div className="space-y-2">
                {availableDevices.map((device, index) => {
                  const isConnected = connectedDeviceIds.includes(device.id);
                  const isConnecting = connectingId === device.id;
                  
                  return (
                    <motion.button
                      key={device.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.05 }}
                      onClick={() => handleDeviceClick(device)}
                      disabled={isConnecting}
                      className={cn(
                        'w-full flex items-center gap-3 p-3 rounded-xl border transition-all group',
                        isConnected
                          ? 'bg-primary/10 border-primary/50 shadow-glow-primary'
                          : 'bg-surface-light border-border hover:border-primary/30 hover:bg-surface-hover',
                        isConnecting && 'opacity-50 cursor-wait'
                      )}
                    >
                      <div
                        className={cn(
                          'w-2 h-2 rounded-full flex-shrink-0',
                          isConnected ? 'bg-success animate-pulse' : 'bg-text-muted'
                        )}
                      />
                      <div className="flex-1 min-w-0 text-left">
                        <div
                          className={cn(
                            'font-medium truncate',
                            isConnected ? 'text-primary' : 'text-text'
                          )}
                        >
                          {device.name}
                        </div>
                        {device.manufacturer && (
                          <div className="text-xs text-text-muted truncate">
                            {device.manufacturer}
                          </div>
                        )}
                      </div>
                      {isConnected ? (
                        <div className="flex items-center gap-2">
                          <Check className="w-5 h-5 text-primary flex-shrink-0" />
                          <X 
                            className="w-4 h-4 text-text-muted hover:text-error opacity-0 group-hover:opacity-100 transition-opacity" 
                          />
                        </div>
                      ) : (
                        <StatusBadge status="idle" text="点击连接" showDot={false} />
                      )}
                    </motion.button>
                  );
                })}
              </div>
            )}

            {historicalDevices.length > 0 && (
              <div className="space-y-2 mt-4">
                <p className="text-xs font-medium text-text-muted uppercase tracking-wider px-1">
                  历史设备 ({historicalDevices.length})
                </p>
                {historicalDevices.map((device, index) => (
                  <motion.div
                    key={device.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: (availableDevices.length + index) * 0.05 }}
                    className="w-full flex items-center gap-3 p-3 rounded-xl border border-border bg-surface-light/50 opacity-60"
                  >
                    <div className="w-2 h-2 rounded-full bg-text-muted flex-shrink-0" />
                    <div className="flex-1 min-w-0 text-left">
                      <div className="font-medium text-text-muted truncate">
                        {device.name}
                      </div>
                      {device.manufacturer && (
                        <div className="text-xs text-text-muted/70 truncate">
                          {device.manufacturer}
                        </div>
                      )}
                    </div>
                    <StatusBadge status="idle" text="离线" showDot={false} />
                  </motion.div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </motion.div>
  );
}
