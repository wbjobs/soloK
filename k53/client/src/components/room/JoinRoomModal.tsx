import { useState, useEffect } from 'react'
import { X, Lock, Users, Loader2, LogIn } from 'lucide-react'
import { apiClient } from '../../api/client'
import { useUserStore } from '../../store/userStore'
import { useRoomStore } from '../../store/roomStore'
import { useNavigate } from 'react-router-dom'

interface JoinRoomModalProps {
  isOpen: boolean
  onClose: () => void
  roomId?: string
  roomName?: string
  requiresPassword?: boolean
}

export default function JoinRoomModal({ 
  isOpen, 
  onClose, 
  roomId: initialRoomId,
  roomName: initialRoomName,
  requiresPassword: initialRequiresPassword 
}: JoinRoomModalProps) {
  const navigate = useNavigate()
  const user = useUserStore((state) => state.user)
  const generateGuestUser = useUserStore((state) => state.generateGuestUser)
  const setCurrentRoom = useRoomStore((state) => state.setCurrentRoom)
  const setMembers = useRoomStore((state) => state.setMembers)
  const setRoomToken = useRoomStore((state) => state.setRoomToken)
  const setConnectionStatus = useRoomStore((state) => state.setConnectionStatus)
  const setLoading = useRoomStore((state) => state.setLoading)
  const setError = useRoomStore((state) => state.setError)

  const [roomId, setRoomId] = useState(initialRoomId || '')
  const [password, setPassword] = useState('')
  const [userName, setUserName] = useState('')
  const [roomInfo, setRoomInfo] = useState<{ name: string; requiresPassword: boolean } | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isLoadingRoom, setIsLoadingRoom] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [step, setStep] = useState<'roomId' | 'info' | 'join'>('roomId')

  useEffect(() => {
    if (isOpen) {
      setRoomId(initialRoomId || '')
      setPassword('')
      setUserName('')
      setErrors({})
      setRoomInfo(null)
      
      if (initialRoomId && initialRoomName) {
        setRoomInfo({
          name: initialRoomName,
          requiresPassword: initialRequiresPassword || false
        })
        setStep('join')
      } else if (initialRoomId) {
        setStep('info')
        loadRoomInfo(initialRoomId)
      } else {
        setStep('roomId')
      }

      if (user) {
        setUserName(user.name)
      }
    }
  }, [isOpen, initialRoomId, initialRoomName, initialRequiresPassword, user])

  const loadRoomInfo = async (id: string) => {
    try {
      setIsLoadingRoom(true)
      setErrors({})
      const response = await apiClient.getRoom(id)
      if (response.success && response.data) {
        setRoomInfo({
          name: response.data.room.name,
          requiresPassword: !!response.data.room.passwordHash
        })
        setStep('join')
      } else {
        setErrors({ roomId: response.error?.message || '房间不存在' })
        setStep('roomId')
      }
    } catch (err) {
      setErrors({ roomId: '网络错误，请检查房间ID' })
      setStep('roomId')
    } finally {
      setIsLoadingRoom(false)
    }
  }

  const handleNextStep = () => {
    const newErrors: Record<string, string> = {}
    
    if (!roomId.trim()) {
      newErrors.roomId = '请输入房间ID'
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    loadRoomInfo(roomId.trim())
  }

  const validateJoinForm = (): boolean => {
    const newErrors: Record<string, string> = {}

    if (!userName.trim()) {
      newErrors.userName = '请输入您的昵称'
    } else if (userName.length < 2) {
      newErrors.userName = '昵称至少2个字符'
    }

    if (roomInfo?.requiresPassword && !password) {
      newErrors.password = '请输入房间密码'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!validateJoinForm()) return
    if (!roomId) return

    try {
      setIsSubmitting(true)
      setLoading(true)
      setError(null)

      const currentUser = user || generateGuestUser()
      
      const response = await apiClient.joinRoom(roomId, {
        userId: currentUser.id,
        userName: userName.trim(),
        password: roomInfo?.requiresPassword ? password : undefined
      })

      if (response.success && response.data) {
        apiClient.setToken(response.data.token)
        setRoomToken(response.data.token)
        setCurrentRoom(response.data.room)
        setMembers(response.data.members)
        setConnectionStatus('connected')
        onClose()
        navigate(`/rooms/${roomId}`)
      } else {
        setError(response.error?.message || '加入房间失败')
        setErrors({ submit: response.error?.message || '加入房间失败' })
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '加入房间失败'
      setError(errorMessage)
      setErrors({ submit: errorMessage })
    } finally {
      setIsSubmitting(false)
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div 
        className="modal-content glass-card w-full max-w-md p-6 mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white">加入房间</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg
              text-gray-400 hover:text-white hover:bg-white/10
              transition-all duration-200"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {step === 'roomId' && (
            <div className="space-y-5 animate-fade-in">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  房间ID
                </label>
                <input
                  type="text"
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value)}
                  placeholder="输入房间ID"
                  className={`input-field ${errors.roomId ? 'border-red-500/50' : ''}`}
                  autoFocus
                />
                {errors.roomId && (
                  <p className="mt-1 text-sm text-red-400">{errors.roomId}</p>
                )}
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
                  disabled={isLoadingRoom}
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleNextStep}
                  className="btn-primary flex-1 flex items-center justify-center gap-2"
                  disabled={isLoadingRoom}
                >
                  {isLoadingRoom ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      加载中...
                    </>
                  ) : (
                    '下一步'
                  )}
                </button>
              </div>
            </div>
          )}

          {(step === 'info' || step === 'join') && roomInfo && (
            <div className="space-y-5 animate-fade-in">
              <div className="p-4 rounded-lg bg-gradient-to-r from-neon-blue/10 to-neon-purple/10 border border-neon-blue/30">
                <div className="flex items-center gap-3 mb-2">
                  {roomInfo.requiresPassword ? (
                    <Lock size={20} className="text-neon-yellow" />
                  ) : (
                    <Users size={20} className="text-neon-green" />
                  )}
                  <h3 className="font-semibold text-white text-lg">{roomInfo.name}</h3>
                </div>
                <p className="text-sm text-gray-400">
                  {roomInfo.requiresPassword ? '私密房间 - 需要密码' : '公开房间 - 无需密码'}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  您的昵称
                </label>
                <input
                  type="text"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  placeholder="输入您的昵称"
                  className={`input-field ${errors.userName ? 'border-red-500/50' : ''}`}
                />
                {errors.userName && (
                  <p className="mt-1 text-sm text-red-400">{errors.userName}</p>
                )}
              </div>

              {roomInfo.requiresPassword && (
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    房间密码
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="输入房间密码"
                    className={`input-field ${errors.password ? 'border-red-500/50' : ''}`}
                  />
                  {errors.password && (
                    <p className="mt-1 text-sm text-red-400">{errors.password}</p>
                  )}
                </div>
              )}

              {errors.submit && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30">
                  <p className="text-sm text-red-400">{errors.submit}</p>
                </div>
              )}

              <div className="flex items-center gap-2 text-sm text-gray-400 pt-2">
                <Users size={16} className="text-neon-cyan" />
                <span>
                  以 <span className="text-neon-cyan">{userName || '访客'}</span> 身份加入
                </span>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    if (initialRoomId) {
                      onClose()
                    } else {
                      setStep('roomId')
                    }
                  }}
                  className="btn-secondary flex-1"
                  disabled={isSubmitting}
                >
                  {initialRoomId ? '取消' : '返回'}
                </button>
                <button
                  type="submit"
                  className="btn-primary flex-1 flex items-center justify-center gap-2"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      加入中...
                    </>
                  ) : (
                    <>
                      <LogIn size={18} />
                      加入房间
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </form>
      </div>
    </div>
  )
}
