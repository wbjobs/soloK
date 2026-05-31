const Macro = require('../models/Macro');
const crypto = require('crypto');

class MacroManager {
  constructor() {
    this.activeRecordings = new Map();
    this.activePlaybacks = new Map();
  }

  generateMacroId() {
    return `macro_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  }

  startRecording(sessionId, userId = 'anonymous', name = null) {
    const macroId = this.generateMacroId();
    
    this.activeRecordings.set(sessionId, {
      macroId,
      name: name || `Recording ${new Date().toLocaleString()}`,
      events: [],
      startTime: Date.now(),
      lastEventTime: Date.now(),
      userId,
      sessionId
    });
    
    console.log(`Started recording: ${macroId} for session ${sessionId}`);
    return { macroId };
  }

  recordEvent(sessionId, eventType, eventData) {
    const recording = this.activeRecordings.get(sessionId);
    if (!recording) return null;
    
    const now = Date.now();
    const delay = now - recording.lastEventTime;
    const relativeTime = now - recording.startTime;
    
    recording.events.push({
      type: eventType,
      data: eventData,
      delay,
      relativeTime
    });
    
    recording.lastEventTime = now;
    
    return recording.events.length;
  }

  async stopRecording(sessionId, description = null, tags = []) {
    const recording = this.activeRecordings.get(sessionId);
    if (!recording) return null;
    
    const duration = Date.now() - recording.startTime;
    
    const macro = new Macro({
      macroId: recording.macroId,
      name: recording.name,
      description,
      events: recording.events,
      status: 'ready',
      duration,
      eventCount: recording.events.length,
      tags,
      createdBy: recording.userId,
      sessionId
    });
    
    await macro.save();
    
    this.activeRecordings.delete(sessionId);
    
    console.log(`Saved macro: ${recording.macroId} with ${recording.events.length} events`);
    return macro.toObject();
  }

  cancelRecording(sessionId) {
    const recording = this.activeRecordings.get(sessionId);
    if (!recording) return null;
    
    this.activeRecordings.delete(sessionId);
    console.log(`Cancelled recording for session ${sessionId}`);
    return { cancelled: true, eventCount: recording.events.length };
  }

  isRecording(sessionId) {
    return this.activeRecordings.has(sessionId);
  }

  getRecordingStatus(sessionId) {
    const recording = this.activeRecordings.get(sessionId);
    if (!recording) return null;
    
    return {
      macroId: recording.macroId,
      eventCount: recording.events.length,
      duration: Date.now() - recording.startTime,
      isRecording: true
    };
  }

  async getMacro(macroId) {
    return await Macro.findOne({ macroId }).lean();
  }

  async getMacros(filters = {}) {
    const query = {};
    if (filters.createdBy) query.createdBy = filters.createdBy;
    if (filters.tags) query.tags = { $in: filters.tags };
    if (filters.status) query.status = filters.status;
    
    return await Macro.find(query)
      .sort({ createdAt: -1 })
      .limit(filters.limit || 50)
      .lean();
  }

  async deleteMacro(macroId) {
    return await Macro.findOneAndDelete({ macroId });
  }

  async updateMacro(macroId, updates) {
    return await Macro.findOneAndUpdate(
      { macroId },
      updates,
      { new: true }
    ).lean();
  }

  async playMacro(macroId, sendEventCallback, options = {}) {
    const macro = await Macro.findOne({ macroId });
    if (!macro) {
      throw new Error('Macro not found');
    }
    
    const playbackId = `playback_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const speed = options.speed || macro.speed || 1;
    const loopCount = options.loopCount || macro.loopCount || 1;
    
    this.activePlaybacks.set(playbackId, {
      macroId,
      status: 'playing',
      currentEvent: 0,
      loop: 0,
      totalLoops: loopCount
    });
    
    const playEvents = async () => {
      for (let loop = 0; loop < loopCount; loop++) {
        const playback = this.activePlaybacks.get(playbackId);
        if (!playback || playback.status === 'stopped') break;
        
        playback.loop = loop;
        playback.currentEvent = 0;
        
        for (let i = 0; i < macro.events.length; i++) {
          const playback = this.activePlaybacks.get(playbackId);
          if (!playback || playback.status === 'stopped') break;
          
          const event = macro.events[i];
          playback.currentEvent = i;
          
          const delay = Math.round(event.delay / speed);
          if (delay > 0 && i > 0) {
            await new Promise(resolve => setTimeout(resolve, delay));
          }
          
          sendEventCallback(event.type, event.data, playbackId);
        }
      }
      
      this.activePlaybacks.delete(playbackId);
      console.log(`Playback ${playbackId} completed`);
    };
    
    playEvents();
    
    return {
      playbackId,
      macroId,
      eventCount: macro.events.length,
      duration: macro.duration / speed
    };
  }

  stopPlayback(playbackId) {
    const playback = this.activePlaybacks.get(playbackId);
    if (!playback) return null;
    
    playback.status = 'stopped';
    this.activePlaybacks.delete(playbackId);
    
    return { stopped: true };
  }

  getPlaybackStatus(playbackId) {
    return this.activePlaybacks.get(playbackId) || null;
  }
}

const macroManager = new MacroManager();

module.exports = macroManager;
