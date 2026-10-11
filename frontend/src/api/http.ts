import axios, { type AxiosInstance, type AxiosRequestConfig } from 'axios'
import { ElMessage } from 'element-plus'
import type { ApiResponse } from '@/types'

const TOKEN_KEY = 'fcdzy_admin_token'

export function getToken(): string {
  return localStorage.getItem(TOKEN_KEY) || ''
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY)
}

const instance: AxiosInstance = axios.create({
  baseURL: '/api',
  timeout: 20000
})

instance.interceptors.request.use((config) => {
  const token = getToken()
  if (token) {
    config.headers = config.headers || {}
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

instance.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status
    const message = error?.response?.data?.message || error.message || '请求失败'
    if (status === 401) {
      clearToken()
      if (!location.pathname.startsWith('/admin/login')) {
        ElMessage.error('登录状态已过期，请重新登录')
        location.href = '/admin/login'
      }
    } else {
      ElMessage.error(message)
    }
    return Promise.reject(error)
  }
)

/** 统一拆包：返回 ApiResponse.data */
export async function request<T>(config: AxiosRequestConfig): Promise<T> {
  const response = await instance.request<ApiResponse<T>>(config)
  const body = response.data
  if (body && typeof body === 'object' && 'code' in body) {
    if (body.code !== 0) {
      ElMessage.error(body.message || '请求失败')
      throw new Error(body.message || '请求失败')
    }
    return body.data
  }
  return body as unknown as T
}

export default instance
