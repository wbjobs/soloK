const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const DatabaseManager = require('./database');
const { diffCompress, diffDecompress } = require('./compression');

let compressionMode = 'lossy';

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static(path.join(__dirname, '../public')));

app.get('/api/snapshots/:roomId', async (req, res) => {
  const { roomId } = req.params;
  const hours = parseFloat(req.query.hours) || 1;
  const endTime = Math.floor(Date.now() / 1000);
  const startTime = endTime - Math.floor(hours * 3600);

  try {
    const snapshots = await db.getSnapshotsByTimeRange(roomId, startTime, endTime);
    const result = snapshots.map(s => {
      let data;
      try { data = JSON.parse(s.snapshot_data); } catch (e) { data = null; }
      return { id: s.id, createdAt: s.created_at, data };
    });
    res.json({ success: true, snapshots: result });
  } catch (error) {
    console.error('Error fetching snapshots:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/compression-mode', (req, res) => {
  res.json({ mode: compressionMode });
});

app.post('/api/compression-mode', express.json(), (req, res) => {
  const { mode } = req.body;
  if (mode === 'lossless' || mode === 'lossy') {
    compressionMode = mode;
    broadcastGlobal({ type: 'compressionMode', mode });
    res.json({ success: true, mode: compressionMode });
  } else {
    res.status(400).json({ success: false, error: 'Invalid mode' });
  }
});

function broadcastGlobal(message) {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  });
}

const db = new DatabaseManager();

const rooms = new Map();
const roomSnapshots = new Map();
const roomIntervalMap = new Map();
const clientHeartbeats = new Map();
const MAX_PATHS_PER_ROOM = 5000;
const HEARTBEAT_INTERVAL = 30000;
const HEARTBEAT_TIMEOUT = 60000;
const CLIENT_CLEANUP_INTERVAL = 60000;

function getOrCreateRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      clients: new Set(),
      paths: [],
      eraserPaths: [],
      createdAt: Date.now()
    });
    roomSnapshots.set(roomId, []);
    startSnapshotInterval(roomId);
  }
  return rooms.get(roomId);
}

function cleanupStaleClients() {
  const now = Date.now();
  
  clientHeartbeats.forEach((lastHeartbeat, ws) => {
    if (now - lastHeartbeat > HEARTBEAT_TIMEOUT) {
      console.log('Cleaning up stale client due to heartbeat timeout');
      if (ws.roomId) {
        handleLeave(ws, ws.roomId);
      }
      try {
        ws.terminate();
      } catch (e) {}
      clientHeartbeats.delete(ws);
    } else {
      try {
        if (ws.readyState === WebSocket.OPEN) {
          ws.ping();
        }
      } catch (e) {}
    }
  });

  wss.clients.forEach(ws => {
    if (!clientHeartbeats.has(ws)) {
      clientHeartbeats.set(ws, now);
    }
  });
}

function cleanupEmptyRooms() {
  const now = Date.now();
  const maxIdleTime = 30 * 60 * 1000;

  rooms.forEach((room, roomId) => {
    if (room.clients.size === 0) {
      const lastActivity = room.lastActivity || room.createdAt;
      if (now - lastActivity > maxIdleTime) {
        console.log(`Cleaning up idle room: ${roomId}`);
        rooms.delete(roomId);
        roomSnapshots.delete(roomId);
        
        const interval = roomIntervalMap.get(roomId);
        if (interval) {
          clearInterval(interval);
          roomIntervalMap.delete(roomId);
        }
      }
    }
  });
}

function trimRoomPaths(room) {
  if (room.paths.length > MAX_PATHS_PER_ROOM) {
    const excess = room.paths.length - MAX_PATHS_PER_ROOM;
    room.paths.splice(0, excess);
    console.log(`Trimmed ${excess} old paths from room`);
  }
  
  if (room.eraserPaths.length > MAX_PATHS_PER_ROOM) {
    const excess = room.eraserPaths.length - MAX_PATHS_PER_ROOM;
    room.eraserPaths.splice(0, excess);
    console.log(`Trimmed ${excess} old eraser paths from room`);
  }
}

