import mqtt, { MqttClient } from 'mqtt';

type MessageHandler = (topic: string, payload: any) => void;

class MQTTService {
  private client: MqttClient | null = null;
  private handlers: Map<string, MessageHandler[]> = new Map();

  private throttledMessages: Map<string, { topic: string; payload: any }> = new Map();
  private rafScheduled = false;

  private readonly THROTTLE_PATTERNS = [
    'device/+/telemetry',
    'device/+/state/robotic_arm',
    'device/+/state/conveyor',
    'device/+/state/vision'
  ];

  connect(brokerUrl: string, options?: mqtt.IClientOptions): Promise<void> {
    return new Promise((resolve, reject) => {
      this.client = mqtt.connect(brokerUrl, {
        clientId: 'frontend_' + Math.random().toString(16).substr(2, 8),
        clean: true,
        connectTimeout: 4000,
        reconnectPeriod: 1000,
        ...options
      });

      this.client.on('connect', () => {
        console.log('[MQTT] Connected to broker');
        this.subscribeToDefaults();
        resolve();
      });

      this.client.on('error', (err) => {
        console.error('[MQTT] Error:', err);
        reject(err);
      });

      this.client.on('reconnect', () => {
        console.log('[MQTT] Reconnecting...');
      });

      this.client.on('message', (topic, message) => {
        this.handleMessage(topic, message);
      });
    });
  }

  private subscribeToDefaults() {
    const topics = [
      'device/+/telemetry',
      'device/+/state/robotic_arm',
      'device/+/state/conveyor',
      'device/+/state/vision',
      'device/+/status'
    ];
    topics.forEach(topic => this.subscribe(topic));
  }

  subscribe(topic: string, qos: number = 1): void {
    if (!this.client) return;
    this.client.subscribe(topic, { qos }, (err) => {
      if (err) {
        console.error(`[MQTT] Failed to subscribe to ${topic}:`, err);
      } else {
        console.log(`[MQTT] Subscribed to ${topic}`);
      }
    });
  }

  publish(topic: string, message: any, qos: number = 1): void {
    if (!this.client) return;
    const payload = typeof message === 'string' ? message : JSON.stringify(message);
    this.client.publish(topic, payload, { qos }, (err) => {
      if (err) {
        console.error(`[MQTT] Failed to publish to ${topic}:`, err);
      }
    });
  }

  on(pattern: string, handler: MessageHandler): void {
    if (!this.handlers.has(pattern)) {
      this.handlers.set(pattern, []);
    }
    this.handlers.get(pattern)!.push(handler);
  }

  off(pattern: string, handler: MessageHandler): void {
    const handlers = this.handlers.get(pattern);
    if (handlers) {
      const idx = handlers.indexOf(handler);
      if (idx > -1) handlers.splice(idx, 1);
    }
  }

  private shouldThrottle(topic: string): boolean {
    for (const pattern of this.THROTTLE_PATTERNS) {
      if (this.matchTopic(pattern, topic)) {
        return true;
      }
    }
    return false;
  }

  private handleMessage(topic: string, message: Buffer): void {
    let payload: any;
    try {
      payload = JSON.parse(message.toString());
    } catch {
      payload = message.toString();
    }

    if (this.shouldThrottle(topic) && payload?.device_id) {
      const key = `${topic}:${payload.device_id}`;
      this.throttledMessages.set(key, { topic, payload });
      this.scheduleFlush();
      return;
    }

    this.dispatchMessage(topic, payload);
  }

  private scheduleFlush(): void {
    if (this.rafScheduled) return;
    this.rafScheduled = true;

    requestAnimationFrame(() => {
      this.rafScheduled = false;
      this.flushThrottledMessages();
    });
  }

  private flushThrottledMessages(): void {
    const messages = Array.from(this.throttledMessages.values());
    this.throttledMessages.clear();

    for (const { topic, payload } of messages) {
      this.dispatchMessage(topic, payload);
    }
  }

  private dispatchMessage(topic: string, payload: any): void {
    this.handlers.forEach((handlers, pattern) => {
      if (this.matchTopic(pattern, topic)) {
        handlers.forEach(h => h(topic, payload));
      }
    });
  }

  private matchTopic(pattern: string, topic: string): boolean {
    if (pattern === topic) return true;

    const patternParts = pattern.split('/');
    const topicParts = topic.split('/');

    if (patternParts.length !== topicParts.length) return false;

    for (let i = 0; i < patternParts.length; i++) {
      if (patternParts[i] === '+') continue;
      if (patternParts[i] === '#') return true;
      if (patternParts[i] !== topicParts[i]) return false;
    }
    return true;
  }

  disconnect(): void {
    if (this.client) {
      this.client.end();
      this.client = null;
    }
  }

  isConnected(): boolean {
    return this.client?.connected ?? false;
  }
}

export const mqttService = new MQTTService();
