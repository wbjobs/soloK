<template>
  <div class="quality-dashboard">
    <div class="stats-cards">
      <el-row :gutter="20">
        <el-col :span="6">
          <el-card class="stat-card" shadow="hover">
            <div class="stat-content">
              <div class="stat-icon kappa">
                <el-icon :size="32"><TrendCharts /></el-icon>
              </div>
              <div class="stat-info">
                <div class="stat-value">{{ (overview?.avg_kappa || 0).toFixed(2) }}</div>
                <div class="stat-label">平均Kappa系数</div>
              </div>
            </div>
            <div class="stat-footer">
              <span :class="kappaClass">
                {{ kappaInterpretation }}
              </span>
            </div>
          </el-card>
        </el-col>
        <el-col :span="6">
          <el-card class="stat-card" shadow="hover">
            <div class="stat-content">
              <div class="stat-icon agreement">
                <el-icon :size="32"><CircleCheck /></el-icon>
              </div>
              <div class="stat-info">
                <div class="stat-value">{{ agreementRate }}%</div>
                <div class="stat-label">一致率</div>
              </div>
            </div>
            <div class="stat-footer">
              <span>基于 {{ overview?.total_annotations || 0 }} 条标注</span>
            </div>
          </el-card>
        </el-col>
        <el-col :span="6">
          <el-card class="stat-card" shadow="hover">
            <div class="stat-content">
              <div class="stat-icon pending">
                <el-icon :size="32"><ChatDotRound /></el-icon>
              </div>
              <div class="stat-info">
                <div class="stat-value">{{ overview?.pending_negotiations || 0 }}</div>
                <div class="stat-label">待协商数</div>
              </div>
            </div>
            <div class="stat-footer">
              <el-button type="primary" link size="small" @click="goToNegotiations">
                快速处理 <el-icon><ArrowRight /></el-icon>
              </el-button>
            </div>
          </el-card>
        </el-col>
        <el-col :span="6">
          <el-card class="stat-card" shadow="hover">
            <div class="stat-content">
              <div class="stat-icon resolved">
                <el-icon :size="32"><Select /></el-icon>
              </div>
              <div class="stat-info">
                <div class="stat-value">{{ resolvedCount }}</div>
                <div class="stat-label">已解决数</div>
              </div>
            </div>
            <div class="stat-footer">
              <span>解决率: {{ resolutionRate }}%</span>
            </div>
          </el-card>
        </el-col>
      </el-row>
    </div>

    <el-row :gutter="20" class="charts-row">
      <el-col :span="12">
        <el-card class="chart-card" shadow="hover">
          <template #header>
            <div class="card-header">
              <span>Kappa系数分布</span>
            </div>
          </template>
          <div ref="kappaPieChartRef" class="chart-container"></div>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card class="chart-card" shadow="hover">
          <template #header>
            <div class="card-header">
              <span>标注员质量排行</span>
            </div>
          </template>
          <div ref="qualityBarChartRef" class="chart-container"></div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="20" class="charts-row">
      <el-col :span="16">
        <el-card class="chart-card" shadow="hover">
          <template #header>
            <div class="card-header">
              <span>近期质量趋势</span>
              <el-radio-group v-model="trendDays" size="small" @change="fetchQualityTrend">
                <el-radio-button :value="7">近7天</el-radio-button>
                <el-radio-button :value="14">近14天</el-radio-button>
                <el-radio-button :value="30">近30天</el-radio-button>
              </el-radio-group>
            </div>
          </template>
          <div ref="trendChartRef" class="chart-container"></div>
        </el-card>
      </el-col>
      <el-col :span="8">
        <el-card class="chart-card kappa-guide-card" shadow="hover">
          <template #header>
            <div class="card-header">
              <span>Kappa系数解读</span>
            </div>
          </template>
          <div class="kappa-guide">
            <div class="guide-item">
              <div class="guide-level excellent">
                <span class="level-badge">0.8 - 1.0</span>
                <span class="level-text">一致性极好</span>
              </div>
              <div class="guide-desc">标注结果几乎完全一致，质量极高</div>
            </div>
            <div class="guide-item">
              <div class="guide-level good">
                <span class="level-badge">0.6 - 0.8</span>
                <span class="level-text">一致性较好</span>
              </div>
              <div class="guide-desc">标注结果基本一致，质量良好</div>
            </div>
            <div class="guide-item">
              <div class="guide-level moderate">
                <span class="level-badge">0.4 - 0.6</span>
                <span class="level-text">一致性中等</span>
              </div>
              <div class="guide-desc">存在一定差异，需关注质量</div>
            </div>
            <div class="guide-item">
              <div class="guide-level fair">
                <span class="level-badge">0.2 - 0.4</span>
                <span class="level-text">一致性一般</span>
              </div>
              <div class="guide-desc">差异较大，建议进行审核</div>
            </div>
            <div class="guide-item">
              <div class="guide-level poor">
                <span class="level-badge">0.0 - 0.2</span>
                <span class="level-text">一致性较差</span>
              </div>
              <div class="guide-desc">差异显著，需重新标注或协商</div>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-card class="table-card" shadow="hover">
      <template #header>
        <div class="card-header">
          <span>待协商任务列表</span>
          <el-button type="primary" link size="small" @click="goToNegotiations">查看全部</el-button>
        </div>
      </template>
      <el-table :data="pendingNegotiations" style="width: 100%" v-loading="loading.negotiations">
        <el-table-column label="ID" width="80" align="center">
          <template #default="{ row }">{{ row.id }}</template>
        </el-table-column>
        <el-table-column label="音频文件" min-width="180" show-overflow-tooltip>
          <template #default="{ row }">
            {{ row.audio_segment_info?.original_filename || '-' }}
          </template>
        </el-table-column>
        <el-table-column label="方言" width="120">
          <template #default="{ row }">
            {{ row.audio_segment_info?.dialect_name || '-' }}
          </template>
        </el-table-column>
        <el-table-column label="标注员1" width="130">
          <template #default="{ row }">
            <div class="annotator-mini">
              <el-avatar :size="24" :src="row.annotation1_info?.annotator_info?.avatar">
                {{ row.annotation1_info?.annotator_info?.username?.charAt(0) }}
              </el-avatar>
              <span>{{ row.annotation1_info?.annotator_info?.username }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="标注员2" width="130">
          <template #default="{ row }">
            <div class="annotator-mini">
              <el-avatar :size="24" :src="row.annotation2_info?.annotator_info?.avatar">
                {{ row.annotation2_info?.annotator_info?.username?.charAt(0) }}
              </el-avatar>
              <span>{{ row.annotation2_info?.annotator_info?.username }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="不一致数" width="100" align="center">
          <template #default="{ row }">
            <el-tag type="danger" size="small">{{ row.disagreements?.length || 0 }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="创建时间" width="160">
          <template #default="{ row }">{{ formatDate(row.created_at) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="120" fixed="right" align="center">
          <template #default="{ row }">
            <el-button type="primary" link size="small" @click="handleNegotiation(row)">
              处理
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import * as echarts from 'echarts'
import { qualityApi, statsApi } from '@/api'
import type { QualityOverview, KappaDistribution } from '@/api/quality'
import type { Negotiation } from '@/types'
import type { AnnotatorQuality } from '@/api/quality'
import { ElMessage } from 'element-plus'
import {
  TrendCharts,
  CircleCheck,
  ChatDotRound,
  Select,
  ArrowRight
} from '@element-plus/icons-vue'

const router = useRouter()

const loading = ref({
  overview: false,
  negotiations: false
})

const overview = ref<QualityOverview | null>(null)
const kappaDistribution = ref<KappaDistribution[]>([])
const qualityRanking = ref<AnnotatorQuality[]>([])
const pendingNegotiations = ref<Negotiation[]>([])
const qualityTrendData = ref<any[]>([])
const trendDays = ref(7)

const kappaPieChartRef = ref<HTMLElement>()
const qualityBarChartRef = ref<HTMLElement>()
const trendChartRef = ref<HTMLElement>()

const kappaInterpretation = computed(() => {
  const kappa = overview.value?.avg_kappa || 0
  if (kappa >= 0.8) return '一致性极好'
  if (kappa >= 0.6) return '一致性较好'
  if (kappa >= 0.4) return '一致性中等'
  if (kappa >= 0.2) return '一致性一般'
  return '一致性较差'
})

const kappaClass = computed(() => {
  const kappa = overview.value?.avg_kappa || 0
  if (kappa >= 0.6) return 'text-success'
  if (kappa >= 0.4) return 'text-warning'
  return 'text-danger'
})

const agreementRate = computed(() => {
  const dist = overview.value?.agreement_distribution
  if (!dist) return '0'
  const total = dist.excellent + dist.good + dist.moderate + dist.fair + dist.poor
  const agreed = dist.excellent + dist.good
  return total > 0 ? ((agreed / total) * 100).toFixed(1) : '0'
})

const resolvedCount = computed(() => {
  const total = overview.value?.total_annotations || 0
  const pending = overview.value?.pending_negotiations || 0
  const pendingReview = overview.value?.pending_review || 0
  return Math.max(0, total - pending - pendingReview)
})

const resolutionRate = computed(() => {
  const total = overview.value?.total_annotations || 0
  return total > 0 ? ((resolvedCount.value / total) * 100).toFixed(1) : '0'
})

const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleString('zh-CN')
}

const fetchData = async () => {
  loading.value.overview = true
  try {
    const [overviewRes, kappaRes, rankingRes] = await Promise.all([
      qualityApi.getQualityOverview(),
      qualityApi.getKappaDistribution(),
      qualityApi.getAnnotatorQualityRanking({ page_size: 10, sort_by: 'avg_kappa' })
    ])
    overview.value = overviewRes
    kappaDistribution.value = kappaRes.results || []
    qualityRanking.value = rankingRes.results || []
    
    initKappaPieChart()
    initQualityBarChart()
    fetchQualityTrend()
  } catch (error) {
    ElMessage.error('获取质量统计数据失败')
  } finally {
    loading.value.overview = false
  }
  
  fetchPendingNegotiations()
}

const fetchPendingNegotiations = async () => {
  loading.value.negotiations = true
  try {
    const res = await qualityApi.getPendingNegotiations({ page_size: 10 })
    pendingNegotiations.value = res.results || []
  } catch (error) {
    ElMessage.error('获取待协商任务失败')
  } finally {
    loading.value.negotiations = false
  }
}

const fetchQualityTrend = async () => {
  try {
    const res = await statsApi.getTimeline({ days: trendDays.value })
    qualityTrendData.value = res.data || []
    initTrendChart()
  } catch (error) {
    console.error('获取质量趋势失败', error)
  }
}

const initKappaPieChart = () => {
  if (!kappaPieChartRef.value || kappaDistribution.value.length === 0) return
  
  const chart = echarts.init(kappaPieChartRef.value)
  
  const option = {
    tooltip: {
      trigger: 'item',
      formatter: '{b}: {c} 条 ({d}%)'
    },
    legend: {
      orient: 'vertical',
      right: '5%',
      top: 'center'
    },
    series: [
      {
        type: 'pie',
        radius: ['40%', '70%'],
        center: ['35%', '50%'],
        avoidLabelOverlap: false,
        itemStyle: {
          borderRadius: 10,
          borderColor: '#fff',
          borderWidth: 2
        },
        label: {
          show: false,
          position: 'center'
        },
        emphasis: {
          label: {
            show: true,
            fontSize: 20,
            fontWeight: 'bold'
          }
        },
        labelLine: {
          show: false
        },
        data: kappaDistribution.value.map(item => ({
          value: item.count,
          name: item.range,
          itemStyle: {
            color: getKappaColor(item.min)
          }
        }))
      }
    ]
  }
  
  chart.setOption(option)
}

const getKappaColor = (min: number) => {
  if (min >= 0.8) return '#10b981'
  if (min >= 0.6) return '#3b82f6'
  if (min >= 0.4) return '#f59e0b'
  if (min >= 0.2) return '#f97316'
  return '#ef4444'
}

const initQualityBarChart = () => {
  if (!qualityBarChartRef.value || qualityRanking.value.length === 0) return
  
  const chart = echarts.init(qualityBarChartRef.value)
  
  const option = {
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        type: 'shadow'
      },
      formatter: (params: any) => {
        const data = params[0]
        return `${data.name}<br/>平均Kappa: ${data.value.toFixed(2)}`
      }
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      top: '3%',
      containLabel: true
    },
    xAxis: {
      type: 'value',
      max: 1,
      axisLabel: {
        formatter: (value: number) => value.toFixed(1)
      }
    },
    yAxis: {
      type: 'category',
      data: qualityRanking.value.map(item => item.full_name || item.annotator_name).reverse(),
      axisLabel: {
        width: 80,
        overflow: 'truncate'
      }
    },
    series: [
      {
        type: 'bar',
        data: qualityRanking.value.map(item => ({
          value: item.avg_kappa || 0,
          itemStyle: {
            color: getKappaColor(item.avg_kappa || 0),
            borderRadius: [0, 4, 4, 0]
          }
        })).reverse(),
        barWidth: '50%',
        label: {
          show: true,
          position: 'right',
          formatter: (params: any) => params.value.toFixed(2),
          color: '#374151',
          fontWeight: 500
        }
      }
    ]
  }
  
  chart.setOption(option)
}

