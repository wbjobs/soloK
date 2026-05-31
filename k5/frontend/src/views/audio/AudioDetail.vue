<template>
  <div class="audio-detail">
    <div class="detail-header">
      <div class="header-left">
        <el-button @click="$router.back()">
          <el-icon><ArrowLeft /></el-icon>返回
        </el-button>
        <el-divider direction="vertical" />
        <div class="audio-info">
          <h3 class="audio-title">{{ audio?.original_filename }}</h3>
          <div class="audio-meta">
            <el-tag :type="statusTagType" size="small">{{ audio?.status_display }}</el-tag>
            <el-tag size="small" type="info">{{ audio?.dialect_name }}</el-tag>
            <el-tag v-if="audio?.subregion_name" size="small" type="info">{{ audio?.subregion_name }}</el-tag>
            <span class="meta-item">ID: {{ audio?.id }}</span>
          </div>
        </div>
      </div>
      <div class="header-right">
        <el-button type="primary" @click="handleEditAnnotation" :disabled="!canEdit">
          <el-icon><Edit /></el-icon>编辑标注
        </el-button>
        <el-button type="success" @click="assignDialogVisible = true" v-if="userStore.user?.role === 'admin'">
          <el-icon><UserFilled /></el-icon>分配标注员
        </el-button>
        <el-button type="warning" @click="handleReprocess" v-if="userStore.user?.role === 'admin'" :loading="reprocessing">
          <el-icon><Refresh /></el-icon>重新处理
        </el-button>
        <el-button type="danger" @click="handleDelete" v-if="userStore.user?.role === 'admin'">
          <el-icon><Delete /></el-icon>删除
        </el-button>
      </div>
    </div>

    <div class="detail-content" v-loading="loading">
      <el-row :gutter="20">
        <el-col :span="16">
          <el-card class="waveform-card" shadow="never">
            <template #header>
              <div class="card-header">
                <span>波形图与频谱图</span>
                <div class="header-actions">
                  <el-button-group>
                    <el-button size="small" @click="zoomIn">
                      <el-icon><ZoomIn /></el-icon>
                    </el-button>
                    <el-button size="small" @click="zoomOut">
                      <el-icon><ZoomOut /></el-icon>
                    </el-button>
                    <el-button size="small" @click="resetZoom">
                      <el-icon><Refresh /></el-icon>
                    </el-button>
                  </el-button-group>
                </div>
              </div>
            </template>
            
            <div class="waveform-container">
              <div ref="waveformRef" class="waveform"></div>
            </div>

            <div class="spectrogram-container" v-if="audio?.spectrogram_data">
              <div class="spectrogram-title">频谱图</div>
              <canvas ref="spectrogramCanvas" class="spectrogram-canvas"></canvas>
            </div>

            <div class="playback-controls">
              <el-button-group>
                <el-button @click="skipBackward">
                  <el-icon><DArrowLeft /></el-icon>
                </el-button>
                <el-button @click="togglePlay" :type="isPlaying ? 'primary' : ''">
                  <el-icon v-if="!isPlaying"><VideoPlay /></el-icon>
                  <el-icon v-else><VideoPause /></el-icon>
                </el-button>
                <el-button @click="skipForward">
                  <el-icon><DArrowRight /></el-icon>
                </el-button>
              </el-button-group>
              <el-slider
                v-model="currentTime"
                :min="0"
                :max="audio?.duration || 0"
                :step="0.01"
                class="time-slider"
                @change="seekTo"
              />
              <span class="time-display">
                {{ formatTime(currentTime) }} / {{ formatTime(audio?.duration || 0) }}
              </span>
            </div>
          </el-card>

          <el-card class="basic-info-card" shadow="never">
            <template #header>
              <span>基本信息</span>
            </template>
            <el-descriptions :column="3" border>
              <el-descriptions-item label="文件名">
                {{ audio?.original_filename }}
              </el-descriptions-item>
              <el-descriptions-item label="存储文件名">
                {{ audio?.filename }}
              </el-descriptions-item>
              <el-descriptions-item label="上传时间">
                {{ formatDate(audio?.created_at) }}
              </el-descriptions-item>
              <el-descriptions-item label="方言">
                {{ audio?.dialect_name }}
              </el-descriptions-item>
              <el-descriptions-item label="片区">
                {{ audio?.subregion_name || '-' }}
              </el-descriptions-item>
              <el-descriptions-item label="上传者">
                {{ audio?.uploaded_by_name || '-' }}
              </el-descriptions-item>
              <el-descriptions-item label="说话人性别">
                {{ audio?.speaker_gender_display }}
              </el-descriptions-item>
              <el-descriptions-item label="说话人年龄段">
                {{ audio?.speaker_age_display }}
              </el-descriptions-item>
              <el-descriptions-item label="处理时间">
                {{ audio?.processed_at ? formatDate(audio?.processed_at) : '-' }}
              </el-descriptions-item>
              <el-descriptions-item label="时长">
                {{ audio?.duration.toFixed(2) }}s
              </el-descriptions-item>
              <el-descriptions-item label="采样率">
                {{ audio?.sample_rate }} Hz
              </el-descriptions-item>
              <el-descriptions-item label="声道数">
                {{ audio?.channels }}
              </el-descriptions-item>
            </el-descriptions>
          </el-card>

          <el-card class="transcript-card" shadow="never">
            <template #header>
              <span>文本转写</span>
            </template>
            <div class="transcript-text">
              {{ audio?.text_transcript || '暂无转写内容' }}
            </div>
          </el-card>

          <el-card class="initial-phonemes-card" shadow="never">
            <template #header>
              <div class="card-header">
                <span>初始标注音素列表</span>
                <el-tag size="small" type="info">
                  共 {{ initialPhonemes.length }} 个音素
                </el-tag>
              </div>
            </template>
            <div class="phoneme-timeline" v-if="initialPhonemes.length > 0">
              <div class="timeline-scale">
                <div
                  v-for="i in Math.ceil(audio?.duration || 0) + 1"
                  :key="i"
                  class="scale-mark"
                  :style="{ left: `${(i - 1) * (100 / (audio?.duration || 1))}%` }"
                >
                  {{ i - 1 }}s
                </div>
              </div>
              
              <div class="phoneme-tracks">
                <div
                  v-for="(phoneme, index) in initialPhonemes"
                  :key="index"
                  class="phoneme-segment"
                  :style="getPhonemeStyle(phoneme)"
                  @click="playPhoneme(phoneme)"
                >
                  <div class="phoneme-label">
                    <span class="phoneme-text">{{ phoneme.pinyin || phoneme.phoneme }}</span>
                    <span v-if="phoneme.tone" class="tone-mark">T{{ phoneme.tone }}</span>
                  </div>
                </div>
              </div>

              <div class="playhead" :style="{ left: `${(currentTime / (audio?.duration || 1)) * 100}%` }"></div>
            </div>
            <el-table :data="initialPhonemes" v-if="initialPhonemes.length > 0" size="small" class="phoneme-table">
              <el-table-column prop="start_time" label="开始时间" width="100">
                <template #default="{ row }">
                  {{ row.start_time.toFixed(3) }}s
                </template>
              </el-table-column>
              <el-table-column prop="end_time" label="结束时间" width="100">
                <template #default="{ row }">
                  {{ row.end_time.toFixed(3) }}s
                </template>
              </el-table-column>
              <el-table-column label="时长" width="80">
                <template #default="{ row }">
                  {{ (row.end_time - row.start_time).toFixed(3) }}s
                </template>
              </el-table-column>
              <el-table-column prop="phoneme" label="音素" width="100" />
              <el-table-column prop="pinyin" label="拼音" width="100" />
              <el-table-column prop="ipa" label="IPA" width="100" />
              <el-table-column prop="tone" label="声调" width="80">
                <template #default="{ row }">
                  {{ row.tone || '-' }}
                </template>
              </el-table-column>
              <el-table-column label="置信度" width="120">
                <template #default="{ row }">
                  <el-progress
                    :percentage="Math.round((row.confidence || 0) * 100)"
                    :status="row.confidence && row.confidence > 0.7 ? 'success' : 'warning'"
                    :show-text="true"
                  />
                </template>
              </el-table-column>
            </el-table>
            <el-empty v-else description="暂无初始音素标注" />
          </el-card>
        </el-col>

        <el-col :span="8">
          <el-card class="progress-card" shadow="never">
            <template #header>
              <span>标注进度</span>
            </template>
            <div class="progress-info">
              <el-progress
                :percentage="annotationPercentage"
                :status="audio && audio.completed_annotations >= audio.required_annotations ? 'success' : ''"
              />
              <div class="progress-text">
                已完成 {{ audio?.completed_annotations }} / {{ audio?.required_annotations }} 个标注
              </div>
            </div>
            <el-divider />
            <div class="assigned-annotators">
              <div class="annotators-label">已分配标注员：</div>
              <div class="annotators-list" v-if="audio?.assigned_annotators?.length">
                <el-avatar
                  v-for="annotator in audio.assigned_annotators"
                  :key="annotator.id"
                  :src="annotator.avatar"
                  size="small"
                  :alt="annotator.username"
                >
                  {{ annotator.username.charAt(0).toUpperCase() }}
                </el-avatar>
              </div>
              <span v-else class="no-annotators">暂未分配</span>
            </div>
          </el-card>

          <el-card class="annotations-card" shadow="never">
            <template #header>
              <div class="card-header">
                <span>标注任务列表</span>
                <el-tag size="small" type="info">
                  共 {{ annotations.length }} 个任务
                </el-tag>
              </div>
            </template>
            <el-table :data="annotations" size="small" v-loading="annotationsLoading">
              <el-table-column label="标注员" min-width="120">
                <template #default="{ row }">
                  <div class="annotator-cell">
                    <el-avatar :src="row.annotator_info?.avatar" size="small">
                      {{ row.annotator_info?.username?.charAt(0).toUpperCase() }}
                    </el-avatar>
                    <span class="annotator-name">{{ row.annotator_info?.username }}</span>
                  </div>
                </template>
              </el-table-column>
              <el-table-column label="状态" width="100">
                <template #default="{ row }">
                  <el-tag :type="annotationStatusTagType(row.status)" size="small">
                    {{ row.status_display }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column prop="phoneme_count" label="音素数" width="80" />
              <el-table-column label="质量分" width="90">
                <template #default="{ row }">
                  <span v-if="row.quality_score !== null" :class="getQualityScoreClass(row.quality_score)">
                    {{ row.quality_score.toFixed(1) }}
                  </span>
                  <span v-else>-</span>
                </template>
              </el-table-column>
              <el-table-column label="Kappa" width="90">
                <template #default="{ row }">
                  <span v-if="row.kappa_score !== null" :class="getKappaClass(row.kappa_score)">
                    {{ row.kappa_score.toFixed(2) }}
                  </span>
                  <span v-else>-</span>
                </template>
              </el-table-column>
              <el-table-column label="一致率" width="90">
                <template #default="{ row }">
                  <span v-if="row.agreement_rate !== null">
                    {{ (row.agreement_rate * 100).toFixed(0) }}%
                  </span>
                  <span v-else>-</span>
                </template>
              </el-table-column>
              <el-table-column label="用时" width="100">
                <template #default="{ row }">
                  {{ formatTimeSpent(row.time_spent) }}
                </template>
              </el-table-column>
              <el-table-column label="提交时间" width="150">
                <template #default="{ row }">
                  {{ row.submitted_at ? formatDate(row.submitted_at) : '-' }}
                </template>
              </el-table-column>
              <el-table-column label="操作" width="80" fixed="right">
                <template #default="{ row }">
                  <el-button
                    type="primary"
                    link
                    size="small"
                    @click="viewAnnotation(row)"
                  >
                    查看
                  </el-button>
                </template>
              </el-table-column>
            </el-table>
            <el-empty v-if="annotations.length === 0 && !annotationsLoading" description="暂无标注任务" />
          </el-card>
        </el-col>
      </el-row>
    </div>

    <el-dialog v-model="assignDialogVisible" title="分配标注员" width="500px">
      <el-form :model="assignForm" label-width="100px">
        <el-form-item label="选择标注员" required>
          <el-select
            v-model="assignForm.annotatorIds"
            multiple
            placeholder="请选择标注员"
            style="width: 100%"
            filterable
          >
            <el-option
              v-for="annotator in annotators"
              :key="annotator.id"
              :label="annotator.username"
              :value="annotator.id"
            />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="assignDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="confirmAssign" :loading="assigning">确定分配</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import WaveSurfer from 'wavesurfer.js'
import { useUserStore } from '@/store/user'
import { audioApi, authApi } from '@/api'
import type { AudioSegment, Annotation, Phoneme, User } from '@/types'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  ArrowLeft,
  Edit,
  UserFilled,
  Refresh,
  Delete,
  ZoomIn,
  ZoomOut,
  DArrowLeft,
  DArrowRight,
  VideoPlay,
  VideoPause
} from '@element-plus/icons-vue'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()

