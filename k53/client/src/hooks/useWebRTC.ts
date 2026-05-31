import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { PeerManager } from '../webrtc/PeerManager'
import type { SignalingClient } from '../webrtc/SignalingClient'
import type { YjsProvider } from '../crdt/YjsProvider'
import { useRoomStore } from '../store/roomStore'
import { useEditorStore } from '../store/editorStore'
import type { PeerConnectionState, ConnectionStatus, Member, CursorPosition, Selection } from '../types/api'

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

interface DragLockPayload {
  nodeId: string
  userId: string
  userName: string
  timestamp: number
  x: number
  y: number
}

interface DragUnlockPayload {
  nodeId: string
  userId: string
  timestamp: number
  finalX: number
  finalY: number
}

interface DragPositionPayload {
  nodeId: string
  userId: string
  timestamp: number
  x: number
  y: number
}

interface UseWebRTCOptions {
  signalingClient: SignalingClient | null
  yjsProvider: YjsProvider | null
  roomId: string | null
  memberId: string | null
  userId: string | null
  memberName: string | null
  memberColor: string | null
  autoConnect?: boolean
  onPeerStatusChange?: (peerId: string, status: PeerConnectionState['status']) => void
  onPeersChange?: (peers: Map<string, PeerConnectionState>) => void
  onCursorMessage?: (peerId: string, cursor: CursorPosition) => void
  onSelectionMessage?: (peerId: string, selection: Selection) => void
  onDragLockMessage?: (peerId: string, payload: DragLockPayload) => void
  onDragUnlockMessage?: (peerId: string, payload: DragUnlockPayload) => void
  onDragPositionMessage?: (peerId: string, payload: DragPositionPayload) => void
}

interface UseWebRTCResult {
  peerManager: PeerManager | null
  isConnected: boolean
  connectionStatus: ConnectionStatus
  isLoading: boolean
  error: string | null
  peers: Map<string, PeerConnectionState>
  connectedPeerIds: string[]

  connect: () => Promise<{ yourId: string; members: Member[] } | null>
  disconnect: () => void

  sendCursor: (cursor: CursorPosition) => void
  sendSelection: (selection: Selection) => void
  sendDragLock: (payload: DragLockPayload) => void
  sendDragUnlock: (payload: DragUnlockPayload) => void
  sendDragPosition: (payload: DragPositionPayload) => void
  broadcast: (message: DataChannelMessage) => void
  sendToPeer: (peerId: string, message: DataChannelMessage) => boolean

  onPeerStatusChange: (listener: (peerId: string, status: PeerConnectionState['status']) => void) => (() => void) | null
  onPeersChange: (listener: (peers: Map<string, PeerConnectionState>) => void) => (() => void) | null
  registerMessageHandler: (type: DataChannelMessageType, handler: (peerId: string, message: DataChannelMessage) => void) => (() => void) | null

  getPeers: () => Map<string, PeerConnectionState>
  getPeer: (peerId: string) => PeerConnectionState | undefined
  getConnectedPeers: () => string[]
  getLocalMemberId: () => string | null
}

