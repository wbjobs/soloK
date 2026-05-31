import ReconnectingWebSocket from 'reconnecting-websocket'
import type { ConnectionStatus, Member } from '../types/api'
import type { SignalingMessage, MemberInfo } from '../types/crdt'

type SignalingMessageHandler = (message: SignalingMessage) => void
type StatusChangeListener = (status: ConnectionStatus) => void
type MembersChangeListener = (members: MemberInfo[]) => void

export class SignalingClient {
  private ws: ReconnectingWebSocket | null = null
  private url: string
  private roomId: string | null = null
  private memberId: string | null = null
  private userId: string | null = null
  private userName: string | null = null
  private memberColor: string | null = null
  private messageHandlers: Set<SignalingMessageHandler> = new Set()
  private statusListeners: Set<StatusChangeListener> = new Set()
  private membersListeners: Set<MembersChangeListener> = new Set()
  private status: ConnectionStatus = 'disconnected'
  private heartbeatInterval: number | null = null
  private readonly HEARTBEAT_INTERVAL = 30000

  constructor(url: string) {
    this.url = url
  }

  connect(
    roomId: string,
    memberId: string,
    userId: string,
    userName: string,
    memberColor: string
  ): Promise<{ yourId: string; members: Member[] }> {
    return new Promise((resolve, reject) => {
      this.roomId = roomId
      this.memberId = memberId
      this.userId = userId
      this.userName = userName
      this.memberColor = memberColor

      try {
        this.ws = new ReconnectingWebSocket(this.url, [], {
          maxReconnectionDelay: 10000,
          minReconnectionDelay: 1000,
          reconnectionDelayGrowFactor: 1.3,
          connectionTimeout: 5000,
          maxRetries: Infinity,
          debug: false
        })

        this.ws.onopen = () => {
          this.setStatus('connecting')
          this.sendJoinMessage()
          this.startHeartbeat()
        }

        this.ws.onmessage = (event) => {
          try {
            const message: SignalingMessage = JSON.parse(event.data)
            this.handleMessage(message, resolve, reject)
          } catch (error) {
            console.error('Failed to parse signaling message:', error)
          }
        }

        this.ws.onclose = () => {
          this.setStatus('disconnected')
          this.stopHeartbeat()
        }

        this.ws.onerror = (error) => {
          console.error('Signaling WebSocket error:', error)
          this.setStatus('reconnecting')
          reject(error)
        }
      } catch (error) {
        reject(error)
      }
    })
  }

  private sendJoinMessage(): void {
    if (!this.roomId || !this.memberId || !this.userId || !this.userName || !this.memberColor) return

    const message: SignalingMessage = {
      type: 'join',
      from: this.memberId,
      roomId: this.roomId,
      timestamp: Date.now(),
      payload: {
        userId: this.userId,
        userName: this.userName,
        color: this.memberColor
      }
    }

    this.send(message)
  }

  private handleMessage(
    message: SignalingMessage,
    resolve: (value: { yourId: string; members: Member[] }) => void,
    _reject: (reason?: unknown) => void
  ): void {
    switch (message.type) {
      case 'member-joined': {
        const payload = message.payload
        if ('memberId' in payload && 'userId' in payload && 'userName' in payload && 'color' in payload) {
          const member: MemberInfo = {
            id: payload.memberId,
            userId: payload.userId,
            userName: payload.userName,
            color: payload.color,
            isOnline: true,
            joinedAt: message.timestamp
          }
          this.emitMembers([member])
        }
        break
      }
      case 'member-left': {
        const payload = message.payload
        if ('memberId' in payload) {
          this.emitMembers([{
            id: payload.memberId,
            userId: '',
            userName: '',
            color: '',
            isOnline: false,
            joinedAt: 0
          }])
        }
        break
      }
      case 'sync-state': {
        this.setStatus('connected')
        const members: Member[] = []
        resolve({ yourId: this.memberId || '', members })
        break
      }
      default:
        this.notifyHandlers(message)
    }
  }

