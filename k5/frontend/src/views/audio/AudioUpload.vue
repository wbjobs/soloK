<template>
  <div class="audio-upload">
    <el-card class="upload-card" shadow="never">
      <template #header>
        <div class="card-header">
          <span>上传方言语音片段</span>
          <el-button @click="$router.back()">
            <el-icon><Back /></el-icon>返回
          </el-button>
        </div>
      </template>

      <el-upload
        ref="uploadRef"
        class="upload-dragger"
        drag
        :auto-upload="false"
        :multiple="true"
        :file-list="fileList"
        :before-upload="beforeUpload"
        :on-change="handleFileChange"
        :on-remove="handleFileRemove"
        accept=".wav"
      >
        <el-icon class="upload-icon"><UploadFilled /></el-icon>
        <div class="upload-text">
          将WAV文件拖到此处，或<em>点击上传</em>
        </div>
        <template #tip>
          <div class="upload-tip">
            <el-icon :size="14" style="margin-right: 4px;"><InfoFilled /></el-icon>
            支持WAV格式，单声道，时长5-15秒，文件大小不超过10MB
          </div>
        </template>
      </el-upload>

      <el-divider />

      <el-form
        ref="formRef"
        :model="uploadForm"
        :rules="uploadRules"
        label-width="120px"
        class="upload-form"
      >
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="方言片区" prop="dialect">
              <el-select
                v-model="uploadForm.dialect"
                placeholder="请选择方言"
                style="width: 100%"
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
                v-model="uploadForm.subregion"
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
                v-model="uploadForm.speaker_gender"
                placeholder="请选择性别"
                style="width: 100%"
              >
                <el-option label="男" value="male" />
                <el-option label="女" value="female" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="说话人年龄段" prop="speaker_age">
              <el-select
                v-model="uploadForm.speaker_age"
                placeholder="请选择年龄段"
                style="width: 100%"
              >
                <el-option label="儿童(0-12)" value="child" />
                <el-option label="青少年(13-17)" value="teen" />
                <el-option label="青年(18-35)" value="young" />
                <el-option label="中年(36-55)" value="middle" />
                <el-option label="老年(55+)" value="senior" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item label="文本转写" prop="text_transcript">
              <el-input
                v-model="uploadForm.text_transcript"
                type="textarea"
                :rows="3"
                placeholder="请输入语音对应的文本内容"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="需要标注数">
              <el-input-number
                v-model="uploadForm.required_annotations"
                :min="1"
                :max="5"
                style="width: 100%"
              />
              <span class="form-tip">默认2个标注员独立标注</span>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="自动处理">
              <el-switch
                v-model="uploadForm.auto_process"
                active-text="是"
                inactive-text="否"
              />
              <span class="form-tip">上传后自动切分音素并生成初始标注</span>
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>

      <div class="upload-actions">
        <el-button :loading="uploading" type="primary" size="large" @click="handleUpload">
          <el-icon><Upload /></el-icon>
          上传并处理 ({{ fileList.length }}个文件)
        </el-button>
        <el-button size="large" @click="clearFiles">清空文件</el-button>
      </div>
    </el-card>

    <el-card class="result-card" shadow="never" v-if="uploadResults.length > 0">
      <template #header>
        <span>上传结果</span>
      </template>
      <el-table :data="uploadResults" style="width: 100%">
        <el-table-column prop="filename" label="文件名" width="250" />
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag v-if="row.status === 'success'" type="success" size="small">成功</el-tag>
            <el-tag v-else type="danger" size="small">失败</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="message" label="说明" />
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { audioApi, dialectsApi } from '@/api'
import type { DialectRegion, DialectSubregion, UploadFile } from '@/types'
import { ElMessage, type FormInstance, type FormRules, type UploadInstance, type UploadFiles } from 'element-plus'
import {
  Back,
  UploadFilled,
  InfoFilled,
  Upload
} from '@element-plus/icons-vue'

const router = useRouter()

const uploadRef = ref<UploadInstance>()
const formRef = ref<FormInstance>()
const uploading = ref(false)
const fileList = ref<UploadFiles>([])
const uploadResults = ref<any[]>([])
const dialects = ref<DialectRegion[]>([])
const subregions = ref<DialectSubregion[]>([])

const uploadForm = reactive({
  dialect: null as number | null,
  subregion: null as number | null,
  speaker_gender: null as string | null,
  speaker_age: null as string | null,
  text_transcript: '',
  required_annotations: 2,
  auto_process: true
})

