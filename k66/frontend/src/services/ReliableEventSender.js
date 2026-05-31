class ReliableEventSender {
  constructor(socket, options = {}) {
    this.socket = socket;
    this.pendingEvents = new Map();
    this.bufferQueue = [];
    this.sequenceNumber = 0;
    this.maxRetries = options.maxRetries || 5;
    this.retryDelay = options.retryDelay || 1000;
    this.maxBufferSize = options.maxBufferSize || 1000;
    this.flushInterval = null;
    this.isConnected = false;
    this.onAckCallback = options.onAck || (() => {});
    
    this.setupSocketListeners();
    this.startFlushInterval();
  }

  setupSocketListeners() {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      this.isConnected = true;
      this.flushBuffer();
    });

    this.socket.on('disconnect', () => {
      this.isConnected = false;
    });

    this.socket.on('event-ack', (data) => {
      this.handleAck(data);
    });

    this.socket.on('event-retry', (data) => {
      this.retryEvent(data.sequenceId);
    });
  }

  generateSequenceId() {
    this.sequenceNumber = (this.sequenceNumber + 1) % Number.MAX_SAFE_INTEGER;
    return `seq_${Date.now()}_${this.sequenceNumber}`;
  }

  send(type, data, sessionId) {
    const sequenceId = this.generateSequenceId();
    const eventData = {
      type,
      data,
      frontendTimestamp: Date.now(),
      sessionId,
      sequenceId,
      retryCount: 0
    };

    if (this.isConnected && this.socket?.connected) {
      this.sendEvent(eventData);
    } else {
      this.enqueueEvent(eventData);
    }

    return sequenceId;
  }

  sendEvent(eventData) {
    this.pendingEvents.set(eventData.sequenceId, {
      ...eventData,
      sentAt: Date.now(),
      timeout: this.scheduleRetry(eventData.sequenceId)
    });
    this.socket.emit('event', eventData);
  }

  enqueueEvent(eventData) {
    if (this.bufferQueue.length >= this.maxBufferSize) {
      this.bufferQueue.shift();
    }
    this.bufferQueue.push(eventData);
  }

  scheduleRetry(sequenceId) {
    return setTimeout(() => {
      this.retryEvent(sequenceId);
    }, this.retryDelay);
  }

  retryEvent(sequenceId) {
    const pending = this.pendingEvents.get(sequenceId);
    if (!pending) return;

    if (pending.retryCount >= this.maxRetries) {
      console.warn(`Event ${sequenceId} failed after ${this.maxRetries} retries`);
      this.pendingEvents.delete(sequenceId);
      return;
    }

    if (this.isConnected && this.socket?.connected) {
      pending.retryCount++;
      pending.sentAt = Date.now();
      clearTimeout(pending.timeout);
      pending.timeout = this.scheduleRetry(sequenceId);
      this.socket.emit('event', { ...pending, retryCount: pending.retryCount });
    }
  }

  handleAck(data) {
    const pending = this.pendingEvents.get(data.sequenceId);
    if (pending) {
      clearTimeout(pending.timeout);
      this.pendingEvents.delete(data.sequenceId);
      this.onAckCallback({
        sequenceId: data.sequenceId,
        latency: data.latency,
        eventId: data.eventId
      });
    }
  }

  flushBuffer() {
    while (this.bufferQueue.length > 0 && this.isConnected) {
      const eventData = this.bufferQueue.shift();
      this.sendEvent(eventData);
    }
  }

  startFlushInterval() {
    this.flushInterval = setInterval(() => {
      if (this.isConnected) {
        this.flushBuffer();
      }
    }, 500);
  }

  getStats() {
    return {
      pendingCount: this.pendingEvents.size,
      bufferCount: this.bufferQueue.length,
      isConnected: this.isConnected
    };
  }

  destroy() {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }
    this.pendingEvents.forEach((pending) => {
      if (pending.timeout) {
        clearTimeout(pending.timeout);
      }
    });
    this.pendingEvents.clear();
    this.bufferQueue = [];
  }
}

export default ReliableEventSender;
