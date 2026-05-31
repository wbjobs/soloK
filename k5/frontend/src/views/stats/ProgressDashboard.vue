<template>
  <div class="progress-dashboard">
    <div class="stats-cards">
      <el-row :gutter="20">
        <el-col :span="6">
          <el-card class="stat-card" shadow="hover">
            <div class="stat-content">
              <div class="stat-icon total">
                <el-icon :size="32"><Files /></el-icon>
              </div>
              <div class="stat-info">
                <div class="stat-value">{{ overview?.total_annotations || 0 }}</div>
                <div class="stat-label">总任务数</div>
              </div>
            </div>
            <div class="stat-footer">
              <span>目标: 10,000 条</span>
            </div>
          </el-card>
        </el-col>
        <el-col :span="6">
          <el-card class="stat-card" shadow="hover">
            <div class="stat-content">
              <div class="stat-icon completed">
                <el-icon :size="32"><CircleCheck /></el-icon>
              </div>
              <div class="stat-info">
                <div class="stat-value">{{ overview?.completed_annotations || 0 }}</div>
                <div class="stat-label">已完成数</div>
              </div>
            </div>
            <div class="stat-footer">
              <span>完成率: {{ completionRate }}%</span>
            </div>
          </el-card>
        </el-col>
        <el-col :span="6">
          <el-card class="stat-card" shadow="hover">
            <div class="stat-content">
              <div class="stat-icon in-progress">
                <el-icon :size="32"><Loading /></el-icon>
              </div>
              <div class="stat-info">
                <div class="stat-value">{{ inProgressCount }}</div>
                <div class="stat-label">标注中</div>
              </div>
            </div>
            <div class="stat-footer">
              <span>{{ annotatorProgress.length }} 位标注员正在工作</span>
            </div>
          </el-card>
        </el-col>
        <el-col :span="6">
          <el-card class="stat-card" shadow="hover">
            <div class="stat-content">
              <div class="stat-icon pending">
                <el-icon :size="32"><Clock /></el-icon>
              </div>
              <div class="stat-info">
                <div class="stat-value">{{ pendingCount }}</div>
                <div class="stat-label">待标注</div>
              </div>
            </div>
            <div class="stat-footer">
              <span>预计剩余: {{ estimatedRemaining }}</span>
            </div>
          </el-card>
        </el-col>
      </el-row>
    </div>

    <el-card class="chart-card" shadow="hover">
      <template #header>
        <div class="card-header">
          <span>标注员任务完成率</span>
          <el-radio-group v-model="pieSortBy" size="small" @change="sortPieData">
            <el-radio-button value="total">按总数</el-radio-button>
            <el-radio-button value="completed">按完成数</el-radio-button>
            <el-radio-button value="rate">按完成率</el-radio-button>
          </el-radio-group>
        </div>
      </template>
      <div class="pie-charts-grid" ref="pieChartsContainer">
        <div 
          v-for="(item, index) in sortedPieData" 
          :key="item.annotator_id"
          class="pie-chart-item"
        >
          <div class="pie-chart-header">
            <el-avatar :size="28" :src="item.avatar">
              {{ item.full_name?.charAt(0) || item.annotator_name?.charAt(0) }}
            </el-avatar>
            <span class="annotator-name">{{ item.full_name || item.annotator_name }}</span>
          </div>
          <div 
            :ref="el => setPieChartRef(el, index)" 
            class="pie-chart-canvas"
          ></div>
          <div class="pie-chart-stats">
            <div class="stat-item">
              <span class="stat-dot completed"></span>
              <span>完成 {{ item.completed }}</span>
            </div>
            <div class="stat-item">
              <span class="stat-dot in-progress"></span>
              <span>进行中 {{ item.in_progress }}</span>
            </div>
            <div class="stat-item">
              <span class="stat-dot pending"></span>
              <span>待标注 {{ item.total - item.completed - item.in_progress }}</span>
            </div>
          </div>
        </div>
      </div>
    </el-card>

    <el-card class="chart-card" shadow="hover">
      <template #header>
        <div class="card-header">
          <span>标注员进度表格</span>
        </div>
      </template>
      <el-table :data="sortedProgressData" style="width: 100%" v-loading="loading">
        <el-table-column label="排名" width="80" align="center">
          <template #default="{ $index }">
            <div class="rank-badge" :class="`rank-${$index + 1}`">
              {{ $index + 1 }}
            </div>
          </template>
        </el-table-column>
        <el-table-column label="标注员" width="180">
          <template #default="{ row }">
            <div class="annotator-info">
              <el-avatar :size="36" :src="row.avatar">
                {{ row.full_name?.charAt(0) || row.annotator_name?.charAt(0) }}
              </el-avatar>
              <div class="annotator-detail">
                <div class="annotator-name">{{ row.full_name || row.annotator_name }}</div>
                <div class="annotator-username">@{{ row.annotator_name }}</div>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="总任务" width="100" align="center">
          <template #default="{ row }">{{ row.total }}</template>
        </el-table-column>
        <el-table-column label="已完成" width="100" align="center">
          <template #default="{ row }">
            <span class="text-success">{{ row.completed }}</span>
          </template>
        </el-table-column>
        <el-table-column label="进行中" width="100" align="center">
          <template #default="{ row }">
            <span class="text-warning">{{ row.in_progress }}</span>
          </template>
        </el-table-column>
        <el-table-column label="待标注" width="100" align="center">
          <template #default="{ row }">
            <span class="text-muted">{{ row.total - row.completed - row.in_progress }}</span>
          </template>
        </el-table-column>
        <el-table-column label="完成率" width="180" align="center">
          <template #default="{ row }">
            <el-progress 
              :percentage="Math.round(row.completion_rate * 100)" 
              :color="getProgressColor(row.completion_rate)"
              :stroke-width="10"
              :show-text="true"
            />
          </template>
        </el-table-column>
        <el-table-column label="总时长" width="120" align="center">
          <template #default="{ row }">
            {{ formatMinutes(row.total_minutes || 0) }}
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, nextTick } from 'vue'
import * as echarts from 'echarts'
import { statsApi } from '@/api'
import type { StatsOverview, AnnotatorProgress, AnnotatorPieData } from '@/types'
import { ElMessage } from 'element-plus'
import {
  Files,
  CircleCheck,
  Loading,
  Clock
} from '@element-plus/icons-vue'

