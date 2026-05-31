const CongestionState = {
  SLOW_START: 'slow_start',
  CONGESTION_AVOID: 'congestion_avoid',
  FAST_RECOVERY: 'fast_recovery'
};

class CongestionControl {
  constructor(initialWindow = 1, ssthresh = 64, maxWindow = 256) {
    this.cwnd = initialWindow;
    this.ssthresh = ssthresh;
    this.maxWindow = maxWindow;
    this.initialSsthresh = ssthresh;
    this.state = CongestionState.SLOW_START;
    this.duplicateAckCount = 0;
    this.lastAckSeq = -1;
    this.totalLossEvents = 0;
    this.totalTimeouts = 0;
    this.totalSpuriousRetransmits = 0;
    
    this.windowHistory = [];
    this.maxHistory = 5;
    this.lastSsthreshBeforeTimeout = ssthresh;
    this.lastCwndBeforeTimeout = initialWindow;
    
    this.eifelEnabled = true;
    this.cwndGrowthEnabled = true;
  }

  onAck(seqNum) {
    if (seqNum > this.lastAckSeq) {
      this.duplicateAckCount = 0;
      this.lastAckSeq = seqNum;
      
      if (this.cwndGrowthEnabled) {
        this.increaseWindow();
      }
    } else if (seqNum === this.lastAckSeq) {
      this.duplicateAckCount++;
      if (this.duplicateAckCount >= 3) {
        this.onFastRetransmit();
      }
    }
    
    this.saveWindowHistory();
  }

  saveWindowHistory() {
    this.windowHistory.push({
      cwnd: this.cwnd,
      ssthresh: this.ssthresh,
      state: this.state,
      timestamp: Date.now()
    });
    
    if (this.windowHistory.length > this.maxHistory) {
      this.windowHistory.shift();
    }
  }

  increaseWindow() {
    if (this.state === CongestionState.SLOW_START) {
      this.cwnd = Math.min(this.cwnd + 1, this.maxWindow);
      if (this.cwnd >= this.ssthresh) {
        this.state = CongestionState.CONGESTION_AVOID;
      }
    } else if (this.state === CongestionState.CONGESTION_AVOID) {
      this.cwnd = Math.min(this.cwnd + Math.max(0.5, 1 / this.cwnd), this.maxWindow);
    } else if (this.state === CongestionState.FAST_RECOVERY) {
      this.cwnd = this.ssthresh;
      this.state = CongestionState.CONGESTION_AVOID;
    }
  }

  onTimeout() {
    this.totalTimeouts++;
    this.totalLossEvents++;
    
    this.lastSsthreshBeforeTimeout = this.ssthresh;
    this.lastCwndBeforeTimeout = this.cwnd;
    
    this.ssthresh = Math.max(2, Math.floor(this.cwnd * 0.7));
    this.cwnd = Math.max(1, Math.floor(this.cwnd * 0.5));
    this.state = CongestionState.SLOW_START;
    this.duplicateAckCount = 0;
    
    this.cwndGrowthEnabled = true;
  }

  onFastRetransmit() {
    this.totalLossEvents++;
    
    this.lastSsthreshBeforeTimeout = this.ssthresh;
    this.lastCwndBeforeTimeout = this.cwnd;
    
    this.ssthresh = Math.max(2, Math.floor(this.cwnd * 0.7));
    this.cwnd = this.ssthresh + 3;
    this.state = CongestionState.FAST_RECOVERY;
    
    this.cwndGrowthEnabled = true;
  }

