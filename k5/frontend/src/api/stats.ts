import request from './axios'
import type { 
  StatsOverview, AnnotatorProgress, AnnotatorRanking, 
  AnnotatorPieData 
} from '@/types'

export function getStatsOverview() {
  return request<any, StatsOverview>({
    url: '/stats/overview/',
    method: 'get'
  })
}

export function getAnnotatorProgress() {
  return request<any, { count: number; results: AnnotatorProgress[] }>({
    url: '/stats/annotator-progress/',
    method: 'get'
  })
}

export function getAnnotatorProgressPie() {
  return request<any, { count: number; results: AnnotatorPieData[] }>({
    url: '/stats/annotator-progress/pie/',
    method: 'get'
  })
}

export function getAnnotatorRankingList(limit = 20, sortBy = 'total_annotations') {
  return request<any, { count: number; results: AnnotatorRanking[]; sort_by: string }>({
    url: `/stats/annotator-ranking/?limit=${limit}&sort_by=${sortBy}`,
    method: 'get'
  })
}

export function getDialectStats() {
  return request({
    url: '/stats/dialects/',
    method: 'get'
  })
}

export function getQualityStats() {
  return request({
    url: '/stats/quality/',
    method: 'get'
  })
}

export function getTimelineStats(days = 30) {
  return request({
    url: `/stats/timeline/?days=${days}`,
    method: 'get'
  })
}

export function getNegotiationStats() {
  return request({
    url: '/stats/negotiations/',
    method: 'get'
  })
}

export function getOverview() {
  return getStatsOverview()
}

export function getTimeline(params?: { days?: number }) {
  return getTimelineStats(params?.days || 30)
}

export function getAnnotatorRanking(params?: { page_size?: number }) {
  return getAnnotatorRankingList(params?.page_size || 20)
}
