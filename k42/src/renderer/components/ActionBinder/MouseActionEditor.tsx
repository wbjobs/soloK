import { useState } from 'react';
import { motion } from 'framer-motion';
import { MousePointer2, MousePointerClick, Move, Scroll, Crosshair, Clock } from 'lucide-react';
import type { Action, MouseClickAction, MouseDragAction, MouseScrollAction } from '@shared/index';
import { cn } from '@/lib/utils';

type MouseActionType = 'mouseClick' | 'mouseDrag' | 'mouseScroll';

interface MouseActionEditorProps {
  value?: Action | null;
  onChange?: (action: Action) => void;
  className?: string;
}

const actionTypes: { type: MouseActionType; label: string; icon: typeof MousePointerClick; description: string }[] = [
  { type: 'mouseClick', label: '鼠标点击', icon: MousePointerClick, description: '模拟鼠标点击' },
  { type: 'mouseDrag', label: '鼠标拖拽', icon: Move, description: '从A点拖拽到B点' },
  { type: 'mouseScroll', label: '鼠标滚动', icon: Scroll, description: '模拟滚轮滚动' },
];

export default function MouseActionEditor({
  value,
  onChange,
  className,
}: MouseActionEditorProps) {
  const [selectedType, setSelectedType] = useState<MouseActionType>(
    (value?.type as MouseActionType) || 'mouseClick'
  );

  const handleTypeChange = (type: MouseActionType) => {
    setSelectedType(type);
    if (onChange) {
      switch (type) {
        case 'mouseClick':
          onChange({ type: 'mouseClick', button: 'left' });
          break;
        case 'mouseDrag':
          onChange({ type: 'mouseDrag', fromX: 0, fromY: 0, toX: 100, toY: 100, button: 'left' });
          break;
        case 'mouseScroll':
          onChange({ type: 'mouseScroll', direction: 'down', amount: 1 });
          break;
      }
    }
  };

  const renderClickEditor = () => {
    const action = (value as MouseClickAction) || { type: 'mouseClick', button: 'left' };
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-2">
          {(['left', 'right', 'middle'] as const).map((btn) => (
            <button
              key={btn}
              onClick={() => onChange?.({ ...action, button: btn })}
              className={cn(
                'py-2 px-3 rounded-lg border text-sm font-medium transition-all',
                action.button === btn
                  ? 'bg-primary/10 border-primary/50 text-primary'
                  : 'bg-surface border-border text-text-muted hover:border-primary/30 hover:text-text'
              )}
            >
              {btn === 'left' ? '左键' : btn === 'right' ? '右键' : '中键'}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={action.doubleClick ?? false}
            onChange={(e) => onChange?.({ ...action, doubleClick: e.target.checked })}
            className="w-4 h-4 rounded border-border bg-surface text-primary focus:ring-primary"
          />
          <span className="text-sm text-text">双击</span>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs text-text-muted">X 坐标 (可选)</label>
            <div className="flex items-center gap-2">
              <Crosshair className="w-4 h-4 text-text-muted" />
              <input
                type="number"
                value={action.x ?? ''}
                placeholder="屏幕X"
                onChange={(e) =>
                  onChange?.({
                    ...action,
                    x: e.target.value ? parseInt(e.target.value) : undefined,
                  })
                }
                className="flex-1 px-3 py-2 bg-surface border border-border rounded-lg text-text text-sm focus:outline-none focus:border-primary"
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-text-muted">Y 坐标 (可选)</label>
            <div className="flex items-center gap-2">
              <Crosshair className="w-4 h-4 text-text-muted" />
              <input
                type="number"
                value={action.y ?? ''}
                placeholder="屏幕Y"
                onChange={(e) =>
                  onChange?.({
                    ...action,
                    y: e.target.value ? parseInt(e.target.value) : undefined,
                  })
                }
                className="flex-1 px-3 py-2 bg-surface border border-border rounded-lg text-text text-sm focus:outline-none focus:border-primary"
              />
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderDragEditor = () => {
    const action = (value as MouseDragAction) || {
      type: 'mouseDrag',
      fromX: 0,
      fromY: 0,
      toX: 100,
      toY: 100,
      button: 'left',
    };
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-2">
          {(['left', 'right', 'middle'] as const).map((btn) => (
            <button
              key={btn}
              onClick={() => onChange?.({ ...action, button: btn })}
              className={cn(
                'py-2 px-3 rounded-lg border text-sm font-medium transition-all',
                action.button === btn
                  ? 'bg-primary/10 border-primary/50 text-primary'
                  : 'bg-surface border-border text-text-muted hover:border-primary/30 hover:text-text'
              )}
            >
              {btn === 'left' ? '左键' : btn === 'right' ? '右键' : '中键'}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 rounded-lg bg-surface space-y-2">
            <div className="text-xs font-medium text-text-muted">起始位置</div>
            <div className="flex gap-2">
              <input
                type="number"
                value={action.fromX}
                onChange={(e) => onChange?.({ ...action, fromX: parseInt(e.target.value) || 0 })}
                className="flex-1 px-2 py-1.5 bg-surface-light border border-border rounded text-text text-sm focus:outline-none focus:border-primary"
                placeholder="X"
              />
              <input
                type="number"
                value={action.fromY}
                onChange={(e) => onChange?.({ ...action, fromY: parseInt(e.target.value) || 0 })}
                className="flex-1 px-2 py-1.5 bg-surface-light border border-border rounded text-text text-sm focus:outline-none focus:border-primary"
                placeholder="Y"
              />
            </div>
          </div>
          <div className="p-3 rounded-lg bg-surface space-y-2">
            <div className="text-xs font-medium text-text-muted">目标位置</div>
            <div className="flex gap-2">
              <input
                type="number"
                value={action.toX}
                onChange={(e) => onChange?.({ ...action, toX: parseInt(e.target.value) || 0 })}
                className="flex-1 px-2 py-1.5 bg-surface-light border border-border rounded text-text text-sm focus:outline-none focus:border-primary"
                placeholder="X"
              />
              <input
                type="number"
                value={action.toY}
                onChange={(e) => onChange?.({ ...action, toY: parseInt(e.target.value) || 0 })}
                className="flex-1 px-2 py-1.5 bg-surface-light border border-border rounded text-text text-sm focus:outline-none focus:border-primary"
                placeholder="Y"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Clock className="w-4 h-4 text-text-muted" />
          <span className="text-sm text-text-muted whitespace-nowrap">拖拽时长</span>
          <input
            type="number"
            min="0"
            max="5000"
            step="100"
            value={action.duration ?? ''}
            placeholder="毫秒"
            onChange={(e) =>
              onChange?.({
                ...action,
                duration: e.target.value ? parseInt(e.target.value) : undefined,
              })
            }
            className="flex-1 px-3 py-2 bg-surface border border-border rounded-lg text-text text-sm focus:outline-none focus:border-primary"
          />
          <span className="text-xs text-text-muted">ms</span>
        </div>
      </div>
    );
  };

  const renderScrollEditor = () => {
    const action = (value as MouseScrollAction) || {
      type: 'mouseScroll',
      direction: 'down',
      amount: 1,
    };
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-4 gap-2">
          {(['up', 'down', 'left', 'right'] as const).map((dir) => (
            <button
              key={dir}
              onClick={() => onChange?.({ ...action, direction: dir })}
              className={cn(
                'py-2 px-3 rounded-lg border text-sm font-medium transition-all flex flex-col items-center gap-1',
                action.direction === dir
                  ? 'bg-primary/10 border-primary/50 text-primary'
                  : 'bg-surface border-border text-text-muted hover:border-primary/30 hover:text-text'
              )}
            >
              <Scroll
                className={cn('w-4 h-4', {
                  '-rotate-90': dir === 'left',
                  'rotate-90': dir === 'right',
                  'rotate-180': dir === 'up',
                })}
              />
              {dir === 'up' ? '上' : dir === 'down' ? '下' : dir === 'left' ? '左' : '右'}
            </button>
          ))}
        </div>

        <div className="space-y-1">
          <label className="text-xs text-text-muted">滚动量 (滚动单位)</label>
          <input
            type="number"
            min="1"
            max="100"
            value={action.amount}
            onChange={(e) => onChange?.({ ...action, amount: parseInt(e.target.value) || 1 })}
            className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-text text-sm focus:outline-none focus:border-primary"
          />
          <div className="text-xs text-text-muted">
            正值表示向{action.direction}滚动，数值越大滚动距离越长
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center gap-2 mb-2">
        <MousePointer2 className="w-5 h-5 text-secondary" />
        <span className="font-medium text-text">鼠标动作</span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {actionTypes.map(({ type, label, icon: Icon, description }) => (
          <motion.button
            key={type}
            whileHover={{ scale: selectedType === type ? 1 : 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => handleTypeChange(type)}
            className={cn(
              'p-3 rounded-xl border transition-all text-left',
              selectedType === type
                ? 'bg-secondary/10 border-secondary/50 shadow-glow-secondary'
                : 'bg-surface-light border-border hover:border-secondary/30'
            )}
          >
            <Icon
              className={cn(
                'w-5 h-5 mb-1',
                selectedType === type ? 'text-secondary' : 'text-text-muted'
              )}
            />
            <div
              className={cn(
                'text-sm font-medium',
                selectedType === type ? 'text-secondary' : 'text-text'
              )}
            >
              {label}
            </div>
            <div className="text-xs text-text-muted">{description}</div>
          </motion.button>
        ))}
      </div>

      <div className="p-4 rounded-xl bg-surface-light border border-border">
        {selectedType === 'mouseClick' && renderClickEditor()}
        {selectedType === 'mouseDrag' && renderDragEditor()}
        {selectedType === 'mouseScroll' && renderScrollEditor()}
      </div>
    </div>
  );
}
