const mongoose = require('mongoose');

const macroEventSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['mouse_click', 'mouse_move', 'key_press', 'key_release', 'wait'],
    required: true
  },
  data: mongoose.Schema.Types.Mixed,
  delay: {
    type: Number,
    default: 0
  },
  relativeTime: Number
}, { _id: false });

const macroSchema = new mongoose.Schema({
  macroId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  name: {
    type: String,
    required: true
  },
  description: String,
  events: [macroEventSchema],
  status: {
    type: String,
    enum: ['draft', 'ready', 'playing', 'paused'],
    default: 'draft'
  },
  duration: {
    type: Number,
    default: 0
  },
  eventCount: {
    type: Number,
    default: 0
  },
  tags: [String],
  createdBy: String,
  sessionId: String,
  loopCount: {
    type: Number,
    default: 1
  },
  speed: {
    type: Number,
    default: 1,
    min: 0.1,
    max: 10
  },
  isPublic: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

macroSchema.index({ createdBy: 1, createdAt: -1 });
macroSchema.index({ tags: 1 });

module.exports = mongoose.model('Macro', macroSchema);
