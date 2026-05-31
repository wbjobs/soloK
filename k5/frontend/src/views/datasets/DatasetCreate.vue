<template>
  <div class="dataset-create">
    <el-card class="form-card" shadow="never">
      <template #header>
        <div class="card-header">
          <span>创建数据集</span>
          <el-button @click="$router.back()">
            <el-icon><Back /></el-icon>返回
          </el-button>
        </div>
      </template>

      <el-form
        ref="formRef"
        :model="datasetForm"
        :rules="datasetRules"
        label-width="120px"
        class="dataset-form"
      >
        <el-row :gutter="20">
          <el-col :span="24">
            <el-form-item label="名称" prop="name">
              <el-input
                v-model="datasetForm.name"
                placeholder="请输入数据集名称"
                maxlength="100"
                show-word-limit
              />
            </el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item label="描述" prop="description">
              <el-input
                v-model="datasetForm.description"
                type="textarea"
                :rows="3"
                placeholder="请输入数据集描述"
                maxlength="500"
                show-word-limit
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="方言片区" prop="dialect">
              <el-select
                v-model="datasetForm.dialect"
                placeholder="请选择方言片区"
                style="width: 100%"
                clearable
                @change="handleDialectChange"
              >
                <el-option
                  v-for="dialect in dialects"
                  :key="dialect.id"
                  :label="dialect.name"
                  :value="dialect.id"
                />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="子片区" prop="subregion">
              <el-select
                v-model="datasetForm.subregion"
                placeholder="请选择子片区"
                style="width: 100%"
                clearable
              >
                <el-option
                  v-for="subregion in subregions"
                  :key="subregion.id"
                  :label="subregion.name"
                  :value="subregion.id"
                />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="说话人性别" prop="speaker_gender">
              <el-select
                v-model="datasetForm.speaker_gender"
                placeholder="请选择性别"
                style="width: 100%"
                clearable
              >
                <el-option label="不限" value="any" />
                <el-option label="男" value="male" />
                <el-option label="女" value="female" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="年龄段" prop="speaker_age">
              <el-select
                v-model="datasetForm.speaker_age"
                placeholder="请选择年龄段"
                style="width: 100%"
                clearable
              >
                <el-option label="不限" value="any" />
                <el-option label="儿童(0-12)" value="child" />
                <el-option label="青少年(13-17)" value="teen" />
                <el-option label="青年(18-35)" value="young" />
                <el-option label="中年(36-55)" value="middle" />
                <el-option label="老年(55+)" value="senior" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="最小时长(秒)">
              <el-input-number
                v-model="datasetForm.min_duration"
                :min="0"
                :max="3600"
                :precision="2"
                :step="0.5"
                placeholder="不限"
                style="width: 100%"
                clearable
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="最大时长(秒)">
              <el-input-number
                v-model="datasetForm.max_duration"
                :min="0"
                :max="3600"
                :precision="2"
                :step="0.5"
                placeholder="不限"
                style="width: 100%"
                clearable
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="最小质量分">
              <el-input-number
                v-model="datasetForm.min_quality_score"
                :min="0"
                :max="100"
                :precision="0"
                :step="5"
                placeholder="不限"
                style="width: 100%"
                clearable
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="导出格式" prop="format">
              <el-radio-group v-model="datasetForm.format">
                <el-radio value="json">JSON</el-radio>
                <el-radio value="textgrid">TextGrid</el-radio>
                <el-radio value="both">JSON+TextGrid</el-radio>
              </el-radio-group>
            </el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item label="包含音频文件">
              <el-switch
                v-model="datasetForm.include_audio"
                active-text="是"
                inactive-text="否"
              />
              <span class="form-tip">导出时是否包含原始音频文件（会增大文件体积）</span>
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>

      <el-divider />

      <div class="preview-section">
        <div class="preview-header">
          <span class="preview-title">
            符合条件的语音数量：
            <el-tag type="primary" size="large">
              <el-icon><DataLine /></el-icon>
              {{ previewCount }} 条
            </el-tag>
          </span>
          <el-button
            type="primary"
            size="large"
            :loading="generating"
            :disabled="previewCount === 0 || generating"
            @click="handleGenerate"
          >
            <el-icon v-if="!generating"><MagicStick /></el-icon>
            <span v-if="generating">生成中 {{ progress }}%</span>
            <span v-else>生成数据集</span>
          </el-button>
        </div>

        <el-table
          v-loading="previewLoading"
          :data="previewData"
          stripe
          style="width: 100%; margin-top: 16px"
          max-height="400"
        >
          <el-table-column prop="filename" label="文件名" min-width="180" />
          <el-table-column prop="dialect_name" label="方言" width="100" />
          <el-table-column prop="subregion_name" label="子片区" width="120" />
          <el-table-column prop="speaker_gender_display" label="性别" width="70" />
          <el-table-column prop="speaker_age_display" label="年龄段" width="90" />
          <el-table-column prop="duration" label="时长(秒)" width="90" align="right">
            <template #default="{ row }">
              {{ row.duration?.toFixed(2) }}
            </template>
          </el-table-column>
          <el-table-column prop="quality_score" label="质量分" width="80" align="right">
            <template #default="{ row }">
              <el-tag v-if="row.quality_score !== null" :type="getQualityTagType(row.quality_score)" size="small">
                {{ row.quality_score }}
              </el-tag>
              <span v-else>-</span>
            </template>
          </el-table-column>
          <el-table-column prop="text_transcript" label="文本内容" min-width="200" show-overflow-tooltip />
        </el-table>

        <el-pagination
          v-if="previewCount > 0"
          class="preview-pagination"
          v-model:current-page="previewPagination.page"
          v-model:page-size="previewPagination.page_size"
          :page-sizes="[10, 20, 50]"
          :total="previewCount"
          layout="total, sizes, prev, pager, next"
          @size-change="fetchPreview"
          @current-change="fetchPreview"
        />
      </div>
    </el-card>

    <el-progress
      v-if="generating"
      :percentage="progress"
      :status="progressStatus"
      :stroke-width="20"
      class="progress-bar"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, watch, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { createDataset, filterAudioForDataset, exportDataset } from '@/api/datasets'
