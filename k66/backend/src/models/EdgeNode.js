const mongoose = require('mongoose');

const edgeNodeSchema = new mongoose.Schema({
  nodeId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  name: {
    type: String,
    required: true
  },
  url: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['online', 'offline', 'degraded'],
    default: 'offline',
    index: true
  },
  location: {
    type: String,
    default: 'unknown'
  },
  system: {
    type: String,
    default: 'unknown'
  },
  inputMethod: String,
  screenSize: {
    width: Number,
    height: Number
  },
  latency: {
    current: {
      type: Number,
      default: 0
    },
    average: {
      type: Number,
      default: 0
    },
    history: [Number]
  },
  weight: {
    type: Number,
    default: 1
  },
  eventCount: {
    type: Number,
    default: 0
  },
  errorCount: {
    type: Number,
    default: 0
  },
  lastHeartbeat: {
    type: Date,
    index: true
  },
  registeredAt: {
    type: Date,
    default: Date.now
  },
  metadata: {
    type: Map,
    of: String
  }
}, {
  timestamps: true
});

edgeNodeSchema.index({ status: 1, 'latency.average': 1 });

module.exports = mongoose.model('EdgeNode', edgeNodeSchema);
