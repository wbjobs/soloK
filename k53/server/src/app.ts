import express, { Request, Response, NextFunction, Application } from 'express';
import cors from 'cors';
import { roomController } from './controllers/roomController.js';
import { snapshotController } from './controllers/snapshotController.js';
import { operationController } from './controllers/operationController.js';
import { authMiddleware, roomAuthMiddleware, optionalAuthMiddleware } from './middleware/auth.js';
import { config } from './config/index.js';
import { handleError, AppError } from './utils/index.js';

const app: Application = express();

app.use(cors({
  origin: config.corsOrigin,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use((req: Request, res: Response, next: NextFunction) => {
  console.log(`${req.method} ${req.path}`);
  next();
});

app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: Date.now(),
    environment: config.nodeEnv,
  });
});

const publicRouter = express.Router();

publicRouter.post('/rooms', roomController.createRoom);
publicRouter.post('/rooms/:roomId/join', roomController.joinRoom);
publicRouter.get('/rooms', roomController.listRooms);

app.use('/api', publicRouter);

const roomProtectedRouter = express.Router();
roomProtectedRouter.use(roomAuthMiddleware);

roomProtectedRouter.get('/rooms/:roomId', roomController.getRoom);
roomProtectedRouter.post('/rooms/:roomId/leave', roomController.leaveRoom);
roomProtectedRouter.delete('/rooms/:roomId', roomController.deleteRoom);
roomProtectedRouter.get('/rooms/:roomId/stats', roomController.getRoomStats);
roomProtectedRouter.post('/rooms/:roomId/fork', roomController.forkRoom);
roomProtectedRouter.get('/rooms/:roomId/branches', roomController.listBranches);

roomProtectedRouter.post('/rooms/:roomId/snapshots', snapshotController.createSnapshot);
roomProtectedRouter.get('/rooms/:roomId/snapshots', snapshotController.listSnapshots);
roomProtectedRouter.get('/rooms/:roomId/snapshots/latest', snapshotController.getLatestSnapshot);
roomProtectedRouter.get('/rooms/:roomId/snapshots/search', snapshotController.searchSnapshots);

roomProtectedRouter.get('/rooms/:roomId/operations', operationController.listOperations);
roomProtectedRouter.post('/rooms/:roomId/replay', operationController.replayOperations);
roomProtectedRouter.post('/rooms/:roomId/operations', operationController.saveOperation);
roomProtectedRouter.post('/rooms/:roomId/operations/batch', operationController.saveOperations);
roomProtectedRouter.get('/rooms/:roomId/operations/stats', operationController.getOperationStats);
roomProtectedRouter.get('/rooms/:roomId/operations/version/:version', operationController.getOperationsByVersion);

app.use('/api', roomProtectedRouter);

const protectedRouter = express.Router();
protectedRouter.use(authMiddleware);

protectedRouter.get('/snapshots/:snapshotId', snapshotController.getSnapshot);
protectedRouter.post('/snapshots/:snapshotId/restore', snapshotController.restoreSnapshot);
protectedRouter.get('/snapshots/:snapshotId/export', snapshotController.exportSnapshot);
protectedRouter.delete('/snapshots/:snapshotId', snapshotController.deleteSnapshot);
protectedRouter.put('/snapshots/:snapshotId', snapshotController.updateSnapshot);
protectedRouter.get('/snapshots/:snapshotId/query', snapshotController.queryGraphData);

protectedRouter.get('/operations/:operationId', operationController.getOperation);

app.use('/api', protectedRouter);

app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: 'Not Found',
    path: req.path,
    method: req.method,
  });
});

app.use((error: unknown, req: Request, res: Response, next: NextFunction) => {
  console.error('Unhandled error:', error);
  const { statusCode, body } = handleError(error);
  res.status(statusCode).json(body);
});

process.on('unhandledRejection', (reason: unknown) => {
  console.error('Unhandled Rejection:', reason);
});

process.on('uncaughtException', (error: Error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

export default app;
