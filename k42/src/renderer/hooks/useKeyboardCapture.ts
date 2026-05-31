import { useState, useEffect, useCallback, useRef } from 'react';
import type { KeyboardAction } from '@shared/index';
import {
  eventToKeys,
  sortKeys,
  keysToDisplay,
  createKeyboardAction,
} from '../utils/keyboard';

interface UseKeyboardCaptureOptions {
  enabled?: boolean;
  captureOnInput?: boolean;
  timeoutMs?: number;
  onCapture?: (keys: string[], action: KeyboardAction) => void;
  onTimeout?: () => void;
}

interface UseKeyboardCaptureReturn {
  capturing: boolean;
  currentKeys: string[];
  capturedKeys: string[];
  capturedAction: KeyboardAction | null;
  displayText: string;
  timeRemaining: number;
  startCapture: () => void;
  stopCapture: () => void;
  resetCapture: () => void;
}

export function useKeyboardCapture(
  options: UseKeyboardCaptureOptions = {}
): UseKeyboardCaptureReturn {
  const {
    enabled = true,
    captureOnInput = false,
    timeoutMs = 10000,
    onCapture,
    onTimeout,
  } = options;

  const [capturing, setCapturing] = useState(false);
  const [currentKeys, setCurrentKeys] = useState<string[]>([]);
  const [capturedKeys, setCapturedKeys] = useState<string[]>([]);
  const [capturedAction, setCapturedAction] = useState<KeyboardAction | null>(null);
  const [timeRemaining, setTimeRemaining] = useState(0);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);

  const clearTimers = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
  }, []);

  const startCapture = useCallback(() => {
    if (!enabled) return;

    clearTimers();
    setCurrentKeys([]);
    setCapturedKeys([]);
    setCapturedAction(null);
    setCapturing(true);
    setTimeRemaining(timeoutMs);
    startTimeRef.current = Date.now();

    countdownRef.current = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      const remaining = Math.max(0, timeoutMs - elapsed);
      setTimeRemaining(remaining);
    }, 100);

    timerRef.current = setTimeout(() => {
      stopCapture();
      onTimeout?.();
    }, timeoutMs);
  }, [enabled, timeoutMs, clearTimers, onTimeout]);

  const stopCapture = useCallback(() => {
    clearTimers();
    setCapturing(false);
    setCurrentKeys([]);
    setTimeRemaining(0);
  }, [clearTimers]);

  const resetCapture = useCallback(() => {
    clearTimers();
    setCapturing(false);
    setCurrentKeys([]);
    setCapturedKeys([]);
    setCapturedAction(null);
    setTimeRemaining(0);
  }, [clearTimers]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!capturing || !enabled) return;

      const target = e.target as HTMLElement;
      const isInput =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable;

      if (isInput && !captureOnInput) return;

      e.preventDefault();
      e.stopPropagation();

      const keys = eventToKeys(e);
      setCurrentKeys(keys);
    },
    [capturing, enabled, captureOnInput]
  );

  const handleKeyUp = useCallback(
    (e: KeyboardEvent) => {
      if (!capturing || !enabled) return;

      const target = e.target as HTMLElement;
      const isInput =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable;

      if (isInput && !captureOnInput) return;

      e.preventDefault();
      e.stopPropagation();

      const keys = eventToKeys(e);
      if (keys.length > 0) {
        const sortedKeys = sortKeys(keys);
        const action = createKeyboardAction(sortedKeys);

        clearTimers();
        setCapturedKeys(sortedKeys);
        setCapturedAction(action);
        setCurrentKeys([]);
        setCapturing(false);
        setTimeRemaining(0);

        onCapture?.(sortedKeys, action);
      }
    },
    [capturing, enabled, captureOnInput, clearTimers, onCapture]
  );

  useEffect(() => {
    if (!capturing) return;

    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('keyup', handleKeyUp, true);

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('keyup', handleKeyUp, true);
    };
  }, [capturing, handleKeyDown, handleKeyUp]);

  useEffect(() => {
    return () => {
      clearTimers();
    };
  }, [clearTimers]);

  const displayText = capturing
    ? keysToDisplay(currentKeys) || '按下快捷键组合...'
    : capturedKeys.length > 0
    ? keysToDisplay(capturedKeys)
    : '';

  return {
    capturing,
    currentKeys,
    capturedKeys,
    capturedAction,
    displayText,
    timeRemaining,
    startCapture,
    stopCapture,
    resetCapture,
  };
}

export default useKeyboardCapture;
