import { useState, useEffect } from 'react'
import { Settings, Link2, Code2, Plus, Trash2, ToggleLeft, ToggleRight, X } from 'lucide-react'
import type { SeriesAlias, CustomRule } from '../../shared/types'

interface SettingsPanelProps {
  isOpen: boolean
  onClose: () => void
}

export default function SettingsPanel({ isOpen, onClose }: SettingsPanelProps) {
  const [activeTab, setActiveTab] = useState<'aliases' | 'rules'>('aliases')
  const [aliases, setAliases] = useState<SeriesAlias[]>([])
  const [rules, setRules] = useState<CustomRule[]>([])
  const [newCanonical, setNewCanonical] = useState('')
  const [newAlias, setNewAlias] = useState('')

  useEffect(() => {
    if (isOpen) {
      loadData()
    }
  }, [isOpen])

  const loadData = async () => {
    try {
      const [aliasData, ruleData] = await Promise.all([
        window.electronAPI.getSeriesAliases(),
        window.electronAPI.getCustomRules()
      ])
      setAliases(aliasData)
      setRules(ruleData)
    } catch (e) {
      console.error('Failed to load settings:', e)
    }
  }

  const handleAddAlias = async () => {
    if (!newCanonical.trim() || !newAlias.trim()) return
    
    await window.electronAPI.addSeriesAlias(newCanonical.trim(), newAlias.trim())
    setNewCanonical('')
    setNewAlias('')
    loadData()
  }

  const handleDeleteAlias = async (id: number) => {
    await window.electronAPI.deleteSeriesAlias(id)
    loadData()
  }

  const handleDeleteRule = async (id: number) => {
    await window.electronAPI.deleteCustomRule(id)
    loadData()
  }

  const handleToggleRule = async (id: number) => {
    await window.electronAPI.toggleCustomRule(id)
    loadData()
  }

  if (!isOpen) return null

  const ruleTypeLabels: Record<string, string> = {
    series: '系列名',
    chapter: '章节号',
    title: '标题',
    replace: '文本替换'
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="glass rounded-2xl w-[700px] max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-primary-900/30">
          <h2 className="text-xl font-bold text-gradient flex items-center gap-2">
            <Settings size={24} />
            智能识别设置
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-dark-700/50 rounded-lg text-dark-400 hover:text-dark-200">
            <X size={20} />
          </button>
        </div>

        <div className="flex border-b border-primary-900/30">
          <button
            onClick={() => setActiveTab('aliases')}
            className={`flex-1 py-3 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${activeTab === 'aliases' ? 'text-primary-400 border-b-2 border-primary-400' : 'text-dark-400 hover:text-dark-200'}`}
          >
            <Link2 size={16} />
            系列别名
          </button>
          <button
            onClick={() => setActiveTab('rules')}
            className={`flex-1 py-3 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${activeTab === 'rules' ? 'text-primary-400 border-b-2 border-primary-400' : 'text-dark-400 hover:text-dark-200'}`}
          >
            <Code2 size={16} />
            自定义规则
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {activeTab === 'aliases' ? (
            <div className="space-y-4">
              <div className="glass-light rounded-xl p-4">
                <h3 className="text-sm font-semibold text-dark-200 mb-3">添加别名</h3>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newCanonical}
                    onChange={(e) => setNewCanonical(e.target.value)}
                    placeholder="标准系列名 (如: 海贼王)"
                    className="flex-1 bg-dark-900 border border-dark-700 rounded-lg px-3 py-2 text-sm text-dark-200 focus:outline-none focus:border-primary-500"
                  />
                  <span className="text-dark-400 flex items-center">↔</span>
                  <input
                    type="text"
                    value={newAlias}
                    onChange={(e) => setNewAlias(e.target.value)}
                    placeholder="别名 (如: One Piece)"
                    className="flex-1 bg-dark-900 border border-dark-700 rounded-lg px-3 py-2 text-sm text-dark-200 focus:outline-none focus:border-primary-500"
                  />
                  <button onClick={handleAddAlias} className="px-4 py-2 bg-primary-600 rounded-lg text-white hover:bg-primary-500">
                    <Plus size={18} />
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-dark-200">已有别名</h3>
                {aliases.filter(a => a.canonicalName !== a.aliasName).map((alias) => (
                  <div key={alias.id} className="glass-light rounded-lg p-3 flex items-center gap-3">
                    <span className="px-2 py-1 bg-primary-600/30 text-primary-300 rounded text-sm font-medium">
                      {alias.canonicalName}
                    </span>
                    <span className="text-dark-400">↔</span>
                    <span className="px-2 py-1 bg-dark-700 text-dark-200 rounded text-sm flex-1">
                      {alias.aliasName}
                    </span>
                    <button onClick={() => handleDeleteAlias(alias.id)} className="p-1 text-dark-500 hover:text-red-400">
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-dark-200">自定义规则</h3>
              {rules.map((rule) => (
                <div key={rule.id} className="glass-light rounded-lg p-3 flex items-center gap-3">
                  <button onClick={() => handleToggleRule(rule.id)} className="text-dark-400 hover:text-dark-200">
                    {rule.enabled ? <ToggleRight size={20} className="text-primary-400" /> : <ToggleLeft size={20} />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="px-2 py-0.5 bg-accent-600/30 text-accent-300 rounded text-xs">
                        {ruleTypeLabels[rule.ruleType]}
                      </span>
                      <span className="text-xs text-dark-400">优先级: {rule.priority}</span>
                    </div>
                    <div className="text-sm font-mono text-dark-200 truncate">
                      {rule.pattern}
                    </div>
                  </div>
                  <button onClick={() => handleDeleteRule(rule.id)} className="p-2 text-dark-500 hover:text-red-400">
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
              <p className="text-xs text-dark-500 mt-4">
                提示：添加规则功能暂简化展示，可通过数据库直接配置
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
