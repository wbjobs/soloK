import React from 'react';
import { useAppStore } from '@/store/useAppStore';
import { ALGORITHM_INFO, type Algorithm } from '@/types';

const algorithmIcons: Record<Algorithm, string> = {
  sobel: '↗',
  canny: '◎',
  laplacian: '◈',
};

export const AlgorithmSelector: React.FC = () => {
  const params = useAppStore((state) => state.params);
  const setParams = useAppStore((state) => state.setParams);

  const handleSelect = (algorithm: Algorithm) => {
    setParams({ algorithm });
  };

  return (
    <div className="w-full">
      <h3 className="text-white font-medium mb-3">选择算法</h3>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {(Object.keys(ALGORITHM_INFO) as Algorithm[]).map((algo) => {
          const info = ALGORITHM_INFO[algo];
          const isSelected = params.algorithm === algo;

          return (
            <button
              key={algo}
              onClick={() => handleSelect(algo)}
              className={`
                relative p-4 rounded-xl text-left transition-all duration-300 ease-out
                backdrop-blur-xl border-2 overflow-hidden group
                ${isSelected
                  ? 'bg-neon-cyan/10 border-neon-cyan shadow-neon-sm scale-[1.02]'
                  : 'bg-white/5 border-deep-space-lighter hover:border-neon-cyan/50 hover:bg-white/10 hover:scale-[1.01]'
                }
              `}
            >
              <div className="flex items-start gap-3">
                <div className={`
                  w-10 h-10 rounded-lg flex items-center justify-center text-xl font-bold
                  transition-all duration-300 flex-shrink-0
                  ${isSelected
                    ? 'bg-neon-cyan text-deep-space'
                    : 'bg-deep-space-lighter text-gray-400 group-hover:text-neon-cyan'
                  }
                `}>
                  {algorithmIcons[algo]}
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className={`
                    font-semibold text-sm mb-1 transition-colors
                    ${isSelected ? 'text-neon-cyan' : 'text-white group-hover:text-neon-cyan'}
                  `}>
                    {info.name}
                  </h4>
                  <p className="text-xs text-gray-400 leading-relaxed line-clamp-3">
                    {info.description}
                  </p>
                </div>
              </div>

              {isSelected && (
                <>
                  <div className="absolute top-0 right-0 w-20 h-20 bg-neon-cyan/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-xl" />
                  <div className="absolute bottom-0 left-0 w-16 h-16 bg-neon-cyan/5 rounded-full translate-y-1/2 -translate-x-1/2 blur-lg" />
                </>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};
