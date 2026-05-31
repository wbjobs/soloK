class RTTManager {
  constructor(initialRtt = 1000, alpha = 0.125, beta = 0.25) {
    this.estimatedRtt = initialRtt;
    this.devRtt = initialRtt / 2;
    this.alpha = alpha;
    this.beta = beta;
    this.minRtt = Infinity;
    this.maxRtt = 0;
    this.totalRtt = 0;
    this.sampleCount = 0;
    
    this.spikeThreshold = 2.0;
    this.spikeCount = 0;
    this.rttHistory = [];
    this.maxHistory = 10;
    
    this.minRto = 200;
    this.maxRto = 5000;
    this.currentRtoMultiplier = 1;
    this.lastRto = this.getTimeout();
  }

  update(sampleRtt, isRetransmitted = false) {
    if (sampleRtt <= 0) return;
    
    if (isRetransmitted) {
      return;
    }

    const isSpike = this.detectSpike(sampleRtt);
    
    if (isSpike) {
      this.spikeCount++;
      this.handleSpike(sampleRtt);
      return;
    }

    this.spikeCount = Math.max(0, this.spikeCount - 1);
    
    const oldEstimatedRtt = this.estimatedRtt;
    this.estimatedRtt = (1 - this.alpha) * this.estimatedRtt + this.alpha * sampleRtt;
    
    const rttDiff = Math.abs(sampleRtt - oldEstimatedRtt);
    this.devRtt = (1 - this.beta) * this.devRtt + this.beta * rttDiff;
    
    if (sampleRtt < this.minRtt) this.minRtt = sampleRtt;
    if (sampleRtt > this.maxRtt) this.maxRtt = sampleRtt;
    this.totalRtt += sampleRtt;
    this.sampleCount++;
    
    this.rttHistory.push(sampleRtt);
    if (this.rttHistory.length > this.maxHistory) {
      this.rttHistory.shift();
    }
    
    this.resetRtoMultiplier();
  }

  detectSpike(sampleRtt) {
    if (this.sampleCount < 3) return false;
    
    const recentAvg = this.rttHistory.length > 0
      ? this.rttHistory.reduce((a, b) => a + b, 0) / this.rttHistory.length
      : this.estimatedRtt;
    
    const spikeRatio = sampleRtt / recentAvg;
    return spikeRatio >= this.spikeThreshold;
  }

  handleSpike(sampleRtt) {
    const alphaFast = 0.5;
    const betaFast = 0.5;
    
    this.estimatedRtt = (1 - alphaFast) * this.estimatedRtt + alphaFast * sampleRtt;
    this.devRtt = (1 - betaFast) * this.devRtt + betaFast * Math.abs(sampleRtt - this.estimatedRtt);
    
    if (sampleRtt < this.minRtt) this.minRtt = sampleRtt;
    if (sampleRtt > this.maxRtt) this.maxRtt = sampleRtt;
    this.totalRtt += sampleRtt;
    this.sampleCount++;
    
    this.rttHistory.push(sampleRtt);
    if (this.rttHistory.length > this.maxHistory) {
      this.rttHistory.shift();
    }
  }

  getTimeout() {
    const baseRto = this.estimatedRtt + 4 * this.devRtt;
    const rto = baseRto * this.currentRtoMultiplier;
    this.lastRto = Math.max(this.minRto, Math.min(rto, this.maxRto));
    return this.lastRto;
  }

  increaseRtoMultiplier() {
    this.currentRtoMultiplier = Math.min(this.currentRtoMultiplier * 2, 8);
    return this.currentRtoMultiplier;
  }

  resetRtoMultiplier() {
    this.currentRtoMultiplier = 1;
  }

  checkForSpuriousRecovery(sampleRtt, wasRetransmitted) {
    if (!wasRetransmitted) return false;
    
    const expectedRtt = this.estimatedRtt;
    const upperBound = expectedRtt + 4 * this.devRtt;
    
    return sampleRtt > upperBound;
  }

  getAverageRtt() {
    return this.sampleCount > 0 ? this.totalRtt / this.sampleCount : 0;
  }

  getJitter() {
    if (this.rttHistory.length < 2) return 0;
    let jitterSum = 0;
    for (let i = 1; i < this.rttHistory.length; i++) {
      jitterSum += Math.abs(this.rttHistory[i] - this.rttHistory[i - 1]);
    }
    return jitterSum / (this.rttHistory.length - 1);
  }

  getStats() {
    return {
      estimatedRtt: this.estimatedRtt.toFixed(2),
      devRtt: this.devRtt.toFixed(2),
      minRtt: this.minRtt === Infinity ? 0 : this.minRtt.toFixed(2),
      maxRtt: this.maxRtt.toFixed(2),
      averageRtt: this.getAverageRtt().toFixed(2),
      jitter: this.getJitter().toFixed(2),
      timeout: this.getTimeout().toFixed(2),
      currentRtoMultiplier: this.currentRtoMultiplier,
      spikeCount: this.spikeCount,
      sampleCount: this.sampleCount
    };
  }
}