const audioId = route.params.audioId as string

const loading = ref(false)
const reprocessing = ref(false)
const assigning = ref(false)
const annotationsLoading = ref(false)

const audio = ref<AudioSegment | null>(null)
const annotations = ref<Annotation[]>([])
const annotators = ref<User[]>([])
const initialPhonemes = ref<Phoneme[]>([])

const assignDialogVisible = ref(false)
const assignForm = ref({
  annotatorIds: [] as number[]
})

const showSpectrogram = ref(true)
const isPlaying = ref(false)
const currentTime = ref(0)

const waveformRef = ref<HTMLElement>()
const spectrogramCanvas = ref<HTMLCanvasElement>()

let wavesurfer: WaveSurfer | null = null
let timer: number | null = null

const statusTagType = computed(() => {
  const status = audio.value?.status
  const types: Record<string, string> = {
    'pending': 'info',
    'processing': 'warning',
    'processed': 'success',
    'failed': 'danger'
  }
  return types[status || 'pending'] || 'info'
})

const annotationPercentage = computed(() => {
  if (!audio.value) return 0
  return Math.round((audio.value.completed_annotations / audio.value.required_annotations) * 100)
})

const canEdit = computed(() => {
  return audio.value?.status === 'processed'
})

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

const formatDate = (dateStr?: string) => {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleString('zh-CN')
}

