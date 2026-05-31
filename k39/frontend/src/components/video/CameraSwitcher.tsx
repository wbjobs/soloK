import { useState } from 'react';
import { CameraType } from '../../types';

export interface CameraSwitcherProps {
  currentCamera: CameraType;
  onCameraChange: (camera: CameraType) => void;
  thumbnails?: Record<CameraType, string>;
}

const CAMERA_CONFIG: { type: CameraType; label: string; icon: string }[] = [
  { type: CameraType.MAIN, label: '主摄像机', icon: 'M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z' },
  { type: CameraType.GOAL_LEFT, label: '左球门', icon: 'M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z' },
  { type: CameraType.GOAL_RIGHT, label: '右球门', icon: 'M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6z' },
];

const CameraSwitcher = ({ currentCamera, onCameraChange, thumbnails }: CameraSwitcherProps) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const currentConfig = CAMERA_CONFIG.find((c) => c.type === currentCamera) || CAMERA_CONFIG[0];

  return (
    <div className="relative">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center space-x-2 bg-black/60 backdrop-blur-sm text-white px-3 py-2 rounded-lg hover:bg-black/70 transition-all"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={currentConfig.icon} />
        </svg>
        <span className="text-sm font-medium">{currentConfig.label}</span>
        <svg
          className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isExpanded && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setIsExpanded(false)} />
          <div className="absolute top-full left-0 mt-2 w-56 bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden z-20">
            <div className="p-2 space-y-1">
              {CAMERA_CONFIG.map((camera) => {
                const isActive = currentCamera === camera.type;
                return (
                  <button
                    key={camera.type}
                    onClick={() => {
                      onCameraChange(camera.type);
                      setIsExpanded(false);
                    }}
                    className={`w-full flex items-center space-x-3 px-3 py-2 rounded-lg transition-all ${
                      isActive
                        ? 'bg-blue-50 text-blue-700'
                        : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <div className="relative w-16 h-10 bg-gray-200 rounded overflow-hidden flex-shrink-0">
                      {thumbnails?.[camera.type] ? (
                        <img
                          src={thumbnails[camera.type]}
                          alt={camera.label}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={camera.icon} />
                          </svg>
                        </div>
                      )}
                      {isActive && (
                        <div className="absolute inset-0 bg-blue-500/30 flex items-center justify-center">
                          <div className="w-5 h-5 bg-blue-600 rounded-full flex items-center justify-center">
                            <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M8 5v14l11-7z" />
                            </svg>
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="flex-1 text-left">
                      <p className={`text-sm font-medium ${isActive ? 'text-blue-700' : 'text-gray-700'}`}>
                        {camera.label}
                      </p>
                      <p className="text-xs text-gray-400">{camera.type}</p>
                    </div>
                    {isActive && (
                      <svg className="w-4 h-4 text-blue-600" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
                      </svg>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default CameraSwitcher;
