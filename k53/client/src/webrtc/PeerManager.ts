import * as Y from 'yjs'
import type { SignalingClient } from './SignalingClient'
import type { YjsProvider } from '../crdt/YjsProvider'
import type { PeerConnectionState, ConnectionStatus, Member } from '../types/api'
import type { SignalingMessage } from '../types/crdt'

type DataChannelMessageType = 
  | 'yjs-sync' 
  | 'yjs-update' 
  | 'cursor' 
  | 'selection' 
  | 'ping' 
  | 'pong'
  | 'drag-lock'
  | 'drag-unlock'
  | 'drag-position'

interface DataChannelMessage {
  type: DataChannelMessageType
  payload: unknown
  timestamp: number
}

type PeerStatusChangeListener = (peerId: string, status: PeerConnectionState['status']) => void
type PeersChangeListener = (peers: Map<string, PeerConnectionState>) => void
type DataChannelMessageHandler = (peerId: string, message: DataChannelMessage) => void

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' }
  ],
  iceCandidatePoolSize: 10
}

const DATA_CHANNEL_LABEL = 'yjs-sync'

export class PeerManager {
  private signalingClient: SignalingClient
  private yjsProvider: YjsProvider
  private localMemberId: string | null = null
  private peers: Map<string, PeerConnectionState> = new Map()
  private pendingIceCandidates: Map<string, RTCIceCandidateInit[]> = new Map()
  private peerStatusListeners: Set<PeerStatusChangeListener> = new Set()
  private peersListeners: Set<PeersChangeListener> = new Set()
  private messageHandlers: Map<DataChannelMessageType, Set<DataChannelMessageHandler>> = new Map()
  private signalingUnsubscribers: Array<() => void> = []
  private yjsUpdateUnsubscribe: (() => void) | null = null

  constructor(signalingClient: SignalingClient, yjsProvider: YjsProvider) {
    this.signalingClient = signalingClient
    this.yjsProvider = yjsProvider
    this.setupMessageHandlers()
  }

  private setupMessageHandlers(): void {
    const unsub1 = this.signalingClient.onMessage((message) => {
      switch (message.type) {
        case 'offer':
          this.handleOffer(message)
          break
        case 'answer':
          this.handleAnswer(message)
          break
        case 'ice-candidate':
          this.handleIceCandidate(message)
          break
        case 'member-joined':
          this.onPeerJoined(message)
          break
        case 'member-left':
          this.onPeerLeft(message)
          break
      }
    })

    const unsub2 = this.signalingClient.onStatusChange((status) => {
      if (status === 'connected') {
        this.localMemberId = this.signalingClient.getMemberId()
      }
    })

    this.signalingUnsubscribers.push(unsub1, unsub2)
  }

  async connectToRoom(
    roomId: string,
    memberId: string,
    userId: string,
    memberName: string,
    memberColor: string
  ): Promise<{ yourId: string; members: Member[] }> {
    const result = await this.signalingClient.connect(roomId, memberId, userId, memberName, memberColor)
    this.localMemberId = result.yourId
    this.setupYjsSync()

    for (const member of result.members) {
      if (member.id !== this.localMemberId && member.isOnline) {
        this.createPeerConnection(member.id, true)
      }
    }

    return result
  }

  private setupYjsSync(): void {
    this.yjsUpdateUnsubscribe = this.yjsProvider.onUpdate((update: Uint8Array, origin: unknown) => {
      if (origin !== this.yjsProvider.getOrigin()) return
      this.broadcastYjsUpdate(update)
    })

    this.registerMessageHandler('yjs-sync', (peerId, message) => {
      this.handleYjsSync(peerId, message.payload as number[])
    })

    this.registerMessageHandler('yjs-update', (_peerId, message) => {
      this.handleYjsUpdate(message.payload as number[])
    })
  }

