import { useState, useEffect } from 'react'
import { X, Lock, Unlock, Users, Loader2 } from 'lucide-react'
import { apiClient } from '../../api/client'
import { useUserStore } from '../../store/userStore'
import { useRoomStore } from '../../store/roomStore'
import { useNavigate } from 'react-router-dom'

interface CreateRoomModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function CreateRoomModal({ isOpen, onClose }: CreateRoomModalProps) {
  const navigate = useNavigate()
  const user = useUserStore((state) => state.user)
  const generateGuestUser = useUserStore((state) => state.generateGuestUser)
  const setCurrentRoom = useRoomStore((state) => state.setCurrentRoom)
  const setRoomToken = useRoomStore((state) => state.setRoomToken)
  const setConnectionStatus = useRoomStore((state) => state.setConnectionStatus)
  const setLoading = useRoomStore((state) => state.setLoading)
  const setError = useRoomStore((state) => state.setError)

  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isPrivate, setIsPrivate] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (isOpen) {
      setName('')
      setPassword('')
      setConfirmPassword('')
      setIsPrivate(false)
      setErrors({})
    }
  }, [isOpen])

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {}

    if (!name.trim()) {
      newErrors.name = '请输入房间名称'
    } else if (name.length < 2) {
      newErrors.name = '房间名称至少2个字符'
    } else if (name.length > 50) {
      newErrors.name = '房间名称最多50个字符'
    }

    if (isPrivate) {
      if (!password) {
        newErrors.password = '请设置房间密码'
      } else if (password.length < 4) {
        newErrors.password = '密码至少4个字符'
      } else if (password !== confirmPassword) {
        newErrors.confirmPassword = '两次密码输入不一致'
      }
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!validateForm()) return

    try {
      setIsSubmitting(true)
      setLoading(true)
      setError(null)

      const currentUser = user || generateGuestUser()

      const response = await apiClient.createRoom({
        name: name.trim(),
        password: isPrivate ? password : undefined,
        userId: currentUser.id,
        userName: currentUser.name
      })

      if (response.success && response.data) {
        apiClient.setToken(response.data.token)
        setRoomToken(response.data.token)
        setCurrentRoom(response.data.room)
        setConnectionStatus('connected')
        onClose()
        navigate(`/rooms/${response.data.roomId}`)
      } else {
        setError(response.error?.message || '创建房间失败')
        setErrors({ submit: response.error?.message || '创建房间失败' })
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '创建房间失败'
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
          <h2 className="text-xl font-bold text-white">创建新房间</h2>
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
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              房间名称
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="输入房间名称"
              className={`input-field ${errors.name ? 'border-red-500/50' : ''}`}
              maxLength={50}
              autoFocus
            />
            {errors.name && (
              <p className="mt-1 text-sm text-red-400">{errors.name}</p>
            )}
          </div>

          <div className="p-4 rounded-lg bg-white/5 border border-white/10">
            <button
              type="button"
              onClick={() => setIsPrivate(!isPrivate)}
              className="flex items-center justify-between w-full"
            >
              <div className="flex items-center gap-3">
                {isPrivate ? (
                  <Lock size={20} className="text-neon-yellow" />
                ) : (
                  <Unlock size={20} className="text-neon-green" />
                )}
                <div className="text-left">
                  <p className="font-medium text-white">
                    {isPrivate ? '私密房间' : '公开房间'}
                  </p>
                  <p className="text-xs text-gray-400">
                    {isPrivate ? '需要密码才能加入' : '任何人都可以加入'}
                  </p>
                </div>
              </div>
              <div 
                className={`w-12 h-6 rounded-full transition-all duration-300 ${
                  isPrivate ? 'bg-neon-yellow' : 'bg-gray-600'
                }`}
              >
                <div 
                  className={`w-5 h-5 rounded-full bg-white transition-transform duration-300 mt-0.5 ${
                    isPrivate ? 'translate-x-6' : 'translate-x-0.5'
                  }`}
                />
              </div>
            </button>
          </div>

          {isPrivate && (
            <div className="space-y-4 animate-fade-in">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  房间密码
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="设置密码"
                  className={`input-field ${errors.password ? 'border-red-500/50' : ''}`}
                />
                {errors.password && (
                  <p className="mt-1 text-sm text-red-400">{errors.password}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  确认密码
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="再次输入密码"
                  className={`input-field ${errors.confirmPassword ? 'border-red-500/50' : ''}`}
                />
                {errors.confirmPassword && (
                  <p className="mt-1 text-sm text-red-400">{errors.confirmPassword}</p>
                )}
              </div>
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
              以 <span className="text-neon-cyan">{user?.name || '访客'}</span> 身份创建
            </span>
          </div>

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
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  创建中...
                </>
              ) : (
                '创建房间'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