const annotationStatusTagType = (status: string) => {
  const types: Record<string, string> = {
    'pending': 'info',
    'in_progress': 'warning',
    'submitted': 'success',
    'completed': 'success'
  }
  return types[status] || 'info'
}

const getQualityScoreClass = (score: number) => {
  if (score >= 80) return 'text-success'
  if (score >= 60) return 'text-warning'
  return 'text-danger'
}

const getKappaClass = (kappa: number) => {
  if (kappa >= 0.8) return 'text-success'
  if (kappa >= 0.6) return 'text-warning'
  return 'text-danger'
}

const getPhonemeStyle = (phoneme: Phoneme) => {
  const duration = audio.value?.duration || 1
  const left = (phoneme.start_time / duration) * 100
  const width = ((phoneme.end_time - phoneme.start_time) / duration) * 100
  return {
    left: `${left}%`,
    width: `${width}%`
  }
}

const fetchData = async () => {
  loading.value = true
  try {
    const res = await audioApi.getAudioDetail(audioId)
    audio.value = (res as any).data || res
    initialPhonemes.value = audio.value?.initial_phonemes?.phonemes || []
    
    await nextTick()
    initWaveSurfer()
    drawSpectrogram()
    fetchAnnotations()
    
    if (userStore.user?.role === 'admin') {
      fetchAnnotators()
    }
  } catch (error) {
    ElMessage.error('获取语音详情失败')
  } finally {
    loading.value = false
  }
}

