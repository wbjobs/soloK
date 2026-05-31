import { useState, useEffect, useCallback, useRef } from 'react';
import type { MidiMessage, MidiTrigger } from '@shared/index';
import { useMidiStore } from '../store/useMidiStore';
import { ipcMidi } from '../utils/ipc';
import { midiMessageToTrigger } from '../utils/midi';

interface UseLearnModeOptions {
  timeoutMs?: number;
  onLearned?: (trigger: MidiTrigger, message: MidiMessage) => void;
  onTimeout?: () => void;
  onCancel?: () => void;
}

interface UseLearnModeReturn {
  learning: boolean;
  learnedMessage: MidiMessage | null;
  learnedTrigger: MidiTrigger | null;
  timeRemaining: number;
  startLearning: (timeoutMs?: number) => Promise<void>;
  stopLearning: () => Promise<void>;
  resetLearned: () => void;
}

export function useLearnMode(options: UseLearnModeOptions = {}): UseLearnModeReturn {
  const { timeoutMs: defaultTimeoutMs = 10000, onLearned, onTimeout, onCancel } = options;

  const {
    learning,
    learnedMessage,
    setLearning,
    setLearnedMessage,
  } = useMidiStore();

  const [learnedTrigger, setLearnedTrigger] = useState<MidiTrigger | null>(null);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownRef = useRef<NodeJS.Timeout | null>(null);
  const timeoutMsRef = useRef(defaultTimeoutMs);

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

  const startLearning = useCallback(async (timeoutMs?: number): Promise<void> => {
    const timeout = timeoutMs ?? defaultTimeoutMs;
    timeoutMsRef.current = timeout;

    try {
      clearTimers();
      setLearnedMessage(null);
      setLearnedTrigger(null);
      setTimeRemaining(timeout);
      await ipcMidi.startLearn(timeout);
      setLearning(true);

      const startTime = Date.now();
      countdownRef.current = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const remaining = Math.max(0, timeout - elapsed);
        setTimeRemaining(remaining);
      }, 100);

      timerRef.current = setTimeout(() => {
        stopLearning();
        onTimeout?.();
      }, timeout);
    } catch (err) {
      console.error('Failed to start learn mode:', err);
    }
  }, [defaultTimeoutMs, clearTimers, setLearning, setLearnedMessage, onTimeout]);

  const stopLearning = useCallback(async (): Promise<void> => {
    try {
      clearTimers();
      await ipcMidi.stopLearn();
      setLearning(false);
      setTimeRemaining(0);
    } catch (err) {
      console.error('Failed to stop learn mode:', err);
    }
  }, [clearTimers, setLearning]);

  const resetLearned = useCallback(() => {
    setLearnedMessage(null);
    setLearnedTrigger(null);
  }, [setLearnedMessage]);

  useEffect(() => {
    if (!learning) return;

    const handleLearned = (message: MidiMessage) => {
      clearTimers();
      setLearnedMessage(message);
      const trigger = midiMessageToTrigger(message);
      if (trigger) {
        setLearnedTrigger(trigger);
        onLearned?.(trigger, message);
      }
      setLearning(false);
      setTimeRemaining(0);
    };

    ipcMidi.onLearned(handleLearned);

    return () => {
      ipcMidi.removeAllListeners();
    };
  }, [learning, clearTimers, setLearnedMessage, setLearning, onLearned]);

  useEffect(() => {
    return () => {
      clearTimers();
      if (learning) {
        onCancel?.();
        ipcMidi.stopLearn();
      }
    };
  }, [clearTimers, learning, onCancel]);

  return {
    learning,
    learnedMessage,
    learnedTrigger,
    timeRemaining,
    startLearning,
    stopLearning,
    resetLearned,
  };
}

export default useLearnMode;
