import { useEffect } from 'react'
import { CheckCircle, ScanEye } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'

export default function ControlPanel() {
  const {
    imageFiles,
    folderPath,
    isProcessing,
    ocrProgress,
    setIsProcessing,
    setOcrProgress,
    setImageFiles,
    setHistory,
  } = useAppStore()

  useEffect(() => {
    if (typeof window !== 'undefined' && window.electronAPI) {
      const cleanup = window.electronAPI.onOCRProgress((progress) => {
        setOcrProgress(progress)
      })
      return cleanup
    }
  }, [setOcrProgress])

  const selectedFiles = imageFiles.filter(f => f.selected)

  const handleStartOCR = async () => {
    if (selectedFiles.length === 0 || !folderPath) return

    setIsProcessing(true)
    try {
      const processedFiles = await window.electronAPI.recognizeImages(selectedFiles)
      setImageFiles(
        imageFiles.map(file => {
          const processed = processedFiles.find(p => p.id === file.id)
          return processed || file
        })
      )
    } catch (error) {
      console.error('OCR processing failed:', error)
    } finally {
      setIsProcessing(false)
      setOcrProgress(null)
    }
  }

  const handleApplyRename = async () => {
    if (!folderPath) return

    const filesToRename = imageFiles.filter(f => f.selected && f.suggestedName)
    if (filesToRename.length === 0) return

    setIsProcessing(true)
    try {
      const results = await window.electronAPI.applyRename(filesToRename, folderPath)
      
      const successCount = results.filter(r => r.success).length
      alert(`成功重命名 ${successCount}/${results.length} 个文件`)
      
      const history = await window.electronAPI.getHistory(folderPath)
      setHistory(history)
      
      const files = await window.electronAPI.scanFolder(folderPath)
      setImageFiles(files)
    } catch (error) {
      console.error('Rename failed:', error)
    } finally {
      setIsProcessing(false)
    }
  }

  const hasRecognizedCount = imageFiles.filter(f => f.suggestedName).length

  return (
    <div className="glass rounded-xl p-4">
      <h3 className="font-semibold text-dark-200 mb-4">操作控制</h3>

      {ocrProgress && (
        <div className="mb-4">
          <div className="flex justify-between text-sm mb-1">
            <span className="text-dark-300">
              正在处理: {ocrProgress.fileName}
            </span>
            <span className="text-primary-400">
              {ocrProgress.current}/{ocrProgress.total}
            </span>
          </div>
          <div className="h-2 bg-dark-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-primary-500 to-accent-500 transition-all duration-300"
              style={{ width: `${ocrProgress.progress}%` }}
            />
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-dark-800/50 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-primary-400">
            {selectedFiles.length}
          </div>
          <div className="text-xs text-dark-400">已选择</div>
        </div>
        <div className="bg-dark-800/50 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-accent-400">
            {hasRecognizedCount}
          </div>
          <div className="text-xs text-dark-400">已识别</div>
        </div>
        <div className="bg-dark-800/50 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-green-400">
            {imageFiles.length}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <button
          onClick={handleStartOCR}
          disabled={isProcessing || selectedFiles.length === 0}
          className="w-full btn-primary text-white flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <ScanEye size={18} />
          开始 OCR 识别
        </button>

        <button
          onClick={handleApplyRename}
          disabled={
            isProcessing || hasRecognizedCount === 0
          }
          className="w-full btn-accent text-white flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <CheckCircle size={18} />
          应用重命名
        </button>
      </div>
    </div>
  )
}