const loading = ref(false)
const overview = ref<StatsOverview | null>(null)
const annotatorProgress = ref<AnnotatorProgress[]>([])
const pieData = ref<AnnotatorPieData[]>([])

const pieChartsContainer = ref<HTMLElement>()
const pieChartRefs = ref<(HTMLElement | null)[]>([])

const pieSortBy = ref('rate')

const setPieChartRef = (el: any, index: number) => {
  pieChartRefs.value[index] = el as HTMLElement
}

const completionRate = computed(() => {
  if (!overview.value) return '0'
  return (overview.value.completion_rate || 0).toFixed(1)
})

const inProgressCount = computed(() => {
  const statusData = overview.value?.by_status || []
  const inProgress = statusData.find(item => item.key === 'in_progress')
  return inProgress?.value || 0
})

const pendingCount = computed(() => {
  const statusData = overview.value?.by_status || []
  const pending = statusData.find(item => item.key === 'pending')
  return pending?.value || 0
})

const estimatedRemaining = computed(() => {
  const total = overview.value?.total_annotations || 0
  const completed = overview.value?.completed_annotations || 0
  const remaining = total - completed
  if (remaining <= 0) return '已完成'
  const days = Math.ceil(remaining / 50)
  return `约 ${days} 天`
})

const formatMinutes = (minutes: number) => {
  const hours = Math.floor(minutes / 60)
  const mins = Math.round(minutes % 60)
  if (hours > 0) {
    return `${hours}小时${mins}分`
  }
  return `${mins}分钟`
}

const getProgressColor = (rate: number) => {
  if (rate >= 0.8) return '#10b981'
  if (rate >= 0.5) return '#3b82f6'
  if (rate >= 0.3) return '#f59e0b'
  return '#ef4444'
}

interface PieDataWithExtra extends AnnotatorPieData {
  avatar: string | null
  completed: number
  in_progress: number
}

const sortedPieData = computed(() => {
  const data = pieData.value.map(item => {
    const progress = annotatorProgress.value.find(
      p => p.annotator_id === item.annotator_id
    )
    const completed = item.slices.find(s => s.name === '已完成')?.value || 0
    const inProgress = item.slices.find(s => s.name === '进行中')?.value || 0
    return {
      ...item,
      avatar: progress?.avatar || null,
      completed,
      in_progress: inProgress
    } as PieDataWithExtra
  })
  
  if (pieSortBy.value === 'total') {
    return data.sort((a, b) => b.total - a.total)
  } else if (pieSortBy.value === 'completed') {
    return data.sort((a, b) => b.completed - a.completed)
  } else {
    return data.sort((a, b) => {
      const rateA = a.total > 0 ? a.completed / a.total : 0
      const rateB = b.total > 0 ? b.completed / b.total : 0
      return rateB - rateA
    })
  }
})

