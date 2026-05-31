import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Save, RotateCcw, Monitor, Bell, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AppConfig } from '@shared/index';
import { useAppStore } from '../store/useAppStore';
import { ipcConfig } from '../utils/ipc';

const defaultConfig: AppConfig = {
  autoStart: false,
  minimizeToTray: true,
  startServiceOnLaunch: false,
  activeProfileId: null,
  selectedDeviceId: null,
  connectedDeviceIds: [],
  logLevel: 'info',
  profiles: [],
};

export default function Settings() {
  const { config, setConfig, updateConfig } = useAppStore();
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [localConfig, setLocalConfig] = useState<AppConfig>(config || defaultConfig);

  const handleUpdateConfig = useCallback((updates: Partial<AppConfig>) => {
    setLocalConfig(prev => ({ ...prev, ...updates }));
    setHasChanges(true);
  }, []);

  const saveConfig = async () => {
    if (!config) return;
    
    setIsSaving(true);
    try {
      const success = await ipcConfig.save(localConfig);
      if (success) {
        setConfig(localConfig);
        updateConfig(localConfig);
        setHasChanges(false);
      }
    } catch (err) {
      console.error('Failed to save config:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const resetConfig = () => {
    setLocalConfig(defaultConfig);
    setHasChanges(true);
  };

  const displayConfig = hasChanges ? localConfig : config;

  if (!displayConfig) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-text-muted">加载中...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text mb-1">设置</h1>
          <p className="text-text-muted">配置应用程序行为和首选项</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={resetConfig}
            className="btn-secondary flex items-center gap-2"
          >
            <RotateCcw className="w-4 h-4" />
            重置
          </button>
          <button
            onClick={saveConfig}
            disabled={!hasChanges || isSaving}
            className={cn(
              'btn-primary flex items-center gap-2',
              (!hasChanges || isSaving) && 'opacity-50 cursor-not-allowed'
            )}
          >
            <Save className="w-4 h-4" />
            {isSaving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>

      <div className="grid gap-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="card"
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Monitor className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-text">常规设置</h2>
              <p className="text-sm text-text-muted">应用程序启动和窗口行为</p>
            </div>
          </div>

          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium text-text">开机自启</div>
                <div className="text-sm text-text-muted">系统启动时自动运行MIDI Mapper</div>
              </div>
              <button
                onClick={() => handleUpdateConfig({ autoStart: !displayConfig.autoStart })}
                className={cn(
                  'relative w-12 h-6 rounded-full transition-colors duration-200',
                  displayConfig.autoStart ? 'bg-primary' : 'bg-surface-hover'
                )}
              >
                <motion.div
                  animate={{ x: displayConfig.autoStart ? 26 : 2 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                  className="absolute top-1 w-4 h-4 rounded-full bg-white shadow-md"
                />
              </button>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium text-text">最小化到托盘</div>
                <div className="text-sm text-text-muted">关闭窗口时最小化到系统托盘</div>
              </div>
              <button
                onClick={() => handleUpdateConfig({ minimizeToTray: !displayConfig.minimizeToTray })}
                className={cn(
                  'relative w-12 h-6 rounded-full transition-colors duration-200',
                  displayConfig.minimizeToTray ? 'bg-primary' : 'bg-surface-hover'
                )}
              >
                <motion.div
                  animate={{ x: displayConfig.minimizeToTray ? 26 : 2 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                  className="absolute top-1 w-4 h-4 rounded-full bg-white shadow-md"
                />
              </button>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium text-text">启动时自动运行服务</div>
                <div className="text-sm text-text-muted">应用程序启动时自动开启MIDI映射服务</div>
              </div>
              <button
                onClick={() => handleUpdateConfig({ startServiceOnLaunch: !displayConfig.startServiceOnLaunch })}
                className={cn(
                  'relative w-12 h-6 rounded-full transition-colors duration-200',
                  displayConfig.startServiceOnLaunch ? 'bg-primary' : 'bg-surface-hover'
                )}
              >
                <motion.div
                  animate={{ x: displayConfig.startServiceOnLaunch ? 26 : 2 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                  className="absolute top-1 w-4 h-4 rounded-full bg-white shadow-md"
                />
              </button>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="card"
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-secondary/10 flex items-center justify-center">
              <Bell className="w-5 h-5 text-secondary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-text">日志设置</h2>
              <p className="text-sm text-text-muted">配置日志记录级别</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-text mb-2">日志级别</label>
              <select
                value={displayConfig.logLevel}
                onChange={(e) => handleUpdateConfig({ logLevel: e.target.value as AppConfig['logLevel'] })}
                className="w-full px-4 py-3 bg-surface-light border border-border rounded-lg text-text focus:outline-none focus:border-primary transition-colors"
              >
                <option value="debug">Debug - 详细调试信息</option>
                <option value="info">Info - 一般信息</option>
                <option value="warn">Warn - 仅警告</option>
                <option value="error">Error - 仅错误</option>
              </select>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="card"
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
              <Info className="w-5 h-5 text-accent" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-text">关于</h2>
              <p className="text-sm text-text-muted">应用程序信息</p>
            </div>
          </div>

          <div className="space-y-3 text-sm">
            <div className="flex justify-between py-2 border-b border-border">
              <span className="text-text-muted">应用名称</span>
              <span className="text-text font-medium">MIDI Mapper</span>
            </div>
            <div className="flex justify-between py-2 border-b border-border">
              <span className="text-text-muted">版本</span>
              <span className="text-text font-medium">v1.0.0</span>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-text-muted">开发者</span>
              <span className="text-text font-medium">MIDI Mapper Team</span>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
