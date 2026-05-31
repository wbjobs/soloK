import { motion } from 'framer-motion';
import { Keyboard, Circle, Square, RotateCcw, Clock, Timer } from 'lucide-react';
import type { KeyboardAction } from '@shared/index';
import { cn } from '@/lib/utils';
import useKeyboardCapture from '../../hooks/useKeyboardCapture';
import { keysToDisplay } from '../../utils/keyboard';

interface KeyboardActionEditorProps {
  value?: KeyboardAction | null;
  onChange?: (action: KeyboardAction) => void;
  onCapture?: (action: KeyboardAction) => void;
  disabled?: boolean;
  className?: string;
}

export default function KeyboardActionEditor({
  value,
  onChange,
  onCapture,
  disabled = false,
  className,
}: KeyboardActionEditorProps) {
  const {
    capturing,
    currentKeys,
    capturedKeys,
    capturedAction,
    displayText,
    timeRemaining,
    startCapture,
    stopCapture,
    resetCapture,
  } = useKeyboardCapture({
    onCapture: (keys, action) => {
      if (onChange) onChange(action);
      if (onCapture) onCapture(action);
    },
  });

  const displayKeys = value?.keys || capturedKeys;
  const hasValue = displayKeys.length > 0;

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center gap-2 mb-2">
        <Keyboard className="w-5 h-5 text-primary" />
        <span className="font-medium text-text">键盘动作</span>
      </div>

      <div
        className={cn(
          'p-4 rounded-xl border-2 transition-all',
          capturing
            ? 'border-primary bg-primary/10'
            : hasValue
            ? 'border-success/30 bg-success/5'
            : 'border-border bg-surface-light'
        )}
      >
        {capturing ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-primary">
                <Circle className="w-5 h-5 animate-pulse fill-primary" />
                <span className="font-medium">录制中...</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-text-muted">
                <Clock className="w-4 h-4" />
                <span className="font-mono">{(timeRemaining / 1000).toFixed(1)}s</span>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 min-h-[48px] items-center">
              {currentKeys.length > 0 ? (
                currentKeys.map((key, index) => (
                  <motion.span
                    key={index}
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="px-3 py-1.5 bg-primary text-background rounded-lg font-mono text-sm font-medium shadow-glow-primary"
                  >
                    {keysToDisplay([key])}
                  </motion.span>
                ))
              ) : (
                <span className="text-text-muted text-sm">按下你想要的快捷键组合...</span>
              )}
            </div>

            <button
              onClick={stopCapture}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-error/10 text-error border border-error/30 hover:bg-error/20 transition-all"
            >
              <Square className="w-4 h-4" />
              停止录制
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2 min-h-[48px] items-center">
              {hasValue ? (
                displayKeys.map((key, index) => (
                  <motion.span
                    key={index}
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: index * 0.05 }}
                    className="px-3 py-1.5 bg-primary/10 text-primary rounded-lg font-mono text-sm font-medium border border-primary/30"
                  >
                    {keysToDisplay([key])}
                  </motion.span>
                ))
              ) : (
                <span className="text-text-muted text-sm">未设置快捷键</span>
              )}
            </div>

            {displayText && !hasValue && (
              <div className="text-sm font-mono text-success">
                已捕获: {displayText}
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={startCapture}
                disabled={disabled}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg font-medium transition-all',
                  disabled
                    ? 'bg-surface-light text-text-muted cursor-not-allowed'
                    : 'bg-primary text-background hover:bg-primary-dark hover:shadow-glow-primary'
                )}
              >
                <Circle className="w-4 h-4 fill-primary" />
                {hasValue ? '重新录制' : '录制快捷键'}
              </button>
              {hasValue && (
                <button
                  onClick={() => {
                    resetCapture();
                    if (onChange) onChange({ type: 'keyboard', keys: [] });
                  }}
                  className="p-2.5 rounded-lg bg-surface-light text-text-muted hover:text-text hover:bg-surface-hover transition-all"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {hasValue && (
        <div className="space-y-3 p-4 rounded-xl bg-surface-light">
          <div className="flex items-center gap-2">
            <Timer className="w-4 h-4 text-text-muted" />
            <span className="text-sm font-medium text-text">高级选项</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={value?.hold ?? false}
                onChange={(e) => {
                  if (onChange && value) {
                    onChange({ ...value, hold: e.target.checked });
                  } else if (onChange && capturedAction) {
                    onChange({ ...capturedAction, hold: e.target.checked });
                  }
                }}
                className="w-4 h-4 rounded border-border bg-surface text-primary focus:ring-primary"
              />
              <span className="text-sm text-text">按住模式</span>
            </label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-text-muted whitespace-nowrap">持续时间</span>
              <input
                type="number"
                min="0"
                max="5000"
                step="100"
                value={value?.duration ?? ''}
                placeholder="ms"
                onChange={(e) => {
                  if (onChange && value) {
                    onChange({
                      ...value,
                      duration: e.target.value ? parseInt(e.target.value) : undefined,
                    });
                  } else if (onChange && capturedAction) {
                    onChange({
                      ...capturedAction,
                      duration: e.target.value ? parseInt(e.target.value) : undefined,
                    });
                  }
                }}
                className="flex-1 px-3 py-1.5 text-sm bg-surface border border-border rounded-lg text-text focus:outline-none focus:border-primary"
              />
              <span className="text-xs text-text-muted">ms</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
