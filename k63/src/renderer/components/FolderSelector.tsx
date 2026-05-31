import { FolderOpen, Image, HardDrive } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'

export default function FolderSelector() {
  const { folderPath, imageFiles, setFolderPath, setImageFiles, setSelectedImageId } = useAppStore()

  const handleSelectFolder = async () => {
    const path = await window.electronAPI.selectFolder()
    if (path) {
      setFolderPath(path)
      const files = await window.electronAPI.scanFolder(path)
      setImageFiles(files)
      setSelectedImageId(files.length > 0 ? files[0].id : null)
    }
  }

  const selectedCount = imageFiles.filter(f => f.selected).length

  return (
    <div className="glass rounded-xl p-5 mb-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={handleSelectFolder}
            className="btn-primary flex items-center gap-2 text-white"
          >
            <FolderOpen size={20} />
            选择文件夹
          </button>
          
          {folderPath && (
            <div className="flex items-center gap-2 text-dark-300 text-sm">
              <HardDrive size={16} />
              <span className="font-mono truncate max-w-md">{folderPath}</span>
            </div>
          )}
        </div>

        {imageFiles.length > 0 && (
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2 text-dark-300">
              <Image size={18} />
              <span className="text-sm">
                共 <span className="text-primary-400 font-semibold">{imageFiles.length}</span> 张图片
              </span>
            </div>
            <div className="text-sm text-dark-300">
              已选择 <span className="text-accent-400 font-semibold">{selectedCount}</span> 张
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
