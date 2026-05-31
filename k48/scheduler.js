const PriorityLevel = {
  LOW: 1,
  NORMAL: 2,
  HIGH: 4,
  CRITICAL: 8
};

class WeightedRoundRobin {
  constructor() {
    this.queues = new Map();
    this.currentQueueId = null;
    this.currentWeightCounter = 0;
    this.totalWeight = 0;
    this.queueOrder = [];
  }

  addQueue(fileId, priority = PriorityLevel.NORMAL) {
    if (!this.queues.has(fileId)) {
      this.queues.set(fileId, {
        packets: [],
        priority,
        weight: priority,
        bytesSent: 0,
        packetsSent: 0,
        startTime: Date.now()
      });
      this.totalWeight += priority;
      this.queueOrder.push(fileId);
      
      if (this.currentQueueId === null) {
        this.currentQueueId = fileId;
      }
    }
    return this.queues.get(fileId);
  }

  removeQueue(fileId) {
    const queue = this.queues.get(fileId);
    if (queue) {
      this.totalWeight -= queue.weight;
      this.queues.delete(fileId);
      const idx = this.queueOrder.indexOf(fileId);
      if (idx !== -1) {
        this.queueOrder.splice(idx, 1);
      }
      
      if (this.currentQueueId === fileId) {
        this.moveToNextQueue();
      }
    }
  }

  enqueue(fileId, packet, packetSize) {
    let queue = this.queues.get(fileId);
    if (!queue) {
      queue = this.addQueue(fileId, PriorityLevel.NORMAL);
    }

    queue.packets.push({
      packet,
      packetSize,
      enqueueTime: Date.now()
    });
  }

  moveToNextQueue() {
    if (this.queueOrder.length === 0) {
      this.currentQueueId = null;
      this.currentWeightCounter = 0;
      return;
    }

    const currentIdx = this.currentQueueId 
      ? this.queueOrder.indexOf(this.currentQueueId) 
      : -1;
    
    let nextIdx = (currentIdx + 1) % this.queueOrder.length;
    let iterations = 0;
    
    while (iterations < this.queueOrder.length) {
      const nextId = this.queueOrder[nextIdx];
      const nextQueue = this.queues.get(nextId);
      
      if (nextQueue && nextQueue.packets.length > 0) {
        this.currentQueueId = nextId;
        this.currentWeightCounter = nextQueue.weight;
        return;
      }
      
      nextIdx = (nextIdx + 1) % this.queueOrder.length;
      iterations++;
    }
    
    this.currentQueueId = null;
    this.currentWeightCounter = 0;
  }

  dequeue() {
    if (this.queueOrder.length === 0) return null;

    if (this.currentQueueId === null || this.currentWeightCounter <= 0) {
      this.moveToNextQueue();
    }

    if (this.currentQueueId === null) return null;

    const queue = this.queues.get(this.currentQueueId);
    if (!queue || queue.packets.length === 0) {
      this.moveToNextQueue();
      return this.dequeue();
    }

    const item = queue.packets.shift();
    queue.bytesSent += item.packetSize;
    queue.packetsSent++;
    
    this.currentWeightCounter--;
    
    if (this.currentWeightCounter <= 0 || queue.packets.length === 0) {
      this.moveToNextQueue();
    }

    return {
      fileId: this.currentQueueId,
      packet: item.packet,
      packetSize: item.packetSize
    };
  }

  hasPackets() {
    for (const queue of this.queues.values()) {
      if (queue.packets.length > 0) return true;
    }
    return false;
  }

  getQueueSize(fileId) {
    const queue = this.queues.get(fileId);
    return queue ? queue.packets.length : 0;
  }

  getTotalQueueSize() {
    let total = 0;
    for (const queue of this.queues.values()) {
      total += queue.packets.length;
    }
    return total;
  }

  getStats() {
    const stats = {};
    for (const [fileId, queue] of this.queues) {
      const elapsed = (Date.now() - queue.startTime) / 1000;
      stats[fileId] = {
        priority: queue.priority,
        weight: queue.weight,
        queueSize: queue.packets.length,
        bytesSent: queue.bytesSent,
        packetsSent: queue.packetsSent,
        throughput: elapsed > 0 ? (queue.bytesSent / 1024 / 1024 / elapsed).toFixed(3) : 0,
        bandwidthShare: this.totalWeight > 0 ? ((queue.weight / this.totalWeight) * 100).toFixed(1) : '0.0'
      };
    }
    return stats;
  }

  setPriority(fileId, priority) {
    const queue = this.queues.get(fileId);
    if (queue) {
      this.totalWeight -= queue.weight;
      queue.priority = priority;
      queue.weight = priority;
      this.totalWeight += priority;
    }
  }

