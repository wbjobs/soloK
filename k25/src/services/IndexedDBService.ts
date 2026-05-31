import { AlertEvent } from '../types';

const DB_NAME = 'EscalatorAlertDB';
const DB_VERSION = 1;
const EVENTS_STORE = 'alertEvents';
const VIDEOS_STORE = 'alertVideos';

export class IndexedDBService {
  private db: IDBDatabase | null = null;

  async initialize(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        if (!db.objectStoreNames.contains(EVENTS_STORE)) {
          const eventStore = db.createObjectStore(EVENTS_STORE, { keyPath: 'id' });
          eventStore.createIndex('timestamp', 'timestamp');
          eventStore.createIndex('type', 'type');
          eventStore.createIndex('cameraId', 'cameraId');
        }

        if (!db.objectStoreNames.contains(VIDEOS_STORE)) {
          const videoStore = db.createObjectStore(VIDEOS_STORE, { keyPath: 'id' });
          videoStore.createIndex('eventId', 'eventId');
        }
      };
    });
  }

  async saveEvent(event: AlertEvent): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const transaction = this.db.transaction([EVENTS_STORE], 'readwrite');
      const store = transaction.objectStore(EVENTS_STORE);
      const request = store.add(event);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getEvents(limit: number = 100): Promise<AlertEvent[]> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const transaction = this.db.transaction([EVENTS_STORE], 'readonly');
      const store = transaction.objectStore(EVENTS_STORE);
      const index = store.index('timestamp');
      const request = index.openCursor(null, 'prev');

      const events: AlertEvent[] = [];

      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor && events.length < limit) {
          events.push(cursor.value);
          cursor.continue();
        } else {
          resolve(events);
        }
      };

      request.onerror = () => reject(request.error);
    });
  }

  async saveVideoBlob(eventId: string, blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const videoId = `video_${eventId}_${Date.now()}`;
      const transaction = this.db.transaction([VIDEOS_STORE], 'readwrite');
      const store = transaction.objectStore(VIDEOS_STORE);
      const request = store.add({ id: videoId, eventId, blob });

      request.onsuccess = () => resolve(videoId);
      request.onerror = () => reject(request.error);
    });
  }

  async getVideoBlob(videoId: string): Promise<Blob | null> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const transaction = this.db.transaction([VIDEOS_STORE], 'readonly');
      const store = transaction.objectStore(VIDEOS_STORE);
      const request = store.get(videoId);

      request.onsuccess = () => {
        const result = request.result;
        resolve(result ? result.blob : null);
      };

      request.onerror = () => reject(request.error);
    });
  }

  async getTodayStats(): Promise<{ total: number; byType: Record<string, number>; byHour: Record<number, number> }> {
    const events = await this.getEvents(1000);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayEvents = events.filter(e => e.timestamp >= today.getTime());

    const byType: Record<string, number> = {
      fall: 0,
      retrograde: 0,
      luggage: 0,
      jump: 0
    };

    const byHour: Record<number, number> = {};
    for (let i = 0; i < 24; i++) {
      byHour[i] = 0;
    }

    todayEvents.forEach(event => {
      byType[event.type] = (byType[event.type] || 0) + 1;
      const hour = new Date(event.timestamp).getHours();
      byHour[hour] = (byHour[hour] || 0) + 1;
    });

    return {
      total: todayEvents.length,
      byType,
      byHour
    };
  }

  close(): void {
    this.db?.close();
    this.db = null;
  }
}