  private createPeerConnection(peerId: string, isInitiator: boolean): RTCPeerConnection {
    const existing = this.peers.get(peerId)
    if (existing?.connection) {
      return existing.connection
    }

    const pc = new RTCPeerConnection(RTC_CONFIG)

    const state: PeerConnectionState = {
      peerId,
      status: 'connecting',
      connection: pc,
      isInitiator,
      connectedAt: undefined
    }

    this.peers.set(peerId, state)
    this.notifyPeersChange()
    this.notifyPeerStatusChange(peerId, 'connecting')

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.signalingClient.sendIceCandidate(peerId, event.candidate.toJSON())
      }
    }

    pc.onconnectionstatechange = () => {
      this.handleConnectionStateChange(peerId, pc)
    }

    pc.oniceconnectionstatechange = () => {
      this.handleIceConnectionStateChange(peerId, pc)
    }

    pc.onsignalingstatechange = () => {
      if (pc.signalingState === 'stable') {
        this.flushPendingIceCandidates(peerId, pc)
      }
    }

    pc.ondatachannel = (event) => {
      if (event.channel.label === DATA_CHANNEL_LABEL) {
        this.setupDataChannel(peerId, event.channel)
      }
    }

    if (isInitiator) {
      const dataChannel = pc.createDataChannel(DATA_CHANNEL_LABEL, {
        ordered: true
      })
      this.setupDataChannel(peerId, dataChannel)
      this.createAndSendOffer(peerId, pc)
    }

    return pc
  }

  private setupDataChannel(peerId: string, channel: RTCDataChannel): void {
    const state = this.peers.get(peerId)
    if (!state) return

    state.dataChannel = channel

    channel.onopen = () => {
      console.log(`DataChannel open with ${peerId}`)
      state.status = 'connected'
      state.connectedAt = Date.now()
      this.notifyPeerStatusChange(peerId, 'connected')
      this.notifyPeersChange()
      this.sendYjsSync(peerId)
    }

    channel.onclose = () => {
      console.log(`DataChannel closed with ${peerId}`)
      state.status = 'disconnected'
      this.notifyPeerStatusChange(peerId, 'disconnected')
      this.notifyPeersChange()
    }

    channel.onerror = (error) => {
      console.error(`DataChannel error with ${peerId}:`, error)
      state.status = 'failed'
      this.notifyPeerStatusChange(peerId, 'failed')
      this.notifyPeersChange()
    }

    channel.onmessage = (event) => {
      try {
        if (event.data instanceof ArrayBuffer) {
          const message: DataChannelMessage = {
            type: 'yjs-update',
            payload: Array.from(new Uint8Array(event.data)),
            timestamp: Date.now()
          }
          this.handleDataChannelMessage(peerId, message)
        } else {
          const message: DataChannelMessage = JSON.parse(event.data)
          this.handleDataChannelMessage(peerId, message)
        }
      } catch (error) {
        console.error('Failed to parse DataChannel message:', error)
      }
    }
  }

  private async createAndSendOffer(peerId: string, pc: RTCPeerConnection): Promise<void> {
    try {
      const offer = await pc.createOffer({
        offerToReceiveAudio: false,
        offerToReceiveVideo: false
      })
      await pc.setLocalDescription(offer)
      this.signalingClient.sendOffer(peerId, offer)
    } catch (error) {
      console.error(`Failed to create offer for ${peerId}:`, error)
      this.setPeerStatus(peerId, 'failed')
    }
  }

  private async handleOffer(message: SignalingMessage): Promise<void> {
    const peerId = message.from
    if (peerId === this.localMemberId) return

    const pc = this.createPeerConnection(peerId, false)

    try {
      const payload = message.payload
      if ('offer' in payload) {
        await pc.setRemoteDescription(new RTCSessionDescription(payload.offer))
        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)
        this.signalingClient.sendAnswer(peerId, answer)
      }
    } catch (error) {
      console.error(`Failed to handle offer from ${peerId}:`, error)
      this.setPeerStatus(peerId, 'failed')
    }
  }

  private async handleAnswer(message: SignalingMessage): Promise<void> {
    const peerId = message.from
    const state = this.peers.get(peerId)
    if (!state?.connection) return

    try {
      const payload = message.payload
      if ('answer' in payload) {
        await state.connection.setRemoteDescription(new RTCSessionDescription(payload.answer))
      }
    } catch (error) {
      console.error(`Failed to handle answer from ${peerId}:`, error)
      this.setPeerStatus(peerId, 'failed')
    }
  }

  private async handleIceCandidate(message: SignalingMessage): Promise<void> {
    const peerId = message.from
    const state = this.peers.get(peerId)

    const payload = message.payload
    let candidate: RTCIceCandidateInit | undefined
    if ('candidate' in payload) {
      candidate = payload.candidate
    }

    if (!candidate) return

    if (!state?.connection || state.connection.signalingState !== 'stable') {
      if (!this.pendingIceCandidates.has(peerId)) {
        this.pendingIceCandidates.set(peerId, [])
      }
      this.pendingIceCandidates.get(peerId)!.push(candidate)
      return
    }

    try {
      await state.connection.addIceCandidate(new RTCIceCandidate(candidate))
    } catch (error) {
      console.error(`Failed to add ICE candidate from ${peerId}:`, error)
    }
  }

  private async flushPendingIceCandidates(peerId: string, pc: RTCPeerConnection): Promise<void> {
    const candidates = this.pendingIceCandidates.get(peerId) || []
    this.pendingIceCandidates.delete(peerId)

    for (const candidate of candidates) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate))
      } catch (error) {
        console.error(`Failed to add pending ICE candidate from ${peerId}:`, error)
      }
    }
  }

  private handleConnectionStateChange(peerId: string, pc: RTCPeerConnection): void {
    const state = this.peers.get(peerId)
    if (!state) return

    switch (pc.connectionState) {
      case 'connected':
        state.status = 'connected'
        state.connectedAt = Date.now()
        break
      case 'disconnected':
        state.status = 'disconnected'
        break
      case 'failed':
        state.status = 'failed'
        break
      case 'closed':
        state.status = 'closed'
        break
      case 'connecting':
        state.status = 'connecting'
        break
    }

    this.notifyPeerStatusChange(peerId, state.status)
    this.notifyPeersChange()
  }

  private handleIceConnectionStateChange(peerId: string, pc: RTCPeerConnection): void {
    if (pc.iceConnectionState === 'failed') {
      console.log(`ICE connection failed with ${peerId}, attempting restart...`)
      this.restartIce(peerId)
    } else if (pc.iceConnectionState === 'disconnected') {
      console.log(`ICE connection disconnected with ${peerId}`)
      this.setPeerStatus(peerId, 'disconnected')
    }
  }

  private async restartIce(peerId: string): Promise<void> {
    const state = this.peers.get(peerId)
    if (!state?.connection || state.isInitiator === false) return

    try {
      await state.connection.restartIce()
      const offer = await state.connection.createOffer()
      await state.connection.setLocalDescription(offer)
      this.signalingClient.sendOffer(peerId, offer)
    } catch (error) {
      console.error(`Failed to restart ICE with ${peerId}:`, error)
    }
  }

  private onPeerJoined(message: SignalingMessage): void {
    const payload = message.payload
    let memberId: string | undefined

    if ('memberId' in payload) {
      memberId = payload.memberId
    }

    if (!memberId || memberId === this.localMemberId) return

    const shouldInitiate = this.localMemberId
      ? this.localMemberId.localeCompare(memberId) < 0
      : true

    this.createPeerConnection(memberId, shouldInitiate)
  }

  private onPeerLeft(message: SignalingMessage): void {
    const payload = message.payload
    let memberId: string | undefined

    if ('memberId' in payload) {
      memberId = payload.memberId
    }

    if (memberId) {
      this.closePeerConnection(memberId)
    }
  }

  private closePeerConnection(peerId: string): void {
    const state = this.peers.get(peerId)
    if (!state) return

    if (state.dataChannel) {
      try {
        state.dataChannel.close()
      } catch (e) {
        console.error('Error closing data channel:', e)
      }
    }

    if (state.connection) {
      try {
        state.connection.close()
      } catch (e) {
        console.error('Error closing peer connection:', e)
      }
    }

    this.peers.delete(peerId)
    this.pendingIceCandidates.delete(peerId)
    this.notifyPeerStatusChange(peerId, 'closed')
    this.notifyPeersChange()
  }

  private setPeerStatus(peerId: string, status: PeerConnectionState['status']): void {
    const state = this.peers.get(peerId)
    if (state && state.status !== status) {
      state.status = status
      this.notifyPeerStatusChange(peerId, status)
      this.notifyPeersChange()
    }
  }

  sendToPeer(peerId: string, message: DataChannelMessage): boolean {
    const state = this.peers.get(peerId)
    if (!state?.dataChannel || state.dataChannel.readyState !== 'open') {
      return false
    }

    try {
      if (message.type === 'yjs-update' && Array.isArray(message.payload)) {
        state.dataChannel.send(new Uint8Array(message.payload))
      } else {
        state.dataChannel.send(JSON.stringify(message))
      }
      return true
    } catch (error) {
      console.error(`Failed to send message to ${peerId}:`, error)
      return false
    }
  }

  broadcast(message: DataChannelMessage): void {
    for (const peerId of Array.from(this.peers.keys())) {
      this.sendToPeer(peerId, message)
    }
  }

  private broadcastYjsUpdate(update: Uint8Array): void {
    const message: DataChannelMessage = {
      type: 'yjs-update',
      payload: Array.from(update),
      timestamp: Date.now()
    }
    this.broadcast(message)
  }

  private sendYjsSync(peerId: string): void {
    const state = Y.encodeStateAsUpdate(this.yjsProvider.getDoc())
    const message: DataChannelMessage = {
      type: 'yjs-sync',
      payload: Array.from(state),
      timestamp: Date.now()
    }
    this.sendToPeer(peerId, message)
  }

  private handleYjsSync(peerId: string, payload: number[]): void {
    try {
      const update = new Uint8Array(payload)

      this.yjsProvider.transact(() => {
        Y.applyUpdate(this.yjsProvider.getDoc(), update, `peer-${peerId}`)
      })

      const localState = Y.encodeStateAsUpdate(this.yjsProvider.getDoc())
      const message: DataChannelMessage = {
        type: 'yjs-update',
        payload: Array.from(localState),
        timestamp: Date.now()
      }
      this.sendToPeer(peerId, message)
    } catch (error) {
      console.error('Failed to handle yjs-sync:', error)
    }
  }

  private handleYjsUpdate(payload: number[]): void {
    try {
      const update = new Uint8Array(payload)
      Y.applyUpdate(this.yjsProvider.getDoc(), update, 'remote')
    } catch (error) {
      console.error('Failed to handle yjs-update:', error)
    }
  }

  private handleDataChannelMessage(peerId: string, message: DataChannelMessage): void {
    const handlers = this.messageHandlers.get(message.type)
    if (handlers) {
      handlers.forEach((handler) => {
        try {
          handler(peerId, message)
        } catch (error) {
          console.error(`Error in DataChannel message handler for ${message.type}:`, error)
        }
      })
    }
  }

  registerMessageHandler(type: DataChannelMessageType, handler: DataChannelMessageHandler): () => void {
    if (!this.messageHandlers.has(type)) {
      this.messageHandlers.set(type, new Set())
    }
    this.messageHandlers.get(type)!.add(handler)

    return () => {
      this.messageHandlers.get(type)?.delete(handler)
    }
  }

  onPeerStatusChange(listener: PeerStatusChangeListener): () => void {
    this.peerStatusListeners.add(listener)
    return () => {
      this.peerStatusListeners.delete(listener)
    }
  }

  onPeersChange(listener: PeersChangeListener): () => void {
    this.peersListeners.add(listener)
    listener(new Map(this.peers))
    return () => {
      this.peersListeners.delete(listener)
    }
  }

  private notifyPeerStatusChange(peerId: string, status: PeerConnectionState['status']): void {
    this.peerStatusListeners.forEach((listener) => {
      try {
        listener(peerId, status)
      } catch (error) {
        console.error('Error in peer status listener:', error)
      }
    })
  }

  private notifyPeersChange(): void {
    this.peersListeners.forEach((listener) => {
      try {
        listener(new Map(this.peers))
      } catch (error) {
        console.error('Error in peers listener:', error)
      }
    })
  }

  getPeers(): Map<string, PeerConnectionState> {
    return new Map(this.peers)
  }

  getPeer(peerId: string): PeerConnectionState | undefined {
    return this.peers.get(peerId)
  }

  getConnectedPeers(): string[] {
    const result: string[] = []
    this.peers.forEach((state, peerId) => {
      if (state.status === 'connected') {
        result.push(peerId)
      }
    })
    return result
  }

  getConnectionStatus(): ConnectionStatus {
    return this.signalingClient.getStatus()
  }

  getLocalMemberId(): string | null {
    return this.localMemberId
  }

  disconnect(): void {
    if (this.yjsUpdateUnsubscribe) {
      this.yjsUpdateUnsubscribe()
      this.yjsUpdateUnsubscribe = null
    }

    this.signalingUnsubscribers.forEach((unsub) => unsub())
    this.signalingUnsubscribers = []

    for (const peerId of Array.from(this.peers.keys())) {
      this.closePeerConnection(peerId)
    }

    this.peerStatusListeners.clear()
    this.peersListeners.clear()
    this.messageHandlers.clear()
    this.pendingIceCandidates.clear()
    this.localMemberId = null

    this.signalingClient.disconnect()
  }
}
