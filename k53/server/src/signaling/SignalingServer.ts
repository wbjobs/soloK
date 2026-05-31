import { Server as HTTPServer, IncomingMessage } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { wsManager } from './WebSocketManager.js';
import { roomRepository } from '../repositories/roomRepository.js';
import { authenticateWebSocket } from '../middleware/auth.js';
import { config } from '../config/index.js';
import { getRandomColor, getCurrentTimestamp } from '../utils/index.js';
import { SignalingMessage, CRDTOperation } from '../types/index.js';
import { operationService } from '../services/operationService.js';
import { URL } from 'url';

export class SignalingServer {
  private wss: WebSocketServer;

  constructor(server: HTTPServer) {
    this.wss = new WebSocketServer({
      server,
      path: config.wsPath,
      verifyClient: this.verifyClient.bind(this),
    });
    this.setupEventListeners();
  }

  private verifyClient(info: { origin: string; req: IncomingMessage; secure: boolean }): boolean {
    try {
      const url = new URL(info.req.url || '', `http://${info.req.headers.host}`);
      const token = url.searchParams.get('token');

      if (!token) {
        console.warn('WebSocket connection attempt without token');
        return false;
      }

      const payload = authenticateWebSocket(token);
      if (!payload) {
        console.warn('WebSocket connection with invalid token');
        return false;
      }

      (info.req as any).user = payload;
      return true;
    } catch (error) {
      console.error('WebSocket verification error:', error);
      return false;
    }
  }

