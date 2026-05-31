import React from 'react';
import {
  MousePointer2,
  ArrowRight,
  Square,
  Circle,
  Pencil,
  Ruler,
  Grid3X3,
  Angle,
  Eraser,
  Snowflake,
  Play,
  Circle as CircleIcon,
  Camera,
  Download,
  Palette,
  Trash2,
} from 'lucide-react';
import { TOOL_TYPES, ANNOTATION_COLORS } from '../config';
import useRoomStore from '../store/roomStore';

const TOOLS = [
  { type: TOOL_TYPES.SELECT, icon: MousePointer2, label: '选择 (双击删除)' },
  { type: TOOL_TYPES.ARROW, icon: ArrowRight, label: '箭头' },
  { type: TOOL_TYPES.RECTANGLE, icon: Square, label: '矩形' },
  { type: TOOL_TYPES.ELLIPSE, icon: Circle, label: '椭圆' },
  { type: TOOL_TYPES.FREEHAND, icon: Pencil, label: '画笔' },
  { type: TOOL_TYPES.DISTANCE, icon: Ruler, label: '距离' },
  { type: TOOL_TYPES.AREA, icon: Grid3X3, label: '面积' },
  { type: TOOL_TYPES.ANGLE, icon: Angle, label: '角度' },
  { type: TOOL_TYPES.ERASER, icon: Eraser, label: '橡皮擦 (点击删除自己的标注)' },
];

export default function Toolbar({
  onFreeze,
  onUnfreeze,
  onSaveKeyframe,
  onStartRecording,
  onStopRecording,
  onClearAnnotations,
}) {
  const selectedTool = useRoomStore((s) => s.selectedTool);
  const selectedColor = useRoomStore((s) => s.selectedColor);
  const setSelectedTool = useRoomStore((s) => s.setSelectedTool);
  const setSelectedColor = useRoomStore((s) => s.setSelectedColor);
  const isFrozen = useRoomStore((s) => s.isFrozen);
  const isRecording = useRoomStore((s) => s.isRecording);

  return (
    <div className="bg-gray-900 border-b border-gray-700 px-4 py-2">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1">
          {TOOLS.map(({ type, icon: Icon, label }) => (
            <button
              key={type}
              onClick={() => setSelectedTool(selectedTool === type ? null : type)}
              className={`p-2 rounded transition-colors ${
                selectedTool === type
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-300 hover:bg-gray-700'
              }`}
              title={label}
            >
              <Icon size={18} />
            </button>
          ))}
        </div>

        <div className="w-px h-6 bg-gray-600" />

        <div className="flex items-center gap-1">
          <Palette size={18} className="text-gray-400" />
          <div className="flex gap-1">
            {ANNOTATION_COLORS.map((color) => (
              <button
                key={color}
                onClick={() => setSelectedColor(color)}
                className={`w-5 h-5 rounded-full border-2 transition-transform ${
                  selectedColor === color
                    ? 'border-white scale-110'
                    : 'border-transparent hover:scale-110'
                }`}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
        </div>

        <div className="w-px h-6 bg-gray-600" />

        <div className="flex items-center gap-1">
          <button
            onClick={isFrozen ? onUnfreeze : onFreeze}
            className={`p-2 rounded transition-colors ${
              isFrozen
                ? 'bg-yellow-500 text-white'
                : 'text-gray-300 hover:bg-gray-700'
            }`}
            title={isFrozen ? '解冻' : '冻结图像'}
          >
            {isFrozen ? <Play size={18} /> : <Snowflake size={18} />}
          </button>

          <button
            onClick={onSaveKeyframe}
            className="p-2 rounded text-gray-300 hover:bg-gray-700"
            title="保存关键帧"
          >
            <Camera size={18} />
          </button>

          <button
            onClick={isRecording ? onStopRecording : onStartRecording}
            className={`p-2 rounded transition-colors ${
              isRecording
                ? 'bg-red-600 text-white animate-pulse'
                : 'text-gray-300 hover:bg-gray-700'
            }`}
            title={isRecording ? '停止录制' : '开始录制'}
          >
            <CircleIcon size={18} />
          </button>

          <button
            onClick={onClearAnnotations}
            className="p-2 rounded text-gray-300 hover:bg-gray-700"
            title="清除所有标注"
          >
            <Trash2 size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