function startSnapshotInterval(roomId) {
  if (roomIntervalMap.has(roomId)) return;
  
  const interval = setInterval(async () => {
    await saveRoomSnapshot(roomId);
  }, 5000);
  
  roomIntervalMap.set(roomId, interval);
}

async function saveRoomSnapshot(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  
  const snapshotData = JSON.stringify({
    paths: room.paths,
    eraserPaths: room.eraserPaths,
    timestamp: Date.now()
  });
  
  try {
    await db.saveSnapshot(roomId, snapshotData);
    console.log(`[${roomId}] Snapshot saved at ${new Date().toISOString()}`);
  } catch (error) {
    console.error(`[${roomId}] Failed to save snapshot:`, error.message);
  }
}

function broadcastToRoom(roomId, message, excludeClient = null) {
  const room = rooms.get(roomId);
  if (!room) return;
  
  const messageStr = JSON.stringify(message);
  const deadClients = [];
  
  room.clients.forEach(client => {
    if (client === excludeClient) return;
    
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(messageStr, (error) => {
          if (error) {
            deadClients.push(client);
          }
        });
      } catch (e) {
        deadClients.push(client);
      }
    } else {
      deadClients.push(client);
    }
  });
  
  if (deadClients.length > 0) {
    deadClients.forEach(deadClient => {
      room.clients.delete(deadClient);
      clientHeartbeats.delete(deadClient);
      try {
        deadClient.terminate();
      } catch (e) {}
    });
    
    if (deadClients.length > 0) {
      broadcastToRoom(roomId, {
        type: 'userCount',
        count: room.clients.size
      });
    }
  }
}

wss.on('connection', (ws) => {
  let currentRoomId = null;
  clientHeartbeats.set(ws, Date.now());
  
  ws.isAlive = true;
  ws.roomId = null;
  
  ws.on('pong', () => {
    ws.isAlive = true;
    clientHeartbeats.set(ws, Date.now());
  });
  
  ws.on('message', async (data) => {
    clientHeartbeats.set(ws, Date.now());
    
    try {
      const message = JSON.parse(data);
      
      switch (message.type) {
        case 'join':
          await handleJoin(ws, message.roomId);
          currentRoomId = message.roomId;
          ws.roomId = message.roomId;
          break;
          
        case 'draw':
          handleDraw(ws, message);
          break;
          
        case 'erase':
          handleErase(ws, message);
          break;
          
        case 'clear':
          handleClear(ws, message.roomId);
          break;
          
        case 'replay':
          await handleReplay(ws, message.roomId, message.hours);
          break;
          
        case 'setCompressionMode':
          if (message.mode === 'lossless' || message.mode === 'lossy') {
            compressionMode = message.mode;
            broadcastGlobal({ type: 'compressionMode', mode: compressionMode });
          }
          break;
      }
    } catch (error) {
      console.error('Error parsing message:', error);
    }
  });
  
  ws.on('close', () => {
    clientHeartbeats.delete(ws);
    if (currentRoomId) {
      handleLeave(ws, currentRoomId);
    }
  });
  
  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
    clientHeartbeats.delete(ws);
    if (currentRoomId) {
      handleLeave(ws, currentRoomId);
    }
  });
});

async function handleJoin(ws, roomId) {
  const room = getOrCreateRoom(roomId);
  room.clients.add(ws);
  room.lastActivity = Date.now();
  
  let snapshots = [];
  try {
    snapshots = await db.getSnapshots(roomId, 10);
  } catch (error) {
    console.error('Error loading snapshots:', error);
  }
  
  ws.send(JSON.stringify({
    type: 'init',
    roomId,
    paths: room.paths,
    eraserPaths: room.eraserPaths,
    snapshots: snapshots
  }));
  
  broadcastToRoom(roomId, {
    type: 'userCount',
    count: room.clients.size
  });
  
  console.log(`User joined room ${roomId}, total: ${room.clients.size}`);
}

