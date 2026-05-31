import { useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Plus, Download, Upload, Music, FolderOpen } from 'lucide-react'
import type { Profile, MappingRule } from '@shared/index'
import { useAppStore } from '../store/useAppStore'
import { useMidiStore } from '../store/useMidiStore'
import { useLearnMode } from '../hooks/useLearnMode'
import ProfileCard from '../components/ProfileManager/ProfileCard'
import LearnModeButton from '../components/LearnMode/LearnModeButton'
import MappingList from '../components/MappingList/MappingList'
import ActionBinderModal from '../components/ActionBinder/ActionBinderModal'
import { ipcProfile, ipcMapping, ipcAction } from '../utils/ipc'

export default function Mappings() {
  const { config, currentProfile, setConfig, setCurrentProfile } = useAppStore()
  const { learning, learnedMessage } = useMidiStore()
  const { learning: hookLearning, learnedTrigger, timeRemaining, startLearning, stopLearning, resetLearned } = useLearnMode()

  const [showModal, setShowModal] = useState(false)
  const [editMapping, setEditMapping] = useState<MappingRule | null>(null)

  const profiles = config?.profiles || []
  const activeProfile = currentProfile
  const isLearning = learning || hookLearning

  const handleCreateProfile = useCallback(async () => {
    const name = prompt('输入配置文件名称:')
    if (!name?.trim()) return

    const newProfile = await ipcProfile.create(name.trim())
    if (newProfile && config) {
      const updatedConfig = {
        ...config,
        profiles: [...config.profiles, newProfile],
      }
      setConfig(updatedConfig)
    }
  }, [config, setConfig])

  const handleRenameProfile = useCallback(async (id: string, name: string) => {
    if (!config) return
    const profile = config.profiles.find(p => p.id === id)
    if (!profile) return

    const updatedProfile = { ...profile, name, updatedAt: Date.now() }
    const success = await ipcProfile.update(updatedProfile)
    if (success) {
      const updatedProfiles = config.profiles.map(p => p.id === id ? updatedProfile : p)
      const updatedConfig = { ...config, profiles: updatedProfiles }
      setConfig(updatedConfig)
      if (currentProfile?.id === id) {
        setCurrentProfile(updatedProfile)
      }
    }
  }, [config, currentProfile, setConfig, setCurrentProfile])

  const handleDeleteProfile = useCallback(async (id: string) => {
    if (!config) return
    const success = await ipcProfile.delete(id)
    if (success) {
      const updatedProfiles = config.profiles.filter(p => p.id !== id)
      const activeProfileId = config.activeProfileId === id ? null : config.activeProfileId
      const updatedConfig = { ...config, profiles: updatedProfiles, activeProfileId }
      setConfig(updatedConfig)
      if (currentProfile?.id === id) {
        setCurrentProfile(null)
      }
    }
  }, [config, currentProfile, setConfig, setCurrentProfile])

  const handleDuplicateProfile = useCallback(async (profile: Profile) => {
    if (!config) return
    const newName = `${profile.name} (副本)`
    const newProfile = await ipcProfile.create(newName)
    if (newProfile && config) {
      const duplicateProfile: Profile = {
        ...newProfile,
        description: profile.description,
        mappings: profile.mappings.map(m => ({ ...m, id: `${m.id}-copy-${Date.now()}` })),
      }
      await ipcProfile.update(duplicateProfile)
      const updatedConfig = {
        ...config,
        profiles: [...config.profiles, duplicateProfile],
      }
      setConfig(updatedConfig)
    }
  }, [config, setConfig])

  const handleSelectProfile = useCallback(async (id: string) => {
    if (!config) return
    const success = await ipcProfile.switch(id)
    if (success) {
      const updatedConfig = { ...config, activeProfileId: id }
      setConfig(updatedConfig)
      const profile = config.profiles.find(p => p.id === id)
      setCurrentProfile(profile || null)
    }
  }, [config, setConfig, setCurrentProfile])

  const handleAddMapping = () => {
    setEditMapping(null)
    resetLearned()
    setShowModal(true)
  }

  const handleEditMapping = (mapping: MappingRule) => {
    setEditMapping(mapping)
    setShowModal(true)
  }

  const handleToggleMapping = useCallback(async (id: string, enabled: boolean) => {
    if (!activeProfile || !config) return
    const mapping = activeProfile.mappings.find(m => m.id === id)
    if (!mapping) return

    const updatedMapping = { ...mapping, enabled, updatedAt: Date.now() }
    const success = await ipcMapping.update(activeProfile.id, updatedMapping)
    if (success) {
      const updatedMappings = activeProfile.mappings.map(m => m.id === id ? updatedMapping : m)
      const updatedProfile = { ...activeProfile, mappings: updatedMappings, updatedAt: Date.now() }
      await ipcProfile.update(updatedProfile)
      setCurrentProfile(updatedProfile)
      
      const updatedProfiles = config.profiles.map(p => p.id === activeProfile.id ? updatedProfile : p)
      setConfig({ ...config, profiles: updatedProfiles })
    }
  }, [activeProfile, config, setCurrentProfile, setConfig])

  const handleSaveMapping = useCallback(async (mapping: MappingRule) => {
    if (!activeProfile || !config) return

    if (editMapping) {
      const success = await ipcMapping.update(activeProfile.id, mapping)
      if (success) {
        const updatedMappings = activeProfile.mappings.map(m => m.id === mapping.id ? mapping : m)
        const updatedProfile = { ...activeProfile, mappings: updatedMappings, updatedAt: Date.now() }
        await ipcProfile.update(updatedProfile)
        setCurrentProfile(updatedProfile)
        
        const updatedProfiles = config.profiles.map(p => p.id === activeProfile.id ? updatedProfile : p)
        setConfig({ ...config, profiles: updatedProfiles })
      }
    } else {
      const success = await ipcMapping.add(activeProfile.id, mapping)
      if (success) {
        const updatedMappings = [...activeProfile.mappings, mapping]
        const updatedProfile = { ...activeProfile, mappings: updatedMappings, updatedAt: Date.now() }
        await ipcProfile.update(updatedProfile)
        setCurrentProfile(updatedProfile)
        
        const updatedProfiles = config.profiles.map(p => p.id === activeProfile.id ? updatedProfile : p)
        setConfig({ ...config, profiles: updatedProfiles })
      }
    }
  }, [activeProfile, config, editMapping, setCurrentProfile, setConfig])

  const handleDeleteMapping = useCallback(async (id: string) => {
    if (!activeProfile || !config) return
    const success = await ipcMapping.delete(activeProfile.id, id)
    if (success) {
      const updatedMappings = activeProfile.mappings.filter(m => m.id !== id)
      const updatedProfile = { ...activeProfile, mappings: updatedMappings, updatedAt: Date.now() }
      await ipcProfile.update(updatedProfile)
      setCurrentProfile(updatedProfile)
      
      const updatedProfiles = config.profiles.map(p => p.id === activeProfile.id ? updatedProfile : p)
      setConfig({ ...config, profiles: updatedProfiles })
    }
  }, [activeProfile, config, setCurrentProfile, setConfig])

  const handleTestAction = useCallback(async (mapping: MappingRule) => {
    await ipcAction.test(mapping.action)
  }, [])

  const handleExport = useCallback(async () => {
    if (!activeProfile) return
    await ipcProfile.export(activeProfile.id)
  }, [activeProfile])

  const handleImport = useCallback(async () => {
    if (!config) return
    const importedProfile = await ipcProfile.import()
    if (importedProfile) {
      const updatedConfig = {
        ...config,
        profiles: [...config.profiles, importedProfile],
      }
      setConfig(updatedConfig)
    }
  }, [config, setConfig])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text mb-1">映射配置</h1>
          <p className="text-text-muted">管理MIDI消息到桌面动作的映射规则</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleImport}
            className="btn-secondary flex items-center gap-2"
          >
            <Upload className="w-4 h-4" />
            导入
          </button>
          <button
            onClick={handleExport}
            disabled={!activeProfile}
            className="btn-secondary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="w-4 h-4" />
            导出
          </button>
          <button
            onClick={handleAddMapping}
            disabled={!activeProfile}
            className="btn-primary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="w-4 h-4" />
            新建映射
          </button>
        </div>
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <FolderOpen className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-text">配置文件</h2>
              <p className="text-sm text-text-muted">
                共 {profiles.length} 个配置文件
              </p>
            </div>
          </div>
          <button
            onClick={handleCreateProfile}
            className="btn-secondary flex items-center gap-2 text-sm py-1.5"
          >
            <Plus className="w-4 h-4" />
            新建配置
          </button>
        </div>

        {profiles.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-12 text-text-muted"
          >
            <Music className="w-16 h-16 mx-auto mb-4 opacity-30" />
            <p className="text-lg mb-2">暂无配置文件</p>
            <p className="text-sm mb-4">点击"新建配置"按钮创建第一个配置文件</p>
            <button
              onClick={handleCreateProfile}
              className="btn-primary inline-flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              创建配置
            </button>
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {profiles.map((profile) => (
              <ProfileCard
                key={profile.id}
                profile={profile}
                isActive={activeProfile?.id === profile.id}
                onSelect={handleSelectProfile}
                onRename={handleRenameProfile}
                onDelete={handleDeleteProfile}
                onDuplicate={handleDuplicateProfile}
              />
            ))}
          </div>
        )}
      </div>

      {activeProfile && (
        <>
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <LearnModeButton
                learning={isLearning}
                learned={!!learnedMessage && !isLearning}
                timeRemaining={timeRemaining}
                timeoutMs={10000}
                onStart={() => startLearning(10000)}
                onStop={stopLearning}
                onReset={resetLearned}
              />
            </div>

            {learnedTrigger && !isLearning && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="mb-4 p-4 bg-success/5 border border-success/30 rounded-lg"
              >
                <div className="flex items-center gap-2 text-success text-sm font-medium mb-2">
                  已学习触发器
                </div>
                <div className="font-mono text-sm text-text mt-1">
                  {learnedTrigger && (
                    <span className="text-success">
                      {learnedTrigger.type === 'note' 
                        ? `音符 ${learnedTrigger.note} (通道 ${learnedTrigger.channel + 1})`
                        : learnedTrigger.type === 'cc'
                        ? `CC ${learnedTrigger.controlNumber} (通道 ${learnedTrigger.channel + 1})`
                        : `弯音轮 (通道 ${learnedTrigger.channel + 1})`
                      }
                    </span>
                  )}
                </div>
                <button
                  onClick={handleAddMapping}
                  className="mt-2 btn-primary text-sm py-1.5"
                >
                  以此触发器创建映射
                </button>
              </motion.div>
            )}
          </div>

          <div className="card">
            <MappingList
              mappings={activeProfile.mappings}
              onAdd={handleAddMapping}
              onToggle={handleToggleMapping}
              onEdit={handleEditMapping}
              onDelete={handleDeleteMapping}
              onTest={handleTestAction}
            />
          </div>
        </>
      )}

      {!activeProfile && profiles.length > 0 && (
        <div className="card">
          <div className="text-center py-12 text-text-muted">
            <FolderOpen className="w-16 h-16 mx-auto mb-4 opacity-30" />
            <p className="text-lg mb-2">请选择一个配置文件</p>
            <p className="text-sm">点击上方配置卡片以管理其映射规则</p>
          </div>
        </div>
      )}

      <ActionBinderModal
        isOpen={showModal}
        onClose={() => {
          setShowModal(false)
          setEditMapping(null)
        }}
        onSave={handleSaveMapping}
        editMapping={editMapping}
      />
    </div>
  )
}