export function useWebRTC({
  signalingClient,
  yjsProvider,
  roomId,
  memberId,
  userId,
  memberName,
  memberColor,
  autoConnect = true,
  onPeerStatusChange,
  onPeersChange,
  onCursorMessage,
  onSelectionMessage,
  onDragLockMessage,
  onDragUnlockMessage,
  onDragPositionMessage
}: UseWebRTCOptions): UseWebRTCResult {
  const peerManagerRef = useRef<PeerManager | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [peers, setPeers] = useState<Map<string, PeerConnectionState>>(new Map())

  const unsubscribersRef = useRef<Array<() => void>>([])

  const setPeerState = useRoomStore((state) => state.setPeerState)
  const removePeerState = useRoomStore((state) => state.removePeerState)
  const clearPeerStates = useRoomStore((state) => state.clearPeerStates)
  const setConnectionStatus = useRoomStore((state) => state.setConnectionStatus)
  const setMembers = useRoomStore((state) => state.setMembers)

  const updateRemoteCursor = useEditorStore((state) => state.updateRemoteCursor)
  const updateRemoteSelection = useEditorStore((state) => state.updateRemoteSelection)
  const acquireDragLock = useEditorStore((state) => state.acquireDragLock)
  const releaseDragLock = useEditorStore((state) => state.releaseDragLock)
  const updateRemoteDragPosition = useEditorStore((state) => state.updateRemoteDragPosition)

  const cleanup = useCallback(() => {
    unsubscribersRef.current.forEach((unsub) => {
      try {
        unsub()
      } catch (e) {
        console.error('Error unsubscribing from peer manager:', e)
      }
    })
    unsubscribersRef.current = []

    if (peerManagerRef.current) {
      try {
        peerManagerRef.current.disconnect()
      } catch (e) {
        console.error('Error disconnecting peer manager:', e)
      }
      peerManagerRef.current = null
    }

    setPeers(new Map())
    clearPeerStates()
    setConnectionStatus('disconnected')
  }, [clearPeerStates, setConnectionStatus])

  const handlePeerStatusChange = useCallback((peerId: string, status: PeerConnectionState['status']) => {
    const state = peerManagerRef.current?.getPeer(peerId)
    if (state) {
      setPeerState(peerId, state)
    }

    if (status === 'disconnected' || status === 'closed' || status === 'failed') {
      removePeerState(peerId)
    }

    onPeerStatusChange?.(peerId, status)
  }, [setPeerState, removePeerState, onPeerStatusChange])

  const handlePeersChange = useCallback((newPeers: Map<string, PeerConnectionState>) => {
    setPeers(new Map(newPeers))

    newPeers.forEach((state, peerId) => {
      setPeerState(peerId, state)
    })

    onPeersChange?.(newPeers)
  }, [setPeerState, onPeersChange])

  const handleCursorMessage = useCallback((peerId: string, message: DataChannelMessage) => {
    const cursor = message.payload as CursorPosition
    updateRemoteCursor(cursor)
    onCursorMessage?.(peerId, cursor)
  }, [updateRemoteCursor, onCursorMessage])

  const handleSelectionMessage = useCallback((peerId: string, message: DataChannelMessage) => {
    const selection = message.payload as Selection
    updateRemoteSelection(selection)
    onSelectionMessage?.(peerId, selection)
  }, [updateRemoteSelection, onSelectionMessage])

  const handleDragLockMessage = useCallback((peerId: string, message: DataChannelMessage) => {
    const payload = message.payload as DragLockPayload
    acquireDragLock(
      payload.nodeId,
      payload.userId,
      payload.userName,
      payload.x,
      payload.y
    )
    onDragLockMessage?.(peerId, payload)
  }, [acquireDragLock, onDragLockMessage])

  const handleDragUnlockMessage = useCallback((peerId: string, message: DataChannelMessage) => {
    const payload = message.payload as DragUnlockPayload
    releaseDragLock(
      payload.nodeId,
      payload.userId,
      payload.finalX,
      payload.finalY
    )
    onDragUnlockMessage?.(peerId, payload)
  }, [releaseDragLock, onDragUnlockMessage])

  const handleDragPositionMessage = useCallback((peerId: string, message: DataChannelMessage) => {
    const payload = message.payload as DragPositionPayload
    updateRemoteDragPosition(
      payload.nodeId,
      payload.userId,
      payload.x,
      payload.y,
      payload.timestamp
    )
    onDragPositionMessage?.(peerId, payload)
  }, [updateRemoteDragPosition, onDragPositionMessage])

  const connect = useCallback(async (): Promise<{ yourId: string; members: Member[] } | null> => {
    if (!signalingClient || !yjsProvider || !roomId || !memberId || !userId || !memberName || !memberColor) {
      const errMsg = 'Missing required parameters for WebRTC connection'
      console.error(errMsg)
      setError(errMsg)
      return null
    }

    setIsLoading(true)
    setError(null)

    try {
      cleanup()

      const peerManager = new PeerManager(signalingClient, yjsProvider)
      peerManagerRef.current = peerManager

      const unsub1 = peerManager.onPeerStatusChange(handlePeerStatusChange)
      const unsub2 = peerManager.onPeersChange(handlePeersChange)
      const unsub3 = peerManager.registerMessageHandler('cursor', handleCursorMessage)
      const unsub4 = peerManager.registerMessageHandler('selection', handleSelectionMessage)
      const unsub5 = peerManager.registerMessageHandler('drag-lock', handleDragLockMessage)
      const unsub6 = peerManager.registerMessageHandler('drag-unlock', handleDragUnlockMessage)
      const unsub7 = peerManager.registerMessageHandler('drag-position', handleDragPositionMessage)

      unsubscribersRef.current = [unsub1, unsub2, unsub3, unsub4, unsub5, unsub6, unsub7]

      const result = await peerManager.connectToRoom(
        roomId,
        memberId,
        userId,
        memberName,
        memberColor
      )

      setMembers(result.members)
      setConnectionStatus(signalingClient.getStatus())
      setIsLoading(false)

      return result
    } catch (err) {
      console.error('Failed to setup WebRTC connection:', err)
      setError(err instanceof Error ? err.message : 'Failed to setup WebRTC')
      setIsLoading(false)
      setConnectionStatus('disconnected')
      return null
    }
  }, [signalingClient, yjsProvider, roomId, memberId, userId, memberName, memberColor, cleanup, handlePeerStatusChange, handlePeersChange, handleCursorMessage, handleSelectionMessage, handleDragLockMessage, handleDragUnlockMessage, handleDragPositionMessage, setMembers, setConnectionStatus])

  const disconnect = useCallback(() => {
    cleanup()
    setIsLoading(false)
  }, [cleanup])

  const sendCursor = useCallback((cursor: CursorPosition): void => {
    if (!peerManagerRef.current) return

    const message: DataChannelMessage = {
      type: 'cursor',
      payload: cursor,
      timestamp: Date.now()
    }

    peerManagerRef.current.broadcast(message)
  }, [])

  const sendSelection = useCallback((selection: Selection): void => {
    if (!peerManagerRef.current) return

    const message: DataChannelMessage = {
      type: 'selection',
      payload: selection,
      timestamp: Date.now()
    }

    peerManagerRef.current.broadcast(message)
  }, [])

  const sendDragLock = useCallback((payload: DragLockPayload): void => {
    if (!peerManagerRef.current) return

    const message: DataChannelMessage = {
      type: 'drag-lock',
      payload,
      timestamp: payload.timestamp
    }

    peerManagerRef.current.broadcast(message)
  }, [])

  const sendDragUnlock = useCallback((payload: DragUnlockPayload): void => {
    if (!peerManagerRef.current) return

    const message: DataChannelMessage = {
      type: 'drag-unlock',
      payload,
      timestamp: payload.timestamp
    }

    peerManagerRef.current.broadcast(message)
  }, [])

  const sendDragPosition = useCallback((payload: DragPositionPayload): void => {
    if (!peerManagerRef.current) return

    const message: DataChannelMessage = {
      type: 'drag-position',
      payload,
      timestamp: payload.timestamp
    }

    peerManagerRef.current.broadcast(message)
  }, [])

  const broadcast = useCallback((message: DataChannelMessage): void => {
    peerManagerRef.current?.broadcast(message)
  }, [])

  const sendToPeer = useCallback((peerId: string, message: DataChannelMessage): boolean => {
    return peerManagerRef.current?.sendToPeer(peerId, message) ?? false
  }, [])

  const onPeerStatusChangeHandler = useCallback((listener: (peerId: string, status: PeerConnectionState['status']) => void): (() => void) | null => {
    if (!peerManagerRef.current) return null
    return peerManagerRef.current.onPeerStatusChange(listener)
  }, [])

  const onPeersChangeHandler = useCallback((listener: (peers: Map<string, PeerConnectionState>) => void): (() => void) | null => {
    if (!peerManagerRef.current) return null
    return peerManagerRef.current.onPeersChange(listener)
  }, [])

  const registerMessageHandler = useCallback((type: DataChannelMessageType, handler: (peerId: string, message: DataChannelMessage) => void): (() => void) | null => {
    if (!peerManagerRef.current) return null
    return peerManagerRef.current.registerMessageHandler(type, handler)
  }, [])

  const getPeers = useCallback((): Map<string, PeerConnectionState> => {
    return peerManagerRef.current?.getPeers() ?? new Map()
  }, [])

  const getPeer = useCallback((peerId: string): PeerConnectionState | undefined => {
    return peerManagerRef.current?.getPeer(peerId)
  }, [])

  const getConnectedPeers = useCallback((): string[] => {
    return peerManagerRef.current?.getConnectedPeers() ?? []
  }, [])

  const getLocalMemberId = useCallback((): string | null => {
    return peerManagerRef.current?.getLocalMemberId() ?? null
  }, [])

  useEffect(() => {
    if (autoConnect && signalingClient && yjsProvider && roomId && memberId && userId && memberName && memberColor) {
      connect()
    }

    return () => {
      cleanup()
    }
  }, [autoConnect, signalingClient, yjsProvider, roomId, memberId, userId, memberName, memberColor, connect, cleanup])

  const connectionStatus = useMemo(() => {
    return peerManagerRef.current?.getConnectionStatus() ?? 'disconnected'
  }, [peers])

  const isConnected = useMemo(() => connectionStatus === 'connected', [connectionStatus])

  const connectedPeerIds = useMemo(() => {
    return peerManagerRef.current?.getConnectedPeers() ?? []
  }, [peers])

  const result = useMemo<UseWebRTCResult>(() => ({
    peerManager: peerManagerRef.current,
    isConnected,
    connectionStatus,
    isLoading,
    error,
    peers,
    connectedPeerIds,

    connect,
    disconnect,

    sendCursor,
    sendSelection,
    sendDragLock,
    sendDragUnlock,
    sendDragPosition,
    broadcast,
    sendToPeer,

    onPeerStatusChange: onPeerStatusChangeHandler,
    onPeersChange: onPeersChangeHandler,
    registerMessageHandler,

    getPeers,
    getPeer,
    getConnectedPeers,
    getLocalMemberId
  }), [
    isConnected, connectionStatus, isLoading, error, peers, connectedPeerIds,
    connect, disconnect,
    sendCursor, sendSelection, sendDragLock, sendDragUnlock, sendDragPosition, broadcast, sendToPeer,
    onPeerStatusChangeHandler, onPeersChangeHandler, registerMessageHandler,
    getPeers, getPeer, getConnectedPeers, getLocalMemberId
  ])

  return result
}