import { getDialectRegions, getDialectSubregions } from '@/api/dialects'
import type { DialectRegion, DialectSubregion, AudioSegment, ApiResponse } from '@/types'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import {
  Back,
  DataLine,
  MagicStick
} from '@element-plus/icons-vue'
import { debounce } from 'lodash-es'

const router = useRouter()

const formRef = ref<FormInstance>()
const generating = ref(false)
const previewLoading = ref(false)
const progress = ref(0)
const previewCount = ref(0)
const dialects = ref<DialectRegion[]>([])
const subregions = ref<DialectSubregion[]>([])
const previewData = ref<AudioSegment[]>([])

const datasetForm = reactive({
  name: '',
  description: '',
  dialect: null as number | null,
  subregion: null as number | null,
  speaker_gender: 'any',
  speaker_age: 'any',
  min_duration: null as number | null,
  max_duration: null as number | null,
  min_quality_score: null as number | null,
  format: 'json',
  include_audio: false
})

const datasetRules: FormRules = {
  name: [
    { required: true, message: '请输入数据集名称', trigger: 'blur' },
    { min: 2, max: 100, message: '长度在 2 到 100 个字符', trigger: 'blur' }
  ],
  description: [
    { required: true, message: '请输入数据集描述', trigger: 'blur' },
    { min: 5, max: 500, message: '长度在 5 到 500 个字符', trigger: 'blur' }
  ],
  format: [
    { required: true, message: '请选择导出格式', trigger: 'change' }
  ]
}

const previewPagination = reactive({
  page: 1,
  page_size: 20
})

const progressStatus = computed(() => {
  if (progress.value === 100) return 'success'
  if (generating.value) return undefined
  return 'exception'
})

const fetchDialects = async () => {
  try {
    const res = await getDialectRegions()
    dialects.value = res.results || []
  } catch (error) {
    console.error('获取方言列表失败', error)
  }
}

const handleDialectChange = async (dialectId: number | null) => {
  datasetForm.subregion = null
  subregions.value = []
  if (dialectId) {
    try {
      const res = await getDialectSubregions(dialectId)
      subregions.value = res.results || []
    } catch (error) {
      console.error('获取子片区列表失败', error)
    }
  }
}