  onSpuriousRetransmit() {
    if (!this.eifelEnabled) return;
    
    this.totalSpuriousRetransmits++;
    
    const recentHistory = this.windowHistory.slice(-3);
    if (recentHistory.length > 0) {
      const avgCwnd = recentHistory.reduce((sum, h) => sum + h.cwnd, 0) / recentHistory.length;
      const avgSsthresh = recentHistory.reduce((sum, h) => sum + h.ssthresh, 0) / recentHistory.length;
      
      const recoveryFactor = 0.8;
      this.cwnd = Math.max(this.cwnd, Math.min(
        Math.max(avgCwnd * recoveryFactor, this.lastCwndBeforeTimeout * recoveryFactor),
        this.maxWindow
      ));
      
      this.ssthresh = Math.max(this.ssthresh, Math.min(
        Math.max(avgSsthresh, this.lastSsthreshBeforeTimeout),
        this.maxWindow
      ));
    } else {
      this.cwnd = Math.max(this.cwnd, this.lastCwndBeforeTimeout * 0.75);
      this.ssthresh = Math.max(this.ssthresh, this.lastSsthreshBeforeTimeout);
    }
    
    if (this.cwnd >= this.ssthresh) {
      this.state = CongestionState.CONGESTION_AVOID;
    } else {
      this.state = CongestionState.SLOW_START;
    }
    
    this.duplicateAckCount = 0;
    this.cwndGrowthEnabled = true;
  }

  onMultipleTimeouts(count) {
    if (count >= 2) {
      this.cwnd = Math.max(1, Math.floor(this.cwnd * 0.75));
    }
  }

  getWindowSize() {
    return Math.floor(this.cwnd);
  }

  getStats() {
    return {
      cwnd: this.cwnd.toFixed(2),
      ssthresh: this.ssthresh,
      state: this.state,
      maxWindow: this.maxWindow,
      totalLossEvents: this.totalLossEvents,
      totalTimeouts: this.totalTimeouts,
      totalSpuriousRetransmits: this.totalSpuriousRetransmits
    };
  }

  reset() {
    this.cwnd = 1;
    this.ssthresh = this.initialSsthresh;
    this.state = CongestionState.SLOW_START;
    this.duplicateAckCount = 0;
    this.lastAckSeq = -1;
    this.windowHistory = [];
    this.cwndGrowthEnabled = true;
  }
}

class SlidingWindow {
  constructor(windowSize = 16) {
    this.base = 0;
    this.nextSeqNum = 0;
    this.maxWindowSize = windowSize;
    this.congestionControl = new CongestionControl(1, 64, windowSize);
    this.consecutiveTimeouts = 0;
  }

  canSend() {
    const effectiveWindow = this.getEffectiveWindow();
    return this.nextSeqNum < this.base + effectiveWindow;
  }

  getNextSeqNum() {
    return this.nextSeqNum++;
  }

  ack(seqNum) {
    if (seqNum >= this.base) {
      const oldBase = this.base;
      this.base = seqNum + 1;
      this.consecutiveTimeouts = 0;
      
      for (let i = oldBase; i <= seqNum; i++) {
        this.congestionControl.onAck(i);
      }
      
      return true;
    }
    return false;
  }

  onSpuriousRetransmit() {
    this.congestionControl.onSpuriousRetransmit();
  }

  onTimeout() {
    this.consecutiveTimeouts++;
    this.congestionControl.onTimeout();
    
    if (this.consecutiveTimeouts > 1) {
      this.congestionControl.onMultipleTimeouts(this.consecutiveTimeouts);
    }
  }

  getEffectiveWindow() {
    return Math.min(
      this.maxWindowSize,
      this.congestionControl.getWindowSize()
    );
  }

  getInflightCount() {
    return this.nextSeqNum - this.base;
  }

  getStats() {
    return {
      base: this.base,
      nextSeqNum: this.nextSeqNum,
      effectiveWindow: this.getEffectiveWindow(),
      inflightCount: this.getInflightCount(),
      consecutiveTimeouts: this.consecutiveTimeouts,
      congestion: this.congestionControl.getStats()
    };
  }

  reset(base = 0) {
    this.base = base;
    this.nextSeqNum = base;
    this.consecutiveTimeouts = 0;
    this.congestionControl.reset();
  }
}

module.exports = {
  CongestionState,
  CongestionControl,
  SlidingWindow
};
