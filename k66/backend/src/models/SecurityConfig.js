const mongoose = require('mongoose');

const securityConfigSchema = new mongoose.Schema({
  configId: {
    type: String,
    required: true,
    unique: true,
    default: 'main'
  },
  enabled: {
    type: Boolean,
    default: true
  },
  criticalKeys: {
    type: [String],
    default: [
      'ctrl+alt+delete',
      'ctrl+shift+esc',
      'meta+l',
      'meta+r',
      'alt+f4',
      'ctrl+w'
    ]
  },
  totpSecret: String,
  totpEnabled: {
    type: Boolean,
    default: false
  },
  adminEmails: [String],
  sessionTimeout: {
    type: Number,
    default: 300
  },
  whitelistedIps: [String],
  requireConfirmation: {
    type: Boolean,
    default: true
  },
  confirmationExpiry: {
    type: Number,
    default: 60
  }
}, {
  timestamps: true
});

const pendingConfirmationSchema = new mongoose.Schema({
  confirmationId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  eventType: String,
  eventData: mongoose.Schema.Types.Mixed,
  keyCombination: String,
  sessionId: String,
  userId: String,
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'expired'],
    default: 'pending',
    index: true
  },
  expiresAt: {
    type: Date,
    index: true
  },
  approvedBy: String,
  approvedAt: Date,
  qrCode: String
}, {
  timestamps: true
});

pendingConfirmationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 600 });

const SecurityConfig = mongoose.model('SecurityConfig', securityConfigSchema);
const PendingConfirmation = mongoose.model('PendingConfirmation', pendingConfirmationSchema);

module.exports = { SecurityConfig, PendingConfirmation };