  private setupEventListeners(): void {
    this.wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
      const user = (req as any).user;
      let connectionId: string | null = null;

      ws.on('message', async (data: string) => {
        try {
          const message: SignalingMessage = JSON.parse(data);
          if (!message.roomId || !message.from) {
            wsManager.sendError(ws, 'Invalid message format: roomId and from are required', 'INVALID_MESSAGE');
            return;
          }

          if (user && message.from !== user.userId) {
            wsManager.sendError(ws, 'User ID mismatch', 'USER_MISMATCH');
            return;
          }

          if (user && message.roomId !== user.roomId) {
            wsManager.sendError(ws, 'Room ID mismatch', 'ROOM_MISMATCH');
            return;
          }

          if (!connectionId && message.type !== 'join') {
            wsManager.sendError(ws, 'Must join room first', 'NOT_JOINED');
            return;
          }

          await this.handleMessage(connectionId!, ws, message);
        } catch (error) {
          console.error('Failed to parse message:', error);
          wsManager.sendError(ws, 'Failed to parse message', 'PARSE_ERROR');
        }
      });

      ws.on('close', () => {
        this.handleDisconnect(connectionId);
      });

      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        this.handleDisconnect(connectionId);
      });
    });
  }

  private async handleMessage(connectionId: string | null, ws: WebSocket, message: SignalingMessage): Promise<void> {
    switch (message.type) {
      case 'join':
        connectionId = await this.handleJoin(ws, message);
        break;
      case 'leave':
        this.handleLeave(connectionId, message);
        break;
      case 'offer':
      case 'answer':
      case 'ice-candidate':
        this.handleRelayMessage(message);
        break;
      case 'sync-state':
        this.handleSyncState(message, connectionId);
        break;
      case 'operation':
        await this.handleOperation(message, connectionId);
        break;
      default:
        console.warn('Unknown message type:', message.type);
        wsManager.sendError(ws, `Unknown message type: ${message.type}`, 'UNKNOWN_TYPE');
    }
  }

  private async handleJoin(ws: WebSocket, message: SignalingMessage): Promise<string | null> {
    const { roomId, payload } = message;
    const { userId, userName } = payload;

    const room = await roomRepository.findById(roomId);
    if (!room) {
      wsManager.sendError(ws, 'Room not found', 'ROOM_NOT_FOUND');
      return null;
    }

    let member = await roomRepository.findMemberByUserId(roomId, userId);
    if (!member) {
      member = await roomRepository.addMember(roomId, {
        userId,
        userName,
        color: getRandomColor(),
      });
    } else {
      member = await roomRepository.updateMemberOnline(member.id, true);
    }

    const connectionId = wsManager.addConnection({
      ws,
      roomId,
      userId,
      userName,
      memberId: member.id,
    });

    ws.send(JSON.stringify({
      type: 'member-list',
      from: 'server',
      roomId,
      payload: {
        members: wsManager.getRoomMemberIds(roomId),
        member: {
          id: member.id,
          userId: member.userId,
          userName: member.userName,
          color: member.color,
        },
        currentState: room.currentState,
      },
      timestamp: getCurrentTimestamp(),
    }));

    wsManager.sendToRoom(roomId, {
      type: 'member-joined',
      from: userId,
      roomId,
      payload: { userId, userName, memberId: member.id },
      timestamp: getCurrentTimestamp(),
    }, connectionId);

    console.log(`User ${userName} joined room ${roomId}, connection: ${connectionId}`);
    return connectionId;
  }

  private handleLeave(connectionId: string | null, message: SignalingMessage): void {
    if (!connectionId) return;

    const { roomId, from } = message;
    const connection = wsManager.getConnection(connectionId);

    wsManager.removeConnection(connectionId);

    if (connection) {
      roomRepository.updateMemberOnline(connection.memberId, false).catch(console.error);
    }

    wsManager.sendToRoom(roomId, {
      type: 'member-left',
      from,
      roomId,
      payload: { userId: from },
      timestamp: getCurrentTimestamp(),
    });

    console.log(`User ${from} left room ${roomId}`);
  }

  private handleRelayMessage(message: SignalingMessage): void {
    const { to, roomId } = message;
    if (to) {
      const sent = wsManager.sendToUser(roomId, to, message);
      if (!sent) {
        console.warn(`Failed to relay ${message.type} to user ${to} in room ${roomId}`);
      }
    } else {
      wsManager.sendToRoom(roomId, message);
    }
  }

  private handleSyncState(message: SignalingMessage, connectionId: string | null): void {
    const { roomId, from, payload } = message;
    wsManager.sendToRoom(roomId, {
      type: 'sync-state',
      from,
      roomId,
      payload,
      timestamp: getCurrentTimestamp(),
    }, connectionId ?? undefined);
  }

  private async handleOperation(message: SignalingMessage, connectionId: string | null): Promise<void> {
    const { roomId, from, payload } = message;

    try {
      const operation: CRDTOperation = payload;
      await operationService.saveOperation(roomId, operation);
    } catch (error) {
      console.error('Failed to save operation:', error);
    }

    wsManager.sendToRoom(roomId, {
      type: 'operation',
      from,
      roomId,
      payload,
      timestamp: getCurrentTimestamp(),
    }, connectionId ?? undefined);
  }

  private handleDisconnect(connectionId: string | null): void {
    if (!connectionId) return;

    const connection = wsManager.getConnection(connectionId);
    if (connection) {
      const { roomId, userId, memberId } = connection;

      wsManager.removeConnection(connectionId);

      roomRepository.updateMemberOnline(memberId, false).catch(console.error);

      wsManager.sendToRoom(roomId, {
        type: 'member-left',
        from: userId,
        roomId,
        payload: { userId },
        timestamp: getCurrentTimestamp(),
      });

      console.log(`User ${userId} disconnected from room ${roomId}`);
    }
  }

  public getStats(): {
    totalConnections: number;
    activeRooms: number;
    rooms: string[];
  } {
    return {
      totalConnections: wsManager.getTotalConnections(),
      activeRooms: wsManager.getActiveRooms().length,
      rooms: wsManager.getActiveRooms(),
    };
  }

  public close(): void {
    wsManager.closeAllConnections();
    this.wss.close();
  }
}
