type MessageHandler = (data: any) => void;

class WebSocketService {
  private ws: WebSocket | null = null;
  private handlers: Map<string, MessageHandler[]> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private url: string = '';

  private throttledMessages: Map<string, any> = new Map();
  private rafScheduled = false;

  private readonly THROTTLE_TYPES = new Set(['telemetry']);

  connect(url: string): Promise<void> {
    this.url = url;
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(url);

        this.ws.onopen = () => {
          console.log('[WebSocket] Connected');
          this.reconnectAttempts = 0;
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            this.handleMessage(msg);
          } catch (err) {
            console.error('[WebSocket] Parse error:', err);
          }
        };

        this.ws.onerror = (err) => {
          console.error('[WebSocket] Error:', err);
          reject(err);
        };

        this.ws.onclose = () => {
          console.log('[WebSocket] Disconnected');
          this.attemptReconnect();
        };
      } catch (err) {
        reject(err);
      }
    });
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log('[WebSocket] Max reconnect attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 10000);

    setTimeout(() => {
      console.log(`[WebSocket] Reconnecting (attempt ${this.reconnectAttempts})...`);
      this.connect(this.url);
    }, delay);
  }

  on(type: string, handler: MessageHandler): void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, []);
    }
    this.handlers.get(type)!.push(handler);
  }

  off(type: string, handler: MessageHandler): void {
    const handlers = this.handlers.get(type);
    if (handlers) {
      const idx = handlers.indexOf(handler);
      if (idx > -1) handlers.splice(idx, 1);
    }
  }

  private handleMessage(msg: { type: string; data: any }): void {
    if (this.THROTTLE_TYPES.has(msg.type) && msg.data?.device_id) {
      this.throttledMessages.set(msg.type + ':' + msg.data.device_id, msg);
      this.scheduleFlush();
      return;
    }

    this.dispatchMessage(msg);
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

    for (const msg of messages) {
      this.dispatchMessage(msg);
    }
  }

  private dispatchMessage(msg: { type: string; data: any }): void {
    const handlers = this.handlers.get(msg.type);
    if (handlers) {
      handlers.forEach(h => h(msg.data));
    }

    const allHandlers = this.handlers.get('*');
    if (allHandlers) {
      allHandlers.forEach(h => h(msg));
    }
  }

  send(type: string, data: any): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, data }));
    }
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

export const wsService = new WebSocketService();