const fetchAnnotations = async () => {
  annotationsLoading.value = true
  try {
    const res = await audioApi.getAudioAnnotations(audioId)
    annotations.value = res.results || res.data || []
  } catch (error) {
    console.error('获取标注列表失败', error)
  } finally {
    annotationsLoading.value = false
  }
}

const fetchAnnotators = async () => {
  try {
    const res = await authApi.getAnnotators()
    annotators.value = res.results || res.data || []
  } catch (error) {
    console.error('获取标注员列表失败', error)
  }
}

const initWaveSurfer = () => {
  if (!waveformRef.value || !audio.value?.audio_url) return

  if (wavesurfer) {
    wavesurfer.destroy()
  }

  wavesurfer = WaveSurfer.create({
    container: waveformRef.value,
    waveColor: '#667eea',
    progressColor: '#764ba2',
    cursorColor: '#ef4444',
    barWidth: 2,
    barGap: 1,
    barRadius: 2,
    height: 128,
    normalize: true
  })

  wavesurfer.load(audio.value.audio_url)

  wavesurfer.on('ready', () => {
    currentTime.value = 0
  })

  wavesurfer.on('audioprocess', () => {
    if (wavesurfer) {
      currentTime.value = wavesurfer.getCurrentTime()
    }
  })

  wavesurfer.on('play', () => {
    isPlaying.value = true
  })

  wavesurfer.on('pause', () => {
    isPlaying.value = false
  })

  wavesurfer.on('finish', () => {
    isPlaying.value = false
  })
}

