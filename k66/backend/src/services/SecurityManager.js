const { SecurityConfig, PendingConfirmation } = require('../models/SecurityConfig');
const crypto = require('crypto');

const CRITICAL_KEY_COMBINATIONS = [
  { keys: ['ctrl', 'alt', 'delete'], name: 'Ctrl+Alt+Del' },
  { keys: ['ctrl', 'shift', 'esc'], name: 'Ctrl+Shift+Esc' },
  { keys: ['meta', 'l'], name: 'Win+L / Cmd+L' },
  { keys: ['meta', 'r'], name: 'Win+R / Cmd+R' },
  { keys: ['alt', 'f4'], name: 'Alt+F4' },
  { keys: ['ctrl', 'w'], name: 'Ctrl+W' },
  { keys: ['ctrl', 'alt', 't'], name: 'Ctrl+Alt+T' },
];

class SecurityManager {
  constructor() {
    this.config = null;
    this.initConfig();
  }

  async initConfig() {
    let config = await SecurityConfig.findOne({ configId: 'main' });
    if (!config) {
      config = new SecurityConfig({
        configId: 'main',
        enabled: true,
        criticalKeys: CRITICAL_KEY_COMBINATIONS.map(k => k.keys.join('+')),
        requireConfirmation: true,
        confirmationExpiry: 60
      });
      await config.save();
    }
    this.config = config.toObject();
  }

  async getConfig() {
    if (!this.config) {
      await this.initConfig();
    }
    return this.config;
  }

  async updateConfig(updates) {
    const config = await SecurityConfig.findOneAndUpdate(
      { configId: 'main' },
      updates,
      { new: true }
    );
    this.config = config.toObject();
    return this.config;
  }

  normalizeKey(key) {
    const keyMap = {
      'control': 'ctrl',
      'meta': 'meta',
      'command': 'meta',
      'option': 'alt',
      ' ': 'space'
    };
    return keyMap[key] || key.toLowerCase();
  }

  checkCriticalKey(event) {
    if (event.type !== 'key_press') {
      return null;
    }

    const data = event.data;
    const pressedKeys = [];

    if (data.ctrlKey) pressedKeys.push('ctrl');
    if (data.shiftKey) pressedKeys.push('shift');
    if (data.altKey) pressedKeys.push('alt');
    if (data.metaKey) pressedKeys.push('meta');

    const key = this.normalizeKey(data.key);
    if (key && !pressedKeys.includes(key)) {
      pressedKeys.push(key);
    }

    pressedKeys.sort();

    for (const combo of CRITICAL_KEY_COMBINATIONS) {
      const comboKeys = [...combo.keys].sort();
      if (pressedKeys.length === comboKeys.length &&
          pressedKeys.every((k, i) => k === comboKeys[i])) {
        return combo.name;
      }
    }

    return null;
  }

  generateConfirmationId() {
    return `conf_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  }

  async createConfirmation(eventType, eventData, keyCombination, sessionId) {
    const config = await this.getConfig();
    if (!config.enabled || !config.requireConfirmation) {
      return { approved: true, skipped: true };
    }

    const confirmationId = this.generateConfirmationId();
    const expiresAt = new Date(Date.now() + config.confirmationExpiry * 1000);

    const qrData = JSON.stringify({
      confirmationId,
      keyCombination,
      sessionId,
      expiresAt: expiresAt.getTime()
    });
    const qrCode = Buffer.from(qrData).toString('base64');

    const confirmation = new PendingConfirmation({
      confirmationId,
      eventType,
      eventData,
      keyCombination,
      sessionId,
      status: 'pending',
      expiresAt,
      qrCode
    });

    await confirmation.save();

    return {
      confirmationId,
      keyCombination,
      expiresAt,
      qrCode,
      requiresApproval: true
    };
  }

  async getPendingConfirmations() {
    return await PendingConfirmation.find({
      status: 'pending',
      expiresAt: { $gt: new Date() }
    }).sort({ createdAt: -1 }).lean();
  }

  async approveConfirmation(confirmationId, adminId = 'admin') {
    const confirmation = await PendingConfirmation.findOne({
      confirmationId,
      status: 'pending'
    });

    if (!confirmation) {
      return null;
    }

    confirmation.status = 'approved';
    confirmation.approvedBy = adminId;
    confirmation.approvedAt = new Date();
    await confirmation.save();

    return {
      approved: true,
      eventType: confirmation.eventType,
      eventData: confirmation.eventData
    };
  }

  async rejectConfirmation(confirmationId, adminId = 'admin') {
    const confirmation = await PendingConfirmation.findOne({
      confirmationId,
      status: 'pending'
    });

    if (!confirmation) {
      return null;
    }

    confirmation.status = 'rejected';
    confirmation.approvedBy = adminId;
    confirmation.approvedAt = new Date();
    await confirmation.save();

    return { rejected: true };
  }

  async getConfirmationStatus(confirmationId) {
    const confirmation = await PendingConfirmation.findOne({ confirmationId }).lean();
    if (!confirmation) {
      return { status: 'not_found' };
    }

    if (confirmation.expiresAt < new Date() && confirmation.status === 'pending') {
      confirmation.status = 'expired';
      await PendingConfirmation.findOneAndUpdate(
        { confirmationId },
        { status: 'expired' }
      );
    }

    return {
      confirmationId,
      status: confirmation.status,
      keyCombination: confirmation.keyCombination,
      expiresAt: confirmation.expiresAt
    };
  }

  async cleanupExpired() {
    return await PendingConfirmation.deleteMany({
      expiresAt: { $lt: new Date() }
    });
  }
}

const securityManager = new SecurityManager();

module.exports = securityManager;
