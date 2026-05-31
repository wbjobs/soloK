const Database = require('better-sqlite3');
const path = require('path');

class DatabaseManager {
  constructor() {
    const dbPath = path.join(__dirname, '../data/whiteboard.db');
    this.db = new Database(dbPath, {
      readonly: false,
      fileMustExist: false,
      timeout: 5000
    });
    
    this.writeQueue = [];
    this.isProcessingQueue = false;
    this.MAX_RETRIES = 5;
    this.RETRY_DELAY = 100;
    this.MAX_QUEUE_SIZE = 100;
    this.stmts = {};
    
    this.init();
  }

  init() {
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('busy_timeout = 5000');
    this.db.pragma('cache_size = -20000');
    this.db.pragma('temp_store = MEMORY');
    this.db.pragma('mmap_size = 2147483648');

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        room_id TEXT NOT NULL,
        snapshot_data TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_snapshots_room_id ON snapshots(room_id)
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_snapshots_created_at ON snapshots(created_at)
    `);

    this.stmts.insertSnapshot = this.db.prepare(`
      INSERT INTO snapshots (room_id, snapshot_data)
      VALUES (?, ?)
    `);

    this.stmts.getSnapshots = this.db.prepare(`
      SELECT id, room_id, snapshot_data, created_at
      FROM snapshots
      WHERE room_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `);

    this.stmts.getSnapshotById = this.db.prepare(`
      SELECT id, room_id, snapshot_data, created_at
      FROM snapshots
      WHERE id = ?
    `);

    this.stmts.deleteOldSnapshots = this.db.prepare(`
      DELETE FROM snapshots
      WHERE room_id = ? AND id NOT IN (
        SELECT id FROM snapshots
        WHERE room_id = ?
        ORDER BY created_at DESC
        LIMIT ?
      )
    `);

    this.stmts.getSnapshotsByTimeRange = this.db.prepare(`
      SELECT id, room_id, snapshot_data, created_at
      FROM snapshots
      WHERE room_id = ? AND created_at >= datetime(?, 'unixepoch') AND created_at <= datetime(?, 'unixepoch')
      ORDER BY created_at ASC
    `);
  }

  async executeWithRetry(operation, ...args) {
    let lastError;
    
    for (let attempt = 0; attempt < this.MAX_RETRIES; attempt++) {
      try {
        return operation(...args);
      } catch (error) {
        lastError = error;
        
        if (error.code === 'SQLITE_BUSY' || error.code === 'SQLITE_LOCKED') {
          if (attempt < this.MAX_RETRIES - 1) {
            await new Promise(resolve => 
              setTimeout(resolve, this.RETRY_DELAY * Math.pow(2, attempt))
            );
            continue;
          }
        }
        
        throw error;
      }
    }
    
    throw lastError;
  }

  saveSnapshot(roomId, snapshotData) {
    if (this.writeQueue.length >= this.MAX_QUEUE_SIZE) {
      console.warn('Write queue is full, dropping oldest snapshot');
      this.writeQueue.shift();
    }

    return new Promise((resolve, reject) => {
      this.writeQueue.push({
        roomId,
        snapshotData,
        timestamp: Date.now(),
        resolve,
        reject
      });

      this.processWriteQueue();
    });
  }

  async processWriteQueue() {
    if (this.isProcessingQueue || this.writeQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;

    try {
      while (this.writeQueue.length > 0) {
        const batch = this.writeQueue.splice(0, Math.min(10, this.writeQueue.length));
        
        try {
          await this.executeWithRetry(() => {
            const transaction = this.db.transaction((items) => {
              for (const item of items) {
                this.stmts.insertSnapshot.run(item.roomId, item.snapshotData);
              }
            });
            transaction(batch);
          });

          batch.forEach(item => item.resolve());
          
        } catch (error) {
          console.error('Error saving snapshots:', error);
          batch.forEach(item => item.reject(error));
        }
      }
    } finally {
      this.isProcessingQueue = false;
      
      if (this.writeQueue.length > 0) {
        setImmediate(() => this.processWriteQueue());
      }
    }
  }

  async getSnapshots(roomId, limit = 10) {
    return this.executeWithRetry(() => {
      return this.stmts.getSnapshots.all(roomId, limit);
    });
  }

  async getSnapshotById(id) {
    return this.executeWithRetry(() => {
      return this.stmts.getSnapshotById.get(id);
    });
  }

  async deleteOldSnapshots(roomId, keepCount = 100) {
    return this.executeWithRetry(() => {
      return this.stmts.deleteOldSnapshots.run(roomId, roomId, keepCount);
    });
  }

  async getSnapshotsByTimeRange(roomId, startTime, endTime) {
    return this.executeWithRetry(() => {
      return this.stmts.getSnapshotsByTimeRange.all(roomId, startTime, endTime);
    });
  }

  async backup() {
    const backupPath = path.join(
      __dirname, 
      '../data', 
      `backup_${Date.now()}.db`
    );
    
    return this.db.backup(backupPath);
  }

  close() {
    const forceClose = setTimeout(() => {
      console.warn('Force closing database after timeout');
      try {
        this.db.close();
      } catch (e) {}
    }, 5000);

    try {
      if (this.writeQueue.length > 0) {
        console.log(`Processing ${this.writeQueue.length} pending writes before closing`);
      }

      this.writeQueue.forEach(item => {
        try {
          this.stmts.insertSnapshot.run(item.roomId, item.snapshotData);
          item.resolve();
        } catch (e) {
          item.reject(e);
        }
      });
      this.writeQueue = [];

      this.db.pragma('optimize');
      this.db.close();
      clearTimeout(forceClose);
      console.log('Database closed gracefully');
    } catch (error) {
      console.error('Error closing database:', error);
      try {
        this.db.close();
      } catch (e) {}
      clearTimeout(forceClose);
    }
  }
}

module.exports = DatabaseManager;
