import React, { useCallback, useRef } from 'react';
import { Square, Minus, Plus, Sun, Contrast, Palette } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import type { KernelSize } from '@/types';

export const ParameterSliders: React.FC = () => {
  const params = useAppStore((state) => state.params);
  const setParams = useAppStore((state) => state.setParams);

  const debounceTimerRef = useRef<number | null>(null);

  const debouncedSetParams = useCallback((partial: Record<string, unknown>) => {
    if (debounceTimerRef.current) {
      window.clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = window.setTimeout(() => {
      setParams(partial);
    }, 16);
  }, [setParams]);

  const kernelSizes: KernelSize[] = [3, 5, 7];

  const handleKernelChange = (size: KernelSize) => {
    setParams({ kernelSize: size });
  };

  const handleLowThresholdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10);
    debouncedSetParams({ lowThreshold: value });
  };

  const handleHighThresholdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10);
    debouncedSetParams({ highThreshold: value });
  };

  const handleIntensityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value);
    debouncedSetParams({ intensity: Math.round(value * 100) / 100 });
  };

  const handleGrayscaleToggle = () => {
    setParams({ grayscale: !params.grayscale });
  };

  return (
    <div className="w-full p-5 rounded-2xl backdrop-blur-xl bg-white/5 border border-deep-space-lighter">
      <h3 className="text-white font-medium mb-5">参数调节</h3>

      <div className="space-y-5">
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Square className="w-4 h-4 text-neon-cyan" />
            <label className="text-white text-sm">卷积核大小</label>
          </div>
          <div className="flex gap-2">
            {kernelSizes.map((size) => (
              <button
                key={size}
                onClick={() => handleKernelChange(size)}
                className={`
                  flex-1 py-2 px-4 rounded-lg text-sm font-medium
                  transition-all duration-200 border-2
                  ${params.kernelSize === size
                    ? 'bg-neon-cyan/20 border-neon-cyan text-neon-cyan shadow-neon-sm'
                    : 'bg-white/5 border-deep-space-lighter text-gray-400 hover:border-neon-cyan/50 hover:text-white'
                  }
                `}
              >
                {size}×{size}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Minus className="w-4 h-4 text-neon-cyan" />
              <label className="text-white text-sm">低阈值</label>
            </div>
            <span className="text-neon-cyan text-sm font-mono w-10 text-right">
              {params.lowThreshold}
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="255"
            value={params.lowThreshold}
            onChange={handleLowThresholdChange}
            className="w-full h-2 bg-deep-space-lighter rounded-lg appearance-none cursor-pointer accent-neon-cyan"
          />
        </div>

        {params.algorithm === 'canny' && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Plus className="w-4 h-4 text-neon-cyan" />
                <label className="text-white text-sm">高阈值</label>
              </div>
              <span className="text-neon-cyan text-sm font-mono w-10 text-right">
                {params.highThreshold}
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="255"
              value={params.highThreshold}
              onChange={handleHighThresholdChange}
              className="w-full h-2 bg-deep-space-lighter rounded-lg appearance-none cursor-pointer accent-neon-cyan"
            />
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Sun className="w-4 h-4 text-neon-cyan" />
              <label className="text-white text-sm">强度</label>
            </div>
            <span className="text-neon-cyan text-sm font-mono w-14 text-right">
              {params.intensity.toFixed(2)}
            </span>
          </div>
          <input
            type="range"
            min="0.5"
            max="2.0"
            step="0.01"
            value={params.intensity}
            onChange={handleIntensityChange}
            className="w-full h-2 bg-deep-space-lighter rounded-lg appearance-none cursor-pointer accent-neon-cyan"
          />
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>0.5</span>
            <span>2.0</span>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-deep-space-lighter">
          <div className="flex items-center gap-2">
            <Contrast className="w-4 h-4 text-neon-cyan" />
            <span className="text-white text-sm">灰度输出</span>
          </div>
          <button
            onClick={handleGrayscaleToggle}
            className={`
              relative w-12 h-6 rounded-full transition-all duration-300
              ${params.grayscale ? 'bg-neon-cyan' : 'bg-deep-space-lighter'}
            `}
          >
            <div
              className={`
                absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-md
                transition-all duration-300 flex items-center justify-center
                ${params.grayscale ? 'left-6' : 'left-0.5'}
              `}
            >
              <Palette className={`w-3 h-3 ${params.grayscale ? 'text-neon-cyan' : 'text-gray-400'}`} />
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};