  clear() {
    this.queues.clear();
    this.queueOrder = [];
    this.totalWeight = 0;
    this.currentQueueId = null;
    this.currentWeightCounter = 0;
  }
}

class TokenBucket {
  constructor(rate, burstSize) {
    this.rate = rate;
    this.burstSize = burstSize;
    this.tokens = burstSize;
    this.lastUpdate = Date.now();
  }

  update() {
    const now = Date.now();
    const elapsed = (now - this.lastUpdate) / 1000;
    this.tokens = Math.min(this.burstSize, this.tokens + elapsed * this.rate);
    this.lastUpdate = now;
  }

  consume(bytes) {
    this.update();
    if (this.tokens >= bytes) {
      this.tokens -= bytes;
      return true;
    }
    return false;
  }

  getAvailableTokens() {
    this.update();
    return this.tokens;
  }
}

class MultiFileScheduler {
  constructor(totalBandwidth = 10 * 1024 * 1024) {
    this.wrr = new WeightedRoundRobin();
    this.tokenBucket = new TokenBucket(totalBandwidth, Math.max(totalBandwidth / 10, 64 * 1024));
    this.fileStates = new Map();
    this.nextFileId = 1;
    this.totalBandwidth = totalBandwidth;
  }

  registerFile(filePath, priority = PriorityLevel.NORMAL, fileSize = 0) {
    const fileId = this.nextFileId++;
    this.wrr.addQueue(fileId, priority);
    
    this.fileStates.set(fileId, {
      filePath,
      fileId,
      priority,
      fileSize,
      bytesSent: 0,
      packetsSent: 0,
      retransmits: 0,
      startTime: Date.now(),
      isComplete: false,
      isPaused: false
    });

    return fileId;
  }

  unregisterFile(fileId) {
    const state = this.fileStates.get(fileId);
    if (state) {
      state.isComplete = true;
    }
    this.wrr.removeQueue(fileId);
  }

  queuePacket(fileId, packet, packetSize) {
    const state = this.fileStates.get(fileId);
    if (!state || state.isPaused || state.isComplete) {
      return false;
    }
    this.wrr.enqueue(fileId, packet, packetSize);
    return true;
  }

  getNextPacket() {
    const item = this.wrr.dequeue();
    if (item) {
      if (this.tokenBucket.consume(item.packetSize)) {
        const state = this.fileStates.get(item.fileId);
        if (state) {
          state.bytesSent += item.packetSize;
          state.packetsSent++;
        }
        return item;
      } else {
        this.wrr.enqueue(item.fileId, item.packet, item.packetSize);
      }
    }
    return null;
  }

  hasPendingPackets() {
    return this.wrr.hasPackets();
  }

  setFilePriority(fileId, priority) {
    const state = this.fileStates.get(fileId);
    if (state) {
      state.priority = priority;
      this.wrr.setPriority(fileId, priority);
    }
  }

  pauseFile(fileId) {
    const state = this.fileStates.get(fileId);
    if (state) {
      state.isPaused = true;
    }
  }

  resumeFile(fileId) {
    const state = this.fileStates.get(fileId);
    if (state) {
      state.isPaused = false;
    }
  }

  recordRetransmit(fileId) {
    const state = this.fileStates.get(fileId);
    if (state) {
      state.retransmits++;
    }
  }

  getFileStats(fileId) {
    const state = this.fileStates.get(fileId);
    if (!state) return null;
    
    const elapsed = (Date.now() - state.startTime) / 1000;
    const throughput = elapsed > 0 ? (state.bytesSent / 1024 / 1024 / elapsed).toFixed(3) : 0;
    const progress = state.fileSize > 0 ? ((state.bytesSent / state.fileSize) * 100).toFixed(1) : '0.0';
    
    return {
      ...state,
      elapsed,
      throughput,
      progress,
      queueSize: this.wrr.getQueueSize(fileId)
    };
  }

  getAllStats() {
    const stats = {};
    for (const fileId of this.fileStates.keys()) {
      stats[fileId] = this.getFileStats(fileId);
    }
    
    const wrrStats = this.wrr.getStats();
    for (const fileId of Object.keys(wrrStats)) {
      if (stats[fileId]) {
        stats[fileId].bandwidthShare = wrrStats[fileId].bandwidthShare;
      }
    }
    
    return stats;
  }

  getActiveFileCount() {
    let count = 0;
    for (const state of this.fileStates.values()) {
      if (!state.isComplete && !state.isPaused) count++;
    }
    return count;
  }

  clear() {
    this.wrr.clear();
    this.fileStates.clear();
    this.nextFileId = 1;
  }
}

module.exports = {
  PriorityLevel,
  WeightedRoundRobin,
  TokenBucket,
  MultiFileScheduler
};
