<template>
  <div class="audio-list">
    <el-card class="filter-card" shadow="never">
      <el-form :inline="true" :model="filterForm" class="filter-form">
        <el-form-item label="方言">
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
        <el-form-item label="状态">
          <el-select
            v-model="filterForm.status"
            placeholder="全部状态"
            clearable
            style="width: 140px"
          >
            <el-option label="待处理" value="pending" />
            <el-option label="处理中" value="processing" />
            <el-option label="已处理" value="processed" />
            <el-option label="处理失败" value="failed" />
          </el-select>
        </el-form-item>
        <el-form-item label="性别">
          <el-select
            v-model="filterForm.speaker_gender"
            placeholder="全部性别"
            clearable
            style="width: 120px"
          >
            <el-option label="男" value="male" />
            <el-option label="女" value="female" />
          </el-select>
        </el-form-item>
        <el-form-item label="年龄段">
          <el-select
            v-model="filterForm.speaker_age"
            placeholder="全部年龄段"
            clearable
            style="width: 140px"
          >
            <el-option label="儿童(0-12)" value="child" />
            <el-option label="青少年(13-17)" value="teen" />
            <el-option label="青年(18-35)" value="young" />
            <el-option label="中年(36-55)" value="middle" />
            <el-option label="老年(55+)" value="senior" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="fetchData">
            <el-icon><Search /></el-icon>搜索
          </el-button>
          <el-button @click="resetFilter">重置</el-button>
        </el-form-item>
        <el-form-item v-if="userStore.user?.role === 'admin'">
          <el-button type="success" @click="$router.push('/audio/upload')">
            <el-icon><Upload /></el-icon>上传语音
          </el-button>
          <el-button type="warning" @click="handleBatchAssign" :disabled="selectedIds.length === 0">
            <el-icon><UserFilled /></el-icon>批量分配
          </el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card class="table-card" shadow="never">
      <el-table
        :data="audioList"
        style="width: 100%"
        v-loading="loading"
        @selection-change="handleSelectionChange"
      >
        <el-table-column type="selection" width="55" />
        <el-table-column prop="id" label="ID" width="100" />
        <el-table-column label="文件名" min-width="200">
          <template #default="{ row }">
            <div class="filename-cell">
              <el-icon class="audio-icon"><Headset /></el-icon>
              <span>{{ row.original_filename }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="dialect_name" label="方言" width="120" />
        <el-table-column prop="subregion_name" label="片区" width="120" />
        <el-table-column label="说话人" width="120">
          <template #default="{ row }">
            {{ row.speaker_gender_display }} / {{ row.speaker_age_display }}
          </template>
        </el-table-column>
        <el-table-column label="时长" width="100">
          <template #default="{ row }">
            {{ row.duration.toFixed(1) }}s
          </template>
        </el-table-column>
        <el-table-column label="标注进度" width="150">
          <template #default="{ row }">
            <el-progress
              :percentage="Math.round(row.completed_annotations / row.required_annotations * 100)"
              :status="row.completed_annotations >= row.required_annotations ? 'success' : ''"
            />
            <div class="progress-text">
              {{ row.completed_annotations }}/{{ row.required_annotations }}
            </div>
          </template>
        </el-table-column>
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
        <el-table-column prop="created_at" label="上传时间" width="180">
          <template #default="{ row }">
            {{ formatDate(row.created_at) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link size="small" @click="viewDetail(row)">
              详情
            </el-button>
            <el-button type="success" link size="small" @click="annotate(row)">
              标注
            </el-button>
            <el-button
              v-if="userStore.user?.role === 'admin'"
              type="danger"
              link
              size="small"
              @click="handleDelete(row)"
            >
              删除
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

    <el-dialog v-model="assignDialogVisible" title="批量分配标注员" width="500px">
      <el-form :model="assignForm" label-width="100px">
        <el-form-item label="选择标注员" required>
          <el-select
            v-model="assignForm.annotators"
            multiple
            placeholder="请选择标注员"
            style="width: 100%"
          >
            <el-option
              v-for="annotator in annotators"
              :key="annotator.id"
              :label="annotator.username"
              :value="annotator.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="分配数量">
          <el-input-number
            v-model="assignForm.per_annotator"
            :min="1"
            :max="10"
            :controls="false"
          />
          <span class="form-tip">每个标注员分配的任务数</span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="assignDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="confirmAssign">确定分配</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '@/store/user'
import { audioApi, dialectsApi, authApi } from '@/api'
import type { AudioSegment, DialectRegion, User } from '@/types'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Search,
  Upload,
  UserFilled,
  Headset
} from '@element-plus/icons-vue'

const router = useRouter()
const userStore = useUserStore()

const loading = ref(false)
const audioList = ref<AudioSegment[]>([])
const dialects = ref<DialectRegion[]>([])
const annotators = ref<User[]>([])
const selectedIds = ref<string[]>([])

const filterForm = reactive({
  dialect: null as number | null,
  status: null as string | null,
  speaker_gender: null as string | null,
  speaker_age: null as string | null
})

const pagination = reactive({
  page: 1,
  page_size: 20,
  total: 0
})

const assignDialogVisible = ref(false)
const assignForm = reactive({
  annotators: [] as number[],
  per_annotator: 2
})

const statusTagType = (status: string) => {
  const types: Record<string, string> = {
    'pending': 'info',
    'processing': 'warning',
    'processed': 'success',
    'failed': 'danger'
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
    const res = await audioApi.getAudioList(params)
    audioList.value = res.results || []
    pagination.total = res.count || 0
  } catch (error) {
    ElMessage.error('获取语音列表失败')
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
  filterForm.dialect = null
  filterForm.status = null
  filterForm.speaker_gender = null
  filterForm.speaker_age = null
  pagination.page = 1
  fetchData()
}

const handleSelectionChange = (selection: AudioSegment[]) => {
  selectedIds.value = selection.map(item => item.id)
}

const viewDetail = (row: AudioSegment) => {
  router.push(`/audio/${row.id}`)
}

const annotate = (row: AudioSegment) => {
  router.push(`/annotate/${row.id}`)
}

const handleBatchAssign = () => {
  if (selectedIds.value.length === 0) {
    ElMessage.warning('请先选择要分配的语音片段')
    return
  }
  assignDialogVisible.value = true
}

const confirmAssign = async () => {
  if (assignForm.annotators.length === 0) {
    ElMessage.warning('请选择标注员')
    return
  }
  
  try {
    await audioApi.batchAssign({
      audio_ids: selectedIds.value,
      annotator_ids: assignForm.annotators,
      annotations_per_annotator: assignForm.per_annotator
    })
    ElMessage.success('分配成功')
    assignDialogVisible.value = false
    fetchData()
  } catch (error: any) {
    ElMessage.error(error.response?.data?.detail || '分配失败')
  }
}

const handleDelete = async (row: AudioSegment) => {
  ElMessageBox.confirm(
    `确定要删除语音片段 "${row.original_filename}" 吗？`,
    '提示',
    {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    }
  ).then(async () => {
    try {
      await audioApi.deleteAudio(row.id)
      ElMessage.success('删除成功')
      fetchData()
    } catch (error) {
      ElMessage.error('删除失败')
    }
  }).catch(() => {})
}

onMounted(() => {
  fetchData()
  fetchDialects()
  if (userStore.user?.role === 'admin') {
    fetchAnnotators()
  }
})
</script>

<style scoped lang="scss">
.audio-list {
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

  .progress-text {
    font-size: 12px;
    color: #6b7280;
    text-align: center;
    margin-top: 4px;
  }

  .pagination {
    display: flex;
    justify-content: flex-end;
    margin-top: 20px;
  }

  .form-tip {
    font-size: 12px;
    color: #9ca3af;
    margin-left: 8px;
  }
}
</style>
