<template>
  <div class="annotation-editor">
    <div class="editor-header">
      <div class="header-left">
        <el-button @click="$router.back()">
          <el-icon><ArrowLeft /></el-icon>返回
        </el-button>
        <el-divider direction="vertical" />
        <div class="audio-info">
          <h3 class="audio-title">{{ audio?.original_filename }}</h3>
          <div class="audio-meta">
            <el-tag size="small" type="info">{{ audio?.dialect_name }}</el-tag>
            <el-tag size="small" type="info">{{ audio?.subregion_name }}</el-tag>
            <span class="meta-item">{{ audio?.speaker_gender_display }} / {{ audio?.speaker_age_display }}</span>
            <span class="meta-item">时长: {{ audio?.duration.toFixed(1) }}s</span>
          </div>
        </div>
      </div>
      <div class="header-right">
        <el-radio-group v-model="displayMode" size="small" @change="handleDisplayModeChange">
          <el-radio-button value="pinyin">拼音模式</el-radio-button>
          <el-radio-button value="ipa">IPA模式</el-radio-button>
        </el-radio-group>
        <el-divider direction="vertical" />
        <el-tag :type="statusTagType" size="small">{{ annotation?.status_display }}</el-tag>
      </div>
    </div>

    <div class="editor-content" v-loading="loading">
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
              <div class="time-ruler" ref="rulerRef"></div>
            </div>

            <div class="spectrogram-container" v-if="showSpectrogram">
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
                @input="handleSliderInput"
                @change="handleSliderChange"
              />
              <span class="time-display">
                {{ formatTime(currentTime) }} / {{ formatTime(audio?.duration || 0) }}
              </span>
              <el-switch v-model="showSpectrogram" active-text="频谱图" inactive-text="" />
            </div>
          </el-card>

          <el-card class="timeline-card" shadow="never">
            <template #header>
              <div class="card-header">
                <span>音素时间轴</span>
                <div class="header-actions">
                  <el-button size="small" @click="addPhoneme">
                    <el-icon><Plus /></el-icon>添加音素
                  </el-button>
                  <el-button size="small" @click="playSelection" :disabled="!selectedPhoneme">
                    <el-icon><VideoPlay /></el-icon>播放选中
                  </el-button>
                </div>
              </div>
            </template>
            
            <div class="phoneme-timeline" ref="timelineRef">
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
                  v-for="(phoneme, index) in phonemes"
                  :key="index"
                  class="phoneme-segment"
                  :class="{
                    'selected': selectedIndex === index,
                    'disagreement': phoneme.is_disagreement
                  }"
                  :style="getPhonemeStyle(phoneme)"
                  @click="selectPhoneme(index)"
                >
                  <div class="phoneme-label">
                    <span class="phoneme-text">{{ getDisplayText(phoneme) }}</span>
                    <span v-if="phoneme.tone" class="tone-mark">T{{ phoneme.tone }}</span>
                  </div>
                  <div
                    class="resize-handle left"
                    @mousedown.stop="startResize(index, 'left', $event)"
                  ></div>
                  <div
                    class="resize-handle right"
                    @mousedown.stop="startResize(index, 'right', $event)"
                  ></div>
                </div>
              </div>

              <div class="playhead" :style="{ left: `${(currentTime / (audio?.duration || 1)) * 100}%` }"></div>
            </div>

            <div class="disagreement-legend" v-if="hasDisagreements">
              <el-icon color="#ef4444"><Warning /></el-icon>
              <span>红色区域表示与其他标注员存在不一致，需要协商</span>
            </div>
          </el-card>
        </el-col>

        <el-col :span="8">
          <el-card class="detail-card" shadow="never">
            <template #header>
              <span>音素详情</span>
            </template>
            
            <div v-if="selectedPhoneme" class="phoneme-detail">
              <el-form label-width="100px">
                <el-form-item label="开始时间">
                  <el-input-number
                    v-model="selectedPhoneme.start_time"
                    :min="0"
                    :max="audio?.duration"
                    :step="0.01"
                    :controls="false"
                    style="width: 100%"
                    @change="updatePhoneme"
                  />
                </el-form-item>
                <el-form-item label="结束时间">
                  <el-input-number
                    v-model="selectedPhoneme.end_time"
                    :min="0"
                    :max="audio?.duration"
                    :step="0.01"
                    :controls="false"
                    style="width: 100%"
                    @change="updatePhoneme"
                  />
                </el-form-item>
                <el-form-item label="时长">
                  <span>{{ (selectedPhoneme.end_time - selectedPhoneme.start_time).toFixed(3) }}s</span>
                </el-form-item>
                <el-form-item label="音素">
                  <el-input
                    v-model="selectedPhoneme.phoneme"
                    @change="updatePhoneme"
                  />
                </el-form-item>
                <el-form-item label="拼音">
                  <el-input
                    v-model="selectedPhoneme.pinyin"
                    @change="updatePhoneme"
                  />
                </el-form-item>
                <el-form-item label="IPA">
                  <el-input
                    v-model="selectedPhoneme.ipa"
                    @change="updatePhoneme"
                  />
                </el-form-item>
                <el-form-item label="声调">
                  <el-select
                    v-model="selectedPhoneme.tone"
                    placeholder="请选择声调"
                    clearable
                    style="width: 100%"
                    @change="updatePhoneme"
                  >
                    <el-option
                      v-for="tone in toneOptions"
                      :key="tone.number"
                      :label="`${tone.number} - ${tone.name} (${tone.ipa})`"
                      :value="tone.number"
                    />
                  </el-select>
                </el-form-item>
                <el-form-item label="置信度">
                  <el-progress
                    :percentage="Math.round((selectedPhoneme.confidence || 0) * 100)"
                    :status="selectedPhoneme.confidence && selectedPhoneme.confidence > 0.7 ? 'success' : 'warning'"
                  />
                </el-form-item>
              </el-form>

              <el-divider />
              
              <div class="detail-actions">
                <el-button type="danger" @click="deletePhoneme">
                  <el-icon><Delete /></el-icon>删除此音素
                </el-button>
              </div>
            </div>
            <div v-else class="empty-detail">
              <el-empty description="请在时间轴上选择一个音素进行编辑" />
            </div>
          </el-card>

          <el-card class="text-card" shadow="never">
            <template #header>
              <span>文本转写</span>
              <el-tag v-if="audio?.asr_success" type="success" size="small">ASR生成</el-tag>
            </template>
            <div class="transcript-text">
              {{ audio?.text_transcript }}
            </div>
          </el-card>

          <el-card class="speaker-card" shadow="never">
            <template #header>
              <div class="card-header">
                <span>相似说话人</span>
                <el-button-group size="small">
                  <el-button
                    :type="speakerView === 'similar' ? 'primary' : 'default'"
                    @click="speakerView = 'similar'"
                  >
                    相似列表
                  </el-button>
                  <el-button
                    :type="speakerView === 'cluster' ? 'primary' : 'default'"
                    @click="speakerView = 'cluster'"
                  >
                    聚类图
                  </el-button>
                </el-button-group>
              </div>
            </template>
            
            <div v-if="speakerView === 'similar'" v-loading="similarSpeakersLoading">
              <div v-if="similarSpeakers.length > 0" class="similar-list">
                <div
                  v-for="(speaker, index) in similarSpeakers"
                  :key="speaker.audio_id"
                  class="similar-item"
                  @click="playSimilarAudio(speaker)"
                >
                  <div class="similar-rank">{{ index + 1 }}</div>
                  <div class="similar-info">
                    <div class="similar-filename">{{ speaker.filename }}</div>
                    <div class="similar-meta">
                      {{ speaker.dialect_name }} | {{ speaker.speaker_gender_display || speaker.speaker_gender }}
                    </div>
                  </div>
                  <div class="similar-similarity">
                    <el-progress
                      type="dashboard"
                      :percentage="speaker.similarity_percent"
                      :width="40"
                      :stroke-width="8"
                      :color="getSimilarityColor(speaker.similarity_percent)"
                    />
                  </div>
                </div>
              </div>
              <el-empty v-else description="暂无相似说话人数据" />
            </div>

            <div v-else v-loading="clustersLoading">
              <div ref="clusterChartRef" class="cluster-chart"></div>
              <div class="cluster-legend" v-if="clusterInfo.num_clusters > 0">
                <span
                  v-for="(color, clusterId) in clusterColors"
                  :key="clusterId"
                  class="legend-item"
                >
                  <span class="legend-dot" :style="{ backgroundColor: color }"></span>
                  聚类{{ clusterId }} ({{ clusterInfo.clusters[clusterId]?.length || 0 }}个)
                </span>
              </div>
            </div>
          </el-card>

          <el-card class="notes-card" shadow="never">
            <template #header>
              <span>标注备注</span>
            </template>
            <el-input
              v-model="notes"
              type="textarea"
              :rows="4"
              placeholder="请输入标注备注信息..."
            />
          </el-card>
        </el-col>
      </el-row>
    </div>

    <div class="editor-footer">
      <div class="footer-left">
        <span class="stat-item">音素数: <b>{{ phonemes.length }}</b></span>
        <span class="stat-item">已用时: <b>{{ formatTimeSpent(timeSpent) }}</b></span>
      </div>
      <div class="footer-right">
        <el-button @click="saveDraft" :disabled="annotation?.status === 'submitted'">
          <el-icon><Document /></el-icon>保存草稿
        </el-button>
        <el-button type="primary" @click="submitAnnotation" :disabled="annotation?.status === 'submitted'" :loading="submitting">
          <el-icon><Check /></el-icon>提交标注
        </el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted, watch, nextTick, watchEffect } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import WaveSurfer from 'wavesurfer.js'
