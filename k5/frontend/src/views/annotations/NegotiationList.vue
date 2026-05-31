<template>
  <div class="negotiation-list">
    <el-card class="filter-card" shadow="never">
      <el-form :inline="true" :model="filterForm" class="filter-form">
        <el-form-item label="状态">
          <el-select
            v-model="filterForm.status"
            placeholder="全部状态"
            clearable
            style="width: 140px"
          >
            <el-option label="待协商" value="pending" />
            <el-option label="已解决" value="resolved" />
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
        <el-form-item>
          <el-button type="primary" @click="fetchData">
            <el-icon><Search /></el-icon>搜索
          </el-button>
          <el-button @click="resetFilter">重置</el-button>
        </el-form-item>
        <el-form-item>
          <el-button
            type="success"
            @click="handleBatchResolve"
            :disabled="selectedIds.length === 0"
          >
            <el-icon><Check /></el-icon>批量解决
          </el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card class="table-card" shadow="never">
      <el-table
        :data="negotiationList"
        style="width: 100%"
        v-loading="loading"
        @selection-change="handleSelectionChange"
      >
        <el-table-column type="selection" width="55" />
        <el-table-column prop="id" label="ID" width="80" />
        <el-table-column label="语音文件名" min-width="200">
          <template #default="{ row }">
            {{ row.audio_segment_info?.original_filename || '-' }}
          </template>
        </el-table-column>
        <el-table-column label="方言" width="120">
          <template #default="{ row }">
            {{ row.audio_segment_info?.dialect_name || '-' }}
          </template>
        </el-table-column>
        <el-table-column label="标注员1" width="120">
          <template #default="{ row }">
            {{ row.annotation1_info?.annotator_info?.username || '-' }}
          </template>
        </el-table-column>
        <el-table-column label="标注员2" width="120">
          <template #default="{ row }">
            {{ row.annotation2_info?.annotator_info?.username || '-' }}
          </template>
        </el-table-column>
        <el-table-column label="不一致数" width="100">
          <template #default="{ row }">
            <el-tag :type="getSignificantDisagreements(row).length > 0 ? 'danger' : 'success'" size="small">
              {{ getSignificantDisagreements(row).length }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="Kappa系数" width="120">
          <template #default="{ row }">
            {{ row.annotation1_info?.kappa_score?.toFixed(3) || '-' }}
          </template>
        </el-table-column>
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
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <el-button
              type="primary"
              link
              size="small"
              @click="viewDetail(row)"
            >
              查看详情
            </el-button>
            <el-button
              v-if="row.status === 'pending'"
              type="success"
              link
              size="small"
              @click="handleResolve(row)"
            >
              处理协商
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

    <el-dialog
      v-model="resolveDialogVisible"
      title="处理协商"
      width="900px"
      :close-on-click-modal="false"
    >
      <div v-if="currentNegotiation" class="resolve-dialog">
        <div class="negotiation-header">
          <div class="info-item">
            <span class="label">语音文件：</span>
            <span>{{ currentNegotiation.audio_segment_info?.original_filename }}</span>
          </div>
          <div class="info-item">
            <span class="label">标注员1：</span>
            <span class="annotator1">
              {{ currentNegotiation.annotation1_info?.annotator_info?.username }}
            </span>
          </div>
          <div class="info-item">
            <span class="label">标注员2：</span>
            <span class="annotator2">
              {{ currentNegotiation.annotation2_info?.annotator_info?.username }}
            </span>
          </div>
          <div class="info-item">
            <span class="label">不一致数：</span>
            <el-tag :type="getSignificantDisagreements(currentNegotiation).length > 0 ? 'danger' : 'success'" size="small">
              {{ getSignificantDisagreements(currentNegotiation).length }}
            </el-tag>
          </div>
        </div>

        <div class="phonemes-compare">
          <div class="compare-header">
            <div class="compare-col annotator1-col">
              <el-tag type="primary">标注员1</el-tag>
            </div>
            <div class="compare-col result-col">
              <el-tag type="success">最终结果</el-tag>
            </div>
            <div class="compare-col annotator2-col">
              <el-tag type="warning">标注员2</el-tag>
            </div>
          </div>
          <div class="compare-list">
            <div
              v-for="(phoneme, index) in mergedPhonemes"
              :key="index"
              class="compare-row"
              :class="{ 'disagreement-row': phoneme.is_disagreement }"
            >
              <div class="compare-col annotator1-col">
                <div
                  class="phoneme-item"
                  :class="{
                    'is-disagreement': phoneme.is_disagreement && phoneme.annotator1,
                    'is-selected': resolveForm.use_annotator === 1
                  }"
                  @click="selectAnnotator(1)"
                >
                  <span class="phoneme-text">{{ phoneme.annotator1?.phoneme || '-' }}</span>
                  <span class="phoneme-tone">{{ phoneme.annotator1?.tone || '' }}</span>
                </div>
              </div>
              <div class="compare-col result-col">
                <div class="phoneme-item final-item">
                  <el-input
                    v-model="resolveForm.final_annotation[index].phoneme"
                    size="small"
                    placeholder="音素"
                    style="width: 80px"
                  />
                  <el-input-number
                    v-model="resolveForm.final_annotation[index].tone"
                    :min="0"
                    :max="9"
                    size="small"
                    placeholder="声调"
                    style="width: 70px"
                  />
                </div>
              </div>
              <div class="compare-col annotator2-col">
                <div
                  class="phoneme-item"
                  :class="{
                    'is-disagreement': phoneme.is_disagreement && phoneme.annotator2,
                    'is-selected': resolveForm.use_annotator === 2
                  }"
                  @click="selectAnnotator(2)"
                >
                  <span class="phoneme-text">{{ phoneme.annotator2?.phoneme || '-' }}</span>
                  <span class="phoneme-tone">{{ phoneme.annotator2?.tone || '' }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <el-form :model="resolveForm" label-width="100px" class="resolve-form">
          <el-form-item label="快速选择">
            <el-radio-group v-model="resolveForm.use_annotator">
              <el-radio :value="1">采用标注员1</el-radio>
              <el-radio :value="2">采用标注员2</el-radio>
              <el-radio :value="null">手动编辑</el-radio>
            </el-radio-group>
          </el-form-item>
          <el-form-item label="备注">
            <el-input
              v-model="resolveForm.notes"
              type="textarea"
              :rows="2"
              placeholder="请输入处理备注"
            />
          </el-form-item>
        </el-form>
      </div>
      <template #footer>
        <el-button @click="resolveDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="confirmResolve">确认解决</el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="batchResolveDialogVisible"
      title="批量解决协商"
      width="500px"
    >
      <el-form :model="batchResolveForm" label-width="120px">
        <el-form-item label="已选择" required>
          <span>{{ selectedIds.length }} 条协商记录</span>
        </el-form-item>
        <el-form-item label="采用标注员" required>
          <el-radio-group v-model="batchResolveForm.use_annotator">
            <el-radio :value="1">标注员1</el-radio>
            <el-radio :value="2">标注员2</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="备注">
          <el-input
            v-model="batchResolveForm.notes"
            type="textarea"
            :rows="2"
            placeholder="请输入处理备注"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="batchResolveDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="confirmBatchResolve">确认批量解决</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '@/store/user'
import { annotationsApi, dialectsApi } from '@/api'
import type { Negotiation, DialectRegion, Phoneme } from '@/types'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search, Check } from '@element-plus/icons-vue'

