import { useState } from 'react';
import type { Annotation } from '../../types';

export interface AnnotationToolsProps {
  activeTool: Annotation['type'] | null;
  color: string;
  onToolChange: (tool: Annotation['type'] | null) => void;
  onColorChange: (color: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

const TOOLS: { type: Annotation['type']; label: string; icon: string }[] = [
  {
    type: 'arrow',
    label: '箭头',
    icon: 'M14 5l7 7m0 0l-7 7m7-7H3',
  },
  {
    type: 'line',
    label: '直线',
    icon: 'M4 20L20 4',
  },
  {
    type: 'circle',
    label: '圆形',
    icon: 'M12 8a4 4 0 100 8 4 4 0 000-8z',
  },
  {
    type: 'rectangle',
    label: '矩形',
    icon: 'M3 3h18v18H3V3z',
  },
  {
    type: 'text',
    label: '文字',
    icon: 'M4 6h16M4 6l8 14M4 6l8 14M20 6l-8 14',
  },
];

const COLORS = [
  '#EF4444', '#F97316', '#FBBF24', '#22C55E', '#3B82F6',
  '#8B5CF6', '#EC4899', '#FFFFFF', '#000000',
];

const AnnotationTools = ({
  activeTool,
  color,
  onToolChange,
  onColorChange,
  onUndo,
  onRedo,
  onClear,
  canUndo,
  canRedo,
}: AnnotationToolsProps) => {
  const [showColorPicker, setShowColorPicker] = useState(false);

  return (
    <div className="flex items-center space-x-1 bg-white rounded-xl shadow-sm border border-gray-200 px-3 py-2">
      {TOOLS.map((tool) => (
        <button
          key={tool.type}
          onClick={() => onToolChange(activeTool === tool.type ? null : tool.type)}
          className={`relative p-2 rounded-lg transition-all ${
            activeTool === tool.type
              ? 'bg-blue-100 text-blue-700 shadow-sm'
              : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
          }`}
          title={tool.label}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={tool.icon} />
          </svg>
          {activeTool === tool.type && (
            <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-blue-600 rounded-full" />
          )}
        </button>
      ))}

      <div className="w-px h-6 bg-gray-200 mx-1" />

      <div className="relative">
        <button
          onClick={() => setShowColorPicker(!showColorPicker)}
          className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
          title="选择颜色"
        >
          <div className="w-5 h-5 rounded-full border-2 border-gray-300" style={{ backgroundColor: color }} />
        </button>

        {showColorPicker && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setShowColorPicker(false)} />
            <div className="absolute top-full left-0 mt-1 p-2 bg-white rounded-lg shadow-xl border border-gray-200 z-20">
              <div className="grid grid-cols-3 gap-1">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => {
                      onColorChange(c);
                      setShowColorPicker(false);
                    }}
                    className={`w-7 h-7 rounded-full border-2 transition-transform hover:scale-110 ${
                      color === c ? 'border-gray-800 scale-110' : 'border-gray-200'
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      <div className="w-px h-6 bg-gray-200 mx-1" />

      <button
        onClick={onUndo}
        disabled={!canUndo}
        className={`p-2 rounded-lg transition-colors ${
          canUndo ? 'text-gray-500 hover:bg-gray-100 hover:text-gray-700' : 'text-gray-300 cursor-not-allowed'
        }`}
        title="撤销"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a5 5 0 015 5v2M3 10l4-4M3 10l4 4" />
        </svg>
      </button>

      <button
        onClick={onRedo}
        disabled={!canRedo}
        className={`p-2 rounded-lg transition-colors ${
          canRedo ? 'text-gray-500 hover:bg-gray-100 hover:text-gray-700' : 'text-gray-300 cursor-not-allowed'
        }`}
        title="重做"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10H11a5 5 0 00-5 5v2M21 10l-4-4M21 10l-4 4" />
        </svg>
      </button>

      <div className="w-px h-6 bg-gray-200 mx-1" />

      <button
        onClick={onClear}
        className="p-2 rounded-lg text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors"
        title="清除所有标注"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      </button>
    </div>
  );
};

export default AnnotationTools;
