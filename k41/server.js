const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.static(path.join(__dirname, 'public')));

const rooms = new Map();

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.roomCode = null;
  ws.role = null;

  ws.on('pong', () => {
    ws.isAlive = true;
  });

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    switch (msg.type) {
      case 'create': {
        let code;
        do {
          code = generateRoomCode();
        } while (rooms.has(code));

        rooms.set(code, { host: ws, peer: null });
        ws.roomCode = code;
        ws.role = 'host';
        ws.send(JSON.stringify({ type: 'created', roomCode: code }));
        break;
      }

      case 'join': {
        const code = msg.roomCode;
        if (!code || !rooms.has(code)) {
          ws.send(JSON.stringify({ type: 'error', message: 'Room not found' }));
          return;
        }
        const room = rooms.get(code);
        if (room.peer) {
          ws.send(JSON.stringify({ type: 'error', message: 'Room is full' }));
          return;
        }
        room.peer = ws;
        ws.roomCode = code;
        ws.role = 'peer';
        ws.send(JSON.stringify({ type: 'joined', roomCode: code }));
        room.host.send(JSON.stringify({ type: 'peer_joined' }));
        break;
      }

      case 'signal': {
        if (!ws.roomCode || !rooms.has(ws.roomCode)) return;
        const room = rooms.get(ws.roomCode);
        const target = ws.role === 'host' ? room.peer : room.host;
        if (target && target.readyState === 1) {
          target.send(JSON.stringify({ type: 'signal', payload: msg.payload }));
        }
        break;
      }

      default:
        break;
    }
  });

  ws.on('close', () => {
    if (ws.roomCode && rooms.has(ws.roomCode)) {
      const room = rooms.get(ws.roomCode);
      const other = ws.role === 'host' ? room.peer : room.host;
      if (other && other.readyState === 1) {
        other.send(JSON.stringify({ type: 'peer_left' }));
      }
      rooms.delete(ws.roomCode);
    }
  });
});

const interval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) {
      return ws.terminate();
    }
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on('close', () => {
  clearInterval(interval);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Signaling server running on http://localhost:${PORT}`);
});
