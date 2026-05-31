import request from './axios'
import type { Dataset, ApiResponse } from '@/types'

export function getDatasetList(params?: any) {
  return request<any, ApiResponse<Dataset[]>>({
    url: '/datasets/datasets/',
    method: 'get',
    params
  })
}

export function getDatasetDetail(id: string) {
  return request<any, Dataset>({
    url: `/datasets/datasets/${id}/`,
    method: 'get'
  })
}

export function createDataset(data: any) {
  return request<any, Dataset>({
    url: '/datasets/datasets/',
    method: 'post',
    data
  })
}

export function exportDataset(id: string, data?: { format?: string; expires_hours?: number }) {
  return request({
    url: `/datasets/datasets/${id}/export/`,
    method: 'post',
    data
  })
}

export function getDatasetPreview(id: string, limit = 10) {
  return request({
    url: `/datasets/datasets/${id}/preview/?limit=${limit}`,
    method: 'get'
  })
}

export function filterAudioForDataset(data: any) {
  return request({
    url: '/datasets/datasets/filter_audio/',
    method: 'post',
    data
  })
}

export function getDatasetExport(datasetId: string) {
  return request({
    url: `/datasets/dataset/${datasetId}/export`,
    method: 'get'
  })
}

export function getExportList(params?: any) {
  return request<any, ApiResponse<any[]>>({
    url: '/datasets/exports/',
    method: 'get',
    params
  })
}