function handleLeave(ws, roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  
  room.clients.delete(ws);
  room.lastActivity = Date.now();
  
  broadcastToRoom(roomId, {
    type: 'userCount',
    count: room.clients.size
  });
  
  if (room.clients.size === 0) {
    const interval = roomIntervalMap.get(roomId);
    if (interval) {
      clearInterval(interval);
      roomIntervalMap.delete(roomId);
    }
  }
  
  console.log(`User left room ${roomId}, remaining: ${room.clients.size}`);
}

function handleDraw(ws, message) {
  const room = rooms.get(message.roomId);
  if (!room) return;
  
  room.lastActivity = Date.now();
  
  const mode = message.compressionMode || compressionMode;
  const { compressed, originalSize, compressedSize } = diffCompress(message.path, room.paths, mode);
  
  if (!compressed.skip) {
    room.paths.push(message.path);
    trimRoomPaths(room);
    
    broadcastToRoom(message.roomId, {
      type: 'draw',
      path: compressed,
      compressionStats: {
        originalSize,
        compressedSize,
        ratio: originalSize > 0 ? ((1 - compressedSize / originalSize) * 100).toFixed(2) : '0',
        mode
      }
    }, ws);
  }
}

function handleErase(ws, message) {
  const room = rooms.get(message.roomId);
  if (!room) return;
  
  room.lastActivity = Date.now();
  
  const mode = message.compressionMode || compressionMode;
  const { compressed, originalSize, compressedSize } = diffCompress(message.eraserPath, room.eraserPaths, mode);
  
  if (!compressed.skip) {
    room.eraserPaths.push(message.eraserPath);
    trimRoomPaths(room);
    
    broadcastToRoom(message.roomId, {
      type: 'erase',
      eraserPath: compressed,
      compressionStats: {
        originalSize,
        compressedSize,
        ratio: originalSize > 0 ? ((1 - compressedSize / originalSize) * 100).toFixed(2) : '0',
        mode
      }
    }, ws);
  }
}

function handleClear(ws, roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  
  room.lastActivity = Date.now();
  room.paths = [];
  room.eraserPaths = [];
  
  broadcastToRoom(roomId, {
    type: 'clear'
  });
}

async function handleReplay(ws, roomId, hours = 1) {
  const endTime = Math.floor(Date.now() / 1000);
  const startTime = endTime - Math.floor((hours || 1) * 3600);

  try {
    const snapshots = await db.getSnapshotsByTimeRange(roomId, startTime, endTime);
    ws.send(JSON.stringify({
      type: 'replay',
      snapshots: snapshots.map(s => {
        let data;
        try { data = JSON.parse(s.snapshot_data); } catch (e) { data = null; }
        return { id: s.id, createdAt: s.created_at, data };
      })
    }));
  } catch (error) {
    console.error('Error loading replay data:', error);
    ws.send(JSON.stringify({ type: 'replay', snapshots: [], error: error.message }));
  }
}

setInterval(cleanupStaleClients, HEARTBEAT_INTERVAL);
setInterval(cleanupEmptyRooms, CLIENT_CLEANUP_INTERVAL);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log('Press Ctrl+C to stop');
});

process.on('SIGINT', () => {
  console.log('\nShutting down gracefully...');
  
  const heartbeatInterval = global._heartbeatInterval;
  const cleanupInterval = global._cleanupInterval;
  if (heartbeatInterval) clearInterval(heartbeatInterval);
  if (cleanupInterval) clearInterval(cleanupInterval);
  
  roomIntervalMap.forEach(interval => clearInterval(interval));
  roomIntervalMap.clear();
  
  wss.clients.forEach(ws => {
    ws.close();
  });
  
  db.close();
  
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