import * as echarts from 'echarts'
import { audioApi, annotationsApi, dialectsApi } from '@/api'
import type { AudioSegment, Annotation, Phoneme, ToneOption, SimilarSpeaker, SpeakerCluster } from '@/types'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  ArrowLeft,
  ZoomIn,
  ZoomOut,
  Refresh,
  DArrowLeft,
  DArrowRight,
  VideoPlay,
  VideoPause,
  Plus,
  Warning,
  Delete,
  Document,
  Check
} from '@element-plus/icons-vue'

const route = useRoute()
const router = useRouter()

const audioId = route.params.audioId as string

const loading = ref(false)
const submitting = ref(false)
const audio = ref<AudioSegment | null>(null)
const annotation = ref<Annotation | null>(null)
const phonemes = ref<Phoneme[]>([])
const notes = ref('')
const displayMode = ref<'pinyin' | 'ipa'>('pinyin')
const toneOptions = ref<ToneOption[]>([])

const selectedIndex = ref<number | null>(null)
const selectedPhoneme = computed<Phoneme | null>(() => {
  if (selectedIndex.value === null) return null
  return phonemes.value[selectedIndex.value]
})

const showSpectrogram = ref(true)
const isPlaying = ref(false)
const currentTime = ref(0)
const timeSpent = ref(0)
const isSeeking = ref(false)

