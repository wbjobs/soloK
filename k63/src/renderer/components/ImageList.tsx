import { CheckSquare, Square, List, Grid, FileImage, Loader, X } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'

export default function ImageList() {
  const {
    imageFiles,
    selectedImageId,
    viewMode,
    setViewMode,
    setSelectedImageId,
    toggleImageSelection,
    selectAllImages,
    clearImageSelection,
  } = useAppStore()

  const selectedCount = imageFiles.filter(f => f.selected).length

  if (imageFiles.length === 0) {
    return null
  }

  return (
    <div className="glass rounded-xl h-full flex flex-col">
      <div className="p-4 border-b border-primary-900/30 flex items-center justify-between">
        <h3 className="font-semibold text-dark-200">图片列表</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={selectAllImages}
            className="p-1.5 rounded hover:bg-dark-700/50 text-dark-400 hover:text-dark-200 transition-colors"
            title="全选"
          >
            <CheckSquare size={18} />
          </button>
          <button
            onClick={clearImageSelection}
            className="p-1.5 rounded hover:bg-dark-700/50 text-dark-400 hover:text-dark-200 transition-colors"
            title="取消全选"
          >
            <X size={18} />
          </button>
          <div className="w-px h-5 bg-dark-700 mx-1" />
          <button
            onClick={() => setViewMode('list')}
            className={`p-1.5 rounded transition-colors ${
              viewMode === 'list'
                ? 'bg-primary-600 text-white'
                : 'text-dark-400 hover:text-dark-200'
            }`}
          >
            <List size={18} />
          </button>
          <button
            onClick={() => setViewMode('grid')}
            className={`p-1.5 rounded transition-colors ${
              viewMode === 'grid'
                ? 'bg-primary-600 text-white'
                : 'text-dark-400 hover:text-dark-200'
            }`}
          >
            <Grid size={18} />
          </button>
        </div>
      </div>

      <div className="text-xs text-dark-400 px-4 py-2 bg-dark-800/50 border-b border-primary-900/20">
        已选择 {selectedCount}/{imageFiles.length} 张图片
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {viewMode === 'list' ? (
          <div className="space-y-1">
            {imageFiles.map((file) => (
            <div
              key={file.id}
              onClick={() => setSelectedImageId(file.id)}
              className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-all ${
                selectedImageId === file.id
                  ? 'bg-primary-600/20 border border-primary-500/40'
                  : 'hover:bg-dark-700/30 border border-transparent'
              }`}
            >
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  toggleImageSelection(file.id)
                }}
                className="p-1 hover:bg-dark-600/50 rounded"
              >
                {file.selected ? (
                  <CheckSquare size={16} className="text-primary-400" />
                ) : (
                  <Square size={16} className="text-dark-500" />
                )}
              </button>
              
              <div className="w-10 h-10 rounded bg-dark-800 flex items-center justify-center overflow-hidden flex-shrink-0">
                <FileImage size={18} className="text-dark-400" />
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="text-sm font-mono truncate text-dark-200">
                  {file.originalName}
                </div>
                {file.suggestedName && (
                  <div className="text-xs text-accent-400 truncate">
                    → {file.suggestedName}
                  </div>
                )}
              </div>

              {file.status === 'processing' && (
                <Loader size={14} className="text-primary-400 animate-spin" />
              )}
              {file.status === 'completed' && (
                <div className="w-2 h-2 rounded-full bg-green-500" />
              )}
            </div>
          ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {imageFiles.map((file) => (
              <div
                key={file.id}
                onClick={() => setSelectedImageId(file.id)}
                className={`relative aspect-square rounded-lg overflow-hidden cursor-pointer transition-all border-2 ${
                  selectedImageId === file.id
                    ? 'border-primary-500'
                    : 'border-transparent hover:border-dark-600'
                }`}
              >
                <button
                onClick={(e) => {
                  e.stopPropagation()
                  toggleImageSelection(file.id)
                }}
                className="absolute top-1 left-1 z-10 p-1 bg-dark-900/70 rounded"
              >
                {file.selected ? (
                  <CheckSquare size={14} className="text-primary-400" />
                ) : (
                  <Square size={14} className="text-dark-400" />
                )}
              </button>
              <div className="w-full h-full bg-dark-800 flex items-center justify-center">
                <FileImage size={24} className="text-dark-500" />
              </div>
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-dark-900 to-transparent p-2">
                <div className="text-xs font-mono truncate">
                  {file.chapterNumber ? `第${file.chapterNumber}话` : file.originalName.slice(0, 10)}
                </div>
              </div>
            </div>
          ))}
          </div>
        )}
      </div>
    </div>
  )
}
