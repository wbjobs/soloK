import request from './axios'
import type { AudioSegment, ApiResponse } from '@/types'

export interface UploadAudioData {
  file: File
  dialect: number
  subregion?: number
  speaker_gender?: string
  speaker_age?: string
  text_transcript?: string
  required_annotations?: number
}

export function getAudioList(params?: any) {
  return request<any, ApiResponse<AudioSegment[]>>({
    url: '/audio/segments/',
    method: 'get',
    params
  })
}

export function getAudioDetail(id: string) {
  return request<any, AudioSegment>({
    url: `/audio/segments/${id}/`,
    method: 'get'
  })
}

export function uploadAudio(data: UploadAudioData | FormData) {
  let formData: FormData
  if (data instanceof FormData) {
    formData = data
  } else {
    formData = new FormData()
    Object.entries(data).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        formData.append(key, value as any)
      }
    })
  }
  return request<any, AudioSegment>({
    url: '/audio/segments/upload/',
    method: 'post',
    data: formData,
    headers: {
      'Content-Type': 'multipart/form-data'
    }
  })
}

export function processAudio(id: string) {
  return request({
    url: `/audio/segments/${id}/process/`,
    method: 'post'
  })
}

export function batchProcessAudio(ids: string[]) {
  return request({
    url: '/audio/segments/batch_process/',
    method: 'post',
    data: { audio_ids: ids }
  })
}

export function assignAnnotators(id: string, annotatorIds: number[]) {
  return request({
    url: `/audio/segments/${id}/assign/`,
    method: 'post',
    data: { annotator_ids: annotatorIds }
  })
}

export function getMyTasks() {
  return request<any, ApiResponse<AudioSegment[]>>({
    url: '/audio/segments/my_tasks/',
    method: 'get'
  })
}

export function getAudioStats() {
  return request({
    url: '/audio/segments/stats/',
    method: 'get'
  })
}

export function deleteAudio(id: string) {
  return request({
    url: `/audio/segments/${id}/`,
    method: 'delete'
  })
}

export function batchAssign(data: { audio_ids: string[]; annotator_ids: number[]; annotations_per_annotator: number }) {
  return request({
    url: '/audio/segments/batch_assign/',
    method: 'post',
    data
  })
}

export function getAudioAnnotations(audioId: string) {
  return request<any, ApiResponse<import('@/types').Annotation[]>>({
    url: `/audio/segments/${audioId}/annotations/`,
    method: 'get'
  })
}

export interface SimilarSpeaker {
  audio_id: string
  similarity: number
  similarity_percent: number
  filename: string
  dialect_name: string
  subregion_name: string
  speaker_gender: string
  speaker_age: string
  duration: number
  status: string
}

export function getSimilarSpeakers(audioId: string, params?: { top_k?: number; threshold?: number; dialect?: number }) {
  return request<any, { target_audio_id: string; similar_speakers: SimilarSpeaker[]; total_checked: number }>({
    url: `/audio/segments/${audioId}/similar_speakers/`,
    method: 'get',
    params
  })
}

export interface SpeakerCluster {
  x: number
  y: number
  cluster: string
  id: string
  filename: string
  dialect_name: string
  subregion_name: string
  speaker_gender: string
  speaker_age: string
  duration: number
  status: string
}

export function getSpeakerClusters(params?: { dialect?: number; threshold?: number; projection?: string }) {
  return request<any, {
    clusters: Record<string, string[]>
    audio_to_cluster: Record<string, string>
    projections: SpeakerCluster[]
    num_clusters: number
    threshold: number
    total_audio: number
    message?: string
  }>({
    url: '/audio/segments/speaker_clusters/',
    method: 'get',
    params
  })
}

export function compareSpeakers(audioId1: string, audioId2: string) {
  return request<any, {
    audio1: { id: string; filename: string }
    audio2: { id: string; filename: string }
    similarity: number
    similarity_percent: number
    interpretation: string
  }>({
    url: '/audio/segments/compare_speakers/',
    method: 'post',
    data: { audio_id1: audioId1, audio_id2: audioId2 }
  })
}
