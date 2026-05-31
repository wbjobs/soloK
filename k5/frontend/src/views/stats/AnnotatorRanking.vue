<template>
  <div class="annotator-ranking">
    <el-card class="filter-card" shadow="hover">
      <div class="filter-section">
        <div class="filter-item">
          <span class="filter-label">排序方式</span>
          <el-radio-group v-model="sortBy" size="default" @change="fetchData">
            <el-radio-button value="total_annotations">标注数量</el-radio-button>
            <el-radio-button value="total_minutes">总时长</el-radio-button>
            <el-radio-button value="avg_kappa">平均Kappa</el-radio-button>
          </el-radio-group>
        </div>
        <div class="filter-item">
          <span class="filter-label">时间范围</span>
          <el-radio-group v-model="timeRange" size="default" @change="fetchData">
            <el-radio-button value="today">今日</el-radio-button>
            <el-radio-button value="week">本周</el-radio-button>
            <el-radio-button value="month">本月</el-radio-button>
            <el-radio-button value="all">全部</el-radio-button>
          </el-radio-group>
        </div>
        <div class="filter-item">
          <el-button type="primary" :icon="Refresh" @click="fetchData">刷新</el-button>
        </div>
      </div>
    </el-card>

    <el-row :gutter="20">
      <el-col :span="10">
        <el-card class="chart-card" shadow="hover">
          <template #header>
            <div class="card-header">
              <span>工作量TOP10</span>
            </div>
          </template>
          <div ref="rankingChartRef" class="chart-container"></div>
        </el-card>
      </el-col>
      <el-col :span="14">
        <el-card class="ranking-card" shadow="hover">
          <template #header>
            <div class="card-header">
              <span>标注员排行榜</span>
              <span class="total-count">共 {{ rankingData.length }} 位标注员</span>
            </div>
          </template>
          <div class="ranking-table-wrapper">
            <el-table 
              :data="rankingData" 
              style="width: 100%" 
              v-loading="loading"
              :row-class-name="rowClassName"
            >
              <el-table-column label="排名" width="90" align="center" fixed="left">
                <template #default="{ row, $index }">
                  <div class="rank-display">
                    <template v-if="$index === 0">
                      <div class="medal gold">
                        <el-icon :size="22"><Trophy /></el-icon>
                      </div>
                    </template>
                    <template v-else-if="$index === 1">
                      <div class="medal silver">
                        <el-icon :size="20"><Trophy /></el-icon>
                      </div>
                    </template>
                    <template v-else-if="$index === 2">
                      <div class="medal bronze">
                        <el-icon :size="18"><Trophy /></el-icon>
                      </div>
                    </template>
                    <template v-else>
                      <span class="rank-number">{{ $index + 1 }}</span>
                    </template>
                  </div>
                </template>
              </el-table-column>
              <el-table-column label="标注员" width="200" fixed="left">
                <template #default="{ row }">
                  <div class="annotator-info">
                    <el-avatar :size="40" :src="row.avatar" class="annotator-avatar">
                      {{ row.full_name?.charAt(0) || row.annotator_name?.charAt(0) }}
                    </el-avatar>
                    <div class="annotator-detail">
                      <div class="annotator-name">{{ row.full_name || row.annotator_name }}</div>
                      <div class="annotator-username">@{{ row.annotator_name }}</div>
                    </div>
                  </div>
                </template>
              </el-table-column>
              <el-table-column label="标注总数" width="120" align="center">
                <template #default="{ row }">
                  <span class="stat-highlight">{{ row.total_annotations }}</span>
                </template>
              </el-table-column>
              <el-table-column label="总时长" width="130" align="center">
                <template #default="{ row }">
                  {{ formatMinutes(row.total_minutes || 0) }}
                </template>
              </el-table-column>
              <el-table-column label="平均Kappa" width="120" align="center">
                <template #default="{ row }">
                  <span :class="getKappaClass(row.avg_kappa)">
                    {{ (row.avg_kappa || 0).toFixed(2) }}
                  </span>
                </template>
              </el-table-column>
              <el-table-column label="平均用时" width="120" align="center">
                <template #default="{ row }">
                  {{ formatTime(row.avg_time_per_annotation || 0) }}
                </template>
              </el-table-column>
              <el-table-column label="质量分" width="120" align="center">
                <template #default="{ row }">
                  <el-progress 
                    :percentage="calculateQualityScore(row)" 
                    :color="getQualityScoreColor(calculateQualityScore(row))"
                    :stroke-width="10"
                    :show-text="true"
                  />
                </template>
              </el-table-column>
            </el-table>
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, nextTick } from 'vue'
import * as echarts from 'echarts'
import { statsApi } from '@/api'
import type { AnnotatorRanking } from '@/types'
import { ElMessage } from 'element-plus'
import { Refresh, Trophy } from '@element-plus/icons-vue'

