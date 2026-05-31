import { Minus, X, Music2 } from 'lucide-react'
import { IpcChannel } from '@shared/index'

export default function TitleBar() {
  const handleMinimize = () => {
    if (window.electronAPI) {
      window.electronAPI.send(IpcChannel.APP_MINIMIZE)
    }
  }

  const handleClose = () => {
    if (window.electronAPI) {
      window.electronAPI.send(IpcChannel.APP_QUIT)
    }
  }

  return (
    <div className="titlebar h-10 bg-surface border-b border-border flex items-center justify-between px-4 flex-shrink-0">
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-primary to-secondary flex items-center justify-center neon-glow">
          <Music2 className="w-4 h-4 text-background" />
        </div>
        <span className="text-sm font-medium text-text">MIDI Mapper</span>
        <span className="text-xs text-text-muted ml-2">v1.0.0</span>
      </div>

      <div className="flex items-center gap-1">
        <button
          onClick={handleMinimize}
          className="titlebar-button w-10 h-8 flex items-center justify-center text-text-muted hover:text-text hover:bg-surface-hover rounded transition-colors duration-150"
          title="最小化"
        >
          <Minus className="w-4 h-4" />
        </button>
        <button
          onClick={handleClose}
          className="titlebar-button w-10 h-8 flex items-center justify-center text-text-muted hover:text-white hover:bg-error rounded transition-colors duration-150"
          title="关闭"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
