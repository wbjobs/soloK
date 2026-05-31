import { useEffect, useRef, useCallback } from 'react';
import webRTCService from '../services/webrtc';
import socketService from '../services/socket';
import useRoomStore from '../store/roomStore';

export function useWebRTC() {
  const store = useRoomStore();
  const peerRef = useRef(null);
  const statsIntervalRef = useRef(null);

  const initializeLocalStream = useCallback(async (videoElement) => {
    try {
      const stream = await webRTCService.initializeLocalStreamWithElement(videoElement);
      store.setLocalStream(stream);
      return stream;
    } catch (err) {
      console.error('[useWebRTC] Stream init failed:', err);
      throw err;
    }
  }, [store]);

  const createPeerConnection = useCallback((isInitiator) => {
    const pc = webRTCService.createPeerConnection(isInitiator);
    peerRef.current = pc;
    return pc;
  }, []);

  const createOffer = useCallback(async (deviceId) => {
    try {
      await webRTCService.createOffer(deviceId);
    } catch (err) {
      console.error('[useWebRTC] Offer failed:', err);
    }
  }, []);

  const handleOffer = useCallback(async (offer, from) => {
    try {
      await webRTCService.handleOffer(offer, from);
    } catch (err) {
      console.error('[useWebRTC] Handle offer failed:', err);
    }
  }, []);

  const handleAnswer = useCallback(async (answer) => {
    try {
      await webRTCService.handleAnswer(answer);
    } catch (err) {
      console.error('[useWebRTC] Handle answer failed:', err);
    }
  }, []);

  const addIceCandidate = useCallback(async (candidate) => {
    await webRTCService.addIceCandidate(candidate);
  }, []);

  const sendData = useCallback((data) => {
    return webRTCService.sendData(data);
  }, []);

  const adjustBitrate = useCallback(async (bitrate) => {
    await webRTCService.adjustBitrate(bitrate);
    store.setCurrentBitrate(bitrate);
  }, [store]);

  const close = useCallback(() => {
    webRTCService.close();
    peerRef.current = null;
    if (statsIntervalRef.current) {
      clearInterval(statsIntervalRef.current);
      statsIntervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    const onRemoteStream = (stream) => {
      store.setRemoteStream('remote', stream);
    };

    const onLocalStream = (stream) => {
      store.setLocalStream(stream);
    };

    const onIceStateChange = (state) => {
      if (state === 'connected') {
        store.setConnected(true);
      } else if (state === 'disconnected' || state === 'failed' || state === 'closed') {
        store.setConnected(false);
      }
    };

    const onConnectionStateChange = (state) => {
      if (state === 'connected') {
        store.setConnected(true);
      }
    };

    const onDataChannelOpen = () => {
      console.log('[useWebRTC] Data channel ready');
    };

    const onDataMessage = (data) => {
      if (data.type === 'annotation') {
        store.addAnnotation(data.payload);
      } else if (data.type === 'measurement') {
        store.addMeasurement(data.payload);
      }
    };

    const unsub1 = webRTCService.on('remoteStream', onRemoteStream);
    const unsub2 = webRTCService.on('localStream', onLocalStream);
    const unsub3 = webRTCService.on('iceStateChange', onIceStateChange);
    const unsub4 = webRTCService.on('connectionStateChange', onConnectionStateChange);
    const unsub5 = webRTCService.on('dataChannelOpen', onDataChannelOpen);
    const unsub6 = webRTCService.on('dataMessage', onDataMessage);

    return () => {
      unsub1?.();
      unsub2?.();
      unsub3?.();
      unsub4?.();
      unsub5?.();
      unsub6?.();
    };
  }, [store]);

  useEffect(() => {
    const startStatsInterval = () => {
      if (statsIntervalRef.current) {
        clearInterval(statsIntervalRef.current);
      }
      statsIntervalRef.current = setInterval(async () => {
        const stats = await webRTCService.getStats();
        if (stats) {
          if (stats.rtt) {
            let quality = 'good';
            if (stats.rtt > 300 || (stats.packetsLost || 0) > 5) {
              quality = 'poor';
            } else if (stats.rtt > 150 || (stats.packetsLost || 0) > 2) {
              quality = 'fair';
            } else if (stats.rtt < 100 && (stats.packetsLost || 0) === 0) {
              quality = 'excellent';
            }
            store.setNetworkQuality(quality);

            if (store.roomId) {
              socketService.send('network:stats', {
                roomId: store.roomId,
                stats: {
                  rtt: stats.rtt,
                  packetLoss: stats.packetsLost || 0,
                  bandwidth: stats.availableOutgoingBitrate || stats.bitrate || 0,
                },
              });
            }
          }
        }
      }, 2000);
    };

    if (store.isConnected) {
      startStatsInterval();
    } else if (statsIntervalRef.current) {
      clearInterval(statsIntervalRef.current);
      statsIntervalRef.current = null;
    }

    return () => {
      if (statsIntervalRef.current) {
        clearInterval(statsIntervalRef.current);
      }
    };
  }, [store.isConnected, store.roomId]);

  return {
    initializeLocalStream,
    createPeerConnection,
    createOffer,
    handleOffer,
    handleAnswer,
    addIceCandidate,
    sendData,
    adjustBitrate,
    close,
    peerConnection: peerRef.current,
    isConnected: webRTCService.isConnected,
  };
}
