import { useAppStore } from '../store/useAppStore';
import { CameraConfig } from '../types';

export const SettingsPanel = () => {
  const { cameras, settings, setCameras, updateSettings } = useAppStore();

  const toggleCamera = (cameraId: string) => {
    const updatedCameras = cameras.map(cam => 
      cam.id === cameraId ? { ...cam, enabled: !cam.enabled } : cam
    );
    setCameras(updatedCameras);
  };

  const updateCameraDirection = (cameraId: string, direction: CameraConfig['escalatorDirection']) => {
    const updatedCameras = cameras.map(cam => 
      cam.id === cameraId ? { ...cam, escalatorDirection: direction } : cam
    );
    setCameras(updatedCameras);
  };

  const updateCameraName = (cameraId: string, name: string) => {
    const updatedCameras = cameras.map(cam => 
      cam.id === cameraId ? { ...cam, name } : cam
    );
    setCameras(updatedCameras);
  };

  return (
    <div className="p-6 space-y-8">
      <h2 className="text-2xl font-bold text-white">系统设置</h2>

      <section>
        <h3 className="text-lg font-semibold text-white mb-4">摄像头配置</h3>
        <div className="space-y-4">
          {cameras.map((camera) => (
            <div 
              key={camera.id}
              className="bg-secondary rounded-xl p-4"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <span className={`w-3 h-3 rounded-full ${camera.enabled ? 'bg-green-500' : 'bg-gray-500'}`}></span>
                  <input
                    type="text"
                    value={camera.name}
                    onChange={(e) => updateCameraName(camera.id, e.target.value)}
                    className="bg-transparent text-white font-medium border-b border-transparent hover:border-gray-500 focus:border-blue-500 focus:outline-none px-1"
                  />
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={camera.enabled}
                    onChange={() => toggleCamera(camera.id)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-2">扶梯方向</label>
                  <select
                    value={camera.escalatorDirection}
                    onChange={(e) => updateCameraDirection(camera.id, e.target.value as any)}
                    className="w-full bg-primary text-white rounded-lg px-3 py-2 border border-gray-600 focus:border-blue-500 focus:outline-none"
                  >
                    <option value="up">↑ 上行</option>
                    <option value="down">↓ 下行</option>
                    <option value="left">← 左行</option>
                    <option value="right">→ 右行</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">摄像头ID</label>
                  <input
                    type="text"
                    value={camera.deviceId || '默认'}
                    readOnly
                    className="w-full bg-primary text-gray-400 rounded-lg px-3 py-2 border border-gray-600"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h3 className="text-lg font-semibold text-white mb-4">高级检测设置</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-secondary rounded-xl p-4 space-y-4">
            <h4 className="text-white font-medium">年龄与摔倒检测</h4>
            
            <div className="flex items-center justify-between">
              <div>
                <p className="text-white text-sm">年龄组识别</p>
                <p className="text-xs text-gray-400">根据身体比例识别儿童/成人/老人</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.enableAgeDetection}
                  onChange={(e) => updateSettings({ enableAgeDetection: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-600 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-2">
                成人摔倒倾角阈值: {settings.fallThreshold}°
              </label>
              <input
                type="range"
                min="30"
                max="90"
                value={settings.fallThreshold}
                onChange={(e) => updateSettings({ fallThreshold: parseInt(e.target.value) })}
                className="w-full accent-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-2">
                成人头部下降比例: {(settings.fallHeightDropRatio * 100).toFixed(0)}%
              </label>
              <input
                type="range"
                min="20"
                max="80"
                value={settings.fallHeightDropRatio * 100}
                onChange={(e) => updateSettings({ fallHeightDropRatio: parseInt(e.target.value) / 100 })}
                className="w-full accent-blue-500"
              />
            </div>

            <div className="border-t border-gray-600 pt-4">
              <label className="block text-sm text-orange-400 mb-2">
                老人摔倒倾角阈值: {settings.elderlyFallThreshold}° (更灵敏)
              </label>
              <input
                type="range"
                min="20"
                max="60"
                value={settings.elderlyFallThreshold}
                onChange={(e) => updateSettings({ elderlyFallThreshold: parseInt(e.target.value) })}
                className="w-full accent-orange-500"
              />
            </div>

            <div>
              <label className="block text-sm text-orange-400 mb-2">
                老人头部下降比例: {(settings.elderlyFallHeightDropRatio * 100).toFixed(0)}%
              </label>
              <input
                type="range"
                min="10"
                max="50"
                value={settings.elderlyFallHeightDropRatio * 100}
                onChange={(e) => updateSettings({ elderlyFallHeightDropRatio: parseInt(e.target.value) / 100 })}
                className="w-full accent-orange-500"
              />
            </div>
          </div>

          <div className="bg-secondary rounded-xl p-4 space-y-4">
            <h4 className="text-white font-medium">群体行为检测</h4>
            
            <div className="flex items-center justify-between">
              <div>
                <p className="text-white text-sm">群体异常检测</p>
                <p className="text-xs text-gray-400">检测密度过高、推挤、恐慌逃散</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.enableGroupDetection}
                  onChange={(e) => updateSettings({ enableGroupDetection: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-600 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-2">
                最大人群密度: {settings.maxDensityPerSqm} 人/㎡
              </label>
              <input
                type="range"
                min="2"
                max="8"
                value={settings.maxDensityPerSqm}
                onChange={(e) => updateSettings({ maxDensityPerSqm: parseInt(e.target.value) })}
                className="w-full accent-red-500"
              />
            </div>

            <div className="bg-primary rounded-lg p-3 mt-4">
              <p className="text-xs text-gray-400 mb-2">检测类型说明:</p>
              <ul className="text-xs text-gray-500 space-y-1">
                <li>• <span className="text-yellow-400">密度过高</span>: 超过最大密度阈值</li>
                <li>• <span className="text-orange-400">推挤行为</span>: 近距离两人相对速度突变</li>
                <li>• <span className="text-red-400">恐慌逃散</span>: 运动方向混乱度超过阈值</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section>
        <h3 className="text-lg font-semibold text-white mb-4">基础检测参数</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-secondary rounded-xl p-4 space-y-4">
            <h4 className="text-white font-medium">逆行检测</h4>
            
            <div>
              <label className="block text-sm text-gray-400 mb-2">
                逆行持续时间: {settings.retrogradeDuration}ms
              </label>
              <input
                type="range"
                min="500"
                max="3000"
                step="100"
                value={settings.retrogradeDuration}
                onChange={(e) => updateSettings({ retrogradeDuration: parseInt(e.target.value) })}
                className="w-full accent-yellow-500"
              />
            </div>
          </div>

          <div className="bg-secondary rounded-xl p-4 space-y-4">
            <h4 className="text-white font-medium">行李检测</h4>
            
            <div>
              <label className="block text-sm text-gray-400 mb-2">
                手部距离比例: {(settings.luggageDistanceRatio * 100).toFixed(0)}%
              </label>
              <input
                type="range"
                min="50"
                max="120"
                value={settings.luggageDistanceRatio * 100}
                onChange={(e) => updateSettings({ luggageDistanceRatio: parseInt(e.target.value) / 100 })}
                className="w-full accent-blue-500"
              />
            </div>
          </div>

          <div className="bg-secondary rounded-xl p-4 space-y-4">
            <h4 className="text-white font-medium">跳跃/奔跑检测</h4>
            
            <div>
              <label className="block text-sm text-gray-400 mb-2">
                垂直速度阈值: {settings.jumpVerticalSpeed.toFixed(2)}
              </label>
              <input
                type="range"
                min="10"
                max="100"
                value={settings.jumpVerticalSpeed * 100}
                onChange={(e) => updateSettings({ jumpVerticalSpeed: parseInt(e.target.value) / 100 })}
                className="w-full accent-purple-500"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-2">
                步频阈值: {settings.jumpStepFrequency} 步/秒
              </label>
              <input
                type="range"
                min="1"
                max="5"
                value={settings.jumpStepFrequency}
                onChange={(e) => updateSettings({ jumpStepFrequency: parseInt(e.target.value) })}
                className="w-full accent-purple-500"
              />
            </div>
          </div>
        </div>
      </section>

      <section>
        <h3 className="text-lg font-semibold text-white mb-4">隐私与报警</h3>
        <div className="bg-secondary rounded-xl p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white font-medium">人脸模糊化</p>
              <p className="text-sm text-gray-400">对检测到的人脸区域进行高斯模糊处理</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.blurFace}
                onChange={(e) => updateSettings({ blurFace: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-600 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"></div>
            </label>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-white font-medium">语音报警</p>
              <p className="text-sm text-gray-400">检测到异常时播放语音提示</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.enableAudioAlert}
                onChange={(e) => updateSettings({ enableAudioAlert: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-600 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"></div>
            </label>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-2">
              报警音量: {(settings.alertVolume * 100).toFixed(0)}%
            </label>
            <input
              type="range"
              min="0"
              max="100"
              value={settings.alertVolume * 100}
              onChange={(e) => updateSettings({ alertVolume: parseInt(e.target.value) / 100 })}
              className="w-full accent-red-500"
            />
          </div>
        </div>
      </section>
    </div>
  );
};
