import { useState } from 'react'
import { BookOpen, History, Sparkles, Settings } from 'lucide-react'
import FolderSelector from './components/FolderSelector'
import ImageList from './components/ImageList'
import PreviewPanel from './components/PreviewPanel'
import HistoryPanel from './components/HistoryPanel'
import ControlPanel from './components/ControlPanel'
import SettingsPanel from './components/SettingsPanel'

function App() {
  const [activeTab, setActiveTab] = useState<'preview' | 'history'>('preview')
  const [showSettings, setShowSettings] = useState(false)

  return (
    <div className="h-screen flex flex-col p-4 overflow-hidden">
      <header className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center shadow-lg shadow-primary-500/30">
            <BookOpen size={22} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gradient">
              漫画图片重命名工具
            </h1>
            <p className="text-xs text-dark-400">
              OCR 智能识别 · NLP 语义分析 · 批量重命名
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 px-3 py-1 rounded-full bg-dark-800/50 text-xs text-dark-300">
            <Sparkles size={14} className="text-primary-400" />
            <span>Tesseract.js + Naive Bayes</span>
          </div>
          <button
            onClick={() => setShowSettings(true)}
            className="p-2 rounded-lg bg-dark-800/50 hover:bg-dark-700/50 text-dark-300 hover:text-dark-100 transition-colors"
            title="智能识别设置"
          >
            <Settings size={18} />
          </button>
        </div>
      </header>

      <FolderSelector />

      <div className="flex-1 grid grid-cols-12 gap-4 min-h-0">
        <div className="col-span-4 min-h-0">
          <ImageList />
        </div>

        <div className="col-span-5 min-h-0 flex flex-col">
          <div className="flex gap-2 mb-3">
            <button
              onClick={() => setActiveTab('preview')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'preview'
                  ? 'bg-primary-600 text-white shadow-lg shadow-primary-500/20'
                  : 'bg-dark-800/50 text-dark-300 hover:bg-dark-700/50'
              }`}
            >
              预览面板
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                activeTab === 'history'
                  ? 'bg-primary-600 text-white shadow-lg shadow-primary-500/20'
                  : 'bg-dark-800/50 text-dark-300 hover:bg-dark-700/50'
              }`}
            >
              <History size={16} />
              历史记录
            </button>
          </div>
          
          <div className="flex-1 min-h-0">
            {activeTab === 'preview' ? <PreviewPanel /> : <HistoryPanel />}
          </div>
        </div>

        <div className="col-span-3">
          <ControlPanel />
          
          <div className="mt-4 glass rounded-xl p-4">
            <h4 className="font-semibold text-dark-200 mb-3 text-sm">使用说明</h4>
            <ul className="space-y-2 text-xs text-dark-400">
              <li className="flex items-start gap-2">
                <span className="text-primary-400">1.</span>
                <span>选择包含漫画图片的文件夹</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary-400">2.</span>
                <span>点击"开始 OCR 识别"分析图片文字</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary-400">3.</span>
                <span>预览识别结果，可手动编辑文件名</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary-400">4.</span>
                <span>点击"应用重命名"执行批量操作</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-accent-400">*</span>
                <span>可在历史记录中随时撤销操作</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <SettingsPanel isOpen={showSettings} onClose={() => setShowSettings(false)} />
    </div>
  )
}

export default App