const router = useRouter()
const userStore = useUserStore()

const loading = ref(false)
const negotiationList = ref<Negotiation[]>([])
const dialects = ref<DialectRegion[]>([])
const selectedIds = ref<number[]>([])

const filterForm = reactive({
  status: null as string | null,
  dialect: null as number | null
})

const pagination = reactive({
  page: 1,
  page_size: 20,
  total: 0
})

const resolveDialogVisible = ref(false)
const currentNegotiation = ref<Negotiation | null>(null)
const resolveForm = reactive({
  final_annotation: [] as Phoneme[],
  use_annotator: null as number | null,
  notes: ''
})

const batchResolveDialogVisible = ref(false)
const batchResolveForm = reactive({
  use_annotator: 1,
  notes: ''
})

interface MergedPhoneme {
  annotator1: Phoneme | null
  annotator2: Phoneme | null
  is_disagreement: boolean
}

const mergedPhonemes = computed<MergedPhoneme[]>(() => {
  if (!currentNegotiation.value) return []
  const phonemes1 = currentNegotiation.value.annotation1_info?.phonemes || []
  const phonemes2 = currentNegotiation.value.annotation2_info?.phonemes || []
  const maxLen = Math.max(phonemes1.length, phonemes2.length)
  
  const significantDisagreements = (currentNegotiation.value.disagreements || []).filter(
    (d: any) => !(d as any).negligible_time_diff || (d as any).phoneme_mismatch || (d as any).tone_mismatch
  )
  const disagreementIndices = new Set(
    significantDisagreements.map(d => d.index)
  )
  
  const result: MergedPhoneme[] = []
  for (let i = 0; i < maxLen; i++) {
    result.push({
      annotator1: phonemes1[i] || null,
      annotator2: phonemes2[i] || null,
      is_disagreement: disagreementIndices.has(i)
    })
  }
  return result
})

