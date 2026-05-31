import { useState, useEffect } from 'react'
import { GitBranch, Users, ExternalLink, ChevronDown, ChevronUp, Loader2 } from 'lucide-react'
import { apiClient } from '../../api/client'
import { useRoomStore } from '../../store/roomStore'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import 'dayjs/locale/zh-cn'

dayjs.extend(relativeTime)
dayjs.locale('zh-cn')

interface BranchPanelProps {
  roomId: string
  onFork: () => void
}

export default function BranchPanel({ roomId, onFork }: BranchPanelProps) {
  const navigate = useNavigate()
  const branches = useRoomStore((state) => state.branches)
  const setBranches = useRoomStore((state) => state.setBranches)
  const currentRoom = useRoomStore((state) => state.currentRoom)
  const [isExpanded, setIsExpanded] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (isExpanded && roomId) {
      loadBranches()
    }
  }, [isExpanded, roomId])

  const loadBranches = async () => {
    try {
      setIsLoading(true)
      const response = await apiClient.listBranches(roomId)
      if (response.success && response.data) {
        setBranches(response.data.branches)
      }
    } catch (err) {
      console.error('Failed to load branches:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const handleOpenBranch = (branchId: string) => {
    navigate(`/rooms/${branchId}`)
  }

  return (
    <div className="glass-card overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-3 hover:bg-white/5 transition-all"
      >
        <div className="flex items-center gap-2">
          <GitBranch size={16} className="text-neon-purple" />
          <span className="text-sm font-medium text-white">分支</span>
          {branches.length > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-xs bg-neon-purple/20 text-neon-purple">
              {branches.length}
            </span>
          )}
        </div>
        {isExpanded ? (
          <ChevronUp size={16} className="text-gray-400" />
        ) : (
          <ChevronDown size={16} className="text-gray-400" />
        )}
      </button>

      {isExpanded && (
        <div className="border-t border-white/10 animate-fade-in">
          {currentRoom?.parentRoomId && (
            <div className="p-3 bg-neon-blue/5 border-b border-white/10">
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <GitBranch size={12} className="text-neon-blue" />
                <span>从父房间派生</span>
                <button
                  onClick={() => handleOpenBranch(currentRoom.parentRoomId!)}
                  className="text-neon-blue hover:underline ml-auto flex items-center gap-1"
                >
                  查看源房间
                  <ExternalLink size={10} />
                </button>
              </div>
            </div>
          )}

          {isLoading ? (
            <div className="p-4 flex items-center justify-center">
              <Loader2 className="w-5 h-5 text-neon-purple animate-spin" />
            </div>
          ) : branches.length > 0 ? (
            <div className="max-h-60 overflow-y-auto scrollbar-thin">
              {branches.map((branch) => (
                <div
                  key={branch.id}
                  className="p-3 border-b border-white/5 hover:bg-white/5 transition-all"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white truncate">{branch.name}</p>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-xs text-gray-500">
                          {dayjs(branch.createdAt).fromNow()}
                        </span>
                        <span className="text-xs text-gray-500 flex items-center gap-1">
                          <Users size={10} />
                          {branch.memberCount}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => handleOpenBranch(branch.id)}
                      className="ml-2 p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-all"
                      title="打开分支房间"
                    >
                      <ExternalLink size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-4 text-center">
              <GitBranch size={24} className="mx-auto text-gray-600 mb-2" />
              <p className="text-xs text-gray-500">暂无分支</p>
            </div>
          )}

          <div className="p-3 border-t border-white/10">
            <button
              onClick={onFork}
              className="w-full py-2 px-3 rounded-lg text-sm font-medium
                bg-gradient-to-r from-neon-purple to-neon-pink text-white
                hover:opacity-90 transition-all flex items-center justify-center gap-2"
            >
              <GitBranch size={14} />
              创建分支
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
