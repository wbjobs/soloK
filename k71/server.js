const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { createClient } = require('redis');

const app = express();
app.use(cors());
app.use(express.static('public'));

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const redisClient = createClient({
  url: 'redis://localhost:6379'
});

redisClient.on('error', (err) => console.log('Redis Client Error', err));
redisClient.connect().catch(console.error);

const rooms = new Map();
const userSockets = new Map();

const OFFLINE_MESSAGE_TTL = 86400;

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('create-room', async ({ roomId, userId }) => {
    if (rooms.has(roomId)) {
      socket.emit('room-exists', { roomId });
      return;
    }

    rooms.set(roomId, {
      creator: userId,
      users: new Set([userId]),
      userMap: new Map([[userId, socket.id]])
    });

    socket.join(roomId);
    userSockets.set(userId, socket.id);
    socket.userId = userId;
    socket.roomId = roomId;

    const offlineKey = `offline:${roomId}:${userId}`;
    const offlineMessages = await redisClient.lRange(offlineKey, 0, -1);
    if (offlineMessages.length > 0) {
      socket.emit('offline-messages', {
        messages: offlineMessages.map(m => JSON.parse(m))
      });
      await redisClient.del(offlineKey);
    }

    socket.emit('room-created', { roomId, userId });
    console.log(`Room ${roomId} created by ${userId}`);
  });

  socket.on('join-room', async ({ roomId, userId }) => {
    const room = rooms.get(roomId);
    if (!room) {
      socket.emit('room-not-found', { roomId });
      return;
    }

    room.users.add(userId);
    room.userMap.set(userId, socket.id);
    socket.join(roomId);
    userSockets.set(userId, socket.id);
    socket.userId = userId;
    socket.roomId = roomId;

    const otherUsers = Array.from(room.users).filter(u => u !== userId);
    socket.emit('room-joined', { roomId, userId, otherUsers });
    socket.to(roomId).emit('user-joined', { userId });

    const offlineKey = `offline:${roomId}:${userId}`;
    const offlineMessages = await redisClient.lRange(offlineKey, 0, -1);
    if (offlineMessages.length > 0) {
      socket.emit('offline-messages', {
        messages: offlineMessages.map(m => JSON.parse(m))
      });
      await redisClient.del(offlineKey);
    }

    console.log(`User ${userId} joined room ${roomId}`);
  });

  socket.on('offer', ({ to, from, offer }) => {
    const room = rooms.get(socket.roomId);
    if (room && room.userMap.has(to)) {
      io.to(room.userMap.get(to)).emit('offer', { from, offer });
    }
  });

  socket.on('answer', ({ to, from, answer }) => {
    const room = rooms.get(socket.roomId);
    if (room && room.userMap.has(to)) {
      io.to(room.userMap.get(to)).emit('answer', { from, answer });
    }
  });

  socket.on('ice-candidate', ({ to, from, candidate }) => {
    const room = rooms.get(socket.roomId);
    if (room && room.userMap.has(to)) {
      io.to(room.userMap.get(to)).emit('ice-candidate', { from, candidate });
    }
  });

  socket.on('send-message', async ({ to, from, message, timestamp }) => {
    const room = rooms.get(socket.roomId);
    const msgData = { from, message, timestamp, via: 'p2p' };

    if (to && room && room.userMap.has(to)) {
      const targetSocketId = room.userMap.get(to);
      const targetSocket = io.sockets.sockets.get(targetSocketId);
      
      if (targetSocket) {
        io.to(targetSocketId).emit('receive-message', msgData);
        return;
      }
    }

    msgData.via = 'relay';
    
    if (room) {
      socket.to(socket.roomId).emit('receive-message', msgData);
    }

    if (to) {
      const offlineKey = `offline:${socket.roomId}:${to}`;
      await redisClient.rPush(offlineKey, JSON.stringify(msgData));
      await redisClient.expire(offlineKey, OFFLINE_MESSAGE_TTL);
    }
  });

  socket.on('relay-message', async ({ to, from, message, timestamp }) => {
    const msgData = { from, message, timestamp, via: 'relay' };
    const room = rooms.get(socket.roomId);

    if (to) {
      if (room && room.userMap.has(to)) {
        io.to(room.userMap.get(to)).emit('receive-message', msgData);
      } else {
        const offlineKey = `offline:${socket.roomId}:${to}`;
        await redisClient.rPush(offlineKey, JSON.stringify(msgData));
        await redisClient.expire(offlineKey, OFFLINE_MESSAGE_TTL);
      }
    } else if (room) {
      socket.to(socket.roomId).emit('receive-message', msgData);
    }
  });

  socket.on('p2p-connected', ({ userId }) => {
    socket.to(socket.roomId).emit('p2p-status', { userId, connected: true });
  });

  socket.on('p2p-disconnected', ({ userId }) => {
    socket.to(socket.roomId).emit('p2p-status', { userId, connected: false });
  });

  socket.on('leave-room', () => {
    handleUserLeave(socket);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    handleUserLeave(socket);
  });
});

function handleUserLeave(socket) {
  const { userId, roomId } = socket;
  if (!roomId || !userId) return;

  const room = rooms.get(roomId);
  if (!room) return;

  room.users.delete(userId);
  room.userMap.delete(userId);
  userSockets.delete(userId);

  socket.to(roomId).emit('user-left', { userId });
  socket.leave(roomId);

  if (room.users.size === 0) {
    rooms.delete(roomId);
    console.log(`Room ${roomId} destroyed`);
  }

  console.log(`User ${userId} left room ${roomId}`);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Signaling server running on port ${PORT}`);
});
