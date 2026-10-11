import { defineStore } from 'pinia'
import { ref } from 'vue'
import { authApi } from '@/api'
import { clearToken, getToken, setToken } from '@/api/http'
import type { AdminUser } from '@/types'

export const useAuthStore = defineStore('auth', () => {
  const token = ref(getToken())
  const user = ref<AdminUser | null>(null)
  const loading = ref(false)

  const isLoggedIn = () => !!token.value

  async function login(username: string, password: string) {
    loading.value = true
    try {
      const result = await authApi.login(username, password)
      token.value = result.token
      setToken(result.token)
      user.value = result.user
      return result
    } finally {
      loading.value = false
    }
  }

  async function fetchMe() {
    if (!token.value) return null
    user.value = await authApi.me()
    return user.value
  }

  function logout() {
    token.value = ''
    user.value = null
    clearToken()
  }

  return { token, user, loading, isLoggedIn, login, fetchMe, logout }
})
