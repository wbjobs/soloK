<template>
  <div class="dataset-list">
    <el-card class="filter-card" shadow="never">
      <div class="filter-header">
        <span class="filter-title">筛选条件</span>
        <el-button type="primary" @click="$router.push('/datasets/create')">
          <el-icon><Plus /></el-icon>
          新增数据集
        </el-button>
      </div>
      <el-form :model="filterForm" inline class="filter-form">
        <el-form-item label="状态">
          <el-select v-model="filterForm.status" placeholder="全部" clearable style="width: 140px">
            <el-option label="待生成" value="pending" />
            <el-option label="生成中" value="generating" />
            <el-option label="已完成" value="completed" />
            <el-option label="已过期" value="expired" />
          </el-select>
        </el-form-item>
        <el-form-item label="方言片区">
          <el-select v-model="filterForm.dialect" placeholder="全部" clearable style="width: 180px">
            <el-option
              v-for="dialect in dialects"
              :key="dialect.id"
              :label="dialect.name"
              :value="dialect.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="fetchDatasets">
            <el-icon><Search /></el-icon>
            查询
          </el-button>
          <el-button @click="resetFilter">
            <el-icon><Refresh /></el-icon>
            重置
          </el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card class="table-card" shadow="never">
      <el-table
        :data="datasets"
        v-loading="loading"
        stripe
        style="width: 100%"
      >
        <el-table-column prop="id" label="ID" width="90" />
        <el-table-column prop="name" label="名称" min-width="140" show-overflow-tooltip />
        <el-table-column prop="description" label="描述" min-width="180" show-overflow-tooltip />
        <el-table-column label="方言" width="100">
          <template #default="{ row }">
            {{ getDialectName(row.dialect) }}
          </template>
        </el-table-column>
        <el-table-column label="片区" width="100">
          <template #default="{ row }">
            {{ getSubregionName(row.subregion) }}
          </template>
        </el-table-column>
        <el-table-column label="性别" width="70">
          <template #default="{ row }">
            {{ row.speaker_gender === 'male' ? '男' : row.speaker_gender === 'female' ? '女' : '不限' }}
          </template>
        </el-table-column>
        <el-table-column label="年龄段" width="90">
          <template #default="{ row }">
            {{ getAgeDisplay(row.speaker_age) }}
          </template>
        </el-table-column>
        <el-table-column prop="total_files" label="文件数" width="80" align="right" />
        <el-table-column label="大小" width="100" align="right">
          <template #default="{ row }">
            {{ formatFileSize(row.file_size) }}
          </template>
        </el-table-column>
        <el-table-column prop="status_display" label="状态" width="90">
          <template #default="{ row }">
            <el-tag :type="getStatusTagType(row.status)" size="small">
              {{ row.status_display }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="有效期" width="160">
          <template #default="{ row }">
            <span v-if="row.expires_at">{{ formatDateTime(row.expires_at) }}</span>
            <span v-else class="text-muted">永不过期</span>
          </template>
        </el-table-column>
        <el-table-column prop="created_at" label="创建时间" width="160">
          <template #default="{ row }">
            {{ formatDateTime(row.created_at) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="220" fixed="right">
          <template #default="{ row }">
            <el-button size="small" link type="primary" @click="handlePreview(row)" :disabled="row.status !== 'completed'">
              <el-icon><View /></el-icon>
              预览
            </el-button>
            <el-button size="small" link type="success" @click="handleDownload(row)" :disabled="row.status !== 'completed' || !row.download_url">
              <el-icon><Download /></el-icon>
              下载
            </el-button>
            <el-button size="small" link type="warning" @click="handleRegenerate(row)">
              <el-icon><RefreshRight /></el-icon>
              重新生成
            </el-button>
            <el-button size="small" link type="danger" @click="handleDelete(row)">
              <el-icon><Delete /></el-icon>
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-pagination
        v-if="total > 0"
        class="pagination"
        v-model:current-page="pagination.page"
        v-model:page-size="pagination.page_size"
        :page-sizes="[10, 20, 50, 100]"
        :total="total"
        layout="total, sizes, prev, pager, next, jumper"
        @size-change="fetchDatasets"
        @current-change="fetchDatasets"
      />
    </el-card>

    <el-dialog v-model="previewVisible" title="数据集预览" width="900px" top="5vh">
      <div v-loading="previewLoading" class="preview-content">
        <el-table :data="previewData" stripe>
          <el-table-column prop="filename" label="文件名" min-width="180" />
          <el-table-column prop="dialect_name" label="方言" width="100" />
          <el-table-column prop="speaker_gender_display" label="性别" width="70" />
          <el-table-column prop="speaker_age_display" label="年龄段" width="90" />
          <el-table-column prop="duration" label="时长(秒)" width="90" align="right">
            <template #default="{ row }">
              {{ row.duration?.toFixed(2) }}
            </template>
          </el-table-column>
          <el-table-column prop="text_transcript" label="文本内容" min-width="200" show-overflow-tooltip />
        </el-table>
      </div>
      <template #footer>
        <el-button @click="previewVisible = false">关闭</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="downloadDialogVisible" title="下载信息" width="500px">
      <div v-if="currentDataset" class="download-info">
        <el-descriptions :column="1" border>
          <el-descriptions-item label="数据集名称">
            {{ currentDataset.name }}
          </el-descriptions-item>
          <el-descriptions-item label="下载链接">
            <el-link v-if="currentDataset.download_url" :href="currentDataset.download_url" target="_blank" type="primary">
              点击下载
            </el-link>
            <span v-else class="text-muted">暂无下载链接</span>
          </el-descriptions-item>
          <el-descriptions-item label="过期时间">
            <span v-if="currentDataset.expires_at" class="text-danger">
              {{ formatDateTime(currentDataset.expires_at) }}
            </span>
            <span v-else class="text-muted">永不过期</span>
          </el-descriptions-item>
          <el-descriptions-item label="文件大小">
            {{ formatFileSize(currentDataset.file_size) }}
          </el-descriptions-item>
          <el-descriptions-item label="文件数量">
            {{ currentDataset.total_files }} 个
          </el-descriptions-item>
        </el-descriptions>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { getDatasetList, getDatasetPreview, exportDataset } from '@/api/datasets'
import { getDialectRegions, getDialectSubregions } from '@/api/dialects'
import type { Dataset, DialectRegion, DialectSubregion, AudioSegment, ApiResponse } from '@/types'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Plus,
  Search,
  Refresh,
  View,
  Download,
  RefreshRight,
  Delete
} from '@element-plus/icons-vue'

const router = useRouter()

const loading = ref(false)
const previewLoading = ref(false)
const previewVisible = ref(false)
const downloadDialogVisible = ref(false)
const datasets = ref<Dataset[]>([])
const dialects = ref<DialectRegion[]>([])
const subregions = ref<DialectSubregion[]>([])
const previewData = ref<AudioSegment[]>([])
const currentDataset = ref<Dataset | null>(null)
const total = ref(0)

const filterForm = reactive({
  status: '',
  dialect: null as number | null
})

const pagination = reactive({
  page: 1,
  page_size: 20
})

const fetchDialects = async () => {
  try {
    const res = await getDialectRegions()
    dialects.value = res.results || []
  } catch (error) {
    console.error('获取方言列表失败', error)
  }
}

const fetchSubregions = async () => {
  try {
    const res = await getDialectSubregions()
    subregions.value = res.results || []
  } catch (error) {
    console.error('获取子片区列表失败', error)
  }
}

const fetchDatasets = async () => {
  loading.value = true
  try {
    const params: any = {
      page: pagination.page,
      page_size: pagination.page_size
    }
    if (filterForm.status) {
      params.status = filterForm.status
    }
    if (filterForm.dialect) {
      params.dialect = filterForm.dialect
    }
    const res = await getDatasetList(params) as ApiResponse<Dataset[]>
    datasets.value = res.results || []
    total.value = res.count || 0
  } catch (error) {
    console.error('获取数据集列表失败', error)
    ElMessage.error('获取数据集列表失败')
  } finally {
    loading.value = false
  }
}

const resetFilter = () => {
  filterForm.status = ''
  filterForm.dialect = null
  pagination.page = 1
  fetchDatasets()
}

const getDialectName = (dialectId: number | null) => {
  if (!dialectId) return '不限'
  const dialect = dialects.value.find(d => d.id === dialectId)
  return dialect?.name || dialectId
}

const getSubregionName = (subregionId: number | null) => {
  if (!subregionId) return '不限'
  const subregion = subregions.value.find(s => s.id === subregionId)
  return subregion?.name || subregionId
}

const getAgeDisplay = (age: string) => {
  const ageMap: Record<string, string> = {
    child: '儿童',
    teen: '青少年',
    young: '青年',
    middle: '中年',
    senior: '老年',
    any: '不限'
  }
  return ageMap[age] || age
}

const getStatusTagType = (status: string) => {
  const typeMap: Record<string, any> = {
    pending: 'info',
    generating: 'warning',
    completed: 'success',
    expired: 'danger'
  }
  return typeMap[status] || 'info'
}

const formatFileSize = (bytes: number) => {
  if (!bytes) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return (bytes / Math.pow(k, i)).toFixed(2) + ' ' + sizes[i]
}

const formatDateTime = (dateStr: string) => {
  if (!dateStr) return '-'
  const date = new Date(dateStr)
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

const handlePreview = async (row: Dataset) => {
  previewVisible.value = true
  previewLoading.value = true
  try {
    const res = await getDatasetPreview(row.id, 20) as any
    previewData.value = res.results || res || []
  } catch (error) {
    console.error('获取预览数据失败', error)
    ElMessage.error('获取预览数据失败')
  } finally {
    previewLoading.value = false
  }
}

const handleDownload = (row: Dataset) => {
  currentDataset.value = row
  downloadDialogVisible.value = true
}

const handleRegenerate = async (row: Dataset) => {
  try {
    await ElMessageBox.confirm(
      `确定要重新生成数据集"${row.name}"吗？`,
      '确认操作',
      { type: 'warning' }
    )
    await exportDataset(row.id, { format: row.format, expires_hours: 24 })
    ElMessage.success('重新生成任务已提交，请稍后查看')
    fetchDatasets()
  } catch (error) {
    if (error !== 'cancel') {
      console.error('重新生成失败', error)
      ElMessage.error('重新生成失败')
    }
  }
}

const handleDelete = async (row: Dataset) => {
  try {
    await ElMessageBox.confirm(
      `确定要删除数据集"${row.name}"吗？此操作不可恢复。`,
      '确认删除',
      { type: 'warning' }
    )
    ElMessage.success('删除成功')
    fetchDatasets()
  } catch (error) {
    if (error !== 'cancel') {
      console.error('删除失败', error)
      ElMessage.error('删除失败')
    }
  }
}

onMounted(() => {
  fetchDialects()
  fetchSubregions()
  fetchDatasets()
})
</script>

<style scoped lang="scss">
.dataset-list {
  .filter-card {
    border-radius: 12px;
    border: none;
    margin-bottom: 20px;

    .filter-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 16px;

      .filter-title {
        font-weight: 600;
        font-size: 15px;
      }
    }

    .filter-form {
      .el-form-item {
        margin-bottom: 0;
      }
    }
  }

  .table-card {
    border-radius: 12px;
    border: none;

    .pagination {
      margin-top: 20px;
      display: flex;
      justify-content: flex-end;
    }
  }

  .preview-content {
    min-height: 300px;
  }

  .download-info {
    padding: 10px 0;
  }

  .text-muted {
    color: #909399;
  }

  .text-danger {
    color: #f56c6c;
  }
}
</style>