const uploadRules: FormRules = {
  dialect: [
    { required: true, message: '请选择方言片区', trigger: 'change' }
  ],
  speaker_gender: [
    { required: true, message: '请选择说话人性别', trigger: 'change' }
  ],
  speaker_age: [
    { required: true, message: '请选择说话人年龄段', trigger: 'change' }
  ],
  text_transcript: [
    { required: true, message: '请输入文本转写内容', trigger: 'blur' }
  ]
}

const beforeUpload = (file: UploadFile) => {
  const isWAV = file.name.endsWith('.wav')
  if (!isWAV) {
    ElMessage.error('只支持WAV格式文件')
    return false
  }
  const isLt10M = file.size / 1024 / 1024 < 10
  if (!isLt10M) {
    ElMessage.error('文件大小不能超过10MB')
    return false
  }
  return true
}

const handleFileChange = (_file: UploadFile, files: UploadFiles) => {
  fileList.value = files
}

const handleFileRemove = (_file: UploadFile, files: UploadFiles) => {
  fileList.value = files
}

const fetchDialects = async () => {
  try {
    const res = await dialectsApi.getDialectRegions()
    dialects.value = res.results || []
  } catch (error) {
    console.error('获取方言列表失败', error)
  }
}

const handleDialectChange = async (dialectId: number) => {
  uploadForm.subregion = null
  try {
    const res = await dialectsApi.getDialectSubregions(dialectId)
    subregions.value = res.results || []
  } catch (error) {
    console.error('获取子片区列表失败', error)
  }
}

const clearFiles = () => {
  uploadRef.value?.clearFiles()
  fileList.value = []
}

const handleUpload = async () => {
  if (!formRef.value) return
  
  await formRef.value.validate(async (valid) => {
    if (!valid) return
    
    if (fileList.value.length === 0) {
      ElMessage.warning('请先选择要上传的文件')
      return
    }
    
    uploading.value = true
    uploadResults.value = []
    
    try {
      for (const file of fileList.value) {
        try {
          const formData = new FormData()
          formData.append('file', file.raw!)
          formData.append('dialect', String(uploadForm.dialect))
          if (uploadForm.subregion) {
            formData.append('subregion', String(uploadForm.subregion))
          }
          formData.append('speaker_gender', uploadForm.speaker_gender!)
          formData.append('speaker_age', uploadForm.speaker_age!)
          formData.append('text_transcript', uploadForm.text_transcript)
          formData.append('required_annotations', String(uploadForm.required_annotations))
          formData.append('auto_process', String(uploadForm.auto_process))
          
          await audioApi.uploadAudio(formData)
          
          uploadResults.value.push({
            filename: file.name,
            status: 'success',
            message: '上传成功，正在后台处理'
          })
        } catch (error: any) {
          uploadResults.value.push({
            filename: file.name,
            status: 'error',
            message: error.response?.data?.detail || '上传失败'
          })
        }
      }
      
      const successCount = uploadResults.value.filter(r => r.status === 'success').length
      ElMessage.success(`成功上传 ${successCount}/${fileList.value.length} 个文件`)
      
      if (successCount > 0) {
        setTimeout(() => {
          router.push('/audio')
        }, 1500)
      }
    } finally {
      uploading.value = false
    }
  })
}

fetchDialects()
</script>

<style scoped lang="scss">
.audio-upload {
  .upload-card {
    border-radius: 12px;
    border: none;
    margin-bottom: 20px;
  }

  .card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-weight: 600;
  }

  .upload-dragger {
    :deep(.el-upload-dragger) {
      padding: 40px;
      border-radius: 8px;
    }
  }

  .upload-icon {
    font-size: 67px;
    color: #409eff;
    margin-bottom: 16px;
  }

  .upload-text {
    font-size: 14px;
    color: #606266;

    em {
      color: #409eff;
      font-style: normal;
    }
  }

  .upload-tip {
    display: flex;
    align-items: center;
    font-size: 12px;
    color: #909399;
    margin-top: 8px;
  }

  .upload-form {
    margin-top: 20px;
  }

  .form-tip {
    font-size: 12px;
    color: #9ca3af;
    margin-left: 8px;
  }

  .upload-actions {
    display: flex;
    justify-content: center;
    gap: 16px;
    margin-top: 24px;
  }

  .result-card {
    border-radius: 12px;
    border: none;
  }
}
</style>
