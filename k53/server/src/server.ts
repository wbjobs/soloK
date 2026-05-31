import http from 'http';
import app from './app.js';
import { SignalingServer } from './signaling/SignalingServer.js';
import { config } from './config/index.js';
import { prisma } from './repositories/prismaClient.js';

const server = http.createServer(app);

let signalingServer: SignalingServer;

async function startServer(): Promise<void> {
  try {
    await prisma.$connect();
    console.log('Connected to PostgreSQL database');

    signalingServer = new SignalingServer(server);
    console.log('Signaling server initialized');

    server.listen(config.port, () => {
      console.log(`🚀 Server running on port ${config.port}`);
      console.log(`📡 WebSocket server running on ws://localhost:${config.port}${config.wsPath}`);
      console.log(`🌍 Environment: ${config.nodeEnv}`);
      console.log(`📊 API base: http://localhost:${config.port}/api`);
      console.log(`💚 Health check: http://localhost:${config.port}/health`);
    });

    const logStats = () => {
      const stats = signalingServer.getStats();
      console.log(`[${new Date().toISOString()}] Connections: ${stats.totalConnections}, Active rooms: ${stats.activeRooms}`);
    };

    setInterval(logStats, 60000);

  } catch (error) {
    console.error('Failed to start server:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

async function gracefulShutdown(signal: string): Promise<void> {
  console.log(`\nReceived ${signal}, starting graceful shutdown...`);

  if (signalingServer) {
    signalingServer.close();
    console.log('Signaling server closed');
  }

  server.close(async (err) => {
    if (err) {
      console.error('Error closing HTTP server:', err);
      process.exit(1);
    }

    await prisma.$disconnect();
    console.log('Database connection closed');
    console.log('Graceful shutdown completed');
    process.exit(0);
  });

  setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(1);
  }, 30000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

startServer();

export { server, signalingServer };