const waveformRef = ref<HTMLElement>()
const spectrogramCanvas = ref<HTMLCanvasElement>()
const timelineRef = ref<HTMLElement>()
const rulerRef = ref<HTMLElement>()
const clusterChartRef = ref<HTMLElement>()

const speakerView = ref<'similar' | 'cluster'>('similar')
const similarSpeakersLoading = ref(false)
const clustersLoading = ref(false)
const similarSpeakers = ref<SimilarSpeaker[]>([])
const clusterChart: any = ref(null)
const clusterInfo = reactive({
  clusters: {} as Record<string, string[]>,
  num_clusters: 0,
  projections: [] as SpeakerCluster[]
})

const clusterColors = computed(() => {
  const colors = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16']
  const result: Record<string, string> = {}
  Object.keys(clusterInfo.clusters).forEach((key, index) => {
    result[key] = colors[index % colors.length]
  })
  return result
})

let wavesurfer: WaveSurfer | null = null
let timer: number | null = null
let resizing = false
let resizeIndex: number | null = null
let resizeSide: 'left' | 'right' | null = null
let resizeStartX = 0
let resizeStartTime = 0

const hasDisagreements = computed(() => {
  return phonemes.value.some(p => p.is_disagreement)
})

const statusTagType = computed(() => {
  const status = annotation.value?.status
  if (status === 'submitted') return 'success'
  if (status === 'in_progress') return 'warning'
  return 'info'
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

const getDisplayText = (phoneme: Phoneme) => {
  if (displayMode.value === 'ipa') {
    return phoneme.ipa || phoneme.phoneme
  }
  return phoneme.pinyin || phoneme.phoneme
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
    const [audioRes, annotationRes] = await Promise.all([
      audioApi.getAudioDetail(audioId),
      annotationsApi.getOrCreateAnnotation(audioId)
    ])
    
    audio.value = audioRes as any
    annotation.value = annotationRes as any
    phonemes.value = (annotationRes as any).phonemes || []
    notes.value = (annotationRes as any).notes || ''
    displayMode.value = (annotationRes as any).display_mode || 'pinyin'
    timeSpent.value = (annotationRes as any).time_spent || 0

    if (audio.value?.dialect) {
      const dialectRes = await dialectsApi.getDialectRegionDetail(audio.value.dialect)
      toneOptions.value = (dialectRes as any).tone_options || []
    }

    await nextTick()
    initWaveSurfer()
    drawSpectrogram()
    startTimeTracker()
    
    fetchSimilarSpeakers()
    fetchSpeakerClusters()
  } catch (error) {
    ElMessage.error('加载标注数据失败')
  } finally {
    loading.value = false
  }
}

const fetchSimilarSpeakers = async () => {
  if (!audioId) return
  similarSpeakersLoading.value = true
  try {
    const res = await audioApi.getSimilarSpeakers(audioId, { top_k: 5, threshold: 0.5 })
    similarSpeakers.value = res.similar_speakers || []
  } catch (error) {
    console.error('获取相似说话人失败', error)
  } finally {
    similarSpeakersLoading.value = false
  }
}

const fetchSpeakerClusters = async () => {
  if (!audio.value?.dialect) return
  clustersLoading.value = true
  try {
    const res = await audioApi.getSpeakerClusters({
      dialect: (audio.value as any).dialect,
      projection: 'pca'
    })
    clusterInfo.clusters = res.clusters || {}
    clusterInfo.num_clusters = res.num_clusters || 0
    clusterInfo.projections = res.projections || []
    
    await nextTick()
    initClusterChart()
  } catch (error) {
    console.error('获取说话人聚类失败', error)
  } finally {
    clustersLoading.value = false
  }
}

const initClusterChart = () => {
  if (!clusterChartRef.value || clusterInfo.projections.length === 0) return
  
  if (clusterChart.value) {
    clusterChart.value.dispose()
  }
  
  clusterChart.value = echarts.init(clusterChartRef.value)
  
  const seriesData: any[] = clusterInfo.projections.map((item: SpeakerCluster) => ({
    name: item.filename,
    value: [item.x, item.y],
    cluster: item.cluster,
    itemStyle: {
      color: clusterColors.value[item.cluster] || '#9ca3af'
    }
  }))

  const currentAudioId = audioId
  const currentIndex = clusterInfo.projections.findIndex((p: SpeakerCluster) => p.id === currentAudioId)
  if (currentIndex >= 0) {
    seriesData[currentIndex] = {
      ...seriesData[currentIndex],
      symbolSize: 15,
      itemStyle: {
        color: clusterColors.value[seriesData[currentIndex].cluster] || '#9ca3af',
        borderColor: '#000',
        borderWidth: 2
      }
    }
  }

  const option = {
    tooltip: {
      trigger: 'item',
      formatter: (params: any) => {
        return `${params.name}<br/>聚类: ${params.data.cluster}`
      }
    },
    grid: {
      left: '3%',
      right: '3%',
      bottom: '3%',
      containLabel: true
    },
    xAxis: {
      type: 'value',
      show: false
    },
    yAxis: {
      type: 'value',
      show: false
    },
    series: [{
      type: 'scatter',
      data: seriesData,
      symbolSize: 10,
      emphasis: {
        focus: 'series',
        itemStyle: {
          shadowBlur: 10,
          shadowColor: 'rgba(0, 0, 0, 0.5)'
        }
      }
    }]
  }

  clusterChart.value.setOption(option)
}

const getSimilarityColor = (percent: number) => {
  if (percent >= 90) return '#10b981'
  if (percent >= 80) return '#3b82f6'
  if (percent >= 70) return '#f59e0b'
  if (percent >= 60) return '#f97316'
  return '#ef4444'
}

const playSimilarAudio = (speaker: SimilarSpeaker) => {
  router.push(`/annotate/${speaker.audio_id}`)
}

const initWaveSurfer = () => {
  if (!waveformRef.value || !audio.value?.audio_url) return

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
    if (wavesurfer && !isSeeking.value) {
      currentTime.value = wavesurfer.getCurrentTime()
    }
  })

  wavesurfer.on('seeking', () => {
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

const startTimeTracker = () => {
  if (timer) clearInterval(timer)
  timer = window.setInterval(() => {
    if (annotation.value?.status !== 'submitted') {
      timeSpent.value++
    }
  }, 1000)
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

const handleSliderInput = (time: number) => {
  isSeeking.value = true
  if (wavesurfer) {
    wavesurfer.seekTo(time / (audio.value?.duration || 1))
  }
}

const handleSliderChange = (time: number) => {
  isSeeking.value = false
  if (wavesurfer) {
    wavesurfer.seekTo(time / (audio.value?.duration || 1))
  }
}

let currentZoomLevel = 50

const zoomIn = () => {
  if (wavesurfer) {
    currentZoomLevel = currentZoomLevel * 1.5
    wavesurfer.zoom(currentZoomLevel)
  }
}

const zoomOut = () => {
  if (wavesurfer) {
    currentZoomLevel = currentZoomLevel / 1.5
    wavesurfer.zoom(currentZoomLevel)
  }
}

const resetZoom = () => {
  if (wavesurfer) {
    wavesurfer.zoom(50)
  }
}

const selectPhoneme = (index: number) => {
  selectedIndex.value = index
}

const playSelection = () => {
  if (!selectedPhoneme.value || !wavesurfer) return
  
  const start = selectedPhoneme.value.start_time
  const end = selectedPhoneme.value.end_time
  const duration = audio.value?.duration || 1
  
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

const addPhoneme = () => {
  const lastPhoneme = phonemes.value[phonemes.value.length - 1]
  const duration = audio.value?.duration || 0
  
  const newPhoneme: Phoneme = {
    start_time: lastPhoneme ? lastPhoneme.end_time : 0,
    end_time: lastPhoneme ? Math.min(lastPhoneme.end_time + 0.1, duration) : Math.min(0.1, duration),
    phoneme: '',
    pinyin: '',
    ipa: '',
    tone: null,
    confidence: 0.5
  }
  
  phonemes.value.push(newPhoneme)
  selectedIndex.value = phonemes.value.length - 1
}

const updatePhoneme = () => {
  if (selectedIndex.value === null) return
  phonemes.value[selectedIndex.value] = { ...selectedPhoneme.value! }
}

const deletePhoneme = () => {
  if (selectedIndex.value === null) return
  
  ElMessageBox.confirm('确定要删除此音素吗？', '提示', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(() => {
    phonemes.value.splice(selectedIndex.value!, 1)
    selectedIndex.value = null
  }).catch(() => {})
}

const startResize = (index: number, side: 'left' | 'right', event: MouseEvent) => {
  if (annotation.value?.status === 'submitted') return
  
  resizing = true
  resizeIndex = index
  resizeSide = side
  resizeStartX = event.clientX
  resizeStartTime = side === 'left' 
    ? phonemes.value[index].start_time 
    : phonemes.value[index].end_time
  
  document.addEventListener('mousemove', handleResize)
  document.addEventListener('mouseup', stopResize)
}

const handleResize = (event: MouseEvent) => {
  if (!resizing || resizeIndex === null || !timelineRef.value || !audio.value) return
  
  const rect = timelineRef.value.getBoundingClientRect()
  const deltaX = event.clientX - resizeStartX
  const deltaTime = (deltaX / rect.width) * audio.value.duration
  
  const phoneme = phonemes.value[resizeIndex]
  const duration = audio.value.duration
  
  if (resizeSide === 'left') {
    const newStart = Math.max(0, Math.min(resizeStartTime + deltaTime, phoneme.end_time - 0.01))
    phoneme.start_time = newStart
    if (resizeIndex > 0) {
      phonemes.value[resizeIndex - 1].end_time = newStart
    }
  } else {
    const newEnd = Math.min(duration, Math.max(resizeStartTime + deltaTime, phoneme.start_time + 0.01))
    phoneme.end_time = newEnd
    if (resizeIndex < phonemes.value.length - 1) {
      phonemes.value[resizeIndex + 1].start_time = newEnd
    }
  }
}

const stopResize = () => {
  resizing = false
  resizeIndex = null
  resizeSide = null
  document.removeEventListener('mousemove', handleResize)
  document.removeEventListener('mouseup', stopResize)
}

const handleDisplayModeChange = async () => {
  if (!annotation.value) return
  try {
    await annotationsApi.setDisplayMode(annotation.value.id, displayMode.value)
  } catch (error) {
    console.error('切换显示模式失败', error)
  }
}

const saveDraft = async () => {
  if (!annotation.value) return
  
  try {
    await annotationsApi.updateAnnotation(annotation.value.id, {
      phonemes: phonemes.value,
      notes: notes.value,
      time_spent: timeSpent.value
    })
    ElMessage.success('草稿已保存')
  } catch (error) {
    ElMessage.error('保存失败')
  }
}

const submitAnnotation = async () => {
  if (!annotation.value) return
  
  if (phonemes.value.length === 0) {
    ElMessage.warning('请至少添加一个音素')
    return
  }
  
  const invalidPhonemes = phonemes.value.filter(p => !p.phoneme || p.end_time <= p.start_time)
  if (invalidPhonemes.length > 0) {
    ElMessage.warning(`有 ${invalidPhonemes.length} 个音素信息不完整，请检查`)
    return
  }
  
  ElMessageBox.confirm(
    '提交后将无法修改，确定要提交标注结果吗？',
    '提交确认',
    {
      confirmButtonText: '确定提交',
      cancelButtonText: '取消',
      type: 'warning'
    }
  ).then(async () => {
    submitting.value = true
    try {
      if (annotation.value) {
        await annotationsApi.submitAnnotation(annotation.value.id, {
          phonemes: phonemes.value,
          notes: notes.value,
          time_spent: timeSpent.value
        })
        ElMessage.success('标注已提交')
        annotation.value.status = 'submitted'
        annotation.value.status_display = '已提交'
      }
    } catch (error: any) {
      ElMessage.error(error.response?.data?.detail || '提交失败')
    } finally {
      submitting.value = false
    }
  }).catch(() => {})
}

watch(currentTime, (time) => {
  if (wavesurfer && Math.abs(wavesurfer.getCurrentTime() - time) > 0.01) {
    wavesurfer.seekTo(time / (audio.value?.duration || 1))
  }
})

onMounted(() => {
  fetchData()
})

watchEffect(() => {
  if (speakerView.value === 'cluster' && clusterInfo.projections.length > 0) {
    nextTick(() => {
      initClusterChart()
    })
  }
})

const handleWindowResize = () => {
  if (clusterChart.value) {
    clusterChart.value.resize()
  }
}

window.addEventListener('resize', handleWindowResize as EventListener)

onUnmounted(() => {
  if (wavesurfer) {
    wavesurfer.destroy()
  }
  if (timer) {
    clearInterval(timer)
  }
  if (clusterChart.value) {
    clusterChart.value.dispose()
  }
  window.removeEventListener('resize', handleWindowResize as EventListener)
})
</script>

<style scoped lang="scss">
.annotation-editor {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 100px);
}

.editor-header {
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

.editor-content {
  flex: 1;
  overflow-y: auto;
}

.waveform-card,
.timeline-card,
.detail-card,
.text-card,
.notes-card,
.speaker-card {
  border-radius: 12px;
  border: none;
  margin-bottom: 20px;

  :deep(.el-card__header) {
    border-bottom: 1px solid #f3f4f6;
  }
}

.similar-list {
  max-height: 300px;
  overflow-y: auto;

  .similar-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px;
    border-radius: 8px;
    cursor: pointer;
    transition: background-color 0.2s;
    margin-bottom: 8px;

    &:hover {
      background: #f3f4f6;
    }

    &:last-child {
      margin-bottom: 0;
    }

    .similar-rank {
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: 600;
      flex-shrink: 0;
    }

    .similar-info {
      flex: 1;
      min-width: 0;

      .similar-filename {
        font-size: 14px;
        font-weight: 500;
        color: #1f2937;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .similar-meta {
        font-size: 12px;
        color: #6b7280;
        margin-top: 2px;
      }
    }

    .similar-similarity {
      flex-shrink: 0;
    }
  }
}

.cluster-chart {
  height: 250px;
  width: 100%;
}

.cluster-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #f3f4f6;

  .legend-item {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    color: #6b7280;

    .legend-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
    }
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

.phoneme-timeline {
  position: relative;
  height: 80px;
  background: #f9fafb;
  border-radius: 8px;
  padding: 24px 0 8px;
  overflow: hidden;

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

    &.selected {
      border-color: #7c3aed;
      box-shadow: 0 0 0 3px rgba(124, 58, 237, 0.2);
      z-index: 10;
    }

    &.disagreement {
      background: linear-gradient(180deg, #fee2e2 0%, #fca5a5 100%);
      border-color: #ef4444;
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

    .resize-handle {
      position: absolute;
      top: 0;
      bottom: 0;
      width: 6px;
      cursor: ew-resize;
      z-index: 20;

      &.left {
        left: -3px;
      }

      &.right {
        right: -3px;
      }

      &:hover {
        background: rgba(124, 58, 237, 0.3);
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

.disagreement-legend {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  padding: 8px 12px;
  background: #fef2f2;
  border-radius: 6px;
  font-size: 13px;
  color: #b91c1c;
}

.phoneme-detail {
  :deep(.el-form-item) {
    margin-bottom: 16px;
  }
}

.empty-detail {
  padding: 40px 0;
}

.transcript-text {
  font-size: 15px;
  line-height: 1.8;
  color: #374151;
  padding: 12px;
  background: #f9fafb;
  border-radius: 6px;
}

.editor-footer {
  background: #fff;
  border-radius: 12px;
  padding: 16px 20px;
  margin-top: 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border: 1px solid #e5e7eb;

  .footer-left {
    display: flex;
    gap: 24px;

    .stat-item {
      font-size: 14px;
      color: #6b7280;

      b {
        color: #1f2937;
        font-weight: 600;
      }
    }
  }

  .footer-right {
    display: flex;
    gap: 12px;
  }
}
</style>
