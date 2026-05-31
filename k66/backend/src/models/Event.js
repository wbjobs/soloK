const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['mouse_click', 'mouse_move', 'key_press', 'key_release'],
    required: true
  },
  data: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  frontendTimestamp: {
    type: Number,
    required: true
  },
  backendTimestamp: {
    type: Number,
    default: Date.now,
    index: true
  },
  pythonTimestamp: Number,
  sessionId: String,
  sequenceId: {
    type: String,
    index: true,
    sparse: true
  },
  retryCount: {
    type: Number,
    default: 0
  },
  latency: {
    frontendToBackend: Number,
    backendToPython: Number,
    total: Number
  }
}, {
  timestamps: true
});

eventSchema.index({ createdAt: 1 });
eventSchema.index({ type: 1 });
eventSchema.index({ sessionId: 1 });

module.exports = mongoose.model('Event', eventSchema);