const loading = ref(false)
const timeRange = ref('all')
const sortBy = ref('total_annotations')
const rankingData = ref<AnnotatorRanking[]>([])

const rankingChartRef = ref<HTMLElement>()

const formatMinutes = (minutes: number) => {
  const hours = Math.floor(minutes / 60)
  const mins = Math.round(minutes % 60)
  if (hours > 0) {
    return `${hours}小时${mins}分`
  }
  return `${mins}分钟`
}

const formatTime = (seconds: number) => {
  if (seconds < 60) return `${Math.round(seconds)}秒`
  const mins = Math.floor(seconds / 60)
  const secs = Math.round(seconds % 60)
  return `${mins}分${secs}秒`
}

const getKappaClass = (kappa: number | null) => {
  if (kappa === null) return ''
  if (kappa >= 0.8) return 'text-excellent'
  if (kappa >= 0.6) return 'text-good'
  if (kappa >= 0.4) return 'text-moderate'
  return 'text-poor'
}

const calculateQualityScore = (row: AnnotatorRanking) => {
  const kappaScore = Math.min(100, Math.max(0, (row.avg_kappa || 0) * 100))
  const efficiencyScore = Math.min(100, Math.max(0, 100 - (row.avg_time_per_annotation || 0) * 2))
  const quantityScore = Math.min(100, Math.max(0, Math.min(100, row.total_annotations)))
  
  const score = Math.round(kappaScore * 0.5 + efficiencyScore * 0.3 + quantityScore * 0.2)
  return Math.min(100, Math.max(0, score))
}

const getQualityScoreColor = (score: number) => {
  if (score >= 80) return '#10b981'
  if (score >= 60) return '#3b82f6'
  if (score >= 40) return '#f59e0b'
  return '#ef4444'
}

const rowClassName = ({ rowIndex }: { rowIndex: number }) => {
  if (rowIndex === 0) return 'rank-row gold-row'
  if (rowIndex === 1) return 'rank-row silver-row'
  if (rowIndex === 2) return 'rank-row bronze-row'
  return ''
}

const fetchData = async () => {
  loading.value = true
  try {
    const params: any = { page_size: 100, sort_by: sortBy.value }
    if (timeRange.value !== 'all') {
      params.time_range = timeRange.value
    }
    
    const res = await statsApi.getAnnotatorRanking(params)
    rankingData.value = res.results || []
    
    await nextTick()
    initRankingChart()
  } catch (error) {
    ElMessage.error('获取排行榜数据失败')
  } finally {
    loading.value = false
  }
}

const initRankingChart = () => {
  if (!rankingChartRef.value || rankingData.value.length === 0) return
  
  const chart = echarts.init(rankingChartRef.value)
  const top10Data = rankingData.value.slice(0, 10)
  
  let chartData = [...top10Data]
  if (sortBy.value === 'total_minutes') {
    chartData = chartData.sort((a, b) => b.total_minutes - a.total_minutes)
  } else if (sortBy.value === 'avg_kappa') {
    chartData = chartData.sort((a, b) => (b.avg_kappa || 0) - (a.avg_kappa || 0))
  }
  
  const option = {
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        type: 'shadow'
      },
      formatter: (params: any) => {
        const data = params[0]
        const rank = top10Data.length - data.dataIndex
        let valueText = ''
        if (sortBy.value === 'total_annotations') {
          valueText = `标注数: ${data.value}`
        } else if (sortBy.value === 'total_minutes') {
          valueText = `总时长: ${formatMinutes(data.value)}`
        } else {
          valueText = `平均Kappa: ${data.value.toFixed(2)}`
        }
        return `${data.name}<br/>排名: 第${rank}名<br/>${valueText}`
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
      boundaryGap: [0, 0.01],
      axisLabel: {
        show: sortBy.value === 'avg_kappa'
      }
    },
    yAxis: {
      type: 'category',
      data: chartData.map(item => item.full_name || item.annotator_name).reverse(),
      axisLabel: {
        width: 80,
        overflow: 'truncate'
      }
    },
    series: [
      {
        type: 'bar',
        data: chartData.map((item, index) => {
          let value = item.total_annotations
          if (sortBy.value === 'total_minutes') {
            value = item.total_minutes
          } else if (sortBy.value === 'avg_kappa') {
            value = item.avg_kappa || 0
          }
          return {
            value: value,
            itemStyle: {
              color: getBarColor(index),
              borderRadius: [0, 4, 4, 0]
            }
          }
        }).reverse(),
        label: {
          show: true,
          position: 'right',
          formatter: (params: any) => {
            if (sortBy.value === 'avg_kappa') {
              return params.value.toFixed(2)
            } else if (sortBy.value === 'total_minutes') {
              return formatMinutes(params.value)
            }
            return params.value
          },
          color: '#374151',
          fontWeight: 500
        },
        barWidth: '60%'
      }
    ]
  }
  
  chart.setOption(option)
}

