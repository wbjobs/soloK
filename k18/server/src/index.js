const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const config = require('./config');
const { redis, redisPubSub } = require('./config/redis');
const { ensureBucket } = require('./config/minio');
const SignalingService = require('./services/signaling');
const { socketAuthMiddleware } = require('./middleware/auth');
const apiRoutes = require('./routes');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: true,
  },
  pingInterval: 10000,
  pingTimeout: 5000,
  maxHttpBufferSize: 1e8,
});

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use('/api', apiRoutes);

app.use('/recordings', express.static(path.join(__dirname, '..', 'recordings')));

app.get('/', (req, res) => {
  res.json({
    name: 'Ultrasound Consultation Server',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      api: '/api',
      socket: '/socket.io',
    },
  });
});

const signalingService = new SignalingService(io);

io.use(socketAuthMiddleware);

io.on('connection', (socket) => {
  console.log(`[Socket] Client connected: ${socket.id}, user: ${socket.user?.name}`);
  signalingService.setupHandlers(socket);
});

async function startServer() {
  try {
    await redis.ping();
    console.log('[Redis] Connection verified');
  } catch (err) {
    console.warn('[Redis] Connection check failed, continuing anyway:', err.message);
  }

  try {
    await ensureBucket();
  } catch (err) {
    console.warn('[MinIO] Bucket initialization failed, continuing anyway:', err.message);
  }

  server.listen(config.port, () => {
    console.log(`[Server] Listening on port ${config.port}`);
    console.log(`[Server] WebSocket available at ws://localhost:${config.port}`);
    console.log(`[Server] REST API available at http://localhost:${config.port}/api`);
  });
}

startServer().catch((err) => {
  console.error('[Server] Failed to start:', err);
  process.exit(1);
});

process.on('uncaughtException', (err) => {
  console.error('[Server] Uncaught exception:', err);
});

process.on('unhandledRejection', (err) => {
  console.error('[Server] Unhandled rejection:', err);
});

process.on('SIGINT', async () => {
  console.log('[Server] Shutting down...');
  await redis.quit();
  await redisPubSub.quit();
  server.close(() => {
    process.exit(0);
  });
});
