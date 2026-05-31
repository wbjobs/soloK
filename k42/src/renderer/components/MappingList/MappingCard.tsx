import { useState } from 'react';
import { motion } from 'framer-motion';
import { Music, Keyboard, MousePointer2, Pencil, Trash2, Power, GitBranch, Code, Zap } from 'lucide-react';
import type { MappingRule } from '@shared/index';
import { triggerToString, actionToString } from '@shared/index';
import { cn } from '@/lib/utils';
import WaveformAnimation from '../common/WaveformAnimation';

interface MappingCardProps {
  mapping: MappingRule;
  onToggle: (id: string, enabled: boolean) => void;
  onEdit: (mapping: MappingRule) => void;
  onDelete: (id: string) => void;
  onTest?: (mapping: MappingRule) => void;
  isActive?: boolean;
  className?: string;
}

export default function MappingCard({
  mapping,
  onToggle,
  onEdit,
  onDelete,
  onTest,
  isActive = false,
  className,
}: MappingCardProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const getActionIcon = () => {
    switch (mapping.action.type) {
      case 'keyboard':
        return <Keyboard className="w-4 h-4" />;
      case 'script':
        return <Code className="w-4 h-4" />;
      default:
        return <MousePointer2 className="w-4 h-4" />;
    }
  };

  const getActionColor = () => {
    switch (mapping.action.type) {
      case 'keyboard':
        return 'text-primary';
      case 'script':
        return 'text-accent';
      default:
        return 'text-secondary';
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      whileHover={{ scale: 1.01 }}
      className={cn(
        'group relative p-4 rounded-xl border transition-all',
        mapping.enabled
          ? isActive
            ? 'bg-primary/5 border-primary/50 shadow-glow-primary'
            : 'bg-surface border-border hover:border-primary/30'
          : 'bg-surface-light/50 border-border opacity-60',
        className
      )}
    >
      {isActive && (
        <div className="absolute right-4 top-4">
          <WaveformAnimation
            intensity={127}
            color="success"
            height={20}
            barCount={6}
          />
        </div>
      )}

      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              'p-2 rounded-lg',
              mapping.enabled ? 'bg-primary/10' : 'bg-surface-light'
            )}
          >
            <GitBranch
              className={cn(
                'w-5 h-5',
                mapping.enabled ? 'text-primary' : 'text-text-muted'
              )}
            />
          </div>
          <div className="flex-1 min-w-0">
            <h4
              className={cn(
                'font-medium truncate',
                mapping.enabled ? 'text-text' : 'text-text-muted'
              )}
            >
              {mapping.name}
            </h4>
            <div className="text-xs text-text-muted flex items-center gap-2">
              <Music className="w-3 h-3" />
              <span className="truncate font-mono">
                {triggerToString(mapping.midiTrigger)}
              </span>
            </div>
          </div>
        </div>

        <button
          onClick={() => onToggle(mapping.id, !mapping.enabled)}
          className={cn(
            'relative w-12 h-6 rounded-full transition-all flex-shrink-0',
            mapping.enabled ? 'bg-primary' : 'bg-surface-light border border-border'
          )}
        >
          <motion.div
            animate={{ x: mapping.enabled ? 24 : 2 }}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            className={cn(
              'absolute top-1 w-4 h-4 rounded-full',
              mapping.enabled ? 'bg-background' : 'bg-text-muted'
            )}
          />
        </button>
      </div>

      <div className="flex items-center gap-2 p-3 rounded-lg bg-surface-light/50 mb-2">
        <div className={cn('flex-shrink-0', getActionColor())}>
          {getActionIcon()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs text-text-muted mb-0.5">执行动作</div>
          <div className={cn('text-sm font-mono truncate', getActionColor())}>
            {actionToString(mapping.action)}
          </div>
        </div>
      </div>

      {mapping.condition?.enabled && (
        <div className="flex items-center gap-2 p-2 rounded-lg bg-accent/5 border border-accent/30 mb-3">
          <Zap className="w-3.5 h-3.5 text-accent flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-xs font-mono text-accent truncate">
              条件: {mapping.condition.code.substring(0, 60)}{mapping.condition.code.length > 60 ? '...' : ''}
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between text-xs text-text-muted">
        <span>
          创建于 {new Date(mapping.createdAt).toLocaleDateString('zh-CN')}
        </span>

        <div className="flex items-center gap-1">
          {showDeleteConfirm ? (
            <div className="flex items-center gap-2">
              <span className="text-error">确认删除?</span>
              <button
                onClick={() => onDelete(mapping.id)}
                className="p-1.5 rounded bg-error/10 text-error hover:bg-error/20 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="p-1.5 rounded bg-surface text-text-muted hover:bg-surface-hover transition-colors"
              >
                <Power className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <>
              {onTest && (
                <button
                  onClick={() => onTest(mapping)}
                  className="p-1.5 rounded text-text-muted hover:text-success hover:bg-success/10 transition-colors"
                  title="测试动作"
                >
                  <Power className="w-4 h-4" />
                </button>
              )}
              <button
                onClick={() => onEdit(mapping)}
                className="p-1.5 rounded text-text-muted hover:text-primary hover:bg-primary/10 transition-colors"
                title="编辑"
              >
                <Pencil className="w-4 h-4" />
              </button>
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="p-1.5 rounded text-text-muted hover:text-error hover:bg-error/10 transition-colors"
                title="删除"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      </div>
    </motion.div>
  );
}