const sortedProgressData = computed(() => {
  return [...annotatorProgress.value].sort((a, b) => b.completion_rate - a.completion_rate)
})

const fetchData = async () => {
  loading.value = true
  try {
    const [overviewRes, progressRes, pieRes] = await Promise.all([
      statsApi.getOverview(),
      statsApi.getAnnotatorProgress(),
      statsApi.getAnnotatorProgressPie()
    ])
    
    overview.value = overviewRes
    annotatorProgress.value = progressRes.results || []
    pieData.value = pieRes.results || []
    
    await nextTick()
    initPieCharts()
  } catch (error) {
    ElMessage.error('获取进度数据失败')
  } finally {
    loading.value = false
  }
}

const initPieCharts = () => {
  sortedPieData.value.forEach((item, index) => {
    const el = pieChartRefs.value[index]
    if (!el) return
    
    const chart = echarts.init(el)
    
    const option = {
      tooltip: {
        trigger: 'item',
        formatter: '{b}: {c} ({d}%)'
      },
      series: [
        {
          type: 'pie',
          radius: ['45%', '75%'],
          center: ['50%', '50%'],
          avoidLabelOverlap: false,
          itemStyle: {
            borderRadius: 4,
            borderColor: '#fff',
            borderWidth: 2
          },
          label: {
            show: false
          },
          emphasis: {
            scale: false
          },
          data: item.slices.map(slice => ({
            value: slice.value,
            name: slice.name,
            itemStyle: {
              color: slice.color
            }
          }))
        }
      ]
    }
    
    chart.setOption(option)
  })
}

const sortPieData = () => {
  nextTick(() => {
    initPieCharts()
  })
}

onMounted(() => {
  fetchData()
})
</script>

<style scoped lang="scss">
.progress-dashboard {
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

    &.total {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    }

    &.completed {
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    }

    &.in-progress {
      background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
    }

    &.pending {
      background: linear-gradient(135deg, #6b7280 0%, #4b5563 100%);
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
    font-weight: 600;
  }

  .text-warning {
    color: #f59e0b;
    font-weight: 600;
  }

  .text-muted {
    color: #9ca3af;
  }

  .chart-card {
    border-radius: 12px;
    border: none;
    height: 100%;
    margin-bottom: 20px;

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

  .pie-charts-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 20px;
    padding-top: 8px;
  }

  .pie-chart-item {
    background: #f9fafb;
    border-radius: 10px;
    padding: 16px;
    transition: all 0.2s ease;

    &:hover {
      background: #f3f4f6;
      transform: translateY(-2px);
    }

    .pie-chart-header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 12px;

      .annotator-name {
        font-weight: 500;
        color: #1f2937;
        font-size: 14px;
      }
    }

    .pie-chart-canvas {
      height: 140px;
      width: 100%;
    }

    .pie-chart-stats {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-top: 12px;

      .stat-item {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 12px;
        color: #6b7280;

        .stat-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;

          &.completed {
            background: #10b981;
          }

          &.in-progress {
            background: #f59e0b;
          }

          &.pending {
            background: #9ca3af;
          }
        }
      }
    }
  }

  .rank-badge {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto;
    font-weight: 600;
    font-size: 13px;
    background: #f3f4f6;
    color: #6b7280;

    &.rank-1 {
      background: linear-gradient(135deg, #ffd700 0%, #ffb700 100%);
      color: #fff;
    }

    &.rank-2 {
      background: linear-gradient(135deg, #c0c0c0 0%, #a8a8a8 100%);
      color: #fff;
    }

    &.rank-3 {
      background: linear-gradient(135deg, #cd7f32 0%, #b87333 100%);
      color: #fff;
    }
  }

  .annotator-info {
    display: flex;
    align-items: center;
    gap: 12px;

    .annotator-detail {
      .annotator-name {
        font-weight: 500;
        color: #1f2937;
        font-size: 14px;
      }

      .annotator-username {
        font-size: 12px;
        color: #9ca3af;
        margin-top: 2px;
      }
    }
  }
}
</style>
