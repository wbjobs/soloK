<template>
  <div class="annotation-list">
    <el-card class="filter-card" shadow="never">
      <el-form :inline="true" :model="filterForm" class="filter-form">
        <el-form-item label="标注状态">
          <el-select
            v-model="filterForm.status"
            placeholder="全部状态"
            clearable
            style="width: 140px"
          >
            <el-option label="待标注" value="pending" />
            <el-option label="标注中" value="in_progress" />
            <el-option label="已提交" value="submitted" />
            <el-option label="需审核" value="needs_review" />
          </el-select>
        </el-form-item>
        <el-form-item label="方言片区">
          <el-select
            v-model="filterForm.dialect"
            placeholder="全部方言"
            clearable
            style="width: 160px"
          >
            <el-option
              v-for="dialect in dialects"
              :key="dialect.id"
              :label="dialect.name"
              :value="dialect.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="标注员">
          <el-select
            v-model="filterForm.annotator"
            placeholder="全部标注员"
            clearable
            style="width: 140px"
          >
            <el-option
              v-for="annotator in annotators"
              :key="annotator.id"
              :label="annotator.username"
              :value="annotator.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="fetchData">
            <el-icon><Search /></el-icon>搜索
          </el-button>
          <el-button @click="resetFilter">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card class="table-card" shadow="never">
      <el-table
        :data="annotationList"
        style="width: 100%"
        v-loading="loading"
      >
        <el-table-column prop="id" label="ID" width="80" />
        <el-table-column label="语音文件名" min-width="200">
          <template #default="{ row }">
            <div class="filename-cell">
              <el-icon class="audio-icon"><Headset /></el-icon>
              <span>{{ row.audio_segment_info?.original_filename }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="方言" width="120">
          <template #default="{ row }">
            {{ row.audio_segment_info?.dialect_name }}
          </template>
        </el-table-column>
        <el-table-column label="标注员" width="120">
          <template #default="{ row }">
            {{ row.annotator_info?.username }}
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
        <el-table-column prop="quality_score" label="质量分" width="100">
          <template #default="{ row }">
            <span v-if="row.quality_score !== null">
              {{ row.quality_score.toFixed(1) }}
            </span>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column prop="kappa_score" label="Kappa" width="100">
          <template #default="{ row }">
            <span v-if="row.kappa_score !== null">
              {{ row.kappa_score.toFixed(2) }}
            </span>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column prop="agreement_rate" label="一致率" width="100">
          <template #default="{ row }">
            <span v-if="row.agreement_rate !== null">
              {{ (row.agreement_rate * 100).toFixed(1) }}%
            </span>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column label="用时" width="120">
          <template #default="{ row }">
            {{ formatTimeSpent(row.time_spent) }}
          </template>
        </el-table-column>
        <el-table-column prop="created_at" label="创建时间" width="180">
          <template #default="{ row }">
            {{ formatDate(row.created_at) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="260" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link size="small" @click="viewDetail(row)">
              详情
            </el-button>
            <el-button type="success" link size="small" @click="editAnnotation(row)">
              编辑
            </el-button>
            <el-button
              v-if="row.audio_segment_info?.completed_annotations >= 2"
              type="warning"
              link
              size="small"
              @click="showKappaCompare(row)"
            >
              Kappa对比
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="pagination">
        <el-pagination
          v-model:current-page="pagination.page"
          v-model:page-size="pagination.page_size"
          :page-sizes="[10, 20, 50, 100]"
          :total="pagination.total"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="fetchData"
          @current-change="fetchData"
        />
      </div>
    </el-card>

    <el-dialog v-model="kappaDialogVisible" title="Kappa 音素对比" width="900px">
      <div v-if="kappaResult" class="kappa-content">
        <div class="kappa-stats">
          <el-statistic title="总体 Kappa" :value="kappaResult.overall_kappa" :precision="2" />
          <el-statistic title="音素 Kappa" :value="kappaResult.phoneme_kappa" :precision="2" />
          <el-statistic title="声调 Kappa" :value="kappaResult.tone_kappa" :precision="2" />
          <el-statistic title="一致率" :value="kappaResult.agreement_rate * 100" suffix="%" :precision="1" />
        </div>
        <el-alert :title="kappaResult.interpretation" type="info" :closable="false" class="kappa-interpretation" />
        <div class="comparison-table-wrapper">
          <el-table :data="comparisonData" style="width: 100%" border>
            <el-table-column label="序号" width="70" align="center">
              <template #default="{ $index }">
                {{ $index + 1 }}
              </template>
            </el-table-column>
            <el-table-column label="时间范围" width="160">
              <template #default="{ row }">
                {{ formatTime(row.start_time) }} - {{ formatTime(row.end_time) }}
              </template>
            </el-table-column>
            <el-table-column :label="annotator1Name" min-width="180">
              <template #default="{ row }">
                <span :class="{ 'mismatch': row.phoneme_mismatch || row.tone_mismatch || row.time_mismatch }">
                  <span class="phoneme-text">{{ row.annotator1_phoneme }}</span>
                  <span v-if="row.annotator1_tone" class="tone-mark">T{{ row.annotator1_tone }}</span>
                </span>
              </template>
            </el-table-column>
            <el-table-column :label="annotator2Name" min-width="180">
              <template #default="{ row }">
                <span :class="{ 'mismatch': row.phoneme_mismatch || row.tone_mismatch || row.time_mismatch }">
                  <span class="phoneme-text">{{ row.annotator2_phoneme }}</span>
                  <span v-if="row.annotator2_tone" class="tone-mark">T{{ row.annotator2_tone }}</span>
                </span>
              </template>
            </el-table-column>
            <el-table-column label="差异类型" width="140">
              <template #default="{ row }">
                <el-tag v-if="row.phoneme_mismatch" type="danger" size="small" effect="light">音素不符</el-tag>
                <el-tag v-if="row.tone_mismatch" type="warning" size="small" effect="light">声调不符</el-tag>
                <el-tag v-if="row.time_mismatch" type="info" size="small" effect="light">时间不符</el-tag>
                <span v-if="!row.phoneme_mismatch && !row.tone_mismatch && !row.time_mismatch" class="match-text">一致</span>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </div>
      <div v-else-if="kappaLoading" class="loading-wrapper">
        <el-icon class="is-loading"><Loading /></el-icon>
        <span>正在计算 Kappa...</span>
      </div>
      <template #footer>
        <el-button @click="kappaDialogVisible = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '@/store/user'
import { annotationsApi, dialectsApi, authApi, audioApi } from '@/api'
import type { Annotation, DialectRegion, User, KappaResult, Phoneme } from '@/types'
import { ElMessage } from 'element-plus'
import { Search, Headset, Loading } from '@element-plus/icons-vue'

const router = useRouter()
const userStore = useUserStore()

const loading = ref(false)
const annotationList = ref<Annotation[]>([])
const dialects = ref<DialectRegion[]>([])
const annotators = ref<User[]>([])

const filterForm = reactive({
  status: null as string | null,
  dialect: null as number | null,
  annotator: null as number | null
})

const pagination = reactive({
  page: 1,
  page_size: 20,
  total: 0
})

const kappaDialogVisible = ref(false)
const kappaLoading = ref(false)
const kappaResult = ref<KappaResult | null>(null)
const currentAnnotation = ref<Annotation | null>(null)
const audioAnnotations = ref<Annotation[]>([])
const comparisonData = ref<any[]>([])
const annotator1Name = ref('')
const annotator2Name = ref('')

const statusTagType = (status: string) => {
  const types: Record<string, string> = {
    'pending': 'info',
    'in_progress': 'warning',
    'submitted': 'success',
    'needs_review': 'danger'
  }
  return types[status] || 'info'
}

const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleString('zh-CN')
}

const formatTime = (seconds: number) => {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  const ms = Math.floor((seconds % 1) * 100)
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`
}

const formatTimeSpent = (seconds: number) => {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}分${secs}秒`
}

const fetchData = async () => {
  loading.value = true
  try {
    const params = {
      ...filterForm,
      page: pagination.page,
      page_size: pagination.page_size
    }
    const res = await annotationsApi.getAnnotationList(params)
    annotationList.value = res.results || []
    pagination.total = res.count || 0
  } catch (error) {
    ElMessage.error('获取标注列表失败')
  } finally {
    loading.value = false
  }
}

const fetchDialects = async () => {
  try {
    const res = await dialectsApi.getDialectRegions()
    dialects.value = res.results || []
  } catch (error) {
    console.error('获取方言列表失败', error)
  }
}

const fetchAnnotators = async () => {
  try {
    const res = await authApi.getAnnotators()
    annotators.value = res.results || []
  } catch (error) {
    console.error('获取标注员列表失败', error)
  }
}

const resetFilter = () => {
  filterForm.status = null
  filterForm.dialect = null
  filterForm.annotator = null
  pagination.page = 1
  fetchData()
}

const viewDetail = (row: Annotation) => {
  router.push(`/audio/${row.audio_segment}`)
}

const editAnnotation = (row: Annotation) => {
  router.push(`/annotate/${row.audio_segment}`)
}

const showKappaCompare = async (row: Annotation) => {
  currentAnnotation.value = row
  kappaDialogVisible.value = true
  kappaLoading.value = true
  kappaResult.value = null
  comparisonData.value = []

  try {
    const res = await audioApi.getAudioAnnotations(row.audio_segment)
    audioAnnotations.value = res.results || []
    
    const otherAnnotation = audioAnnotations.value.find(a => a.id !== row.id)
    if (!otherAnnotation) {
      ElMessage.warning('未找到其他标注员的标注结果')
      kappaDialogVisible.value = false
      return
    }

    annotator1Name.value = row.annotator_info?.username || '标注员1'
    annotator2Name.value = otherAnnotation.annotator_info?.username || '标注员2'

    const kappaRes = await annotationsApi.calculateKappa(row.phonemes, otherAnnotation.phonemes)
    kappaResult.value = kappaRes

    buildComparisonData(row.phonemes, otherAnnotation.phonemes, kappaRes.disagreements)
  } catch (error) {
    ElMessage.error('获取对比数据失败')
  } finally {
    kappaLoading.value = false
  }
}

const buildComparisonData = (phonemes1: Phoneme[], phonemes2: Phoneme[], disagreements: any[]) => {
  const maxLen = Math.max(phonemes1.length, phonemes2.length)
  const data: any[] = []

  for (let i = 0; i < maxLen; i++) {
    const p1 = phonemes1[i]
    const p2 = phonemes2[i]
    const disagreement = disagreements.find(d => d.index === i)

    const item = {
      start_time: p1?.start_time ?? p2?.start_time ?? 0,
      end_time: p1?.end_time ?? p2?.end_time ?? 0,
      annotator1_phoneme: p1?.phoneme || '-',
      annotator1_tone: p1?.tone,
      annotator2_phoneme: p2?.phoneme || '-',
      annotator2_tone: p2?.tone,
      phoneme_mismatch: disagreement?.phoneme_mismatch || false,
      tone_mismatch: disagreement?.tone_mismatch || false,
      time_mismatch: disagreement?.time_mismatch || false
    }

    data.push(item)
  }

  comparisonData.value = data
}

onMounted(() => {
  fetchData()
  fetchDialects()
  fetchAnnotators()
})
</script>

<style scoped lang="scss">
.annotation-list {
  .filter-card {
    border-radius: 12px;
    margin-bottom: 20px;
    border: none;

    :deep(.el-card__body) {
      padding: 16px 20px;
    }
  }

  .filter-form {
    :deep(.el-form-item) {
      margin-bottom: 0;
      margin-right: 16px;
    }
  }

  .table-card {
    border-radius: 12px;
    border: none;
  }

  .filename-cell {
    display: flex;
    align-items: center;
    gap: 8px;

    .audio-icon {
      color: #3b82f6;
    }
  }

  .pagination {
    display: flex;
    justify-content: flex-end;
    margin-top: 20px;
  }

  .kappa-content {
    .kappa-stats {
      display: flex;
      justify-content: space-around;
      margin-bottom: 20px;
      padding: 16px;
      background: #f9fafb;
      border-radius: 8px;
    }

    .kappa-interpretation {
      margin-bottom: 20px;
    }

    .comparison-table-wrapper {
      max-height: 400px;
      overflow-y: auto;

      :deep(.el-table) {
        .mismatch {
          color: #ef4444;
          font-weight: 600;
        }

        .phoneme-text {
          margin-right: 4px;
        }

        .tone-mark {
          font-size: 12px;
          color: #6366f1;
        }

        .match-text {
          color: #10b981;
        }
      }
    }
  }

  .loading-wrapper {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 60px 0;
    gap: 12px;
    color: #6b7280;

    .el-icon {
      font-size: 32px;
    }
  }
}
</style>
