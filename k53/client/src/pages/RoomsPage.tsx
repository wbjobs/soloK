import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { GitBranch, Plus, LogIn, ArrowLeft, RefreshCw, Search } from 'lucide-react'
import RoomList from '../components/room/RoomList'
import CreateRoomModal from '../components/room/CreateRoomModal'
import JoinRoomModal from '../components/room/JoinRoomModal'
import { useUserStore } from '../store/userStore'

export default function RoomsPage() {
  const navigate = useNavigate()
  const user = useUserStore((state) => state.user)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showJoinModal, setShowJoinModal] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  const handleJoinRoom = (roomId: string) => {
    navigate(`/rooms/${roomId}`)
  }

  const handleShowJoinModal = (_roomId: string) => {
    setShowJoinModal(true)
  }

  const handleRefresh = () => {
    setRefreshKey(prev => prev + 1)
  }

  return (
    <div className="min-h-screen relative overflow-hidden">
      <div className="absolute inset-0 grid-bg opacity-30" />
      
      <div className="relative z-10">
        <header className="py-6 px-8 border-b border-white/10">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-6">
              <button
                onClick={() => navigate('/')}
                className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
              >
                <ArrowLeft size={20} />
                <span>返回</span>
              </button>
              
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-neon-blue to-neon-purple flex items-center justify-center">
                  <GitBranch className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-white">房间列表</h1>
                  <p className="text-sm text-gray-400">浏览和加入协作房间</p>
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              {user && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg glass">
                  <div 
                    className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-medium"
                    style={{ backgroundColor: user.color }}
                  >
                    {user.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-sm text-gray-300">{user.name}</span>
                </div>
              )}
              
              <button
                onClick={() => setShowJoinModal(true)}
                className="btn-secondary px-4 py-2 text-sm flex items-center gap-2"
              >
                <LogIn size={16} />
                加入房间
              </button>
              <button
                onClick={() => setShowCreateModal(true)}
                className="btn-primary px-4 py-2 text-sm flex items-center gap-2"
              >
                <Plus size={16} />
                创建房间
              </button>
            </div>
          </div>
        </header>

        <main className="py-8 px-8">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-4 flex-1 max-w-md">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="搜索房间..."
                    className="input-field pl-10"
                  />
                </div>
                
                <button
                  onClick={handleRefresh}
                  className="w-10 h-10 flex items-center justify-center rounded-lg glass glass-hover text-gray-400 hover:text-white transition-all"
                  title="刷新列表"
                >
                  <RefreshCw size={20} />
                </button>
              </div>
              
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <div className="w-2 h-2 rounded-full bg-neon-green animate-pulse" />
                <span>实时更新</span>
              </div>
            </div>

            <RoomList 
              key={refreshKey}
              onJoinRoom={handleJoinRoom}
              showJoinModal={handleShowJoinModal}
            />
          </div>
        </main>

        <footer className="py-6 px-8 border-t border-white/10 mt-auto">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-neon-blue to-neon-purple flex items-center justify-center">
                <GitBranch className="w-5 h-5 text-white" />
              </div>
              <span className="text-gray-400 text-sm">
                © 2024 GraphFlow. 构建知识的未来。
              </span>
            </div>
            
            <div className="text-sm text-gray-500">
              提示：创建房间后分享房间ID给你的团队成员即可开始协作
            </div>
          </div>
        </footer>
      </div>

      <CreateRoomModal 
        isOpen={showCreateModal} 
        onClose={() => setShowCreateModal(false)} 
      />
      <JoinRoomModal 
        isOpen={showJoinModal} 
        onClose={() => setShowJoinModal(false)} 
      />
    </div>
  )
}
