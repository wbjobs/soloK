import { WebSocket } from 'ws';
import { generateShortId } from '../utils/index.js';

interface WebSocketConnection {
  ws: WebSocket;
  roomId: string;
  userId: string;
  userName: string;
  memberId: string;
}

export class WebSocketManager {
  private connections: Map<string, WebSocketConnection> = new Map();
  private roomConnections: Map<string, Set<string>> = new Map();

  addConnection(connection: WebSocketConnection): string {
    const connectionId = generateShortId();
    this.connections.set(connectionId, connection);
    if (!this.roomConnections.has(connection.roomId)) {
      this.roomConnections.set(connection.roomId, new Set());
    }
    this.roomConnections.get(connection.roomId)!.add(connectionId);
    return connectionId;
  }

  removeConnection(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (connection) {
      const roomConnections = this.roomConnections.get(connection.roomId);
      if (roomConnections) {
        roomConnections.delete(connectionId);
        if (roomConnections.size === 0) {
          this.roomConnections.delete(connection.roomId);
        }
      }
    }
    this.connections.delete(connectionId);
  }

  getConnection(connectionId: string): WebSocketConnection | undefined {
    return this.connections.get(connectionId);
  }

  getConnectionIdByUserId(roomId: string, userId: string): string | undefined {
    const connectionIds = this.roomConnections.get(roomId);
    if (!connectionIds) return undefined;
    for (const id of connectionIds) {
      const conn = this.connections.get(id);
      if (conn && conn.userId === userId) {
        return id;
      }
    }
    return undefined;
  }

  getRoomMembers(roomId: string): WebSocketConnection[] {
    const connectionIds = this.roomConnections.get(roomId);
    if (!connectionIds) return [];
    return Array.from(connectionIds)
      .map(id => this.connections.get(id))
      .filter((conn): conn is WebSocketConnection => conn !== undefined);
  }

  getRoomMemberIds(roomId: string): { userId: string; userName: string }[] {
    return this.getRoomMembers(roomId).map(m => ({
      userId: m.userId,
      userName: m.userName,
    }));
  }

  getRoomCount(roomId: string): number {
    return this.getRoomMembers(roomId).length;
  }

  isUserInRoom(roomId: string, userId: string): boolean {
    return this.getConnectionIdByUserId(roomId, userId) !== undefined;
  }

  sendToRoom(roomId: string, message: any, excludeConnectionId?: string): void {
    const members = this.getRoomMembers(roomId);
    members.forEach(member => {
      const connectionId = this.getConnectionIdByUserId(member.roomId, member.userId);
      if (connectionId && connectionId !== excludeConnectionId && member.ws.readyState === WebSocket.OPEN) {
        try {
          member.ws.send(JSON.stringify(message));
        } catch (error) {
          console.error('Failed to send message to room member:', error);
        }
      }
    });
  }

  sendToUser(roomId: string, userId: string, message: any): boolean {
    const connectionId = this.getConnectionIdByUserId(roomId, userId);
    if (connectionId) {
      const connection = this.connections.get(connectionId);
      if (connection && connection.ws.readyState === WebSocket.OPEN) {
        try {
          connection.ws.send(JSON.stringify(message));
          return true;
        } catch (error) {
          console.error('Failed to send message to user:', error);
        }
      }
    }
    return false;
  }

  sendError(ws: WebSocket, message: string, code?: string): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'error',
        from: 'server',
        payload: { message, code },
        timestamp: Date.now(),
      }));
    }
  }

  broadcastToAll(message: any): void {
    this.connections.forEach(connection => {
      if (connection.ws.readyState === WebSocket.OPEN) {
        try {
          connection.ws.send(JSON.stringify(message));
        } catch (error) {
          console.error('Failed to broadcast message:', error);
        }
      }
    });
  }

  getTotalConnections(): number {
    return this.connections.size;
  }

  getActiveRooms(): string[] {
    return Array.from(this.roomConnections.keys());
  }

  getRoomStats(roomId: string): {
    memberCount: number;
    activeMembers: { userId: string; userName: string }[];
  } {
    return {
      memberCount: this.getRoomCount(roomId),
      activeMembers: this.getRoomMemberIds(roomId),
    };
  }

  closeAllConnections(): void {
    this.connections.forEach((connection, connectionId) => {
      if (connection.ws.readyState === WebSocket.OPEN) {
        connection.ws.close();
      }
      this.removeConnection(connectionId);
    });
  }
}

export const wsManager = new WebSocketManager();
