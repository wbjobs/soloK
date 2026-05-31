const config = require('../config');

class NetworkAdapter {
  constructor() {
    this.baseBitrate = config.videoBitrate.base;
    this.minBitrate = config.videoBitrate.min;
    this.maxBitrate = config.videoBitrate.max;
    this.clients = new Map();
  }

  registerClient(clientId, roomId) {
    this.clients.set(clientId, {
      roomId,
      currentBitrate: this.baseBitrate,
      bandwidth: 0,
      packetLoss: 0,
      rtt: 0,
      lastUpdate: Date.now(),
      history: [],
    });
  }

  unregisterClient(clientId) {
    this.clients.delete(clientId);
  }

  updateStats(clientId, stats) {
    const client = this.clients.get(clientId);
    if (!client) return null;

    client.bandwidth = stats.bandwidth || client.bandwidth;
    client.packetLoss = stats.packetLoss || client.packetLoss;
    client.rtt = stats.rtt || client.rtt;
    client.lastUpdate = Date.now();

    client.history.push({
      timestamp: Date.now(),
      bandwidth: client.bandwidth,
      packetLoss: client.packetLoss,
      rtt: client.rtt,
    });

    if (client.history.length > 60) {
      client.history.shift();
    }

    const newBitrate = this.calculateBitrate(client);
    client.currentBitrate = newBitrate;

    return {
      currentBitrate: newBitrate,
      shouldAdjust: Math.abs(newBitrate - client.currentBitrate) > 100000,
    };
  }

  calculateBitrate(client) {
    let bitrate = this.baseBitrate;

    if (client.bandwidth > 0) {
      if (client.bandwidth < 1000000) {
        bitrate = this.minBitrate;
      } else if (client.bandwidth < 2000000) {
        bitrate = 1000000;
      } else if (client.bandwidth < 4000000) {
        bitrate = 2000000;
      } else {
        bitrate = this.maxBitrate;
      }
    }

    if (client.packetLoss > 5) {
      bitrate = Math.max(this.minBitrate, bitrate * 0.7);
    } else if (client.packetLoss > 2) {
      bitrate = Math.max(this.minBitrate, bitrate * 0.9);
    }

    if (client.rtt > 300) {
      bitrate = Math.max(this.minBitrate, bitrate * 0.8);
    } else if (client.rtt > 150) {
      bitrate = Math.max(this.minBitrate, bitrate * 0.95);
    }

    return Math.floor(Math.max(this.minBitrate, Math.min(this.maxBitrate, bitrate)));
  }

  getClientState(clientId) {
    return this.clients.get(clientId) || null;
  }

  getRoomClients(roomId) {
    return Array.from(this.clients.values())
      .filter((c) => c.roomId === roomId)
      .map((c) => ({
        currentBitrate: c.currentBitrate,
        bandwidth: c.bandwidth,
        packetLoss: c.packetLoss,
        rtt: c.rtt,
      }));
  }

  getNetworkQuality(clientId) {
    const client = this.clients.get(clientId);
    if (!client) return 'unknown';

    const { packetLoss, rtt } = client;

    if (packetLoss === 0 && rtt < 100) return 'excellent';
    if (packetLoss < 2 && rtt < 200) return 'good';
    if (packetLoss < 5 && rtt < 300) return 'fair';
    return 'poor';
  }
}

const networkAdapter = new NetworkAdapter();
module.exports = networkAdapter;
