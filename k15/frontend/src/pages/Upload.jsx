import React, { useState, useRef } from 'react'
import {
  Upload,
  File,
  CheckCircle,
  XCircle,
  Loader2,
  Info,
} from 'lucide-react'
import { uploadAPI } from '../services/api'
import { formatFileSize } from '../utils/helpers'

const SUPPORTED_FORMATS = ['.xtf', '.sgf']

export default function Upload() {
  const [file, setFile] = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const [missionName, setMissionName] = useState('')
  const [description, setDescription] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState(null)
  const [error, setError] = useState(null)
  const fileInputRef = useRef(null)

  const handleFileSelect = (selectedFile) => {
    if (!selectedFile) return

    const ext = '.' + selectedFile.name.split('.').pop().toLowerCase()
    if (!SUPPORTED_FORMATS.includes(ext)) {
      setError(`不支持的文件格式: ${ext}。支持: ${SUPPORTED_FORMATS.join(', ')}`)
      return
    }

    setFile(selectedFile)
    setError(null)
    setUploadResult(null)

    if (!missionName) {
      setMissionName(selectedFile.name.replace(/\.[^/.]+$/, ''))
    }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    const files = e.dataTransfer.files
    if (files.length > 0) {
      handleFileSelect(files[0])
    }
  }

  const handleUpload = async () => {
    if (!file) {
      setError('请先选择文件')
      return
    }
    if (!missionName.trim()) {
      setError('请输入任务名称')
      return
    }

    setUploading(true)
    setError(null)
    setUploadResult(null)

    try {
      const result = await uploadAPI.uploadFile(file, missionName.trim(), description)
      setUploadResult(result)
    } catch (err) {
      setError(err.response?.data?.detail || err.message || '上传失败')
    } finally {
      setUploading(false)
    }
  }

  const resetForm = () => {
    setFile(null)
    setMissionName('')
    setDescription('')
    setUploadResult(null)
    setError(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="card mb-6">
        <h3 className="section-title">上传声呐文件</h3>

        <div
          className={`border-2 border-dashed rounded-xl p-8 text-center transition-all duration-200 ${
            dragOver
              ? 'border-sonar-accent bg-sonar-accent/10'
              : 'border-sonar-border hover:border-sonar-accent/50'
          }`}
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".xtf,.sgf"
            className="hidden"
            onChange={(e) => handleFileSelect(e.target.files[0])}
          />

          {file ? (
            <div className="flex flex-col items-center gap-3">
              <File className="w-16 h-16 text-sonar-accent" />
              <p className="font-medium text-white">{file.name}</p>
              <p className="text-sm text-gray-400">{formatFileSize(file.size)}</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <Upload className="w-16 h-16 text-gray-500" />
              <p className="text-lg font-medium text-gray-300">
                拖拽文件到此处或点击上传
              </p>
              <p className="text-sm text-gray-500">
                支持格式: XTF, SGF | 最大: 500MB
              </p>
            </div>
          )}
        </div>

        {file && (
          <div className="mt-6 space-y-4">
            <div>
              <label className="label-text">任务名称 *</label>
              <input
                type="text"
                className="input-field"
                value={missionName}
                onChange={(e) => setMissionName(e.target.value)}
                placeholder="请输入任务名称"
              />
            </div>

            <div>
              <label className="label-text">任务描述</label>
              <textarea
                className="input-field h-24 resize-none"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="请输入任务描述（可选）"
              />
            </div>

            <div className="flex gap-3">
              <button
                className="btn-primary flex items-center gap-2"
                onClick={handleUpload}
                disabled={uploading}
              >
                {uploading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    上传中...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    开始上传
                  </>
                )}
              </button>
              <button className="btn-secondary" onClick={resetForm}>
                重置
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="mt-4 p-4 rounded-lg bg-red-500/10 border border-red-500/30 flex items-center gap-3">
            <XCircle className="w-5 h-5 text-red-400" />
            <p className="text-red-400">{error}</p>
          </div>
        )}

        {uploadResult && (
          <div className="mt-4 p-4 rounded-lg bg-green-500/10 border border-green-500/30">
            <div className="flex items-center gap-3 mb-3">
              <CheckCircle className="w-5 h-5 text-green-400" />
              <p className="text-green-400 font-medium">上传成功！</p>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-400">任务ID: </span>
                <span className="text-white font-mono">{uploadResult.mission_id}</span>
              </div>
              <div>
                <span className="text-gray-400">Pings数: </span>
                <span className="text-white">{uploadResult.num_pings}</span>
              </div>
              <div>
                <span className="text-gray-400">采样数: </span>
                <span className="text-white">{uploadResult.num_samples}</span>
              </div>
              <div>
                <span className="text-gray-400">采样率: </span>
                <span className="text-white">{uploadResult.sample_rate} Hz</span>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <h3 className="section-title">支持格式说明</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 rounded-lg bg-sonar-bg border border-sonar-border">
            <h4 className="font-medium text-sonar-accent mb-2">XTF 格式</h4>
            <p className="text-sm text-gray-400">
              eXtended Triton Format (XTF) 是一种广泛使用的侧扫声呐数据格式，
              支持多波束和侧扫声呐数据存储。
            </p>
          </div>
          <div className="p-4 rounded-lg bg-sonar-bg border border-sonar-border">
            <h4 className="font-medium text-sonar-accent mb-2">SGF 格式</h4>
            <p className="text-sm text-gray-400">
              Sonar Generic Format (SGF) 是一种通用的声呐数据格式，
              包含侧扫声呐和多波束测深数据。
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
