import React, { useCallback, useState } from 'react';

interface FileUploadProps {
  onFileUpload: (file: File, type: 'image' | 'video') => void;
  accept?: string;
}

export const FileUpload: React.FC<FileUploadProps> = ({ onFileUpload, accept = 'image/*,video/*' }) => {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      const type = file.type.startsWith('image/') ? 'image' : 'video';
      onFileUpload(file, type);
    }
  }, [onFileUpload]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      const type = file.type.startsWith('image/') ? 'image' : 'video';
      onFileUpload(file, type);
    }
  }, [onFileUpload]);

  return (
    <div
      className={`file-upload ${isDragging ? 'dragging' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <input
        type="file"
        accept={accept}
        onChange={handleFileChange}
        className="file-input"
      />
      <div className="upload-content">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
        <p>拖拽文件到此处或点击上传</p>
        <p className="hint">支持图片和视频格式</p>
      </div>
    </div>
  );
};
