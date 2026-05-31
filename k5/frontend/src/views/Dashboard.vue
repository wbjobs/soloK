<template>
  <div class="dashboard">
    <div class="stats-cards">
      <el-row :gutter="20">
        <el-col :span="6">
          <el-card class="stat-card" shadow="hover">
            <div class="stat-content">
              <div class="stat-icon audio">
                <el-icon :size="32"><Headset /></el-icon>
              </div>
              <div class="stat-info">
                <div class="stat-value">{{ overview?.total_audio || 0 }}</div>
                <div class="stat-label">语音片段总数</div>
              </div>
            </div>
            <div class="stat-footer">
              <span>总时长: {{ formatMinutes(overview?.total_duration_minutes || 0) }}</span>
            </div>
          </el-card>
        </el-col>
        <el-col :span="6">
          <el-card class="stat-card" shadow="hover">
            <div class="stat-content">
              <div class="stat-icon annotation">
                <el-icon :size="32"><Edit /></el-icon>
              </div>
              <div class="stat-info">
                <div class="stat-value">{{ overview?.total_annotations || 0 }}</div>
                <div class="stat-label">标注任务总数</div>
              </div>
            </div>
            <div class="stat-footer">
              <span>已完成: {{ overview?.completed_annotations || 0 }}</span>
            </div>
          </el-card>
        </el-col>
        <el-col :span="6">
          <el-card class="stat-card" shadow="hover">
            <div class="stat-content">
              <div class="stat-icon annotator">
                <el-icon :size="32"><User /></el-icon>
              </div>
              <div class="stat-info">
                <div class="stat-value">{{ overview?.total_annotators || 0 }}</div>
                <div class="stat-label">标注员数量</div>
              </div>
            </div>
            <div class="stat-footer">
              <span>完成率: {{ (overview?.completion_rate || 0).toFixed(1) }}%</span>
            </div>
          </el-card>
        </el-col>
        <el-col :span="6">
          <el-card class="stat-card" shadow="hover">
            <div class="stat-content">
              <div class="stat-icon quality">
                <el-icon :size="32"><CircleCheck /></el-icon>
              </div>
              <div class="stat-info">
                <div class="stat-value">{{ (overview?.avg_kappa || 0).toFixed(2) }}</div>
                <div class="stat-label">平均Kappa</div>
              </div>
            </div>
            <div class="stat-footer">
              <span :class="kappaClass">
                {{ kappaInterpretation }}
              </span>
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
              <span>标注状态分布</span>
            </div>
          </template>
          <div ref="statusChartRef" class="chart-container"></div>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card class="chart-card" shadow="hover">
          <template #header>
            <div class="card-header">
              <span>标注员工作量TOP5</span>
              <el-button type="primary" link @click="$router.push('/ranking')">查看全部</el-button>
            </div>
          </template>
          <div ref="rankingChartRef" class="chart-container"></div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="20" class="charts-row">
      <el-col :span="16">
        <el-card class="chart-card" shadow="hover">
          <template #header>
            <div class="card-header">
              <span>近7日标注趋势</span>
            </div>
          </template>
          <div ref="timelineChartRef" class="chart-container"></div>
        </el-card>
      </el-col>
      <el-col :span="8">
        <el-card class="chart-card" shadow="hover">
          <template #header>
            <div class="card-header">
              <span>方言片区分布</span>
            </div>
          </template>
          <div ref="dialectChartRef" class="chart-container"></div>
        </el-card>
      </el-col>
    </el-row>

    <el-card class="recent-card" shadow="hover">
      <template #header>
        <div class="card-header">
          <span>最新标注任务</span>
          <el-button type="primary" link @click="$router.push('/annotations')">查看全部</el-button>
        </div>
      </template>
      <el-table :data="recentAnnotations" style="width: 100%" v-loading="loading">
        <el-table-column prop="id" label="ID" width="80" />
        <el-table-column label="语音片段" width="200">
          <template #default="{ row }">
            {{ row.audio_segment_info?.original_filename || '-' }}
          </template>
        </el-table-column>
        <el-table-column label="方言" width="120">
          <template #default="{ row }">
            {{ row.audio_segment_info?.dialect_name || '-' }}
          </template>
        </el-table-column>
        <el-table-column label="标注员" width="120">
          <template #default="{ row }">
            {{ row.annotator_info?.username || '-' }}
          </template>
        </el-table-column>
        <el-table-column prop="phoneme_count" label="音素数" width="100" />
        <el-table-column prop="status_display" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="statusTagType(row.status)" size="small">
              {{ row.status_display }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="created_at" label="创建时间" width="180">
          <template #default="{ row }">
            {{ formatDate(row.created_at) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="120" fixed="right">
          <template #default="{ row }">
            <el-button
              type="primary"
              link
              size="small"
              @click="$router.push(`/annotate/${row.audio_segment}`)"
            >
              标注
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
import { statsApi, annotationsApi } from '@/api'
import type { StatsOverview, Annotation } from '@/types'
import { ElMessage } from 'element-plus'
import {
  Headset,
  Edit,
  User,
  CircleCheck
} from '@element-plus/icons-vue'

const router = useRouter()

const loading = ref(false)
const overview = ref<StatsOverview | null>(null)
const recentAnnotations = ref<Annotation[]>([])

const statusChartRef = ref<HTMLElement>()
const rankingChartRef = ref<HTMLElement>()
const timelineChartRef = ref<HTMLElement>()
const dialectChartRef = ref<HTMLElement>()

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

const formatMinutes = (minutes: number) => {
  const hours = Math.floor(minutes / 60)
  const mins = Math.round(minutes % 60)
  if (hours > 0) {
    return `${hours}小时${mins}分钟`
  }
  return `${mins}分钟`
}

const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleString('zh-CN')
}

const statusTagType = (status: string) => {
  const types: Record<string, string> = {
    'pending': 'info',
    'in_progress': 'warning',
    'submitted': 'success',
    'needs_review': 'danger'
  }
  return types[status] || 'info'
}

const fetchData = async () => {
  loading.value = true
  try {
    const [overviewRes, annotationsRes] = await Promise.all([
      statsApi.getOverview(),
      annotationsApi.getAnnotations({ page_size: 5 })
    ])
    overview.value = overviewRes as any
    recentAnnotations.value = (annotationsRes as any).results || []
    
    initCharts()
  } catch (error) {
    ElMessage.error('获取统计数据失败')
  } finally {
    loading.value = false
  }
}

const initCharts = () => {
  if (overview.value?.by_status) {
    initStatusChart()
  }
  initRankingChart()
  initTimelineChart()
  initDialectChart()
}

const initStatusChart = () => {
  if (!statusChartRef.value) return
  
  const chart = echarts.init(statusChartRef.value)
  const data = overview.value?.by_status || []
  
  const option = {
    tooltip: {
      trigger: 'item',
      formatter: '{b}: {c} ({d}%)'
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
        data: data.map(item => ({
          value: item.value,
          name: item.name
        })),
        color: ['#67c23a', '#e6a23c', '#909399', '#f56c6c']
      }
    ]
  }
  
  chart.setOption(option)
}

const initRankingChart = async () => {
  if (!rankingChartRef.value) return
  
  try {
    const res = await statsApi.getAnnotatorRanking({ page_size: 5 })
    const data = res.results || []
    
    const chart = echarts.init(rankingChartRef.value)
    
    const option = {
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'shadow'
        }
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '3%',
        containLabel: true
      },
      xAxis: {
        type: 'value',
        boundaryGap: [0, 0.01]
      },
      yAxis: {
        type: 'category',
        data: data.map((item: any) => item.full_name).reverse()
      },
      series: [
        {
          type: 'bar',
          data: data.map((item: any) => item.total_annotations).reverse(),
          itemStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
              { offset: 0, color: '#667eea' },
              { offset: 1, color: '#764ba2' }
            ]),
            borderRadius: [0, 4, 4, 0]
          }
        }
      ]
    }
    
    chart.setOption(option)
  } catch (error) {
    console.error('获取排行数据失败', error)
  }
}

