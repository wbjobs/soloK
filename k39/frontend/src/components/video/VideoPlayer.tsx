import { useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import videojs from 'video.js';
import type Player from 'video.js/dist/types/player';
import { CameraType } from '../../types';
import 'video.js/dist/video-js.css';

export interface VideoPlayerProps {
  src: string;
  poster?: string;
  cameras?: Record<CameraType, string>;
  initialCamera?: CameraType;
  onTimeUpdate?: (currentTime: number) => void;
  onPlay?: () => void;
  onPause?: () => void;
  onEnded?: () => void;
  onReady?: (player: Player) => void;
}

export interface VideoPlayerHandle {
  playerRef: React.MutableRefObject<Player | null>;
  seekTo: (time: number) => void;
  switchCamera: (camera: CameraType) => void;
  getCurrentTime: () => number;
  play: () => void;
  pause: () => void;
}

const VideoPlayer = forwardRef<VideoPlayerHandle, VideoPlayerProps>(
  ({ src, poster, cameras, initialCamera, onTimeUpdate, onPlay, onPause, onEnded, onReady }, ref) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const playerRef = useRef<Player | null>(null);
    const callbacksRef = useRef({ onTimeUpdate, onPlay, onPause, onEnded });

    useEffect(() => {
      callbacksRef.current = { onTimeUpdate, onPlay, onPause, onEnded };
    }, [onTimeUpdate, onPlay, onPause, onEnded]);

    const seekTo = useCallback((time: number) => {
      if (playerRef.current) {
        playerRef.current.currentTime(time);
      }
    }, []);

    const switchCamera = useCallback((camera: CameraType) => {
      if (playerRef.current && cameras) {
        const newSrc = cameras[camera];
        if (newSrc) {
          const wasPlaying = !playerRef.current.paused();
          const currentTime = playerRef.current.currentTime();
          playerRef.current.src({ src: newSrc, type: 'video/mp4' });
          playerRef.current.currentTime(currentTime);
          if (wasPlaying) {
            playerRef.current.play();
          }
        }
      }
    }, [cameras]);

    const getCurrentTime = useCallback(() => {
      return playerRef.current?.currentTime() ?? 0;
    }, []);

    const play = useCallback(() => {
      playerRef.current?.play();
    }, []);

    const pause = useCallback(() => {
      playerRef.current?.pause();
    }, []);

    useImperativeHandle(ref, () => ({
      playerRef,
      seekTo,
      switchCamera,
      getCurrentTime,
      play,
      pause,
    }), [seekTo, switchCamera, getCurrentTime, play, pause]);

    useEffect(() => {
      if (!videoRef.current) return;

      const effectiveSrc = cameras && initialCamera && cameras[initialCamera]
        ? cameras[initialCamera]
        : src;

      const player = videojs(videoRef.current, {
        controls: true,
        autoplay: false,
        preload: 'auto',
        fluid: true,
        aspectRatio: '16:9',
        poster: poster || '',
        sources: [{ src: effectiveSrc, type: 'video/mp4' }],
        controlBar: {
          children: [
            'playToggle',
            'volumePanel',
            'currentTimeDisplay',
            'timeDivider',
            'durationDisplay',
            'progressControl',
            'remainingTimeDisplay',
            'fullscreenToggle',
          ],
        },
      });

      playerRef.current = player;

      player.on('timeupdate', () => {
        callbacksRef.current.onTimeUpdate?.(player.currentTime() ?? 0);
      });

      player.on('play', () => {
        callbacksRef.current.onPlay?.();
      });

      player.on('pause', () => {
        callbacksRef.current.onPause?.();
      });

      player.on('ended', () => {
        callbacksRef.current.onEnded?.();
      });

      player.ready(() => {
        onReady?.(player);
      });

      return () => {
        player.dispose();
        playerRef.current = null;
      };
    }, []);

    useEffect(() => {
      if (playerRef.current && src) {
        playerRef.current.src({ src, type: 'video/mp4' });
      }
    }, [src]);

    return (
      <div data-vjs-player className="w-full">
        <video
          ref={videoRef}
          className="video-js vjs-big-play-centered vjs-theme-fantasy"
          playsInline
        />
      </div>
    );
  }
);

VideoPlayer.displayName = 'VideoPlayer';

export default VideoPlayer;