const drawSpectrogram = () => {
  if (!spectrogramCanvas.value || !audio.value?.spectrogram_data) return

  const canvas = spectrogramCanvas.value
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const specData = audio.value.spectrogram_data
  canvas.width = specData.times.length * 4
  canvas.height = specData.frequencies.length

  const imageData = ctx.createImageData(canvas.width, canvas.height)
  
  let maxVal = -Infinity
  let minVal = Infinity
  specData.spectrogram.forEach(row => {
    row.forEach(val => {
      maxVal = Math.max(maxVal, val)
      minVal = Math.min(minVal, val)
    })
  })

  for (let y = 0; y < specData.frequencies.length; y++) {
    for (let x = 0; x < specData.times.length; x++) {
      const val = specData.spectrogram[specData.frequencies.length - 1 - y][x]
      const normalized = (val - minVal) / (maxVal - minVal)
      
      const r = Math.floor(normalized * 255)
      const g = Math.floor(normalized * 150)
      const b = Math.floor((1 - normalized) * 200)
      
      for (let px = 0; px < 4; px++) {
        const idx = ((y * canvas.width) + (x * 4 + px)) * 4
        imageData.data[idx] = r
        imageData.data[idx + 1] = g
        imageData.data[idx + 2] = b
        imageData.data[idx + 3] = 255
      }
    }
  }

  ctx.putImageData(imageData, 0, 0)
}

const togglePlay = () => {
  if (wavesurfer) {
    wavesurfer.playPause()
  }
}

const skipBackward = () => {
  if (wavesurfer) {
    const newTime = Math.max(0, wavesurfer.getCurrentTime() - 0.5)
    wavesurfer.seekTo(newTime / (audio.value?.duration || 1))
  }
}

