import { motion } from 'framer-motion';
import { Play, Square, Activity, Zap, AlertTriangle } from 'lucide-react';
import type { ServiceStatus } from '@shared/index';
import { cn } from '@/lib/utils';
import StatusBadge from '../common/StatusBadge';
import WaveformAnimation from '../common/WaveformAnimation';

interface ServiceControlProps {
  status: ServiceStatus;
  onStart: () => void;
  onStop: () => void;
  className?: string;
}

export default function ServiceControl({
  status,
  onStart,
  onStop,
  className,
}: ServiceControlProps) {
  const { running, deviceConnected, activeMappings, totalMappings, lastMessage } = status;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn('card', className)}
    >
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className={cn(
            'p-3 rounded-xl',
            running ? 'bg-success/10' : 'bg-surface-light'
          )}>
            <Activity className={cn(
              'w-6 h-6',
              running ? 'text-success' : 'text-text-muted'
            )} />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-text">映射服务</h3>
            <p className="text-sm text-text-muted">
              MIDI 信号转键盘/鼠标动作引擎
            </p>
          </div>
        </div>
        <StatusBadge
          status={running ? 'success' : deviceConnected ? 'idle' : 'warning'}
          text={running ? '运行中' : deviceConnected ? '已就绪' : '设备未连接'}
          pulse={running}
        />
      </div>

      {running && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="mb-6 p-4 rounded-xl bg-surface-light neon-border"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Zap className="w-5 h-5 text-primary" />
              <span className="text-sm font-medium text-text">实时信号</span>
            </div>
            <WaveformAnimation
              intensity={lastMessage?.velocity ?? 0}
              color={lastMessage ? 'success' : 'primary'}
              height={30}
              barCount={12}
            />
          </div>
          {lastMessage && (
            <div className="mt-2 text-xs font-mono text-text-muted">
              最后消息: {lastMessage.type} CH{lastMessage.channel + 1}
              {lastMessage.note !== undefined && ` Note ${lastMessage.note}`}
              {lastMessage.velocity !== undefined && ` Vel ${lastMessage.velocity}`}
            </div>
          )}
        </motion.div>
      )}

      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="p-4 rounded-xl bg-surface-light">
          <div className="text-xs text-text-muted mb-1">活动映射</div>
          <div className="text-2xl font-bold text-primary font-mono">
            {activeMappings}
            <span className="text-sm text-text-muted font-normal ml-1">/ {totalMappings}</span>
          </div>
        </div>
        <div className="p-4 rounded-xl bg-surface-light">
          <div className="text-xs text-text-muted mb-1">设备状态</div>
          <div className="flex items-center gap-2">
            <span className={cn(
              'w-2 h-2 rounded-full',
              deviceConnected ? 'bg-success animate-pulse' : 'bg-error'
            )} />
            <span className={cn(
              'text-lg font-semibold',
              deviceConnected ? 'text-success' : 'text-error'
            )}>
              {deviceConnected ? '已连接' : '未连接'}
            </span>
          </div>
        </div>
      </div>

      {!deviceConnected && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mb-4 p-3 rounded-lg bg-warning/10 border border-warning/30 flex items-center gap-3"
        >
          <AlertTriangle className="w-5 h-5 text-warning flex-shrink-0" />
          <span className="text-sm text-warning">请先选择并连接 MIDI 设备</span>
        </motion.div>
      )}

      <div className="flex gap-3">
        {!running ? (
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={onStart}
            disabled={!deviceConnected}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-medium transition-all',
              deviceConnected
                ? 'bg-primary text-background hover:bg-primary-dark hover:shadow-glow-primary'
                : 'bg-surface-light text-text-muted cursor-not-allowed'
            )}
          >
            <Play className="w-5 h-5" />
            启动服务
          </motion.button>
        ) : (
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={onStop}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-medium bg-error/10 text-error border border-error/30 hover:bg-error/20 hover:border-error/50 transition-all"
          >
            <Square className="w-5 h-5" />
            停止服务
          </motion.button>
        )}
      </div>
    </motion.div>
  );
}
