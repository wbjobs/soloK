import React, { useCallback, useRef, useState } from 'react';
import { Upload, Image as ImageIcon, X } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export const ImageUploader: React.FC = () => {
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [fileInfo, setFileInfo] = useState<{ name: string; size: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setOriginalImage = useAppStore((state) => state.setOriginalImage);
  const originalImage = useAppStore((state) => state.originalImage);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateFile = (file: File): boolean => {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError('只支持 JPG、PNG、WebP 格式');
      return false;
    }
    setError(null);
    return true;
  };

  const loadImage = useCallback((file: File) => {
    if (!validateFile(file)) return;

    setIsLoading(true);
    setFileInfo({ name: file.name, size: file.size });

    const img = new window.Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      setOriginalImage(img);
      setIsLoading(false);
      URL.revokeObjectURL(url);
    };

    img.onerror = () => {
      setError('图片加载失败');
      setIsLoading(false);
      setFileInfo(null);
      URL.revokeObjectURL(url);
    };

    img.src = url;
  }, [setOriginalImage]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      loadImage(files[0]);
    }
  }, [loadImage]);

  const handleClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      loadImage(files[0]);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [loadImage]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile();
        if (file) {
          loadImage(file);
          break;
        }
      }
    }
  }, [loadImage]);

  const handleClear = useCallback(() => {
    setOriginalImage(null);
    setFileInfo(null);
    setError(null);
  }, [setOriginalImage]);

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="w-full">
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={!originalImage ? handleClick : undefined}
        onPaste={handlePaste}
        tabIndex={0}
        className={`
          relative overflow-hidden rounded-2xl border-2 border-dashed
          transition-all duration-300 ease-out cursor-pointer
          backdrop-blur-xl bg-white/5
          ${isDragging
            ? 'border-neon-cyan bg-neon-cyan/10 shadow-neon-cyan scale-[1.02]'
            : 'border-deep-space-lighter hover:border-neon-cyan/50 hover:bg-white/10'
          }
          ${isLoading ? 'pointer-events-none' : ''}
        `}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_TYPES.join(',')}
          onChange={handleFileChange}
          className="hidden"
        />

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-16 px-4">
            <div className="w-12 h-12 border-4 border-neon-cyan/30 border-t-neon-cyan rounded-full animate-spin mb-4" />
            <p className="text-gray-300 text-sm">正在加载图片...</p>
          </div>
        ) : originalImage ? (
          <div className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-neon-cyan/20 flex items-center justify-center">
                  <ImageIcon className="w-5 h-5 text-neon-cyan" />
                </div>
                <div>
                  <p className="text-white font-medium text-sm truncate max-w-[200px]">
                    {fileInfo?.name}
                  </p>
                  <p className="text-gray-400 text-xs">
                    {fileInfo ? formatSize(fileInfo.size) : ''} · {originalImage.width}×{originalImage.height}
                  </p>
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleClear();
                }}
                className="w-8 h-8 rounded-lg bg-red-500/10 hover:bg-red-500/20 flex items-center justify-center transition-colors group"
              >
                <X className="w-4 h-4 text-red-400 group-hover:text-red-300" />
              </button>
            </div>
            <div className="relative rounded-xl overflow-hidden bg-deep-space">
              <img
                src={originalImage.src}
                alt="Preview"
                className="w-full h-48 object-contain"
              />
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 px-4">
            <div className={`
              w-16 h-16 rounded-2xl flex items-center justify-center mb-4
              transition-all duration-300
              ${isDragging ? 'bg-neon-cyan/20 scale-110' : 'bg-white/5'}
            `}>
              <Upload className={`w-8 h-8 transition-colors ${isDragging ? 'text-neon-cyan' : 'text-gray-400'}`} />
            </div>
            <p className="text-white font-medium mb-1">拖拽图片到此处</p>
            <p className="text-gray-400 text-sm mb-2">或点击选择文件 / Ctrl+V 粘贴</p>
            <p className="text-gray-500 text-xs">支持 JPG、PNG、WebP 格式</p>
          </div>
        )}

        {isDragging && (
          <div className="absolute inset-0 border-2 border-neon-cyan rounded-2xl animate-pulse pointer-events-none" />
        )}
      </div>

      {error && (
        <p className="mt-2 text-red-400 text-sm text-center">{error}</p>
      )}
    </div>
  );
};