const getFilterParams = () => {
  const params: any = {}
  if (datasetForm.dialect) params.dialect = datasetForm.dialect
  if (datasetForm.subregion) params.subregion = datasetForm.subregion
  if (datasetForm.speaker_gender && datasetForm.speaker_gender !== 'any') {
    params.speaker_gender = datasetForm.speaker_gender
  }
  if (datasetForm.speaker_age && datasetForm.speaker_age !== 'any') {
    params.speaker_age = datasetForm.speaker_age
  }
  if (datasetForm.min_duration !== null) params.min_duration = datasetForm.min_duration
  if (datasetForm.max_duration !== null) params.max_duration = datasetForm.max_duration
  if (datasetForm.min_quality_score !== null) params.min_quality_score = datasetForm.min_quality_score
  return params
}

const fetchPreview = debounce(async () => {
  previewLoading.value = true
  try {
    const params = getFilterParams()
    params.page = previewPagination.page
    params.page_size = previewPagination.page_size
    const res = await filterAudioForDataset(params) as ApiResponse<AudioSegment[]>
    previewData.value = res.results || []
    previewCount.value = res.count || 0
  } catch (error) {
    console.error('获取预览数据失败', error)
    ElMessage.error('获取预览数据失败')
  } finally {
    previewLoading.value = false
  }
}, 300)

const getQualityTagType = (score: number) => {
  if (score >= 80) return 'success'
  if (score >= 60) return 'warning'
  return 'danger'
}

const simulateProgress = () => {
  progress.value = 0
  const interval = setInterval(() => {
    if (progress.value < 90) {
      progress.value += Math.random() * 10
    } else if (!generating.value) {
      clearInterval(interval)
    }
  }, 500)
  return interval
}

const handleGenerate = async () => {
  if (!formRef.value) return

  await formRef.value.validate(async (valid) => {
    if (!valid) return

    if (previewCount.value === 0) {
      ElMessage.warning('没有符合条件的语音数据')
      return
    }

    try {
      await ElMessageBox.confirm(
        `确定要生成包含 ${previewCount.value} 条语音的数据集吗？`,
        '确认生成',
        { type: 'warning' }
      )

      generating.value = true
      const progressInterval = simulateProgress()

      try {
        const datasetData: any = {
          name: datasetForm.name,
          description: datasetForm.description,
          dialect: datasetForm.dialect,
          subregion: datasetForm.subregion,
          speaker_gender: datasetForm.speaker_gender,
          speaker_age: datasetForm.speaker_age,
          min_duration: datasetForm.min_duration,
          max_duration: datasetForm.max_duration,
          min_quality_score: datasetForm.min_quality_score,
          format: datasetForm.format,
          include_audio: datasetForm.include_audio
        }

        const dataset = await createDataset(datasetData) as any
        const datasetId = dataset.id || dataset

        await exportDataset(datasetId, {
          format: datasetForm.format,
          expires_hours: 24
        })

        progress.value = 100
        clearInterval(progressInterval)

        ElMessage.success('数据集生成成功')

        setTimeout(() => {
          router.push('/datasets')
        }, 1500)
      } catch (error: any) {
        clearInterval(progressInterval)
        console.error('生成数据集失败', error)
        ElMessage.error(error.response?.data?.detail || '生成数据集失败')
        generating.value = false
        progress.value = 0
      }
    } catch (error) {
      if (error !== 'cancel') {
        console.error('生成失败', error)
      }
    }
  })
}

watch(
  () => [
    datasetForm.dialect,
    datasetForm.subregion,
    datasetForm.speaker_gender,
    datasetForm.speaker_age,
    datasetForm.min_duration,
    datasetForm.max_duration,
    datasetForm.min_quality_score
  ],
  () => {
    previewPagination.page = 1
    fetchPreview()
  },
  { deep: true }
)

onMounted(() => {
  fetchDialects()
  fetchPreview()
})
</script>

<style scoped lang="scss">
.dataset-create {
  .form-card {
    border-radius: 12px;
    border: none;
    margin-bottom: 20px;

    .card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-weight: 600;
    }
  }

  .dataset-form {
    margin-top: 20px;

    .form-tip {
      font-size: 12px;
      color: #9ca3af;
      margin-left: 8px;
    }
  }

  .preview-section {
    .preview-header {
      display: flex;
      align-items: center;
      justify-content: space-between;

      .preview-title {
        font-weight: 500;
        font-size: 14px;

        .el-tag {
          margin-left: 8px;
        }
      }
    }

    .preview-pagination {
      margin-top: 16px;
      display: flex;
      justify-content: flex-end;
    }
  }

  .progress-bar {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 9999;
  }
}
</style>