const getSignificantDisagreements = (row: Negotiation) => {
  return (row.disagreements || []).filter(
    (d: any) => !(d as any).negligible_time_diff || (d as any).phoneme_mismatch || (d as any).tone_mismatch
  )
}

const statusTagType = (status: string) => {
  const types: Record<string, string> = {
    'pending': 'warning',
    'resolved': 'success'
  }
  return types[status] || 'info'
}

const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleString('zh-CN')
}

const fetchData = async () => {
  loading.value = true
  try {
    const params = {
      ...filterForm,
      page: pagination.page,
      page_size: pagination.page_size
    }
    const res = await annotationsApi.getNegotiationList(params)
    negotiationList.value = res.results || []
    pagination.total = res.count || 0
  } catch (error) {
    ElMessage.error('获取协商列表失败')
  } finally {
    loading.value = false
  }
}

const fetchDialects = async () => {
  try {
    const res = await dialectsApi.getDialectList()
    dialects.value = res.results || []
  } catch (error) {
    console.error('获取方言列表失败', error)
  }
}

const resetFilter = () => {
  filterForm.status = null
  filterForm.dialect = null
  pagination.page = 1
  fetchData()
}

const handleSelectionChange = (selection: Negotiation[]) => {
  selectedIds.value = selection.map(item => item.id)
}

const viewDetail = (row: Negotiation) => {
  router.push(`/audio/${row.audio_segment}`)
}

const handleResolve = (row: Negotiation) => {
  currentNegotiation.value = row
  const phonemes1 = row.annotation1_info?.phonemes || []
  const phonemes2 = row.annotation2_info?.phonemes || []
  const maxLen = Math.max(phonemes1.length, phonemes2.length)
  
  resolveForm.final_annotation = []
  for (let i = 0; i < maxLen; i++) {
    resolveForm.final_annotation.push({
      start_time: phonemes1[i]?.start_time || phonemes2[i]?.start_time || 0,
      end_time: phonemes1[i]?.end_time || phonemes2[i]?.end_time || 0,
      phoneme: phonemes1[i]?.phoneme || phonemes2[i]?.phoneme || '',
      tone: phonemes1[i]?.tone ?? phonemes2[i]?.tone ?? null
    })
  }
  resolveForm.use_annotator = null
  resolveForm.notes = ''
  resolveDialogVisible.value = true
}

