import { PEER_CONNECTION_CONFIG, VIDEO_CONSTRAINTS, AUDIO_CONSTRAINTS } from '../config';
import socketService from './socket';

class WebRTCService {
  constructor() {
    this.peerConnection = null;
    this.localStream = null;
    this.remoteStream = null;
    this.dataChannel = null;
    this.deviceId = null;
    this.iceCandidates = [];
    this.isInitiator = false;
    this.listeners = new Map();
    this.currentBitrate = 2500000;
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);
    return () => this.off(event, callback);
  }

  off(event, callback) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).delete(callback);
    }
  }

  emit(event, data) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach((cb) => cb(data));
    }
  }

  async initializeLocalStream() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: VIDEO_CONSTRAINTS,
        audio: AUDIO_CONSTRAINTS,
      });

      this.localStream = stream;
      this.emit('localStream', stream);
      return stream;
    } catch (err) {
      console.error('[WebRTC] Failed to get local stream:', err);
      throw err;
    }
  }

  async initializeLocalStreamWithElement(videoElement) {
    const stream = await this.initializeLocalStream();
    if (videoElement) {
      videoElement.srcObject = stream;
    }
    return stream;
  }

  createPeerConnection(isInitiator = false) {
    this.isInitiator = isInitiator;
    this.iceCandidates = [];

    this.peerConnection = new RTCPeerConnection(PEER_CONNECTION_CONFIG);

    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        this.peerConnection.addTrack(track, this.localStream);
      });
    }

    this.dataChannel = this.peerConnection.createDataChannel('annotations', {
      ordered: true,
    });

    this.setupDataChannel(this.dataChannel);

    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.iceCandidates.push(event.candidate);
        socketService.send('webrtc:ice-candidate', {
          to: this.deviceId,
          candidate: event.candidate,
        });
      }
    };

    this.peerConnection.oniceconnectionstatechange = () => {
      const state = this.peerConnection.iceConnectionState;
      console.log('[WebRTC] ICE connection state:', state);
      this.emit('iceStateChange', state);

      if (state === 'failed') {
        this.peerConnection.restartIce();
      }
    };

    this.peerConnection.ontrack = (event) => {
      const [stream] = event.streams;
      this.remoteStream = stream;
      this.emit('remoteStream', stream);
    };

    this.peerConnection.ondatachannel = (event) => {
      const channel = event.channel;
      this.setupDataChannel(channel);
    };

    this.peerConnection.onconnectionstatechange = () => {
      const state = this.peerConnection.connectionState;
      console.log('[WebRTC] Connection state:', state);
      this.emit('connectionStateChange', state);
    };

    return this.peerConnection;
  }

  setupDataChannel(channel) {
    channel.onopen = () => {
      console.log('[WebRTC] Data channel opened');
      this.emit('dataChannelOpen');
    };

    channel.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.emit('dataMessage', data);
      } catch (e) {
        console.error('[WebRTC] Data channel message parse error:', e);
      }
    };

    channel.onerror = (err) => {
      console.error('[WebRTC] Data channel error:', err);
    };

    channel.onclose = () => {
      console.log('[WebRTC] Data channel closed');
      this.emit('dataChannelClose');
    };
  }

  async createOffer(deviceId) {
    this.deviceId = deviceId;

    if (!this.peerConnection) {
      this.createPeerConnection(true);
    }

    try {
      const offer = await this.peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      });

      await this.peerConnection.setLocalDescription(offer);

      socketService.send('webrtc:offer', {
        to: deviceId,
        offer,
      });

      console.log('[WebRTC] Offer sent to', deviceId);
      return offer;
    } catch (err) {
      console.error('[WebRTC] Failed to create offer:', err);
      throw err;
    }
  }

  async handleOffer(offer, from) {
    if (!this.peerConnection) {
      this.createPeerConnection(false);
    }

    try {
      await this.peerConnection.setRemoteDescription(
        new RTCSessionDescription(offer)
      );

      const answer = await this.peerConnection.createAnswer();
      await this.peerConnection.setLocalDescription(answer);

      socketService.send('webrtc:answer', {
        to: from,
        answer,
      });

      console.log('[WebRTC] Answer sent to', from);
      return answer;
    } catch (err) {
      console.error('[WebRTC] Failed to handle offer:', err);
      throw err;
    }
  }

  async handleAnswer(answer) {
    try {
      await this.peerConnection.setRemoteDescription(
        new RTCSessionDescription(answer)
      );
      console.log('[WebRTC] Remote description set from answer');
    } catch (err) {
      console.error('[WebRTC] Failed to handle answer:', err);
      throw err;
    }
  }

  async addIceCandidate(candidate) {
    try {
      await this.peerConnection.addIceCandidate(
        new RTCIceCandidate(candidate)
      );
    } catch (err) {
      console.error('[WebRTC] Failed to add ICE candidate:', err);
    }
  }

  sendData(data) {
    if (this.dataChannel && this.dataChannel.readyState === 'open') {
      this.dataChannel.send(JSON.stringify(data));
      return true;
    }
    return false;
  }

  async adjustBitrate(bitrate) {
    this.currentBitrate = bitrate;

    if (!this.peerConnection) return;

    const senders = this.peerConnection.getSenders();
    for (const sender of senders) {
      if (sender.track && sender.track.kind === 'video') {
        const params = sender.getParameters();
        if (!params.encodings) {
          params.encodings = [{}];
        }
        params.encodings[0].maxBitrate = bitrate;
        try {
          await sender.setParameters(params);
          console.log('[WebRTC] Bitrate adjusted to', bitrate);
        } catch (err) {
          console.error('[WebRTC] Failed to set bitrate:', err);
        }
      }
    }
  }

  async getStats() {
    if (!this.peerConnection) return null;

    try {
      const stats = await this.peerConnection.getStats();
      const result = {};

      stats.forEach((report) => {
        if (report.type === 'inbound-rtp' && report.kind === 'video') {
          result.bitrate = report.bitrate || 0;
          result.frameRate = report.framesPerSecond || 0;
          result.packetsLost = report.packetsLost || 0;
          result.jitter = report.jitter || 0;
        }
        if (report.type === 'candidate-pair' && report.nominated) {
          result.rtt = report.currentRoundTripTime || 0;
          result.availableOutgoingBitrate = report.availableOutgoingBitrate || 0;
        }
      });

      return result;
    } catch (err) {
      console.error('[WebRTC] Failed to get stats:', err);
      return null;
    }
  }

  setVideoEnabled(enabled) {
    if (this.localStream) {
      this.localStream.getVideoTracks().forEach((track) => {
        track.enabled = enabled;
      });
    }
  }

  setAudioEnabled(enabled) {
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((track) => {
        track.enabled = enabled;
      });
    }
  }

  close() {
    if (this.dataChannel) {
      this.dataChannel.close();
      this.dataChannel = null;
    }

    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }

    this.remoteStream = null;
    this.deviceId = null;
    this.iceCandidates = [];
    this.listeners.clear();
  }

  get isConnected() {
    return this.peerConnection?.connectionState === 'connected';
  }
}

const webRTCService = new WebRTCService();
export default webRTCService;
