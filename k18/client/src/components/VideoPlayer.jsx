import React, { useRef, useEffect, useState, forwardRef, useImperativeHandle } from 'react';
import AnnotationCanvas from './AnnotationCanvas';
import DetectionOverlay from './DetectionOverlay';
import useRoomStore from '../store/roomStore';
import { Wifi, WifiOff, Users, Video, VideoOff, Mic, MicOff } from 'lucide-react';

const VideoPlayer = forwardRef(function VideoPlayer({
  stream,
  isLocal = false,
  muted = false,
  showControls = true,
  showOverlay = true,
  onDeleteAnnotation,
  aiEnabled = false,
}, ref) {
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const [canvasSize, setCanvasSize] = useState({ width: 1280, height: 720 });
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);

  useImperativeHandle(ref, () => videoRef.current);

  const networkQuality = useRoomStore((s) => s.networkQuality);
  const isFrozen = useRoomStore((s) => s.isFrozen);
  const experts = useRoomStore((s) => s.experts);
  const remoteStreams = useRoomStore((s) => s.remoteStreams);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  useEffect(() => {
    if (containerRef.current) {
      const updateSize = () => {
        const rect = containerRef.current.getBoundingClientRect();
        setCanvasSize({ width: rect.width, height: rect.height });
      };
      updateSize();
      const observer = new ResizeObserver(updateSize);
      observer.observe(containerRef.current);
      return () => observer.disconnect();
    }
  }, []);

  const toggleVideo = () => {
    if (stream) {
      stream.getVideoTracks().forEach((t) => {
        t.enabled = !t.enabled;
      });
      setIsVideoEnabled(!isVideoEnabled);
    }
  };

  const toggleAudio = () => {
    if (stream) {
      stream.getAudioTracks().forEach((t) => {
        t.enabled = !t.enabled;
      });
      setIsAudioEnabled(!isAudioEnabled);
    }
  };

  const getQualityColor = () => {
    switch (networkQuality) {
      case 'excellent': return 'text-green-400';
      case 'good': return 'text-green-500';
      case 'fair': return 'text-yellow-400';
      case 'poor': return 'text-red-400';
      default: return 'text-gray-400';
    }
  };

  const getQualityIcon = () => {
    if (networkQuality === 'poor') return <WifiOff size={16} />;
    return <Wifi size={16} />;
  };

  return (
    <div ref={containerRef} className="relative w-full h-full bg-black rounded-lg overflow-hidden">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={muted}
        className="w-full h-full object-contain"
      />

      {showOverlay && (
        <AnnotationCanvas
          videoElement={videoRef.current}
          canvasWidth={canvasSize.width}
          canvasHeight={canvasSize.height}
          isFrozen={isFrozen}
          onDeleteAnnotation={onDeleteAnnotation}
        />
      )}

      {aiEnabled && (
        <DetectionOverlay
          videoElement={videoRef.current}
          videoWidth={canvasSize.width}
          videoHeight={canvasSize.height}
        />
      )}

      {isFrozen && (
        <div className="absolute top-4 left-4 bg-yellow-500 text-white px-3 py-1 rounded text-sm font-medium">
          已冻结
        </div>
      )}

      {showControls && (
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={toggleVideo}
                className="p-2 rounded bg-white/20 hover:bg-white/30 text-white transition-colors"
              >
                {isVideoEnabled ? <Video size={18} /> : <VideoOff size={18} />}
              </button>

              <button
                onClick={toggleAudio}
                className="p-2 rounded bg-white/20 hover:bg-white/30 text-white transition-colors"
              >
                {isAudioEnabled ? <Mic size={18} /> : <MicOff size={18} />}
              </button>
            </div>

            <div className="flex items-center gap-3">
              {experts.length > 0 && (
                <div className="flex items-center gap-1 text-white/80 text-sm">
                  <Users size={14} />
                  <span>{experts.length} 专家</span>
                </div>
              )}

              <div className={`flex items-center gap-1 ${getQualityColor()}`}>
                {getQualityIcon()}
              </div>
            </div>
          </div>
        </div>
      )}

      {isLocal && (
        <div className="absolute top-2 right-2 bg-green-500 text-white px-2 py-1 rounded text-xs">
          本地预览
        </div>
      )}
    </div>
  );
});

export default VideoPlayer;
