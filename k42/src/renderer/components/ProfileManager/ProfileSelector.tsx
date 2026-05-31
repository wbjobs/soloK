import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FolderOpen, Plus, ChevronDown, Folder, Check, Settings } from 'lucide-react';
import type { Profile } from '@shared/index';
import { cn } from '@/lib/utils';

interface ProfileSelectorProps {
  profiles: Profile[];
  activeProfileId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onManage?: () => void;
  className?: string;
}

export default function ProfileSelector({
  profiles,
  activeProfileId,
  onSelect,
  onCreate,
  onManage,
  className,
}: ProfileSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);

  const activeProfile = profiles.find((p) => p.id === activeProfileId);

  return (
    <div className={cn('relative', className)}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-3 rounded-xl bg-surface border border-border hover:border-primary/30 transition-all"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <FolderOpen className="w-5 h-5 text-primary" />
          </div>
          <div className="text-left">
            <div className="text-xs text-text-muted">当前配置</div>
            <div className="font-medium text-text">
              {activeProfile?.name || '未选择配置'}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {activeProfile && (
            <span className="px-2 py-1 text-xs bg-primary/10 text-primary rounded font-mono">
              {activeProfile.mappings.length} 条映射
            </span>
          )}
          <ChevronDown
            className={cn(
              'w-5 h-5 text-text-muted transition-transform',
              isOpen && 'rotate-180'
            )}
          />
        </div>
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setIsOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="absolute top-full left-0 right-0 mt-2 bg-surface border border-border rounded-xl shadow-2xl z-50 overflow-hidden"
            >
              <div className="p-2">
              </div>

              <div className="max-h-64 overflow-y-auto p-2">
                {profiles.length === 0 ? (
                  <div className="py-8 text-center text-text-muted">
                    <Folder className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">暂无配置文件</p>
                    <p className="text-xs mt-1">点击下方按钮创建</p>
                  </div>
                ) : (
                  profiles.map((profile) => (
                    <motion.button
                      key={profile.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      onClick={() => {
                        onSelect(profile.id);
                        setIsOpen(false);
                      }}
                      className={cn(
                        'w-full flex items-center gap-3 p-3 rounded-lg transition-all mb-1',
                        profile.id === activeProfileId
                          ? 'bg-primary/10 text-primary'
                          : 'text-text hover:bg-surface-hover'
                      )}
                    >
                      <Folder
                        className={cn(
                          'w-5 h-5 flex-shrink-0',
                          profile.id === activeProfileId
                            ? 'text-primary'
                            : 'text-text-muted'
                        )}
                      />
                      <div className="flex-1 text-left min-w-0">
                        <div
                          className={cn(
                            'font-medium truncate',
                            profile.id === activeProfileId && 'text-primary'
                          )}
                        >
                          {profile.name}
                        </div>
                        <div className="text-xs text-text-muted">
                          {profile.mappings.length} 条映射
                        </div>
                      </div>
                      {profile.id === activeProfileId && (
                        <Check className="w-5 h-5 text-primary flex-shrink-0" />
                      )}
                    </motion.button>
                  ))
                )}
              </div>

              <div className="p-2 border-t border-border">
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      onCreate();
                      setIsOpen(false);
                    }}
                    className="flex-1 flex items-center justify-center gap-2 py-2 bg-primary text-background rounded-lg text-sm font-medium hover:bg-primary-dark transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    新建配置
                  </button>
                  {onManage && (
                    <button
                      onClick={() => {
                        onManage();
                        setIsOpen(false);
                      }}
                      className="p-2 bg-surface-light text-text-muted rounded-lg hover:text-text hover:bg-surface-hover transition-colors"
                    >
                      <Settings className="w-5 h-5" />
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
