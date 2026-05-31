import request from './axios'
import type { Annotation, KappaResult, Negotiation, ApiResponse } from '@/types'

export function createAnnotation(audioSegmentId: string) {
  return request<any, Annotation>({
    url: '/annotations/annotations/',
    method: 'post',
    data: { audio_segment: audioSegmentId }
  })
}

export function getAnnotation(id: number) {
  return request<any, Annotation>({
    url: `/annotations/annotations/${id}/`,
    method: 'get'
  })
}

export function updateAnnotation(id: number, data: any) {
  return request<any, Annotation>({
    url: `/annotations/annotations/${id}/`,
    method: 'patch',
    data
  })
}

export function submitAnnotation(id: number, data?: { time_spent?: number; notes?: string; phonemes?: any[] }) {
  return request<any, Annotation>({
    url: `/annotations/annotations/${id}/submit/`,
    method: 'post',
    data
  })
}

export function getAnnotationList(params?: any) {
  return request<any, ApiResponse<Annotation[]>>({
    url: '/annotations/annotations/',
    method: 'get',
    params
  })
}

export function getAnnotations(params?: any) {
  return getAnnotationList(params)
}

export function getMyAnnotations() {
  return request<any, ApiResponse<Annotation[]>>({
    url: '/annotations/annotations/my_annotations/',
    method: 'get'
  })
}

export function getAnnotationProgress(annotatorId?: number) {
  const url = annotatorId 
    ? `/annotations/annotations/progress/?annotator=${annotatorId}`
    : '/annotations/annotations/progress/'
  return request({
    url,
    method: 'get'
  })
}

export function toggleDisplayMode(id: number) {
  return request({
    url: `/annotations/annotations/${id}/toggle_display_mode/`,
    method: 'post'
  })
}

export function convertPhonemes(id: number, targetMode: 'pinyin' | 'ipa') {
  return request({
    url: `/annotations/annotations/${id}/convert_phonemes/`,
    method: 'post',
    data: { target_mode: targetMode }
  })
}

export function calculateKappa(annotation1: any, annotation2: any) {
  return request<any, KappaResult>({
    url: '/annotations/kappa/',
    method: 'post',
    data: { annotation1, annotation2 }
  })
}

export function getNegotiationList(params?: any) {
  return request<any, ApiResponse<Negotiation[]>>({
    url: '/annotations/negotiations/',
    method: 'get',
    params
  })
}

export function resolveNegotiation(id: number, data: { final_annotation: any[]; notes?: string }) {
  return request<any, Negotiation>({
    url: `/annotations/negotiations/${id}/resolve/`,
    method: 'post',
    data
  })
}

export function getOrCreateAnnotation(audioSegmentId: string) {
  return request<any, Annotation>({
    url: '/annotations/annotations/get_or_create/',
    method: 'post',
    data: { audio_segment: audioSegmentId }
  })
}

export function setDisplayMode(id: number, displayMode: 'pinyin' | 'ipa') {
  return request({
    url: `/annotations/annotations/${id}/set_display_mode/`,
    method: 'post',
    data: { display_mode: displayMode }
  })
}

export function batchResolveNegotiations(data: { negotiation_ids: number[]; use_annotator?: number; notes?: string }) {
  return request({
    url: '/annotations/negotiations/batch_resolve/',
    method: 'post',
    data
  })
}
