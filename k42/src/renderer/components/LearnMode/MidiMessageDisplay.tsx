import { motion } from 'framer-motion';
import { Music, Sliders, RotateCcw, Gauge } from 'lucide-react';
import type { MidiMessage } from '@shared/index';
import { getNoteName, NOTE_NAMES } from '@shared/index';
import { cn } from '@/lib/utils';
import WaveformAnimation from '../common/WaveformAnimation';
import { formatVelocity, formatControlValue, formatPitchBendValue, getChannelDisplay } from '../../utils/midi';

interface MidiMessageDisplayProps {
  message: MidiMessage | null;
  className?: string;
}

const typeConfig = {
  noteOn: {
    icon: Music,
    label: '音符开',
    color: 'success',
    bgColor: 'bg-success/10',
    borderColor: 'border-success/30',
    textColor: 'text-success',
  },
  noteOff: {
    icon: Music,
    label: '音符关',
    color: 'warning',
    bgColor: 'bg-warning/10',
    borderColor: 'border-warning/30',
    textColor: 'text-warning',
  },
  cc: {
    icon: Sliders,
    label: '控制改变',
    color: 'primary',
    bgColor: 'bg-primary/10',
    borderColor: 'border-primary/30',
    textColor: 'text-primary',
  },
  pitchBend: {
    icon: RotateCcw,
    label: '弯音轮',
    color: 'secondary',
    bgColor: 'bg-secondary/10',
    borderColor: 'border-secondary/30',
    textColor: 'text-secondary',
  },
  aftertouch: {
    icon: Gauge,
    label: '触后',
    color: 'accent',
    bgColor: 'bg-accent/10',
    borderColor: 'border-accent/30',
    textColor: 'text-accent',
  },
  programChange: {
    icon: Sliders,
    label: '程序变更',
    color: 'info',
    bgColor: 'bg-primary/10',
    borderColor: 'border-primary/30',
    textColor: 'text-primary',
  },
};

export default function MidiMessageDisplay({ message, className }: MidiMessageDisplayProps) {
  if (!message) {
    return (
      <div className={cn(
        'p-6 rounded-xl border-2 border-dashed border-border bg-surface-light/50 text-center',
        className
      )}>
        <Music className="w-12 h-12 mx-auto mb-3 text-text-muted opacity-30" />
        <p className="text-text-muted">等待 MIDI 信号...</p>
        <p className="text-xs text-text-muted mt-1">按下控制器按键以显示详细信息</p>
      </div>
    );
  }

  const config = typeConfig[message.type];
  const Icon = config.icon;

  const getMainContent = () => {
    switch (message.type) {
      case 'noteOn':
      case 'noteOff':
        return (
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-lg bg-surface">
              <span className="text-sm text-text-muted">音符</span>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold font-mono text-text">
                  {getNoteName(message.note!)}
                </span>
                <span className="text-sm text-text-muted">
                  (MIDI {message.note})
                </span>
              </div>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-surface">
              <span className="text-sm text-text-muted">力度</span>
              <div className="flex items-center gap-3">
                <WaveformAnimation
                  intensity={message.velocity!}
                  color={config.color as 'primary' | 'success' | 'secondary' | 'accent'}
                  height={24}
                  barCount={8}
                />
                <span className="font-mono text-text">{formatVelocity(message.velocity!)}</span>
              </div>
            </div>
          </div>
        );
      case 'cc':
        return (
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-lg bg-surface">
              <span className="text-sm text-text-muted">控制器编号</span>
              <span className="text-xl font-bold font-mono text-text">
                CC #{message.controlNumber}
              </span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-surface">
              <span className="text-sm text-text-muted">当前值</span>
              <div className="flex items-center gap-3">
                <div className="w-32 h-2 bg-surface-light rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-primary rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${(message.controlValue! / 127) * 100}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
                <span className="font-mono text-text min-w-[80px] text-right">
                  {formatControlValue(message.controlValue!)}
                </span>
              </div>
            </div>
          </div>
        );
      case 'pitchBend':
        return (
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-lg bg-surface">
              <span className="text-sm text-text-muted">弯音值</span>
              <div className="flex items-center gap-3">
                <div className="w-32 h-2 bg-surface-light rounded-full overflow-hidden relative">
                  <div className="absolute left-1/2 top-0 bottom-0 w-px bg-border" />
                  <motion.div
                    className="h-full bg-secondary rounded-full absolute top-0 bottom-0"
                    initial={{ left: '50%', right: '50%' }}
                    animate={{
                      left: message.pitchBendValue! >= 0 ? '50%' : `${50 + (message.pitchBendValue! / 8192) * 50}%`,
                      right: message.pitchBendValue! <= 0 ? '50%' : `${50 - (message.pitchBendValue! / 8192) * 50}%`,
                    }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
                <span className="font-mono text-text min-w-[100px] text-right">
                  {formatPitchBendValue(message.pitchBendValue!)}
                </span>
              </div>
            </div>
          </div>
        );
      case 'aftertouch':
        return (
          <div className="flex items-center justify-between p-3 rounded-lg bg-surface">
            <span className="text-sm text-text-muted">触后压力</span>
            <div className="flex items-center gap-3">
              <WaveformAnimation
                intensity={message.velocity!}
                color="accent"
                height={24}
                barCount={8}
              />
              <span className="font-mono text-text">{formatVelocity(message.velocity!)}</span>
            </div>
          </div>
        );
      case 'programChange':
        return (
          <div className="flex items-center justify-between p-3 rounded-lg bg-surface">
            <span className="text-sm text-text-muted">程序编号</span>
            <span className="text-xl font-bold font-mono text-text">
              #{message.note}
            </span>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'p-5 rounded-xl border',
        config.bgColor,
        config.borderColor,
        className
      )}
    >
      <div className="flex items-center gap-3 mb-4">
        <div className={cn('p-2 rounded-lg', config.bgColor)}>
          <Icon className={cn('w-5 h-5', config.textColor)} />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-text">{config.label}</span>
            <span className="px-2 py-0.5 text-xs rounded bg-surface text-text-muted font-mono">
              {getChannelDisplay(message.channel)}
            </span>
          </div>
          <div className="text-xs text-text-muted">
            状态字节: 0x{message.status.toString(16).toUpperCase().padStart(2, '0')}
          </div>
        </div>
      </div>

      {getMainContent()}

      <div className="mt-4 pt-4 border-t border-border/50">
        <div className="flex items-center justify-between text-xs text-text-muted">
          <span>音符映射</span>
          <span className="font-mono">
            {NOTE_NAMES.join(' ')}
          </span>
        </div>
      </div>
    </motion.div>
  );
}
