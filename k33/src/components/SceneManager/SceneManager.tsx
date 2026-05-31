import React, { useState, useEffect } from 'react';
import { X, Save, Trash2, Download, Upload, FolderOpen } from 'lucide-react';
import { useSimulationStore } from '../../store/useSimulationStore';
import { Scene } from '../../types';

interface SceneManagerProps {
  onClose: () => void;
}

export const SceneManager: React.FC<SceneManagerProps> = ({ onClose }) => {
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [saveName, setSaveName] = useState('');
  const [saveDescription, setSaveDescription] = useState('');
  const [activeTab, setActiveTab] = useState<'save' | 'load'>('load');
  
  const { saveScene, loadScene, deleteScene, scene } = useSimulationStore();

  useEffect(() => {
    loadScenes();
  }, []);

  const loadScenes = () => {
    try {
      const data = localStorage.getItem('agv_sim_scenes');
      if (data) {
        setScenes(JSON.parse(data));
      }
    } catch (error) {
      console.error('加载场景失败:', error);
    }
  };

  const handleSave = () => {
    if (!saveName.trim()) {
      alert('请输入场景名称');
      return;
    }
    saveScene(saveName, saveDescription);
    setSaveName('');
    setSaveDescription('');
    loadScenes();
    alert('场景保存成功');
  };

  const handleLoad = (sceneId: string) => {
    if (scene.simulationState.isRunning) {
      if (!confirm('仿真正在运行，加载新场景将停止当前仿真。是否继续？')) {
        return;
      }
    }
    loadScene(sceneId);
    onClose();
  };

  const handleDelete = (sceneId: string, sceneName: string) => {
    if (confirm(`确定要删除场景 "${sceneName}" 吗？`)) {
      deleteScene(sceneId);
      loadScenes();
    }
  };

  const exportScene = (sceneToExport: Scene) => {
    const dataStr = JSON.stringify(sceneToExport, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${sceneToExport.name}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const importScene = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const importedScene = JSON.parse(event.target?.result as string);
          const allScenes = [...scenes, { ...importedScene, id: `scene-${Date.now()}` }];
          localStorage.setItem('agv_sim_scenes', JSON.stringify(allScenes));
          loadScenes();
          alert('场景导入成功');
        } catch (error) {
          alert('场景文件格式错误');
        }
      };
      reader.readAsText(file);
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString('zh-CN');
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-gray-900 rounded-xl w-[700px] max-h-[80vh] shadow-2xl flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-xl font-bold text-white">场景管理</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X size={20} className="text-gray-400" />
          </button>
        </div>

        <div className="flex border-b border-gray-700">
          <button
            onClick={() => setActiveTab('load')}
            className={`flex-1 py-3 px-4 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
              activeTab === 'load'
                ? 'bg-blue-600 text-white'
                : 'text-gray-400 hover:text-white hover:bg-gray-800'
            }`}
          >
            <FolderOpen size={16} />
            加载场景
          </button>
          <button
            onClick={() => setActiveTab('save')}
            className={`flex-1 py-3 px-4 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
              activeTab === 'save'
                ? 'bg-blue-600 text-white'
                : 'text-gray-400 hover:text-white hover:bg-gray-800'
            }`}
          >
            <Save size={16} />
            保存场景
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {activeTab === 'save' ? (
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-300 mb-2">场景名称</label>
                <input
                  type="text"
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  placeholder="输入场景名称"
                  className="w-full bg-gray-800 text-white rounded-lg py-2 px-4 border border-gray-600 focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-2">描述</label>
                <textarea
                  value={saveDescription}
                  onChange={(e) => setSaveDescription(e.target.value)}
                  placeholder="输入场景描述（可选）"
                  rows={3}
                  className="w-full bg-gray-800 text-white rounded-lg py-2 px-4 border border-gray-600 focus:border-blue-500 focus:outline-none resize-none"
                />
              </div>
              <div className="bg-gray-800 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-gray-300 mb-2">当前场景信息</h3>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-400">AGV数量</span>
                    <span className="text-white">{scene.agvs.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">任务数</span>
                    <span className="text-white">{scene.tasks.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">已完成TEU</span>
                    <span className="text-white">{scene.simulationState.totalTEU}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">仿真时间</span>
                    <span className="text-white">{Math.floor(scene.simulationState.currentTime / 60)}分钟</span>
                  </div>
                </div>
              </div>
              <button
                onClick={handleSave}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white py-3 px-4 rounded-lg font-medium flex items-center justify-center gap-2 transition-colors"
              >
                <Save size={18} />
                保存场景
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex justify-end">
                <label className="flex items-center gap-2 py-2 px-4 bg-gray-700 hover:bg-gray-600 rounded-lg cursor-pointer transition-colors text-sm text-white">
                  <Upload size={16} />
                  导入场景
                  <input
                    type="file"
                    accept=".json"
                    onChange={importScene}
                    className="hidden"
                  />
                </label>
              </div>

              {scenes.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <FolderOpen size={48} className="mx-auto mb-3 opacity-50" />
                  <p>暂无保存的场景</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {scenes.map(savedScene => (
                    <div
                      key={savedScene.id}
                      className="bg-gray-800 rounded-lg p-4 hover:bg-gray-750 transition-colors"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h3 className="text-white font-medium">{savedScene.name}</h3>
                          {savedScene.description && (
                            <p className="text-sm text-gray-400 mt-1">{savedScene.description}</p>
                          )}
                          <div className="flex gap-4 mt-2 text-xs text-gray-500">
                            <span>AGV: {savedScene.agvs.length}</span>
                            <span>任务: {savedScene.tasks.length}</span>
                            <span>创建: {formatDate(savedScene.createdAt)}</span>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => exportScene(savedScene)}
                            className="p-2 hover:bg-gray-700 rounded transition-colors"
                            title="导出"
                          >
                            <Download size={16} className="text-gray-400" />
                          </button>
                          <button
                            onClick={() => handleDelete(savedScene.id, savedScene.name)}
                            className="p-2 hover:bg-red-900/50 rounded transition-colors"
                            title="删除"
                          >
                            <Trash2 size={16} className="text-red-400" />
                          </button>
                          <button
                            onClick={() => handleLoad(savedScene.id)}
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition-colors"
                          >
                            加载
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
