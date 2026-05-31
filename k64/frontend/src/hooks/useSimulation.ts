import { useEffect, useRef, useCallback } from 'react';
import useSimulationStore, { type ScalarFrame } from '../store/useSimulationStore';

const N_PARTICLES = 1000;

export const positionsBuffer = new Float32Array(N_PARTICLES * 3);
export const speedsBuffer = new Float32Array(N_PARTICLES);

export function useSimulation() {
  const {
    isConnected,
    setScalarFrame,
    setConnected,
    setError,
    setElectricField,
    connect,
  } = useSimulationStore();

  const eventSourceRef = useRef<EventSource | null>(null);
  const positionsRef = useRef<Float32Array>(positionsBuffer);
  const speedsRef = useRef<Float32Array>(speedsBuffer);
  const frameCountRef = useRef(0);

  const handleMessage = useCallback((event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data);

      if (data.type === 'heartbeat') return;
      if (data.error) {
        setError(data.error);
        return;
      }

      const { positions, speeds, n_particles, E_x, E_y, E_z, ...scalar } = data;

      if (positions && n_particles) {
        const arr = positionsRef.current;
        const len = Math.min(arr.length, positions.length);
        arr.set(positions.slice(0, len));
      }

      if (speeds && n_particles) {
        const arr = speedsRef.current;
        const len = Math.min(arr.length, speeds.length);
        arr.set(speeds.slice(0, len));
      }

      if (E_x !== undefined && E_y !== undefined && E_z !== undefined) {
        setElectricField({ E_x, E_y, E_z });
      }

      frameCountRef.current++;
      if (frameCountRef.current % 2 === 0) {
        setScalarFrame({ ...scalar, E_x, E_y, E_z } as ScalarFrame);
      }
    } catch (e) {
      console.error('Parse error:', e);
    }
  }, [setScalarFrame, setError, setElectricField]);

  useEffect(() => {
    if (isConnected && !eventSourceRef.current) {
      try {
        const eventSource = new EventSource('/simulate');
        eventSourceRef.current = eventSource;

        eventSource.onopen = () => {
          setConnected(true);
        };

        eventSource.onmessage = handleMessage;

        eventSource.onerror = () => {
          if (eventSource.readyState === EventSource.CLOSED) {
            setError('连接断开');
            setConnected(false);
            eventSourceRef.current = null;
          }
        };
      } catch {
        setError('无法建立连接');
        setConnected(false);
      }
    }

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [isConnected, setScalarFrame, setConnected, setError, handleMessage]);

  return {
    connect,
    disconnect: () => useSimulationStore.getState().disconnect(),
    positionsRef,
    speedsRef,
  };
}

export async function setElectricField(E_x: number, E_y: number, E_z: number) {
  const res = await fetch('/electric_field', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ E_x, E_y, E_z }),
  });
  return res.json();
}

export async function getRecordingStatus() {
  const res = await fetch('/recording');
  return res.json();
}

export async function startRecording(record_every: number = 10) {
  const res = await fetch(`/recording/start?record_every=${record_every}`, {
    method: 'POST',
  });
  return res.json();
}

export async function stopRecording() {
  const res = await fetch('/recording/stop', { method: 'POST' });
  return res.json();
}

export async function clearRecording() {
  const res = await fetch('/recording/clear', { method: 'POST' });
  return res.json();
}

export async function exportGLTF() {
  const a = document.createElement('a');
  a.href = '/recording/export/gltf';
  a.download = 'trajectory.gltf';
  a.click();
}