const skipForward = () => {
  if (wavesurfer) {
    const newTime = Math.min(audio.value?.duration || 0, wavesurfer.getCurrentTime() + 0.5)
    wavesurfer.seekTo(newTime / (audio.value?.duration || 1))
  }
}

const seekTo = (time: number) => {
  if (wavesurfer) {
    wavesurfer.seekTo(time / (audio.value?.duration || 1))
  }
}

const currentZoomLevel = ref(50)

const zoomIn = () => {
  if (wavesurfer) {
    currentZoomLevel.value = currentZoomLevel.value * 1.5
    wavesurfer.zoom(currentZoomLevel.value)
  }
}

const zoomOut = () => {
  if (wavesurfer) {
    currentZoomLevel.value = currentZoomLevel.value / 1.5
    wavesurfer.zoom(currentZoomLevel.value)
  }
}

const resetZoom = () => {
  if (wavesurfer) {
    currentZoomLevel.value = 50
    wavesurfer.zoom(50)
  }
}

const playPhoneme = (phoneme: Phoneme) => {
  if (!wavesurfer || !audio.value) return
  
  const start = phoneme.start_time
  const end = phoneme.end_time
  const duration = audio.value.duration
  
  wavesurfer.seekTo(start / duration)
  wavesurfer.play()
  
  const checkEnd = () => {
    if (wavesurfer && wavesurfer.getCurrentTime() >= end) {
      wavesurfer.pause()
      wavesurfer.un('audioprocess', checkEnd)
    }
  }
  wavesurfer.on('audioprocess', checkEnd)
}

const handleEditAnnotation = () => {
  router.push(`/annotate/${audioId}`)
}

const handleReprocess = async () => {
  ElMessageBox.confirm(
    '确定要重新处理此语音片段吗？重新处理将清除现有标注结果。',
    '提示',
    {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    }
  ).then(async () => {
    reprocessing.value = true
    try {
      await audioApi.processAudio(audioId)
      ElMessage.success('已提交重新处理任务')
      fetchData()
    } catch (error: any) {
      ElMessage.error(error.response?.data?.detail || '重新处理失败')
    } finally {
      reprocessing.value = false
    }
  }).catch(() => {})
}

const handleDelete = async () => {
  ElMessageBox.confirm(
    `确定要删除语音片段 "${audio.value?.original_filename}" 吗？此操作不可恢复。`,
    '提示',
    {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    }
  ).then(async () => {
    try {
      await audioApi.deleteAudio(audioId)
      ElMessage.success('删除成功')
      router.push('/audio')
    } catch (error) {
      ElMessage.error('删除失败')
    }
  }).catch(() => {})
}

const confirmAssign = async () => {
  if (assignForm.value.annotatorIds.length === 0) {
    ElMessage.warning('请选择标注员')
    return
  }
  
  assigning.value = true
  try {
    await audioApi.assignAnnotators(audioId, assignForm.value.annotatorIds)
    ElMessage.success('分配成功')
    assignDialogVisible.value = false
    assignForm.value.annotatorIds = []
    fetchData()
  } catch (error: any) {
    ElMessage.error(error.response?.data?.detail || '分配失败')
  } finally {
    assigning.value = false
  }
}

const viewAnnotation = (row: Annotation) => {
  router.push(`/annotate/${audioId}?annotationId=${row.id}`)
}

watch(currentTime, (time) => {
  if (wavesurfer && Math.abs(wavesurfer.getCurrentTime() - time) > 0.01) {
    wavesurfer.seekTo(time / (audio.value?.duration || 1))
  }
})

onMounted(() => {
  fetchData()
})

onUnmounted(() => {
  if (wavesurfer) {
    wavesurfer.destroy()
  }
  if (timer) {
    clearInterval(timer)
  }
})
</script>

<style scoped lang="scss">
.audio-detail {
  display: flex;
  flex-direction: column;
}

