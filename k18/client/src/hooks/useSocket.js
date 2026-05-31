import { useEffect, useRef, useCallback } from 'react';
import socketService from '../services/socket';
import useRoomStore from '../store/roomStore';

export function useSocket() {
  const store = useRoomStore();
  const listenersRef = useRef([]);

  const connect = useCallback(async (token) => {
    try {
      await socketService.connect(token);
      store.setConnected(true);
    } catch (err) {
      console.error('[useSocket] Connection failed:', err);
      store.setConnected(false);
    }
  }, [store]);

  const disconnect = useCallback(() => {
    socketService.disconnect();
    store.setConnected(false);
  }, [store]);

  const on = useCallback((event, callback) => {
    const unsub = socketService.on(event, callback);
    listenersRef.current.push(unsub);
    return unsub;
  }, []);

  const send = useCallback((event, data) => {
    socketService.send(event, data);
  }, []);

  useEffect(() => {
    const onDisconnected = ({ reason }) => {
      store.setConnected(false);
      if (reason === 'io server disconnect' || reason === 'io client disconnect') {
        return;
      }
      store.setReconnectionState('disconnected');
    };

    const onReconnecting = ({ attemptNumber }) => {
      store.setReconnectionState('reconnecting');
    };

    const onReconnected = ({ attemptNumber }) => {
      store.setReconnectionState('connected');
      if (store.roomId) {
        send('expert:join', {
          roomId: store.roomId,
          expertName: store.user?.username || 'Expert',
          expertId: socketService.id,
        });
        send('room:state', { roomId: store.roomId });
      }
    };

    on('disconnected', onDisconnected);
    on('reconnecting', onReconnecting);
    on('reconnected', onReconnected);

    return () => {
      listenersRef.current.forEach((unsub) => unsub());
      listenersRef.current = [];
    };
  }, [on, send, store]);

  return { connect, disconnect, on, send, isConnected: store.isConnected };
}