const getBarColor = (index: number) => {
  const colors = [
    ['#ffd700', '#ffb700'],
    ['#c0c0c0', '#a8a8a8'],
    ['#cd7f32', '#b87333'],
    ['#667eea', '#764ba2'],
    ['#667eea', '#764ba2']
  ]
  
  const colorIndex = Math.min(index, colors.length - 1)
  return new echarts.graphic.LinearGradient(0, 0, 1, 0, [
    { offset: 0, color: colors[colorIndex][0] },
    { offset: 1, color: colors[colorIndex][1] }
  ])
}

onMounted(() => {
  fetchData()
})
</script>

<style scoped lang="scss">
.annotator-ranking {
  .filter-card {
    border-radius: 12px;
    border: none;
    margin-bottom: 20px;

    :deep(.el-card__body) {
      padding: 16px 20px;
    }
  }

  .filter-section {
    display: flex;
    align-items: center;
    gap: 32px;
    flex-wrap: wrap;
  }

  .filter-item {
    display: flex;
    align-items: center;
    gap: 12px;

    .filter-label {
      font-weight: 500;
      color: #374151;
      white-space: nowrap;
    }
  }

  .chart-card,
  .ranking-card {
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

    .total-count {
      font-size: 13px;
      font-weight: normal;
      color: #6b7280;
    }
  }

  .chart-container {
    height: 500px;
    width: 100%;
  }

  .ranking-table-wrapper {
    max-height: 500px;
    overflow-y: auto;

    :deep(.el-table) {
      border: none;

      &::before {
        display: none;
      }

      th.el-table__cell {
        background: #f9fafb;
        font-weight: 600;
        color: #374151;
        border-bottom: 1px solid #e5e7eb;
      }

      td.el-table__cell {
        border-bottom: 1px solid #f3f4f6;
      }

      .gold-row {
        background: linear-gradient(90deg, rgba(255, 215, 0, 0.1) 0%, rgba(255, 215, 0, 0.02) 100%);
      }

      .silver-row {
        background: linear-gradient(90deg, rgba(192, 192, 192, 0.1) 0%, rgba(192, 192, 192, 0.02) 100%);
      }

      .bronze-row {
        background: linear-gradient(90deg, rgba(205, 127, 50, 0.1) 0%, rgba(205, 127, 50, 0.02) 100%);
      }

      .gold-row:hover > td {
        background-color: rgba(255, 215, 0, 0.15) !important;
      }

      .silver-row:hover > td {
        background-color: rgba(192, 192, 192, 0.15) !important;
      }

      .bronze-row:hover > td {
        background-color: rgba(205, 127, 50, 0.15) !important;
      }
    }
  }

  .rank-display {
    display: flex;
    align-items: center;
    justify-content: center;

    .medal {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #fff;

      &.gold {
        background: linear-gradient(135deg, #ffd700 0%, #ffb700 100%);
        box-shadow: 0 2px 8px rgba(255, 215, 0, 0.4);
      }

      &.silver {
        background: linear-gradient(135deg, #c0c0c0 0%, #a8a8a8 100%);
        box-shadow: 0 2px 8px rgba(192, 192, 192, 0.4);
      }

      &.bronze {
        background: linear-gradient(135deg, #cd7f32 0%, #b87333 100%);
        box-shadow: 0 2px 8px rgba(205, 127, 50, 0.4);
      }
    }

    .rank-number {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: #f3f4f6;
      color: #6b7280;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 600;
      font-size: 13px;
    }
  }

  .annotator-info {
    display: flex;
    align-items: center;
    gap: 12px;

    .annotator-avatar {
      flex-shrink: 0;
    }

    .annotator-detail {
      overflow: hidden;

      .annotator-name {
        font-weight: 500;
        color: #1f2937;
        font-size: 14px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .annotator-username {
        font-size: 12px;
        color: #9ca3af;
        margin-top: 2px;
      }
    }
  }

  .stat-highlight {
    font-weight: 600;
    color: #667eea;
    font-size: 16px;
  }

  .text-excellent {
    color: #10b981;
    font-weight: 600;
  }

  .text-good {
    color: #3b82f6;
    font-weight: 600;
  }

  .text-moderate {
    color: #f59e0b;
    font-weight: 600;
  }

  .text-poor {
    color: #ef4444;
    font-weight: 600;
  }
}
</style>
