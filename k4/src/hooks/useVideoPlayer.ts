import { useState, useRef, useCallback } from 'react';

export function useVideoPlayer() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const play = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.play();
      setIsPlaying(true);
    }
  }, []);

  const pause = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  }, []);

  const togglePlay = useCallback(() => {
    if (isPlaying) {
      pause();
    } else {
      play();
    }
  }, [isPlaying, play, pause]);

  const seekTo = useCallback((time: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      setCurrentTime(time);
    }
  }, []);

  const stepFrame = useCallback((direction: 'forward' | 'backward') => {
    if (videoRef.current) {
      const frameTime = 1 / 30;
      const newTime = direction === 'forward' 
        ? Math.min(videoRef.current.currentTime + frameTime, duration)
        : Math.max(videoRef.current.currentTime - frameTime, 0);
      seekTo(newTime);
    }
  }, [duration, seekTo]);

  const handleTimeUpdate = useCallback(() => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  }, []);

  const handleLoadedMetadata = useCallback(() => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
    }
  }, []);

  const handleEnded = useCallback(() => {
    setIsPlaying(false);
  }, []);

  return {
    videoRef,
    isPlaying,
    currentTime,
    duration,
    play,
    pause,
    togglePlay,
    seekTo,
    stepFrame,
    handleTimeUpdate,
    handleLoadedMetadata,
    handleEnded,
  };
}