const selectAnnotator = (annotator: number) => {
  resolveForm.use_annotator = annotator
  if (!currentNegotiation.value) return
  
  const sourcePhonemes = annotator === 1
    ? currentNegotiation.value.annotation1_info?.phonemes || []
    : currentNegotiation.value.annotation2_info?.phonemes || []
  
  resolveForm.final_annotation = sourcePhonemes.map(p => ({
    start_time: p.start_time,
    end_time: p.end_time,
    phoneme: p.phoneme,
    tone: p.tone ?? null
  }))
}

const confirmResolve = async () => {
  if (!currentNegotiation.value) return
  
  try {
    await annotationsApi.resolveNegotiation(currentNegotiation.value.id, {
      final_annotation: resolveForm.final_annotation,
      notes: resolveForm.notes
    })
    ElMessage.success('协商处理成功')
    resolveDialogVisible.value = false
    fetchData()
  } catch (error: any) {
    ElMessage.error(error.response?.data?.detail || '协商处理失败')
  }
}

const handleBatchResolve = () => {
  if (selectedIds.value.length === 0) {
    ElMessage.warning('请先选择要处理的协商记录')
    return
  }
  batchResolveForm.use_annotator = 1
  batchResolveForm.notes = ''
  batchResolveDialogVisible.value = true
}

const confirmBatchResolve = async () => {
  try {
    await annotationsApi.batchResolveNegotiations({
      negotiation_ids: selectedIds.value,
      use_annotator: batchResolveForm.use_annotator,
      notes: batchResolveForm.notes
    })
    ElMessage.success('批量处理成功')
    batchResolveDialogVisible.value = false
    fetchData()
  } catch (error: any) {
    ElMessage.error(error.response?.data?.detail || '批量处理失败')
  }
}

onMounted(() => {
  fetchData()
  fetchDialects()
})
</script>

<style scoped lang="scss">
.negotiation-list {
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

  .pagination {
    display: flex;
    justify-content: flex-end;
    margin-top: 20px;
  }

  .resolve-dialog {
    .negotiation-header {
      display: flex;
      flex-wrap: wrap;
      gap: 24px;
      padding: 16px;
      background: #f5f7fa;
      border-radius: 8px;
      margin-bottom: 20px;

      .info-item {
        display: flex;
        align-items: center;

        .label {
          color: #909399;
          margin-right: 8px;
        }

        .annotator1 {
          color: #409eff;
          font-weight: 500;
        }

        .annotator2 {
          color: #e6a23c;
          font-weight: 500;
        }
      }
    }

    .phonemes-compare {
      margin-bottom: 20px;

      .compare-header {
        display: flex;
        padding: 12px 0;
        border-bottom: 2px solid #e4e7ed;
        font-weight: 500;

        .compare-col {
          text-align: center;
        }
      }

      .compare-list {
        max-height: 400px;
        overflow-y: auto;
      }

      .compare-row {
        display: flex;
        padding: 8px 0;
        border-bottom: 1px solid #f0f2f5;
        align-items: center;

        &.disagreement-row {
          background: #fef0f0;
        }

        .compare-col {
          display: flex;
          justify-content: center;
          align-items: center;
        }

        .annotator1-col,
        .annotator2-col {
          flex: 1;
        }

        .result-col {
          flex: 1.2;
        }
      }

      .phoneme-item {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        border-radius: 6px;
        cursor: pointer;
        transition: all 0.2s;

        &:hover {
          background: #ecf5ff;
        }

        &.is-disagreement {
          color: #f56c6c;
          font-weight: 500;
        }

        &.is-selected {
          background: #409eff;
          color: #fff;

          &.is-disagreement {
            color: #fff;
          }
        }

        .phoneme-text {
          font-size: 16px;
        }

        .phoneme-tone {
          font-size: 12px;
          color: #909399;

          .is-selected & {
            color: #fff;
          }
        }

        &.final-item {
          cursor: default;
          background: transparent;

          &:hover {
            background: transparent;
          }
        }
      }
    }

    .resolve-form {
      margin-top: 20px;
      padding-top: 20px;
      border-top: 1px solid #e4e7ed;
    }
  }
}
</style>
