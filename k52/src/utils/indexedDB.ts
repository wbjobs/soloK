import type { HistoryRecord } from '@/types';

const DB_NAME = 'EdgeDetectionDB';
const DB_VERSION = 1;
const STORE_NAME = 'history';

let db: IDBDatabase | null = null;

export function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (db) {
      resolve(db);
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      reject(request.error);
    };

    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, {
          keyPath: 'id',
          autoIncrement: true,
        });
        store.createIndex('timestamp', 'timestamp', { unique: false });
        store.createIndex('algorithm', 'algorithm', { unique: false });
      }
    };
  });
}

export function addRecord(record: Omit<HistoryRecord, 'id'>): Promise<number> {
  return new Promise((resolve, reject) => {
    openDB()
      .then((database) => {
        const transaction = database.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.add(record);

        request.onsuccess = () => {
          resolve(request.result as number);
        };

        request.onerror = () => {
          reject(request.error);
        };
      })
      .catch(reject);
  });
}

export function getRecords(limit?: number): Promise<HistoryRecord[]> {
  return new Promise((resolve, reject) => {
    openDB()
      .then((database) => {
        const transaction = database.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const index = store.index('timestamp');
        const request = index.openCursor(null, 'prev');

        const records: HistoryRecord[] = [];

        request.onsuccess = () => {
          const cursor = request.result;
          if (cursor && (!limit || records.length < limit)) {
            records.push(cursor.value as HistoryRecord);
            cursor.continue();
          } else {
            resolve(records);
          }
        };

        request.onerror = () => {
          reject(request.error);
        };
      })
      .catch(reject);
  });
}

export function getRecord(id: number): Promise<HistoryRecord | undefined> {
  return new Promise((resolve, reject) => {
    openDB()
      .then((database) => {
        const transaction = database.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(id);

        request.onsuccess = () => {
          resolve(request.result as HistoryRecord | undefined);
        };

        request.onerror = () => {
          reject(request.error);
        };
      })
      .catch(reject);
  });
}

export function deleteRecord(id: number): Promise<void> {
  return new Promise((resolve, reject) => {
    openDB()
      .then((database) => {
        const transaction = database.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(id);

        request.onsuccess = () => {
          resolve();
        };

        request.onerror = () => {
          reject(request.error);
        };
      })
      .catch(reject);
  });
}

export function clearRecords(): Promise<void> {
  return new Promise((resolve, reject) => {
    openDB()
      .then((database) => {
        const transaction = database.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.clear();

        request.onsuccess = () => {
          resolve();
        };

        request.onerror = () => {
          reject(request.error);
        };
      })
      .catch(reject);
  });
}

export function closeDB(): void {
  if (db) {
    db.close();
    db = null;
  }
}
