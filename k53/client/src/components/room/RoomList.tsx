import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Users, Clock, Lock, Unlock, ChevronRight, Loader2 } from 'lucide-react'
import { apiClient } from '../../api/client'
import type { Room } from '../../types/api'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'

dayjs.extend(relativeTime)

interface RoomListProps {
  onJoinRoom?: (roomId: string) => void
  showJoinModal?: (roomId: string) => void
}

export default function RoomList({ onJoinRoom, showJoinModal }: RoomListProps) {
  const navigate = useNavigate()
  const [rooms, setRooms] = useState<Room[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadRooms()
  }, [])

  const loadRooms = async () => {
    try {
      setIsLoading(true)
      setError(null)
      const response = await apiClient.getRooms()
      if (response.success && response.data) {
        setRooms(response.data.rooms)
      } else {
        setError(response.error?.message || '加载房间列表失败')
      }
    } catch (err) {
      setError('网络错误，请稍后重试')
    } finally {
      setIsLoading(false)
    }
  }

  const handleRoomClick = (room: Room) => {
    if (room.passwordHash) {
      if (showJoinModal) {
        showJoinModal(room.id)
      } else {
        navigate(`/rooms/${room.id}/join`)
      }
    } else {
      if (onJoinRoom) {
        onJoinRoom(room.id)
      } else {
        navigate(`/rooms/${room.id}`)
      }
    }
  }

  const getNodeCount = (room: Room) => {
    return Object.keys(room.currentState?.nodes || {}).length
  }

  const getEdgeCount = (room: Room) => {
    return Object.keys(room.currentState?.edges || {}).length
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <Loader2 className="w-12 h-12 text-neon-blue animate-spin mb-4" />
        <p className="text-gray-400">正在加载房间列表...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-16">
        <p className="text-red-400 mb-4">{error}</p>
        <button
          onClick={loadRooms}
          className="btn-secondary"
        >
          重新加载
        </button>
      </div>
    )
  }

  if (rooms.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-br from-neon-blue/20 to-neon-purple/20 flex items-center justify-center border border-neon-blue/30">
          <Users className="w-10 h-10 text-neon-blue" />
        </div>
        <p className="text-gray-400 text-lg mb-2">暂无房间</p>
        <p className="text-gray-500 text-sm">创建第一个房间开始协作吧！</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {rooms.map((room, index) => (
        <div
          key={room.id}
          onClick={() => handleRoomClick(room)}
          className="glass-card p-6 cursor-pointer transition-all duration-300 hover:scale-[1.02] hover:neon-border group animate-slide-up"
          style={{ animationDelay: `${index * 0.05}s` }}
        >
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1">
              <h3 className="font-semibold text-white text-lg mb-1 group-hover:text-neon-blue transition-colors">
                {room.name}
              </h3>
              <div className="flex items-center gap-2 text-xs text-gray-400">
                {room.passwordHash ? (
                  <Lock size={12} className="text-neon-yellow" />
                ) : (
                  <Unlock size={12} className="text-neon-green" />
                )}
                <span>{room.passwordHash ? '私密房间' : '公开房间'}</span>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-500 group-hover:text-neon-blue group-hover:translate-x-1 transition-all" />
          </div>

          <div className="flex items-center gap-4 text-sm text-gray-400 mb-4">
            <div className="flex items-center gap-1">
              <Users size={14} className="text-neon-cyan" />
              <span>{getNodeCount(room)} 节点</span>
            </div>
            <div className="flex items-center gap-1">
              <svg className="w-4 h-4 text-neon-purple" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
              <span>{getEdgeCount(room)} 连线</span>
            </div>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-white/10">
            <div className="flex items-center gap-1 text-xs text-gray-500">
              <Clock size={12} />
              <span>{dayjs(room.updatedAt).fromNow()}</span>
            </div>
            <div 
              className="w-2 h-2 rounded-full"
              style={{
                backgroundColor: room.passwordHash ? '#f59e0b' : '#10b981',
                boxShadow: `0 0 8px ${room.passwordHash ? '#f59e0b' : '#10b981'}`
              }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}
