import React, { useEffect, useRef, useState } from 'react';
import useAIStore from '../store/aiStore';
import { Check, X, Sparkles, Sliders } from 'lucide-react';

export default function DetectionOverlay({ videoElement, videoWidth, videoHeight }) {
  const canvasRef = useRef(null);
  const [showPanel, setShowPanel] = useState(false);

  const isEnabled = useAIStore((s) => s.isEnabled);
  const detections = useAIStore((s) => s.detections);
  const acceptedDetections = useAIStore((s) => s.acceptedDetections);
  const pendingDetections = useAIStore((s) => s.pendingDetections);
  const acceptDetection = useAIStore((s) => s.acceptDetection);
  const rejectDetection = useAIStore((s) => s.rejectDetection);
  const confidenceThreshold = useAIStore((s) => s.confidenceThreshold);
  const setConfidenceThreshold = useAIStore((s) => s.setConfidenceThreshold);
  const autoAccept = useAIStore((s) => s.autoAccept);
  const setAutoAccept = useAIStore((s) => s.setAutoAccept);
  const isReady = useAIStore((s) => s.isReady);
  const mockMode = useAIStore((s) => s.mockMode);

  const canvasWidth = videoWidth || 1280;
  const canvasHeight = videoHeight || 720;

  const drawBBox = (ctx, detection, scaleX, scaleY, isAccepted = false, isPending = false) => {
    const { bbox, color, label, confidence } = detection;

    const x = bbox.x * scaleX;
    const y = bbox.y * scaleY;
    const w = bbox.width * scaleX;
    const h = bbox.height * scaleY;

    ctx.save();

    if (isAccepted) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.setLineDash([]);
      ctx.shadowColor = color;
      ctx.shadowBlur = 8;
    } else if (isPending) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.shadowColor = color;
      ctx.shadowBlur = 4;
    } else {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.setLineDash([]);
    }

    ctx.strokeRect(x, y, w, h);

    ctx.setLineDash([]);
    ctx.shadowBlur = 0;

    const labelText = `${label} ${(confidence * 100).toFixed(0)}%`;
    ctx.font = 'bold 12px Arial';
    const textWidth = ctx.measureText(labelText).width;
    const textHeight = 16;
    const padding = 4;

    ctx.fillStyle = color;
    ctx.fillRect(x, y - textHeight - padding * 2, textWidth + padding * 2, textHeight + padding * 2);

    ctx.fillStyle = '#ffffff';
    ctx.fillText(labelText, x + padding, y - padding);

    ctx.restore();
  };

  const drawContour = (ctx, detection, scaleX, scaleY) => {
    const { bbox, color } = detection;

    const cx = (bbox.x + bbox.width / 2) * scaleX;
    const cy = (bbox.y + bbox.height / 2) * scaleY;
    const rx = (bbox.width / 2) * scaleX;
    const ry = (bbox.height / 2) * scaleY;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.setLineDash([3, 3]);
    ctx.globalAlpha = 0.6;

    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const x1 = cx + Math.cos(angle) * rx;
      const y1 = cy + Math.sin(angle) * ry;
      const angle2 = ((i + 1) / 8) * Math.PI * 2;
      const x2 = cx + Math.cos(angle2) * rx;
      const y2 = cy + Math.sin(angle2) * ry;

      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }

    ctx.restore();
  };

  useEffect(() => {
    if (!canvasRef.current || !isEnabled) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    const scaleX = canvasWidth / 1280;
    const scaleY = canvasHeight / 720;

    acceptedDetections.forEach((det) => {
      drawBBox(ctx, det, scaleX, scaleY, true, false);
    });

    if (!autoAccept) {
      pendingDetections.forEach((det) => {
        drawBBox(ctx, det, scaleX, scaleY, false, true);
      });
    }
  }, [detections, acceptedDetections, pendingDetections, isEnabled, canvasWidth, canvasHeight, autoAccept]);

  const handleAccept = (detection) => {
    acceptDetection(detection);
  };

  const handleReject = (detection) => {
    rejectDetection(detection.id);
  };

  const handleAcceptAll = () => {
    pendingDetections.forEach((det) => acceptDetection(det));
  };

  const handleRejectAll = () => {
    pendingDetections.forEach((det) => rejectDetection(det.id));
  };

  return (
    <>
      <canvas
        ref={canvasRef}
        width={canvasWidth}
        height={canvasHeight}
        className="absolute inset-0 pointer-events-none"
        style={{ zIndex: 20 }}
      />

      {isEnabled && isReady && (
        <div className="absolute top-4 right-4 z-30">
          <button
            onClick={() => setShowPanel(!showPanel)}
            className={`px-3 py-1.5 rounded-lg text-sm flex items-center gap-2 ${
              mockMode ? 'bg-yellow-600 text-white' : 'bg-blue-600 text-white'
            }`}
          >
            <Sparkles size={16} />
            AI检测 {mockMode ? '(模拟)' : ''}
            {pendingDetections.length > 0 && (
              <span className="bg-red-500 px-1.5 py-0.5 rounded text-xs">
                {pendingDetections.length}
              </span>
            )}
          </button>
        </div>
      )}

      {showPanel && (
        <div className="absolute top-16 right-4 z-40 w-80 bg-gray-900 border border-gray-700 rounded-lg shadow-xl">
          <div className="p-3 border-b border-gray-700">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-white font-semibold flex items-center gap-2">
                <Sliders size={16} />
                AI 检测设置
              </h3>
              <button
                onClick={() => setShowPanel(false)}
                className="text-gray-400 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-gray-300 text-sm mb-1">
                  置信度阈值: {(confidenceThreshold * 100).toFixed(0)}%
                </label>
                <input
                  type="range"
                  min="0.3"
                  max="0.9"
                  step="0.05"
                  value={confidenceThreshold}
                  onChange={(e) => setConfidenceThreshold(parseFloat(e.target.value))}
                  className="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer"
                />
              </div>

              <label className="flex items-center gap-2 text-gray-300 text-sm">
                <input
                  type="checkbox"
                  checked={autoAccept}
                  onChange={(e) => setAutoAccept(e.target.checked)}
                  className="rounded"
                />
                自动采纳所有检测结果
              </label>
            </div>
          </div>

          {!autoAccept && pendingDetections.length > 0 && (
            <div className="p-3 border-b border-gray-700">
              <div className="flex items-center justify-between mb-2">
                <span className="text-gray-300 text-sm">待处理检测</span>
                <div className="flex gap-2">
                  <button
                    onClick={handleAcceptAll}
                    className="px-2 py-1 bg-green-600 hover:bg-green-700 text-white text-xs rounded"
                  >
                    全部采纳
                  </button>
                  <button
                    onClick={handleRejectAll}
                    className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white text-xs rounded"
                  >
                    全部拒绝
                  </button>
                </div>
              </div>

              <div className="space-y-2 max-h-48 overflow-y-auto">
                {pendingDetections.map((det) => (
                  <div
                    key={det.id}
                    className="p-2 bg-gray-800 rounded flex items-center justify-between"
                  >
                    <div>
                      <span
                        className="inline-block w-3 h-3 rounded mr-2"
                        style={{ backgroundColor: det.color }}
                      />
                      <span className="text-white text-sm">{det.label}</span>
                      <span className="text-gray-400 text-xs ml-2">
                        {(det.confidence * 100).toFixed(0)}%
                      </span>
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => handleAccept(det)}
                        className="p-1 text-green-400 hover:text-green-300"
                        title="采纳"
                      >
                        <Check size={14} />
                      </button>
                      <button
                        onClick={() => handleReject(det)}
                        className="p-1 text-red-400 hover:text-red-300"
                        title="拒绝"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {acceptedDetections.length > 0 && (
            <div className="p-3">
              <span className="text-gray-300 text-sm mb-2 block">已采纳检测</span>
              <div className="space-y-1">
                {acceptedDetections.map((det) => (
                  <div key={det.id} className="flex items-center text-sm">
                    <span
                      className="inline-block w-3 h-3 rounded mr-2"
                      style={{ backgroundColor: det.color }}
                    />
                    <span className="text-white">{det.label}</span>
                    <span className="text-gray-400 text-xs ml-2">
                      {(det.confidence * 100).toFixed(0)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