const initTrendChart = () => {
  if (!trendChartRef.value || qualityTrendData.value.length === 0) return
  
  const chart = echarts.init(trendChartRef.value)
  
  const option = {
    tooltip: {
      trigger: 'axis'
    },
    legend: {
      data: ['标注数量', '平均Kappa'],
      top: 0
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      top: '12%',
      containLabel: true
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: qualityTrendData.value.map((item: any) => item.date)
    },
    yAxis: [
      {
        type: 'value',
        name: '标注数量'
      },
      {
        type: 'value',
        name: 'Kappa',
        max: 1,
        axisLabel: {
          formatter: (value: number) => value.toFixed(1)
        }
      }
    ],
    series: [
      {
        name: '标注数量',
        type: 'bar',
        data: qualityTrendData.value.map((item: any) => item.annotations || 0),
        itemStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(102, 126, 234, 0.8)' },
            { offset: 1, color: 'rgba(102, 126, 234, 0.3)' }
          ]),
          borderRadius: [4, 4, 0, 0]
        }
      },
      {
        name: '平均Kappa',
        type: 'line',
        yAxisIndex: 1,
        smooth: true,
        data: qualityTrendData.value.map((item: any) => item.avg_kappa || 0.7),
        lineStyle: {
          color: '#10b981',
          width: 3
        },
        symbol: 'circle',
        symbolSize: 6,
        itemStyle: {
          color: '#10b981'
        }
      }
    ]
  }
  
  chart.setOption(option)
}

