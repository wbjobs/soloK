import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Folder,
  Pencil,
  Trash2,
  Check,
  X,
  GitBranch,
  Calendar,
  MoreVertical,
} from 'lucide-react';
import type { Profile } from '@shared/index';
import { cn } from '@/lib/utils';
import StatusBadge from '../common/StatusBadge';

interface ProfileCardProps {
  profile: Profile;
  isActive: boolean;
  onSelect: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onDuplicate?: (profile: Profile) => void;
  className?: string;
}

export default function ProfileCard({
  profile,
  isActive,
  onSelect,
  onRename,
  onDelete,
  onDuplicate,
  className,
}: ProfileCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(profile.name);
  const [showMenu, setShowMenu] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleSave = () => {
    const trimmedName = editName.trim();
    if (trimmedName && trimmedName !== profile.name) {
      onRename(profile.id, trimmedName);
    } else {
      setEditName(profile.name);
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditName(profile.name);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ scale: 1.02 }}
      className={cn(
        'relative p-4 rounded-xl border transition-all cursor-pointer',
        isActive
          ? 'bg-primary/5 border-primary/50 shadow-glow-primary'
          : 'bg-surface border-border hover:border-primary/30',
        className
      )}
      onClick={() => !isEditing && onSelect(profile.id)}
    >
      {isActive && (
        <div className="absolute top-3 right-3">
          <div className="p-1 rounded-full bg-primary/20">
            <Check className="w-4 h-4 text-primary" />
          </div>
        </div>
      )}

      <div className="flex items-start gap-3 mb-3">
        <div
          className={cn(
            'p-2 rounded-lg flex-shrink-0',
            isActive ? 'bg-primary/10' : 'bg-surface-light'
          )}
        >
          <Folder
            className={cn(
              'w-6 h-6',
              isActive ? 'text-primary' : 'text-text-muted'
            )}
          />
        </div>

        <div className="flex-1 min-w-0">
          {isEditing ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={handleKeyDown}
                onClick={(e) => e.stopPropagation()}
                className="flex-1 px-2 py-1 bg-surface border border-primary rounded text-text text-sm font-medium focus:outline-none"
                autoFocus
              />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleSave();
                }}
                className="p-1 rounded bg-primary/10 text-primary hover:bg-primary/20"
              >
                <Check className="w-4 h-4" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleCancel();
                }}
                className="p-1 rounded bg-surface-light text-text-muted hover:bg-surface-hover"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <>
              <h4
                className={cn(
                  'font-medium truncate',
                  isActive ? 'text-primary' : 'text-text'
                )}
              >
                {profile.name}
              </h4>
              {profile.description && (
                <p className="text-xs text-text-muted truncate">
                  {profile.description}
                </p>
              )}
            </>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <GitBranch className="w-3.5 h-3.5" />
          <span>{profile.mappings.length} 条映射规则</span>
        </div>

        <div className="flex items-center gap-2 text-xs text-text-muted">
          <Calendar className="w-3.5 h-3.5" />
          <span>更新于 {new Date(profile.updatedAt).toLocaleDateString('zh-CN')}</span>
        </div>
      </div>

      <div className="flex items-center justify-between mt-4 pt-3 border-t border-border/50">
        {isActive ? (
          <StatusBadge status="success" text="当前使用" pulse showDot={false} />
        ) : (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onSelect(profile.id);
            }}
            className="text-xs text-primary hover:text-primary-dark font-medium"
          >
            切换到此配置
          </button>
        )}

        <div className="relative">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowMenu(!showMenu);
            }}
            className="p-1.5 rounded text-text-muted hover:text-text hover:bg-surface-hover transition-colors"
          >
            <MoreVertical className="w-4 h-4" />
          </button>

          {showMenu && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowMenu(false);
                }}
              />
              <motion.div
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                className="absolute right-0 top-full mt-1 w-36 py-1 bg-surface border border-border rounded-lg shadow-xl z-20"
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsEditing(true);
                    setShowMenu(false);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-text hover:bg-surface-hover transition-colors"
                >
                  <Pencil className="w-4 h-4" />
                  重命名
                </button>
                {onDuplicate && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDuplicate(profile);
                      setShowMenu(false);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-text hover:bg-surface-hover transition-colors"
                  >
                    <Folder className="w-4 h-4" />
                    复制
                  </button>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowDeleteConfirm(true);
                    setShowMenu(false);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-error hover:bg-error/10 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  删除
                </button>
              </motion.div>
            </>
          )}
        </div>
      </div>

      {showDeleteConfirm && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute inset-0 bg-background/80 backdrop-blur-sm rounded-xl flex items-center justify-center z-30"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="text-center p-4">
            <p className="text-sm text-text mb-4">确定要删除此配置吗?</p>
            <div className="flex gap-2 justify-center">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowDeleteConfirm(false);
                }}
                className="px-4 py-2 bg-surface-light text-text rounded-lg text-sm font-medium hover:bg-surface-hover transition-colors"
              >
                取消
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(profile.id);
                }}
                className="px-4 py-2 bg-error text-background rounded-lg text-sm font-medium hover:bg-error/80 transition-colors"
              >
                删除
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}
