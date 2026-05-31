export interface User {
  id: number
  username: string
  email: string
  first_name: string
  last_name: string
  role: 'admin' | 'annotator' | 'auditor'
  role_display: string
  phone: string
  avatar: string | null
  gender: string
  gender_display: string
  age_group: string
  age_group_display: string
  dialect_preference: string
  total_annotations: number
  total_audio_minutes: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface DialectRegion {
  id: number
  name: string
  code: string
  description: string
  language_family: string
  tone_system: string
  tone_count: number
  tone_options: ToneOption[]
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface ToneOption {
  number: number
  ipa: string
  name: string
}

export interface DialectSubregion {
  id: number
  name: string
  code: string
  city: string
  province: string
  description: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Phoneme {
  start_time: number
  end_time: number
  phoneme: string
  pinyin?: string
  ipa?: string
  tone?: number | null
  confidence?: number
  is_disagreement?: boolean
}

export interface AudioSegment {
  id: string
  dialect: number
  dialect_name: string
  subregion: number | null
  subregion_name: string | null
  filename: string
  original_filename: string
  duration: number
  sample_rate: number
  channels: number
  speaker_gender: string
  speaker_gender_display: string
  speaker_age: string
  speaker_age_display: string
  text_transcript: string
  status: string
  status_display: string
  uploaded_by: number | null
  uploaded_by_name: string | null
  processed_at: string | null
  required_annotations: number
  completed_annotations: number
  quality_score: number | null
  is_active: boolean
  created_at: string
  updated_at: string
  audio_url: string
  waveform_data?: WaveformData
  spectrogram_data?: SpectrogramData
  initial_phonemes?: { phonemes: Phoneme[] }
  assigned_annotators?: User[]
  speaker_embedding?: number[] | null
  speaker_embedding_model?: string
  asr_transcript?: string
  asr_segments?: any[] | null
  asr_success?: boolean
}

export interface WaveformData {
  times: number[]
  values: number[]
  duration: number
  sample_rate: number
}

export interface SpectrogramData {
  frequencies: number[]
  times: number[]
  spectrogram: number[][]
}

export interface Annotation {
  id: number
  audio_segment: string
  audio_segment_info: AudioSegment
  annotator: number
  annotator_info: User
  status: string
  status_display: string
  display_mode: 'pinyin' | 'ipa'
  display_mode_display: string
  phonemes: Phoneme[]
  phoneme_count: number
  notes: string
  time_spent: number
  quality_score: number | null
  kappa_score: number | null
  agreement_rate: number | null
  submitted_at: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

export interface KappaResult {
  overall_kappa: number
  phoneme_kappa: number
  tone_kappa: number
  agreement_rate: number
  total_phonemes: number
  matched_phonemes: number
  disagreements: Disagreement[]
  interpretation: string
}

export interface Disagreement {
  index: number
  annotator1: Phoneme
  annotator2: Phoneme
  time_diff: number
  phoneme_mismatch: boolean
  tone_mismatch: boolean
  time_mismatch: boolean
}

export interface Negotiation {
  id: number
  annotation1: number
  annotation1_info: Annotation
  annotation2: number
  annotation2_info: Annotation
  audio_segment: string
  audio_segment_info: AudioSegment
  disagreements: Disagreement[]
  status: string
  status_display: string
  resolved_by: number | null
  resolved_by_info: User | null
  resolution_notes: string
  final_annotation: Phoneme[] | null
  created_at: string
  updated_at: string
}

export interface Dataset {
  id: string
  name: string
  description: string
  dialect: number | null
  subregion: number | null
  speaker_gender: string
  speaker_age: string
  min_duration: number | null
  max_duration: number | null
  min_quality_score: number | null
  format: string
  include_audio: boolean
  status: string
  status_display: string
  total_files: number
  file_size: number
  download_url: string
  created_by: number | null
  expires_at: string | null
  created_at: string
  updated_at: string
}

export interface StatsOverview {
  total_audio: number
  total_annotations: number
  completed_annotations: number
  total_annotators: number
  total_duration_minutes: number
  avg_kappa: number | null
  completion_rate: number
  by_status: { key: string; name: string; value: number }[]
}

export interface AnnotatorProgress {
  annotator_id: number
  annotator_name: string
  full_name: string
  avatar: string | null
  total: number
  completed: number
  in_progress: number
  total_minutes: number
  completion_rate: number
}

export interface AnnotatorRanking {
  rank: number
  annotator_id: number
  annotator_name: string
  full_name: string
  avatar: string | null
  total_annotations: number
  total_minutes: number
  avg_kappa: number | null
  avg_time_per_annotation: number | null
}

export interface AnnotatorPieData {
  annotator_id: number
  annotator_name: string
  full_name: string
  total: number
  slices: { name: string; value: number; color: string }[]
}

export interface UploadFile {
  id: string
  name: string
  size: number
  type: string
  status: string
  percentage?: number
  raw?: File
  response?: any
  error?: any
}

export interface SimilarSpeaker {
  audio_id: string
  filename: string
  dialect_name: string
  speaker_gender: string
  speaker_gender_display?: string
  speaker_age?: string
  similarity: number
  similarity_percent: number
}

export interface SpeakerCluster {
  id: string
  filename: string
  cluster: string
  x: number
  y: number
}

export interface ApiResponse<T> {
  count?: number
  results?: T
  data?: T
  detail?: string
}
