import { motion } from 'framer-motion';
import { Radio, Check, X, Timer } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LearnModeButtonProps {
  learning: boolean;
  learned: boolean;
  timeRemaining: number;
  timeoutMs?: number;
  onStart: () => void;
  onStop: () => void;
  onReset?: () => void;
  disabled?: boolean;
  className?: string;
}

export default function LearnModeButton({
  learning,
  learned,
  timeRemaining,
  timeoutMs = 10000,
  onStart,
  onStop,
  onReset,
  disabled = false,
  className,
}: LearnModeButtonProps) {
  const progress = (timeRemaining / timeoutMs) * 100;
  const displaySeconds = (timeRemaining / 1000).toFixed(1);

  if (learned) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className={cn('flex items-center gap-3', className)}
      >
        <div className="flex items-center gap-2 px-4 py-2 bg-success/10 border border-success/30 rounded-xl">
          <Check className="w-5 h-5 text-success" />
          <span className="text-sm font-medium text-success">学习成功</span>
        </div>
        {onReset && (
          <button
            onClick={onReset}
            className="p-2 rounded-lg bg-surface-light text-text-muted hover:text-text hover:bg-surface-hover transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </motion.div>
    );
  }

  if (learning) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className={cn('flex items-center gap-4', className)}
      >
        <div className="relative">
          <motion.div
            className="w-14 h-14 rounded-full bg-primary/20 flex items-center justify-center"
            animate={{
              boxShadow: [
                '0 0 20px rgba(0, 217, 255, 0.3)',
                '0 0 40px rgba(0, 217, 255, 0.6)',
                '0 0 20px rgba(0, 217, 255, 0.3)',
              ],
            }}
            transition={{
              duration: 1.5,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          >
            <svg className="absolute inset-0 w-full h-full -rotate-90">
              <circle
                cx="28"
                cy="28"
                r="24"
                fill="none"
                stroke="rgba(0, 217, 255, 0.2)"
                strokeWidth="3"
              />
              <motion.circle
                cx="28"
                cy="28"
                r="24"
                fill="none"
                stroke="#00d9ff"
                strokeWidth="3"
                strokeLinecap="round"
                initial={{ pathLength: 1 }}
                animate={{ pathLength: progress / 100 }}
                transition={{ duration: 0.1, ease: 'linear' }}
                style={{
                  strokeDasharray: 150.8,
                }}
              />
            </svg>
            <motion.div
              animate={{
                scale: [1, 1.1, 1],
                opacity: [0.8, 1, 0.8],
              }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
              className="z-10"
            >
              <Radio className="w-6 h-6 text-primary" />
            </motion.div>
          </motion.div>
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 text-primary">
            <Timer className="w-4 h-4" />
            <span className="text-sm font-medium">学习模式进行中...</span>
          </div>
          <div className="text-lg font-bold font-mono text-primary neon-text">
            {displaySeconds}s
          </div>
          <p className="text-xs text-text-muted mt-1">
            请按下 MIDI 控制器上的按键或旋钮
          </p>
        </div>
        <button
          onClick={onStop}
          className="p-3 rounded-xl bg-error/10 text-error border border-error/30 hover:bg-error/20 transition-all"
        >
          <X className="w-5 h-5" />
        </button>
      </motion.div>
    );
  }

  return (
    <motion.button
      whileHover={{ scale: disabled ? 1 : 1.02 }}
      whileTap={{ scale: disabled ? 1 : 0.98 }}
      onClick={onStart}
      disabled={disabled}
      className={cn(
        'w-full flex items-center justify-center gap-3 p-4 rounded-xl border transition-all',
        disabled
          ? 'bg-surface-light border-border text-text-muted cursor-not-allowed'
          : 'bg-primary/10 border-primary/30 text-primary hover:bg-primary/20 hover:border-primary/50 hover:shadow-glow-primary'
      )}
    >
      <div className="relative">
        <Radio className="w-6 h-6" />
        {!disabled && (
          <motion.div
            className="absolute inset-0 rounded-full bg-primary/30"
            animate={{
              scale: [1, 1.5, 1],
              opacity: [0.6, 0, 0.6],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          />
        )}
      </div>
      <div className="text-left">
        <div className="font-medium">开始学习</div>
        <div className="text-xs opacity-70">点击后按下 MIDI 控制器按键</div>
      </div>
    </motion.button>
  );
}
