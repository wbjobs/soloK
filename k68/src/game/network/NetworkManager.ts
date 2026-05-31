import { Peer } from 'peerjs';
import type { DataConnection } from 'peerjs';
import type { NetworkMessage, GameState, PlayerState } from './types';

type MessageHandler = (message: NetworkMessage, peerId: string) => void;

export class NetworkManager {
  private peer: Peer | null = null;
  private connections: Map<string, DataConnection> = new Map();
  private messageHandlers: Set<MessageHandler> = new Set();
  private playerId: string = '';
  private isHost: boolean = false;
  private onConnectionChange: ((connected: boolean) => void) | null = null;

  constructor() {}

  getPlayerId(): string {
    return this.playerId;
  }

  getConnectionCount(): number {
    return this.connections.size;
  }

  isHosting(): boolean {
    return this.isHost;
  }

  isConnected(): boolean {
    return this.connections.size > 0 || this.peer !== null;
  }

  setOnConnectionChange(callback: (connected: boolean) => void): void {
    this.onConnectionChange = callback;
  }

  async hostGame(): Promise<string> {
    return new Promise((resolve, reject) => {
      this.peer = new Peer({
        debug: 2
      });

      this.peer.on('open', (id) => {
        this.playerId = id;
        this.isHost = true;
        console.log('Hosting game with ID:', id);
        resolve(id);
      });

      this.peer.on('connection', (conn) => {
        this.setupConnection(conn);
      });

      this.peer.on('error', (err) => {
        console.error('Peer error:', err);
        reject(err);
      });
    });
  }

  async joinGame(hostId: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      this.peer = new Peer();

      this.peer.on('open', (id) => {
        this.playerId = id;
        this.isHost = false;
        console.log('Joining game as:', id);

        const conn = this.peer!.connect(hostId);
        this.setupConnection(conn);

        conn.on('open', () => {
          console.log('Connected to host');
          resolve(true);
        });

        conn.on('error', (err) => {
          console.error('Connection error:', err);
          reject(err);
        });
      });

      this.peer.on('error', (err) => {
        console.error('Peer error:', err);
        reject(err);
      });
    });
  }

  private setupConnection(conn: DataConnection): void {
    this.connections.set(conn.peer, conn);

    conn.on('open', () => {
      console.log('Connection established with:', conn.peer);
      if (this.onConnectionChange) {
        this.onConnectionChange(true);
      }
    });

    conn.on('data', (data) => {
      const message = data as NetworkMessage;
      this.broadcastMessage(message, conn.peer);
      for (const handler of this.messageHandlers) {
        handler(message, conn.peer);
      }
    });

    conn.on('close', () => {
      console.log('Connection closed with:', conn.peer);
      this.connections.delete(conn.peer);
      if (this.onConnectionChange) {
        this.onConnectionChange(this.connections.size > 0);
      }
    });

    conn.on('error', (err) => {
      console.error('Connection error:', err);
    });
  }

  addMessageHandler(handler: MessageHandler): void {
    this.messageHandlers.add(handler);
  }

  removeMessageHandler(handler: MessageHandler): void {
    this.messageHandlers.delete(handler);
  }

  sendToPeer(peerId: string, message: NetworkMessage): void {
    const conn = this.connections.get(peerId);
    if (conn && conn.open) {
      conn.send(message);
    }
  }

  broadcastMessage(message: NetworkMessage, excludePeerId?: string): void {
    for (const [peerId, conn] of this.connections) {
      if (peerId !== excludePeerId && conn.open) {
        conn.send(message);
      }
    }
  }

  sendToAll(message: NetworkMessage): void {
    for (const [, conn] of this.connections) {
      if (conn.open) {
        conn.send(message);
      }
    }
  }

  disconnect(): void {
    for (const [, conn] of this.connections) {
      conn.close();
    }
    this.connections.clear();
    if (this.peer) {
      this.peer.destroy();
      this.peer = null;
    }
    if (this.onConnectionChange) {
      this.onConnectionChange(false);
    }
  }
}

export const networkManager = new NetworkManager();
