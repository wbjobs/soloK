import request from './axios'
import type { DialectRegion, DialectSubregion, ApiResponse } from '@/types'

export function getDialectList(params?: any) {
  return request<any, ApiResponse<DialectRegion[]>>({
    url: '/dialects/regions/',
    method: 'get',
    params
  })
}

export function getDialectDetail(id: number) {
  return request<any, DialectRegion>({
    url: `/dialects/regions/${id}/`,
    method: 'get'
  })
}

export function getSubregionList(params?: any) {
  return request<any, ApiResponse<DialectSubregion[]>>({
    url: '/dialects/subregions/',
    method: 'get',
    params
  })
}

export function getDialectRegions(params?: any) {
  return getDialectList(params)
}

export function getDialectSubregions(params?: any) {
  return getSubregionList(params)
}

export function getDialectRegionDetail(id: number) {
  return getDialectDetail(id)
}

export function getToneSystems() {
  return request({
    url: '/dialects/tone-systems/',
    method: 'get'
  })
}

export function getDialectToneSystem(id: number) {
  return request({
    url: `/dialects/regions/${id}/tone_system/`,
    method: 'get'
  })
}

export function createDialect(data: any) {
  return request({
    url: '/dialects/regions/',
    method: 'post',
    data
  })
}

export function updateDialect(id: number, data: any) {
  return request({
    url: `/dialects/regions/${id}/`,
    method: 'patch',
    data
  })
}

export function deleteDialect(id: number) {
  return request({
    url: `/dialects/regions/${id}/`,
    method: 'delete'
  })
}

export function createSubregion(data: any) {
  return request({
    url: '/dialects/subregions/',
    method: 'post',
    data
  })
}

export function updateSubregion(id: number, data: any) {
  return request({
    url: `/dialects/subregions/${id}/`,
    method: 'patch',
    data
  })
}

export function deleteSubregion(id: number) {
  return request({
    url: `/dialects/subregions/${id}/`,
    method: 'delete'
  })
}
