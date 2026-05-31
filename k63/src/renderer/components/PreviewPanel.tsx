import { useEffect, useState } from 'react'
import { Image, Edit3, ArrowRight, Check, Brain, CheckCircle } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'

export default function PreviewPanel() {
  const { imageFiles, selectedImageId, updateSuggestedName } = useAppStore()
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [learningSuccess, setLearningSuccess] = useState(false)

  const selectedFile = imageFiles.find(f => f.id === selectedImageId)

  useEffect(() => {
    if (selectedFile) {
      window.electronAPI.getFilePreview(selectedFile.filePath).then(url => {
        setPreviewUrl(url)
      })
    } else {
      setPreviewUrl(null)
    }
  }, [selectedFile?.filePath])

  if (!selectedFile) {
    return (
      <div className="glass rounded-xl h-full flex items-center justify-center">
        <div className="text-center text-dark-400">
          <Image size={48} className="mx-auto mb-3 opacity-50" />
          <p>选择一张图片查看预览</p>
        </div>
      </div>
    )
  }

  const handleStartEdit = () => {
    setEditingId(selectedFile.id)
    setEditValue(selectedFile.suggestedName || selectedFile.originalName)
  }

  const handleSaveEdit = () => {
    if (editingId && editValue) {
      updateSuggestedName(editingId, editValue)
    }
    setEditingId(null)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveEdit()
    } else if (e.key === 'Escape') {
      setEditingId(null)
    }
  }

  const handleLearn = async () => {
    if (!selectedFile || !selectedFile.suggestedName) return
    
    const inputText = `${selectedFile.originalName} ${selectedFile.ocrText || ''}`
    
    const seriesMatch = selectedFile.suggestedName.match(/\[(.+?)\]/)
    const chapterMatch = selectedFile.suggestedName.match(/第(\d+)话/)
    const titleMatch = selectedFile.suggestedName.match(/第\d+话\s+(.+?)(?:\.\w+)?$/)
    
    const seriesName = seriesMatch?.[1] || selectedFile.seriesName || ''
    const chapterNumber = chapterMatch ? parseInt(chapterMatch[1], 10) : selectedFile.chapterNumber
    const chapterTitle = titleMatch?.[1] || selectedFile.chapterTitle || ''
    
    await window.electronAPI.addLearningSample(
      inputText,
      seriesName,
      chapterNumber,
      chapterTitle
    )
    
    setLearningSuccess(true)
    setTimeout(() => setLearningSuccess(false), 2000)
  }

  const canLearn = selectedFile.suggestedName && selectedFile.suggestedName !== selectedFile.originalName

  return (
    <div className="glass rounded-xl h-full flex flex-col overflow-hidden">
      <div className="p-4 border-b border-primary-900/30 flex items-center justify-between">
        <h3 className="font-semibold text-dark-200">预览与编辑</h3>
        {canLearn && (
          <button
            onClick={handleLearn}
            disabled={learningSuccess}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              learningSuccess
                ? 'bg-green-600 text-white'
                : 'bg-accent-600/20 text-accent-400 hover:bg-accent-600/30'
            }`}
          >
            {learningSuccess ? (
              <>
                <CheckCircle size={14} />
                已学习
              </>
            ) : (
              <>
                <Brain size={14} />
                纠正学习
              </>
            )}
          </button>
        )}
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 bg-dark-900/50 p-4 flex items-center justify-center overflow-hidden">
          {previewUrl ? (
            <img
              src={previewUrl}
              alt="Preview"
              className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
            />
          ) : (
            <Image size={64} className="text-dark-600" />
          )}
        </div>

        <div className="p-4 space-y-4 bg-dark-800/50">
          <div>
            <div className="text-xs text-dark-400 mb-1">原始文件名</div>
            <div className="font-mono text-sm text-dark-200 bg-dark-900/50 px-3 py-2 rounded-lg truncate">
              {selectedFile.originalName}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-primary-400">
              <ArrowRight size={20} />
            </div>
          </div>

          <div>
            <div className="text-xs text-dark-400 mb-1">新文件名</div>
            {editingId === selectedFile.id ? (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={handleSaveEdit}
                  onKeyDown={handleKeyDown}
                  className="flex-1 bg-dark-900 border border-primary-500/50 rounded-lg px-3 py-2 text-sm font-mono text-accent-300 focus:outline-none focus:border-primary-400"
                  autoFocus
                />
                <button
                  onClick={handleSaveEdit}
                  className="px-3 py-2 bg-primary-600 rounded-lg text-white hover:bg-primary-500 transition-colors"
                >
                  <Check size={16} />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <div className="flex-1 font-mono text-sm text-accent-300 bg-dark-900/50 px-3 py-2 rounded-lg truncate">
                  {selectedFile.suggestedName || '待识别...'}
                </div>
                <button
                  onClick={handleStartEdit}
                  className="p-2 hover:bg-dark-700/50 rounded-lg text-dark-400 hover:text-dark-200 transition-colors"
                  title="编辑文件名"
                >
                  <Edit3 size={16} />
                </button>
              </div>
            )}
          </div>

          {selectedFile.ocrText && (
            <div className="border-t border-dark-700/30 pt-3">
              <div className="text-xs text-dark-400 mb-1">OCR 识别文本</div>
              <div className="text-xs text-dark-300 bg-dark-900/50 p-2 rounded-lg max-h-24 overflow-y-auto">
                {selectedFile.ocrText.slice(0, 200)}
                {selectedFile.ocrText.length > 200 ? '...' : ''}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
