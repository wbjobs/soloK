import request from './axios'
import type { User, ApiResponse } from '@/types'

export interface LoginData {
  username: string
  password: string
}

export interface LoginResponse {
  user: User
  access: string
  refresh: string
}

export function login(data: LoginData) {
  return request<any, LoginResponse>({
    url: '/auth/login/',
    method: 'post',
    data
  })
}

export function register(data: any) {
  return request({
    url: '/auth/register/',
    method: 'post',
    data
  })
}

export function logout(refresh: string) {
  return request({
    url: '/auth/logout/',
    method: 'post',
    data: { refresh }
  })
}

export function getProfile() {
  return request<any, User>({
    url: '/auth/profile/',
    method: 'get'
  })
}

export function refreshToken(refresh: string) {
  return request({
    url: '/auth/token/refresh/',
    method: 'post',
    data: { refresh }
  })
}

export function getAnnotatorRanking(limit = 10) {
  return request({
    url: `/auth/ranking/?limit=${limit}`,
    method: 'get'
  })
}

export function getAnnotatorList(dialect?: string) {
  const url = dialect ? `/auth/annotators/?dialect=${dialect}` : '/auth/annotators/'
  return request({
    url,
    method: 'get'
  })
}

export function getAnnotators() {
  return request<any, ApiResponse<User[]>>({
    url: '/auth/annotators/',
    method: 'get'
  })
}

export function updateProfile(data: Partial<User>) {
  return request({
    url: '/auth/profile/',
    method: 'put',
    data
  })
}

export function changePassword(data: { old_password: string; new_password: string }) {
  return request({
    url: '/auth/change-password/',
    method: 'post',
    data
  })
}
