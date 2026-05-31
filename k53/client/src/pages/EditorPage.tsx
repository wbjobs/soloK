import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { GitBranch, ArrowLeft, Copy, Check, Settings, LogOut } from 'lucide-react'
import Toolbar from '../components/editor/Toolbar'
import Canvas from '../components/editor/Canvas'
import PropertyPanel from '../components/editor/PropertyPanel'
import MemberList from '../components/editor/MemberList'
import ForkRoomModal from '../components/room/ForkRoomModal'
import BranchPanel from '../components/room/BranchPanel'
import { useCurrentRoom, useConnectionStatus, useRoomOperations, useRoomSnapshots } from '../store/roomStore'
import { apiClient } from '../api/client'

export default function EditorPage() {
  const { roomId } = useParams<{ roomId: string }>()
  const navigate = useNavigate()
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const [showForkModal, setShowForkModal] = useState(false)
  
  const currentRoom = useCurrentRoom()
  const connectionStatus = useConnectionStatus()
  const operations = useRoomOperations()
  const snapshots = useRoomSnapshots()

  useEffect(() => {
    if (!roomId) {
      navigate('/rooms')
      return
    }

    const loadRoom = async () => {
      try {
        setIsLoading(true)
        setError(null)
        
        const response = await apiClient.getRoom(roomId)
        if (response.success && response.data) {
          const token = localStorage.getItem('roomToken')
          if (token) {
            apiClient.setToken(token)
          }
        } else {
          setError(response.error?.message || '加载房间失败')
        }
      } catch (err) {
        setError('网络错误，请稍后重试')
      } finally {
        setIsLoading(false)
      }
    }

    loadRoom()
  }, [roomId, navigate])

  const handleCopyRoomId = () => {
    if (roomId) {
      navigator.clipboard.writeText(roomId)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleLeaveRoom = () => {
    if (confirm('确定要离开房间吗？')) {
      localStorage.removeItem('roomToken')
      apiClient.setToken(null)
      navigate('/rooms')
    }
  }

  const getConnectionStatusColor = () => {
    switch (connectionStatus) {
      case 'connected': return 'bg-neon-green'
      case 'connecting': return 'bg-neon-yellow'
      case 'reconnecting': return 'bg-neon-yellow'
      case 'disconnected': return 'bg-red-500'
      default: return 'bg-gray-500'
    }
  }

  const getConnectionStatusText = () => {
    switch (connectionStatus) {
      case 'connected': return '已连接'
      case 'connecting': return '连接中...'
      case 'reconnecting': return '重连中...'
      case 'disconnected': return '已断开'
      default: return '未知'
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-dark-900">
        <div className="text-center">
          <div className="w-16 h-16 border-2 border-neon-blue border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-400 text-lg">正在加载房间...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-dark-900">
        <div className="text-center glass-card p-8 max-w-md">
          <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-4">
            <Settings className="w-8 h-8 text-red-400" />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">加载失败</h2>
          <p className="text-gray-400 mb-6">{error}</p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => navigate('/rooms')}
              className="btn-secondary"
            >
              返回列表
            </button>
            <button
              onClick={() => window.location.reload()}
              className="btn-primary"
            >
              重新加载
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col bg-dark-900 overflow-hidden">
      <header className="h-14 px-4 flex items-center justify-between border-b border-white/10 bg-dark-800/80 backdrop-blur-sm z-20">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/rooms')}
            className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-all"
          >
            <ArrowLeft size={20} />
          </button>
          
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-neon-blue to-neon-purple flex items-center justify-center">
              <GitBranch className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-semibold text-white text-sm leading-tight">
                {currentRoom?.name || '未命名房间'}
              </h1>
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <span>ID: {roomId?.slice(0, 8)}...</span>
                <button
                  onClick={handleCopyRoomId}
                  className="hover:text-neon-blue transition-colors"
                  title="复制房间ID"
                >
                  {copied ? <Check size={12} className="text-neon-green" /> : <Copy size={12} />}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg glass">
            <div className={`w-2 h-2 rounded-full ${getConnectionStatusColor()} animate-pulse`} />
            <span className="text-xs text-gray-300">{getConnectionStatusText()}</span>
          </div>

          <div className="h-6 w-px bg-white/10" />

          <MemberList compact />

          <div className="h-6 w-px bg-white/10" />

          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">
              {Object.keys(currentRoom?.currentState?.nodes || {}).length} 节点
            </span>
            <span className="text-gray-600">·</span>
            <span className="text-xs text-gray-400">
              {Object.keys(currentRoom?.currentState?.edges || {}).length} 连线
            </span>
            <span className="text-gray-600">·</span>
            <span className="text-xs text-gray-400">
              {operations.length} 操作
            </span>
          </div>

          <div className="h-6 w-px bg-white/10" />

          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-all"
            >
              <Settings size={20} />
            </button>

            {showMenu && (
              <div className="absolute right-0 top-full mt-2 w-48 glass-card p-2 animate-scale-in z-50">
                <button
                  onClick={() => {
                    setShowMenu(false)
                    setShowForkModal(true)
                  }}
                  className="w-full px-3 py-2 text-left text-sm text-neon-purple hover:bg-neon-purple/10 rounded-lg transition-colors flex items-center gap-2"
                >
                  <GitBranch size={16} />
                  Fork 房间
                </button>
                <button
                  onClick={() => {
                    setShowMenu(false)
                    navigate(`/rooms/${roomId}/history`)
                  }}
                  className="w-full px-3 py-2 text-left text-sm text-gray-300 hover:bg-white/10 rounded-lg transition-colors flex items-center gap-2"
                >
                  <Settings size={16} />
                  历史回放
                </button>
                <div className="h-px bg-white/10 my-1" />
                <button
                  onClick={handleLeaveRoom}
                  className="w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-red-500/10 rounded-lg transition-colors flex items-center gap-2"
                >
                  <LogOut size={16} />
                  离开房间
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="flex-1 relative overflow-hidden">
        <Toolbar roomId={roomId} />
        <Canvas roomId={roomId} />
        <PropertyPanel />
        
        <div className="absolute right-4 top-4 w-64 z-10 space-y-2">
          <BranchPanel roomId={roomId!} onFork={() => setShowForkModal(true)} />
        </div>
      </div>

      <footer className="h-8 px-4 flex items-center justify-between border-t border-white/10 bg-dark-800/80 backdrop-blur-sm text-xs text-gray-500 z-20">
        <div className="flex items-center gap-4">
          <span>快捷键: V 选择 · N 节点 · E 连线 · D 删除 · H 平移 · Delete 移除</span>
        </div>
        <div className="flex items-center gap-4">
          <span>Ctrl+Z 撤销 · Ctrl+Y 重做 · Esc 取消</span>
        </div>
      </footer>

      {showMenu && (
        <div 
          className="fixed inset-0 z-10" 
          onClick={() => setShowMenu(false)}
        />
      )}

      <ForkRoomModal
        isOpen={showForkModal}
        onClose={() => setShowForkModal(false)}
        roomId={roomId!}
        roomName={currentRoom?.name || '未命名房间'}
        snapshots={snapshots}
      />
    </div>
  )
}