const goToNegotiations = () => {
  router.push('/negotiations')
}

const handleNegotiation = (row: Negotiation) => {
  router.push(`/negotiations/${row.id}`)
}

onMounted(() => {
  fetchData()
})
</script>

<style scoped lang="scss">
.quality-dashboard {
  .stats-cards {
    margin-bottom: 20px;
  }

  .stat-card {
    border-radius: 12px;
    border: none;

    :deep(.el-card__body) {
      padding: 20px;
    }
  }

  .stat-content {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-bottom: 12px;
  }

  .stat-icon {
    width: 56px;
    height: 56px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;

    &.kappa {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    }

    &.agreement {
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    }

    &.pending {
      background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
    }

    &.resolved {
      background: linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%);
    }
  }

  .stat-info {
    .stat-value {
      font-size: 28px;
      font-weight: 700;
      color: #1f2937;
      line-height: 1.2;
    }

    .stat-label {
      font-size: 14px;
      color: #6b7280;
      margin-top: 4px;
    }
  }

  .stat-footer {
    font-size: 13px;
    color: #9ca3af;
    padding-top: 12px;
    border-top: 1px solid #f3f4f6;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .text-success {
    color: #10b981;
  }

  .text-warning {
    color: #f59e0b;
  }

  .text-danger {
    color: #ef4444;
  }

  .charts-row {
    margin-bottom: 20px;
  }

  .chart-card {
    border-radius: 12px;
    border: none;
    height: 100%;

    :deep(.el-card__header) {
      border-bottom: 1px solid #f3f4f6;
    }
  }

  .card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-weight: 600;
    color: #1f2937;
  }

  .chart-container {
    height: 320px;
    width: 100%;
  }

  .kappa-guide-card {
    .chart-container {
      height: auto;
    }
  }

  .kappa-guide {
    display: flex;
    flex-direction: column;
    gap: 12px;

    .guide-item {
      .guide-level {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 4px;

        .level-badge {
          padding: 2px 8px;
          border-radius: 4px;
          font-size: 12px;
          font-weight: 500;
          color: #fff;
        }

        .level-text {
          font-weight: 500;
          color: #1f2937;
        }
      }

      .guide-desc {
        font-size: 12px;
        color: #6b7280;
        padding-left: 66px;
      }

      &.excellent .level-badge {
        background: #10b981;
      }

      &.good .level-badge {
        background: #3b82f6;
      }

      &.moderate .level-badge {
        background: #f59e0b;
      }

      &.fair .level-badge {
        background: #f97316;
      }

      &.poor .level-badge {
        background: #ef4444;
      }
    }
  }

  .table-card {
    border-radius: 12px;
    border: none;

    :deep(.el-card__header) {
      border-bottom: 1px solid #f3f4f6;
    }
  }

  .annotator-mini {
    display: flex;
    align-items: center;
    gap: 6px;

    span {
      font-size: 13px;
      color: #374151;
    }
  }
}
</style>
