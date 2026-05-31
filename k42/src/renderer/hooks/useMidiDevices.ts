import { useEffect, useCallback } from 'react';
import type { MidiDevice, MidiMessage } from '@shared/index';
import { useMidiStore } from '../store/useMidiStore';
import { useAppStore } from '../store/useAppStore';
import { ipcMidi } from '../utils/ipc';

interface UseMidiDevicesReturn {
  devices: MidiDevice[];
  connectedDevices: MidiDevice[];
  connectedDeviceIds: string[];
  messageHistory: MidiMessage[];
  loading: boolean;
  error: string | null;
  refreshDevices: () => Promise<void>;
  connectDevice: (deviceId: string) => Promise<boolean>;
  disconnectDevice: (deviceId: string) => Promise<boolean>;
  clearHistory: () => void;
}

export function useMidiDevices(): UseMidiDevicesReturn {
  const {
    devices,
    connectedDeviceIds,
    messageHistory,
    loading,
    error,
    setDevices,
    addConnectedDeviceId,
    removeConnectedDeviceId,
    addMessage,
    clearMessageHistory,
    setLoading,
    setError,
    getConnectedDevices,
  } = useMidiStore();

  const { updateConfig } = useAppStore();

  const refreshDevices = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const deviceList = await ipcMidi.getDevices();
      setDevices(deviceList);
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取设备列表失败');
    } finally {
      setLoading(false);
    }
  }, [setDevices, setLoading, setError]);

  const connectDevice = useCallback(async (deviceId: string): Promise<boolean> => {
    try {
      setLoading(true);
      setError(null);
      const success = await ipcMidi.connectDevice(deviceId);
      if (success) {
        addConnectedDeviceId(deviceId);
        const newConnectedDeviceIds = useMidiStore.getState().connectedDeviceIds;
        updateConfig({ connectedDeviceIds: newConnectedDeviceIds });
      }
      return success;
    } catch (err) {
      setError(err instanceof Error ? err.message : '连接设备失败');
      return false;
    } finally {
      setLoading(false);
    }
  }, [addConnectedDeviceId, setLoading, setError, updateConfig]);

  const disconnectDevice = useCallback(async (deviceId: string): Promise<boolean> => {
    try {
      setLoading(true);
      setError(null);
      const success = await ipcMidi.disconnectDevice(deviceId);
      if (success) {
        removeConnectedDeviceId(deviceId);
        const newConnectedDeviceIds = useMidiStore.getState().connectedDeviceIds;
        updateConfig({ connectedDeviceIds: newConnectedDeviceIds });
      }
      return success;
    } catch (err) {
      setError(err instanceof Error ? err.message : '断开设备失败');
      return false;
    } finally {
      setLoading(false);
    }
  }, [removeConnectedDeviceId, setLoading, setError, updateConfig]);

  const clearHistory = useCallback(() => {
    clearMessageHistory();
  }, [clearMessageHistory]);

  useEffect(() => {
    refreshDevices();

    const handleMessage = (message: MidiMessage) => {
      addMessage(message);
    };

    ipcMidi.onMessage(handleMessage);

    const interval = setInterval(() => {
      refreshDevices();
    }, 5000);

    return () => {
      clearInterval(interval);
      ipcMidi.removeAllListeners();
    };
  }, [refreshDevices, addMessage]);

  return {
    devices,
    connectedDevices: getConnectedDevices(),
    connectedDeviceIds,
    messageHistory,
    loading,
    error,
    refreshDevices,
    connectDevice,
    disconnectDevice,
    clearHistory,
  };
}

export default useMidiDevices;