  sendOffer(to: string, sdp: RTCSessionDescriptionInit): void {
    if (!this.memberId || !this.roomId) return

    const message: SignalingMessage = {
      type: 'offer',
      from: this.memberId,
      to,
      roomId: this.roomId,
      timestamp: Date.now(),
      payload: {
        offer: sdp
      }
    }

    this.send(message)
  }

  sendAnswer(to: string, sdp: RTCSessionDescriptionInit): void {
    if (!this.memberId || !this.roomId) return

    const message: SignalingMessage = {
      type: 'answer',
      from: this.memberId,
      to,
      roomId: this.roomId,
      timestamp: Date.now(),
      payload: {
        answer: sdp
      }
    }

    this.send(message)
  }

  sendIceCandidate(to: string, candidate: RTCIceCandidateInit): void {
    if (!this.memberId || !this.roomId) return

    const message: SignalingMessage = {
      type: 'ice-candidate',
      from: this.memberId,
      to,
      roomId: this.roomId,
      timestamp: Date.now(),
      payload: {
        candidate: new RTCIceCandidate(candidate)
      }
    }

    this.send(message)
  }

  private send(message: SignalingMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message))
    } else {
      console.warn('Signaling WebSocket is not open, message queued:', message.type)
    }
  }

  private notifyHandlers(message: SignalingMessage): void {
    this.messageHandlers.forEach((handler) => {
      try {
        handler(message)
      } catch (error) {
        console.error('Error in signaling message handler:', error)
      }
    })
  }

  onMessage(handler: SignalingMessageHandler): () => void {
    this.messageHandlers.add(handler)
    return () => {
      this.messageHandlers.delete(handler)
    }
  }

  onStatusChange(listener: StatusChangeListener): () => void {
    this.statusListeners.add(listener)
    listener(this.status)
    return () => {
      this.statusListeners.delete(listener)
    }
  }

  onMembersChange(listener: MembersChangeListener): () => void {
    this.membersListeners.add(listener)
    return () => {
      this.membersListeners.delete(listener)
    }
  }

  private emitMembers(members: MemberInfo[]): void {
    this.membersListeners.forEach((listener) => {
      try {
        listener(members)
      } catch (error) {
        console.error('Error in members listener:', error)
      }
    })
  }

  private setStatus(status: ConnectionStatus): void {
    this.status = status
    this.statusListeners.forEach((listener) => {
      try {
        listener(status)
      } catch (error) {
        console.error('Error in status listener:', error)
      }
    })
  }

  getStatus(): ConnectionStatus {
    return this.status
  }

  getMemberId(): string | null {
    return this.memberId
  }

  getRoomId(): string | null {
    return this.roomId
  }

  private startHeartbeat(): void {
    this.stopHeartbeat()
    this.heartbeatInterval = window.setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.send({
          type: 'sync-state',
          from: this.memberId || '',
          roomId: this.roomId || '',
          timestamp: Date.now(),
          payload: {
            state: new Uint8Array(),
            version: 1
          }
        })
      }
    }, this.HEARTBEAT_INTERVAL)
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval !== null) {
      clearInterval(this.heartbeatInterval)
      this.heartbeatInterval = null
    }
  }

  disconnect(): void {
    this.stopHeartbeat()

    if (this.ws && this.roomId && this.memberId && this.userId) {
      const leaveMessage: SignalingMessage = {
        type: 'leave',
        from: this.memberId,
        roomId: this.roomId,
        timestamp: Date.now(),
        payload: {
          userId: this.userId
        }
      }
      this.send(leaveMessage)
    }

    this.messageHandlers.clear()
    this.statusListeners.clear()
    this.membersListeners.clear()

    if (this.ws) {
      this.ws.close()
      this.ws = null
    }

    this.setStatus('disconnected')
    this.roomId = null
    this.memberId = null
    this.userId = null
    this.userName = null
    this.memberColor = null
  }
}