.detail-header {
  background: #fff;
  border-radius: 12px;
  padding: 16px 20px;
  margin-bottom: 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border: 1px solid #e5e7eb;

  .header-left {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .audio-info {
    .audio-title {
      margin: 0 0 4px;
      font-size: 16px;
      font-weight: 600;
      color: #1f2937;
    }

    .audio-meta {
      display: flex;
      align-items: center;
      gap: 8px;

      .meta-item {
        font-size: 13px;
        color: #6b7280;
      }
    }
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: 12px;
  }
}

.detail-content {
  flex: 1;
}

.waveform-card,
.basic-info-card,
.transcript-card,
.initial-phonemes-card,
.progress-card,
.annotations-card {
  border-radius: 12px;
  border: none;
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
}

.waveform-container {
  position: relative;
  background: #f9fafb;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 16px;

  .waveform {
    min-height: 128px;
  }
}

.spectrogram-container {
  margin-top: 16px;

  .spectrogram-title {
    font-size: 12px;
    color: #6b7280;
    margin-bottom: 8px;
  }

  .spectrogram-canvas {
    width: 100%;
    height: 100px;
    border-radius: 4px;
  }
}

.playback-controls {
  display: flex;
  align-items: center;
  gap: 16px;
  padding-top: 16px;
  border-top: 1px solid #f3f4f6;

  .time-slider {
    flex: 1;
  }

  .time-display {
    font-family: monospace;
    font-size: 13px;
    color: #6b7280;
    min-width: 100px;
  }
}

.transcript-text {
  font-size: 15px;
  line-height: 1.8;
  color: #374151;
  padding: 12px;
  background: #f9fafb;
  border-radius: 6px;
  min-height: 60px;
}

.progress-info {
  text-align: center;
  padding: 12px 0;

  .progress-text {
    font-size: 13px;
    color: #6b7280;
    margin-top: 8px;
  }
}

.assigned-annotators {
  display: flex;
  align-items: center;
  gap: 12px;

  .annotators-label {
    font-size: 14px;
    color: #374151;
    white-space: nowrap;
  }

  .annotators-list {
    display: flex;
    gap: 8px;
  }

  .no-annotators {
    font-size: 14px;
    color: #9ca3af;
  }
}

.annotator-cell {
  display: flex;
  align-items: center;
  gap: 8px;

  .annotator-name {
    font-size: 13px;
  }
}

.text-success {
  color: #10b981;
  font-weight: 500;
}

.text-warning {
  color: #f59e0b;
  font-weight: 500;
}

.text-danger {
  color: #ef4444;
  font-weight: 500;
}

.phoneme-timeline {
  position: relative;
  height: 80px;
  background: #f9fafb;
  border-radius: 8px;
  padding: 24px 0 8px;
  overflow: hidden;
  margin-bottom: 16px;

  .timeline-scale {
    position: absolute;
    top: 4px;
    left: 0;
    right: 0;
    height: 20px;

    .scale-mark {
      position: absolute;
      font-size: 10px;
      color: #9ca3af;
      transform: translateX(-50%);
    }
  }

  .phoneme-tracks {
    position: relative;
    height: 48px;
    margin: 0 8px;
  }

  .phoneme-segment {
    position: absolute;
    top: 0;
    height: 48px;
    background: linear-gradient(180deg, #dbeafe 0%, #93c5fd 100%);
    border: 2px solid #3b82f6;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.15s;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;

    &:hover {
      box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
    }

    .phoneme-label {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
      font-size: 11px;
      font-weight: 500;
      color: #1e40af;

      .tone-mark {
        font-size: 10px;
        color: #6366f1;
      }
    }
  }

  .playhead {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 2px;
    background: #ef4444;
    z-index: 30;
    pointer-events: none;

    &::before {
      content: '';
      position: absolute;
      top: -4px;
      left: -4px;
      width: 10px;
      height: 10px;
      background: #ef4444;
      border-radius: 50%;
    }
  }
}

.phoneme-table {
  margin-top: 16px;
}
</style>
