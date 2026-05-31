import { useState, useEffect } from 'react'
import { X, GitBranch, Loader2, FileText } from 'lucide-react'
import { apiClient } from '../../api/client'
import { useUserStore } from '../../store/userStore'
import { useRoomStore } from '../../store/roomStore'
import { useNavigate } from 'react-router-dom'
import type { Snapshot } from '../../types/api'

interface ForkRoomModalProps {
  isOpen: boolean
  onClose: () => void
  roomId: string
  roomName: string
  snapshots: Snapshot[]
}

export default function ForkRoomModal({ isOpen, onClose, roomId, roomName, snapshots }: ForkRoomModalProps) {
  const navigate = useNavigate()
  const user = useUserStore((state) => state.user)
  const generateGuestUser = useUserStore((state) => state.generateGuestUser)
  const setCurrentRoom = useRoomStore((state) => state.setCurrentRoom)
  const setRoomToken = useRoomStore((state) => state.setRoomToken)
  const setForking = useRoomStore((state) => state.setForking)
  const addBranch = useRoomStore((state) => state.addBranch)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string>('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (isOpen) {
      setName(`${roomName} (分支)`)
      setDescription('')
      setSelectedSnapshotId('')
      setErrors({})
    }
  }, [isOpen, roomName])

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {}

    if (!name.trim()) {
      newErrors.name = '请输入分支房间名称'
    } else if (name.length < 2) {
      newErrors.name = '名称至少2个字符'
    } else if (name.length > 50) {
      newErrors.name = '名称最多50个字符'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateForm()) return

    try {
      setIsSubmitting(true)
      setForking(true)

      const currentUser = user || generateGuestUser()

      const response = await apiClient.forkRoom(roomId, {
        name: name.trim(),
        userId: currentUser.id,
        userName: currentUser.name,
        snapshotId: selectedSnapshotId || undefined,
        description: description.trim() || undefined
      })

      if (response.success && response.data) {
        apiClient.setToken(response.data.token)
        setRoomToken(response.data.token)
        setCurrentRoom(response.data.room)
        addBranch({
          id: response.data.roomId,
          name: name.trim(),
          createdBy: currentUser.id,
          forkedFromSnapshotId: selectedSnapshotId || null,
          createdAt: new Date().toISOString(),
          memberCount: 1
        })
        onClose()
        navigate(`/rooms/${response.data.roomId}`)
      } else {
        setErrors({ submit: response.error?.message || 'Fork房间失败' })
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Fork房间失败'
      setErrors({ submit: errorMessage })
    } finally {
      setIsSubmitting(false)
      setForking(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content glass-card w-full max-w-lg p-6 mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-neon-purple to-neon-pink flex items-center justify-center">
              <GitBranch className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Fork 房间</h2>
              <p className="text-sm text-gray-400">将当前状态复制到新房间</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg
              text-gray-400 hover:text-white hover:bg-white/10
              transition-all duration-200"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-3 rounded-lg bg-neon-purple/10 border border-neon-purple/30 mb-5">
          <div className="flex items-center gap-2 text-sm">
            <GitBranch size={16} className="text-neon-purple" />
            <span className="text-gray-300">
              从 <span className="text-white font-medium">{roomName}</span> 创建分支
            </span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              分支名称
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="输入分支房间名称"
              className={`input-field ${errors.name ? 'border-red-500/50' : ''}`}
              maxLength={50}
              autoFocus
            />
            {errors.name && (
              <p className="mt-1 text-sm text-red-400">{errors.name}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              描述（可选）
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="描述这个分支的目的..."
              className="input-field resize-none h-20"
              maxLength={200}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Fork 来源
            </label>
            <div className="space-y-2">
              <label className="flex items-center gap-3 p-3 rounded-lg bg-white/5 border border-white/10 cursor-pointer hover:bg-white/10 transition-all">
                <input
                  type="radio"
                  name="forkSource"
                  value=""
                  checked={selectedSnapshotId === ''}
                  onChange={() => setSelectedSnapshotId('')}
                  className="accent-neon-purple"
                />
                <div className="flex-1">
                  <p className="text-sm font-medium text-white">当前状态</p>
                  <p className="text-xs text-gray-400">使用房间当前图谱状态</p>
                </div>
                <GitBranch size={16} className="text-neon-green" />
              </label>

              {snapshots.length > 0 && (
                <div className="border border-white/10 rounded-lg overflow-hidden">
                  <div className="px-3 py-2 bg-white/5 border-b border-white/10">
                    <p className="text-xs text-gray-400 flex items-center gap-1.5">
                      <FileText size={12} />
                      从快照创建分支
                    </p>
                  </div>
                  <div className="max-h-40 overflow-y-auto scrollbar-thin">
                    {snapshots.map((snapshot) => (
                      <label
                        key={snapshot.id}
                        className="flex items-center gap-3 p-3 cursor-pointer hover:bg-white/5 transition-all border-b border-white/5 last:border-b-0"
                      >
                        <input
                          type="radio"
                          name="forkSource"
                          value={snapshot.id}
                          checked={selectedSnapshotId === snapshot.id}
                          onChange={() => setSelectedSnapshotId(snapshot.id)}
                          className="accent-neon-purple"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-white truncate">{snapshot.name}</p>
                          <p className="text-xs text-gray-500">
                            {new Date(snapshot.createdAt).toLocaleString('zh-CN')}
                          </p>
                        </div>
                        <span className="text-xs text-gray-500 flex-shrink-0">
                          {snapshot.operationCount} ops
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {errors.submit && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30">
              <p className="text-sm text-red-400">{errors.submit}</p>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary flex-1"
              disabled={isSubmitting}
            >
              取消
            </button>
            <button
              type="submit"
              className="btn-primary flex-1 flex items-center justify-center gap-2"
              disabled={isSubmitting}
              style={{ background: 'linear-gradient(135deg, #a855f7, #ec4899)' }}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Fork中...
                </>
              ) : (
                <>
                  <GitBranch size={18} />
                  创建分支
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
