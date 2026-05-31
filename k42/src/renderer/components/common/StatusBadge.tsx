import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

type StatusType = 'success' | 'warning' | 'error' | 'info' | 'idle';

interface StatusBadgeProps {
  status: StatusType;
  text: string;
  showDot?: boolean;
  pulse?: boolean;
  className?: string;
}

const statusConfig: Record<StatusType, { dot: string; bg: string; text: string; border: string }> = {
  success: {
    dot: 'bg-success shadow-glow-success',
    bg: 'bg-success/10',
    text: 'text-success',
    border: 'border-success/30',
  },
  warning: {
    dot: 'bg-warning',
    bg: 'bg-warning/10',
    text: 'text-warning',
    border: 'border-warning/30',
  },
  error: {
    dot: 'bg-error shadow-glow-error',
    bg: 'bg-error/10',
    text: 'text-error',
    border: 'border-error/30',
  },
  info: {
    dot: 'bg-primary shadow-glow-primary',
    bg: 'bg-primary/10',
    text: 'text-primary',
    border: 'border-primary/30',
  },
  idle: {
    dot: 'bg-text-muted',
    bg: 'bg-surface-light',
    text: 'text-text-muted',
    border: 'border-border',
  },
};

export default function StatusBadge({ status, text, showDot = true, pulse = false, className }: StatusBadgeProps) {
  const config = statusConfig[status];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className={cn(
        'inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium border',
        config.bg,
        config.text,
        config.border,
        className
      )}
    >
      {showDot && (
        <span
          className={cn(
            'w-2 h-2 rounded-full flex-shrink-0',
            config.dot,
            pulse && 'animate-pulse'
          )}
        />
      )}
      <span>{text}</span>
    </motion.div>
  );
}