class RetransmissionManager {
  constructor(rttManager) {
    this.rttManager = rttManager;
    this.unackedPackets = new Map();
    this.timers = new Map();
    this.retransmitCount = new Map();
    this.spuriousRecoveryCount = 0;
    this.maxRetries = 15;
    this.backoffEnabled = true;
  }

  addPacket(seqNum, packet, sendFn) {
    const sendTime = Date.now();
    this.unackedPackets.set(seqNum, { 
      packet, 
      sendTime, 
      sendFn,
      isRetransmitted: false,
      firstSendTime: sendTime,
      retransmitTimes: []
    });
    this.retransmitCount.set(seqNum, 0);
    
    this.scheduleRetransmit(seqNum);
  }

  scheduleRetransmit(seqNum) {
    if (this.timers.has(seqNum)) {
      clearTimeout(this.timers.get(seqNum));
    }

    const timeout = this.rttManager.getTimeout();
    const timer = setTimeout(() => {
      this.retransmit(seqNum);
    }, timeout);
    
    this.timers.set(seqNum, timer);
  }

  retransmit(seqNum) {
    const packetInfo = this.unackedPackets.get(seqNum);
    if (!packetInfo) return;

    const retryCount = this.retransmitCount.get(seqNum) || 0;
    if (retryCount >= this.maxRetries) {
      console.error(`Packet ${seqNum} max retries reached, giving up`);
      this.removePacket(seqNum);
      return;
    }

    this.retransmitCount.set(seqNum, retryCount + 1);
    packetInfo.sendFn(packetInfo.packet);
    packetInfo.sendTime = Date.now();
    packetInfo.isRetransmitted = true;
    packetInfo.retransmitTimes.push(Date.now());
    
    if (this.backoffEnabled) {
      this.rttManager.increaseRtoMultiplier();
    }
    
    this.scheduleRetransmit(seqNum);
  }

  ackPacket(seqNum) {
    const packetInfo = this.unackedPackets.get(seqNum);
    if (!packetInfo) return false;

    const sampleRtt = Date.now() - packetInfo.sendTime;
    const totalElapsed = Date.now() - packetInfo.firstSendTime;
    const wasRetransmitted = packetInfo.isRetransmitted;
    const retransCount = this.retransmitCount.get(seqNum) || 0;
    
    let isSpurious = false;
    if (wasRetransmitted && retransCount > 0) {
      isSpurious = this.rttManager.checkForSpuriousRecovery(totalElapsed, wasRetransmitted);
      if (isSpurious) {
        this.spuriousRecoveryCount++;
        this.handleSpuriousRecovery(seqNum);
      }
    }
    
    if (!wasRetransmitted || isSpurious) {
      this.rttManager.update(sampleRtt, false);
    }
    
    this.removePacket(seqNum);
    return { acked: true, isSpurious, retransCount };
  }

  handleSpuriousRecovery(seqNum) {
    this.rttManager.resetRtoMultiplier();
  }

  removePacket(seqNum) {
    if (this.timers.has(seqNum)) {
      clearTimeout(this.timers.get(seqNum));
      this.timers.delete(seqNum);
    }
    this.unackedPackets.delete(seqNum);
    this.retransmitCount.delete(seqNum);
  }

  getRetransmitCount(seqNum) {
    return this.retransmitCount.get(seqNum) || 0;
  }

  getTotalRetransmits() {
    let total = 0;
    for (const count of this.retransmitCount.values()) {
      total += count;
    }
    return total;
  }

  getUnackedCount() {
    return this.unackedPackets.size;
  }

  getSpuriousRecoveryCount() {
    return this.spuriousRecoveryCount;
  }

  clearAll() {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
    this.unackedPackets.clear();
    this.retransmitCount.clear();
    this.rttManager.resetRtoMultiplier();
  }
}

module.exports = {
  RTTManager,
  RetransmissionManager
};