const initTimelineChart = async () => {
  if (!timelineChartRef.value) return
  
  try {
    const res = await statsApi.getTimeline({ days: 7 })
    const data = res.data || []
    
    const chart = echarts.init(timelineChartRef.value)
    
    const option = {
      tooltip: {
        trigger: 'axis'
      },
      legend: {
        data: ['标注数', '音频时长(分钟)']
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '3%',
        containLabel: true
      },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: data.map((item: any) => item.date)
      },
      yAxis: [
        {
          type: 'value',
          name: '标注数'
        },
        {
          type: 'value',
          name: '时长(分钟)'
        }
      ],
      series: [
        {
          name: '标注数',
          type: 'line',
          smooth: true,
          data: data.map((item: any) => item.annotations),
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(102, 126, 234, 0.5)' },
              { offset: 1, color: 'rgba(102, 126, 234, 0.05)' }
            ])
          },
          lineStyle: {
            color: '#667eea',
            width: 2
          }
        },
        {
          name: '音频时长(分钟)',
          type: 'line',
          smooth: true,
          yAxisIndex: 1,
          data: data.map((item: any) => item.duration),
          lineStyle: {
            color: '#f59e0b',
            width: 2
          }
        }
      ]
    }
    
    chart.setOption(option)
  } catch (error) {
    console.error('获取时间线数据失败', error)
  }
}

const initDialectChart = async () => {
  if (!dialectChartRef.value) return
  
  try {
    const res = await statsApi.getDialectStats()
    const data = res.data || []
    
    const chart = echarts.init(dialectChartRef.value)
    
    const option = {
      tooltip: {
        trigger: 'item',
        formatter: '{b}: {c} ({d}%)'
      },
      series: [
        {
          type: 'pie',
          radius: '60%',
          center: ['50%', '50%'],
          data: data.map((item: any) => ({
            value: item.count,
            name: item.name
          })),
          emphasis: {
            itemStyle: {
              shadowBlur: 10,
              shadowOffsetX: 0,
              shadowColor: 'rgba(0, 0, 0, 0.5)'
            }
          }
        }
      ]
    }
    
    chart.setOption(option)
  } catch (error) {
    console.error('获取方言统计失败', error)
  }
}

onMounted(() => {
  fetchData()
})
</script>

<style scoped lang="scss">
.dashboard {
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

    &.audio {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    }

    &.annotation {
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    }

    &.annotator {
      background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
    }

    &.quality {
      background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
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

  .recent-card {
    border-radius: 12px;
    border: none;

    :deep(.el-card__header) {
      border-bottom: 1px solid #f3f4f6;
    }
  }
}
</style>
