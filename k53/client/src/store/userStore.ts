import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'
import type { UserInfo } from '../types/api'

interface UserPreferences {
  theme: 'light' | 'dark' | 'system'
  language: string
  autoSave: boolean
  autoSaveInterval: number
  showGrid: boolean
  snapToGrid: boolean
  defaultNodeType: 'concept' | 'topic' | 'note' | 'resource'
  defaultEdgeStyle: 'solid' | 'dashed' | 'dotted'
  zoomSensitivity: number
  panSensitivity: number
}

interface UserState {
  user: UserInfo | null
  isAuthenticated: boolean
  preferences: UserPreferences
  isLoading: boolean
  error: string | null

  setUser: (user: UserInfo | null) => void
  updateUser: (updates: Partial<UserInfo>) => void
  clearUser: () => void

  setPreferences: (preferences: Partial<UserPreferences>) => void
  resetPreferences: () => void

  setLoading: (isLoading: boolean) => void
  setError: (error: string | null) => void

  generateGuestUser: () => UserInfo
}

const defaultPreferences: UserPreferences = {
  theme: 'system',
  language: 'zh-CN',
  autoSave: true,
  autoSaveInterval: 30000,
  showGrid: true,
  snapToGrid: false,
  defaultNodeType: 'concept',
  defaultEdgeStyle: 'solid',
  zoomSensitivity: 1,
  panSensitivity: 1
}

const AVATAR_COLORS = [
  '#ef4444',
  '#f97316',
  '#f59e0b',
  '#84cc16',
  '#22c55e',
  '#14b8a6',
  '#06b6d4',
  '#3b82f6',
  '#6366f1',
  '#8b5cf6',
  '#a855f7',
  '#d946ef',
  '#ec4899',
  '#f43f5e'
]

function getRandomColor(): string {
  return AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)]
}

function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

function generateGuestName(): string {
  const adjectives = ['快乐的', '聪明的', '勇敢的', '友善的', '创意的', '专注的', '热情的', '冷静的']
  const nouns = ['探索者', '创造者', '思考者', '学习者', '分享者', '协作者', '发明家', '艺术家']
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)]
  const noun = nouns[Math.floor(Math.random() * nouns.length)]
  const num = Math.floor(Math.random() * 1000)
  return `${adj}${noun}${num}`
}

export const useUserStore = create<UserState>()(
  devtools(
    persist(
      (set, get) => ({
        user: null,
        isAuthenticated: false,
        preferences: defaultPreferences,
        isLoading: false,
        error: null,

        setUser: (user) => set({
          user,
          isAuthenticated: user !== null
        }),

        updateUser: (updates) => set((state) => {
          if (!state.user) return state
          return {
            user: { ...state.user, ...updates }
          }
        }),

        clearUser: () => set({
          user: null,
          isAuthenticated: false
        }),

        setPreferences: (preferences) => set((state) => ({
          preferences: { ...state.preferences, ...preferences }
        })),

        resetPreferences: () => set({
          preferences: defaultPreferences
        }),

        setLoading: (isLoading) => set({ isLoading }),

        setError: (error) => set({ error }),

        generateGuestUser: () => {
          const existingUser = get().user
          if (existingUser) {
            return existingUser
          }

          const guestUser: UserInfo = {
            id: generateId(),
            name: generateGuestName(),
            color: getRandomColor()
          }

          set({
            user: guestUser,
            isAuthenticated: true
          })

          return guestUser
        }
      }),
      {
        name: 'user-store',
        partialize: (state) => ({
          user: state.user,
          preferences: state.preferences
        })
      }
    )
  )
)

export const useCurrentUser = () => useUserStore((state) => state.user)
export const useIsAuthenticated = () => useUserStore((state) => state.isAuthenticated)
export const useUserPreferences = () => useUserStore((state) => state.preferences)
export const useIsUserLoading = () => useUserStore((state) => state.isLoading)
export const useUserError = () => useUserStore((state) => state.error)
export const useUserId = () => useUserStore((state) => state.user?.id)
export const useUserName = () => useUserStore((state) => state.user?.name)
export const useUserColor = () => useUserStore((state) => state.user?.color)

export function initializeUser() {
  const store = useUserStore.getState()
  if (!store.user) {
    store.generateGuestUser()
  }
}
