import request from './axios'
import type { Annotation, Negotiation, ApiResponse } from '@/types'

export interface QualityOverview {
  total_annotations: number
  avg_kappa: number | null
  agreement_distribution: {
    excellent: number
    good: number
    moderate: number
    fair: number
    poor: number
  }
  pending_negotiations: number
  pending_review: number
}

export interface KappaDistribution {
  range: string
  count: number
  min: number
  max: number
}

export interface AnnotatorQuality {
  annotator_id: number
  annotator_name: string
  full_name: string
  avatar: string | null
  total_annotations: number
  avg_kappa: number | null
  agreement_rate: number | null
  avg_time_spent: number | null
}

export interface QualityReviewRecord {
  id: number
  annotation_id: number
  audio_segment: string
  audio_filename: string
  annotator: string
  reviewer: string | null
  kappa_score: number | null
  status: string
  status_display: string
  reviewed_at: string | null
  created_at: string
}

export interface DialectQuality {
  dialect_id: number
  dialect_name: string
  total_annotations: number
  avg_kappa: number | null
  agreement_rate: number | null
  completion_rate: number
}

export function getQualityOverview() {
  return request<any, QualityOverview>({
    url: '/quality/overview/',
    method: 'get'
  })
}

export function getKappaDistribution() {
  return request<any, { count: number; results: KappaDistribution[] }>({
    url: '/quality/kappa-distribution/',
    method: 'get'
  })
}

export function getAnnotatorQualityRanking(params?: { page_size?: number; sort_by?: string }) {
  const pageSize = params?.page_size || 20
  const sortBy = params?.sort_by || 'avg_kappa'
  return request<any, { count: number; results: AnnotatorQuality[] }>({
    url: `/quality/annotator-ranking/?page_size=${pageSize}&sort_by=${sortBy}`,
    method: 'get'
  })
}

export function getQualityReviewRecords(params?: { page_size?: number }) {
  const pageSize = params?.page_size || 10
  return request<any, ApiResponse<QualityReviewRecord[]>>({
    url: `/quality/review-records/?page_size=${pageSize}`,
    method: 'get'
  })
}

export function getDialectQualityComparison() {
  return request<any, { count: number; results: DialectQuality[] }>({
    url: '/quality/dialect-comparison/',
    method: 'get'
  })
}

export function getPendingReviewAnnotations(params?: any) {
  return request<any, ApiResponse<Annotation[]>>({
    url: '/quality/pending-review/',
    method: 'get',
    params
  })
}

export function getPendingNegotiations(params?: any) {
  return request<any, ApiResponse<Negotiation[]>>({
    url: '/quality/pending-negotiations/',
    method: 'get',
    params
  })
}
