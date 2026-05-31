import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { User } from '@/types'
import { login, logout as apiLogout, getProfile } from '@/api/auth'
import type { LoginData } from '@/api/auth'

export const useUserStore = defineStore('user', () => {
  const token = ref<string>('')
  const refreshToken = ref<string>('')
  const user = ref<User | null>(null)

  const isLoggedIn = computed(() => !!token.value)
  const isAdmin = computed(() => user.value?.role === 'admin')
  const isAnnotator = computed(() => user.value?.role === 'annotator')
  const userName = computed(() => {
    if (!user.value) return ''
    return user.value.first_name || user.value.username
  })

  async function doLogin(data: LoginData): Promise<any> {
    const response = await login(data)
    token.value = response.access
    refreshToken.value = response.refresh
    user.value = response.user
    return response
  }

  async function fetchProfile() {
    try {
      const profile = await getProfile()
      user.value = profile
      return profile
    } catch (error) {
      console.error('Failed to fetch profile:', error)
      throw error
    }
  }

  async function fetchUser() {
    return fetchProfile()
  }

  function logout() {
    if (refreshToken.value) {
      try {
        apiLogout(refreshToken.value)
      } catch (e) {
        console.error('Logout API error:', e)
      }
    }
    token.value = ''
    refreshToken.value = ''
    user.value = null
  }

  async function login(data: LoginData): Promise<any> {
    return doLogin(data)
  }

  return {
    token,
    refreshToken,
    user,
    isLoggedIn,
    isAdmin,
    isAnnotator,
    userName,
    doLogin,
    login,
    fetchProfile,
    fetchUser,
    logout
  }
}, {
  persist: {
    key: 'dialect_annotation_user',
    paths: ['token', 'refreshToken', 'user']
  }
})
