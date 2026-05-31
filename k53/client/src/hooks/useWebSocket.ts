import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { SignalingClient } from '../webrtc/SignalingClient'
import { useRoomStore } from '../store/roomStore'
import type { ConnectionStatus, Member } from '../types/api'
import type { SignalingMessage, MemberInfo } from '../types/crdt'

interface UseWebSocketOptions {
  signalingUrl: string
  roomId: string | null
  memberId: string | null
  userId: string | null
  userName: string | null
  memberColor: string | null
  autoConnect?: boolean
  onMessage?: (message: SignalingMessage) => void
  onStatusChange?: (status: ConnectionStatus) => void
  onMembersChange?: (members: MemberInfo[]) => void
}

interface UseWebSocketResult {
  client: SignalingClient | null
  isConnected: boolean
  status: ConnectionStatus
  isLoading: boolean
  error: string | null
  yourMemberId: string | null

  connect: () => Promise<{ yourId: string; members: Member[] } | null>
  disconnect: () => void
  reconnect: () => Promise<{ yourId: string; members: Member[] } | null>

  sendOffer: (to: string, sdp: RTCSessionDescriptionInit) => void
  sendAnswer: (to: string, sdp: RTCSessionDescriptionInit) => void
  sendIceCandidate: (to: string, candidate: RTCIceCandidateInit) => void

  onMessage: (handler: (message: SignalingMessage) => void) => (() => void) | null
  onStatusChange: (listener: (status: ConnectionStatus) => void) => (() => void) | null
  onMembersChange: (listener: (members: MemberInfo[]) => void) => (() => void) | null
}

export function useWebSocket({
  signalingUrl,
  roomId,
  memberId,
  userId,
  userName,
  memberColor,
  autoConnect = true,
  onMessage,
  onStatusChange,
  onMembersChange
}: UseWebSocketOptions): UseWebSocketResult {
  const clientRef = useRef<SignalingClient | null>(null)
  const [status, setStatus] = useState<ConnectionStatus>('disconnected')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [yourMemberId, setYourMemberId] = useState<string | null>(null)

  const unsubscribersRef = useRef<Array<() => void>>([])

  const setConnectionStatus = useRoomStore((state) => state.setConnectionStatus)
  const setMembers = useRoomStore((state) => state.setMembers)
  const addMember = useRoomStore((state) => state.addMember)
  const updateMember = useRoomStore((state) => state.updateMember)
  const removeMember = useRoomStore((state) => state.removeMember)

  const cleanup = useCallback(() => {
    unsubscribersRef.current.forEach((unsub) => {
      try {
        unsub()
      } catch (e) {
        console.error('Error unsubscribing from signaling client:', e)
      }
    })
    unsubscribersRef.current = []

    if (clientRef.current) {
      try {
        clientRef.current.disconnect()
      } catch (e) {
        console.error('Error disconnecting signaling client:', e)
      }
      clientRef.current = null
    }

    setYourMemberId(null)
    setStatus('disconnected')
    setConnectionStatus('disconnected')
  }, [setConnectionStatus])

  const handleStatusChange = useCallback((newStatus: ConnectionStatus) => {
    setStatus(newStatus)
    setConnectionStatus(newStatus)
    onStatusChange?.(newStatus)
  }, [setConnectionStatus, onStatusChange])

  const handleMembersChange = useCallback((members: MemberInfo[]) => {
    members.forEach((member) => {
      if (member.isOnline) {
        const existingMember = useRoomStore.getState().getMemberById(member.id)
        if (existingMember) {
          updateMember(member.id, {
            isOnline: true,
            lastActiveAt: new Date().toISOString()
          })
        } else {
          addMember({
            id: member.id,
            roomId: roomId || '',
            userId: member.userId,
            userName: member.userName,
            color: member.color,
            isOnline: true,
            joinedAt: new Date(member.joinedAt).toISOString(),
            lastActiveAt: new Date().toISOString()
          })
        }
      } else {
        removeMember(member.id)
      }
    })
    onMembersChange?.(members)
  }, [roomId, addMember, updateMember, removeMember, onMembersChange])

  const handleMessage = useCallback((message: SignalingMessage) => {
    onMessage?.(message)
  }, [onMessage])

  const connect = useCallback(async (): Promise<{ yourId: string; members: Member[] } | null> => {
    if (!roomId || !memberId || !userId || !userName || !memberColor) {
      const errMsg = 'Missing required parameters for WebSocket connection'
      console.error(errMsg)
      setError(errMsg)
      return null
    }

    setIsLoading(true)
    setError(null)

    try {
      cleanup()

      const client = new SignalingClient(signalingUrl)
      clientRef.current = client

      const unsub1 = client.onStatusChange(handleStatusChange)
      const unsub2 = client.onMessage(handleMessage)
      const unsub3 = client.onMembersChange(handleMembersChange)

      unsubscribersRef.current = [unsub1, unsub2, unsub3]

      const result = await client.connect(roomId, memberId, userId, userName, memberColor)
      setYourMemberId(result.yourId)
      setMembers(result.members)
      setIsLoading(false)

      return result
    } catch (err) {
      console.error('Failed to connect signaling server:', err)
      setError(err instanceof Error ? err.message : 'Failed to connect')
      setIsLoading(false)
      handleStatusChange('disconnected')
      return null
    }
  }, [roomId, memberId, userId, userName, memberColor, signalingUrl, cleanup, handleStatusChange, handleMessage, handleMembersChange, setMembers])

  const disconnect = useCallback(() => {
    cleanup()
    setIsLoading(false)
  }, [cleanup])

  const reconnect = useCallback(async (): Promise<{ yourId: string; members: Member[] } | null> => {
    disconnect()
    await new Promise((resolve) => setTimeout(resolve, 500))
    return connect()
  }, [disconnect, connect])

  const sendOffer = useCallback((to: string, sdp: RTCSessionDescriptionInit): void => {
    if (!clientRef.current) {
      console.warn('Signaling client not initialized, cannot send offer')
      return
    }
    clientRef.current.sendOffer(to, sdp)
  }, [])

  const sendAnswer = useCallback((to: string, sdp: RTCSessionDescriptionInit): void => {
    if (!clientRef.current) {
      console.warn('Signaling client not initialized, cannot send answer')
      return
    }
    clientRef.current.sendAnswer(to, sdp)
  }, [])

  const sendIceCandidate = useCallback((to: string, candidate: RTCIceCandidateInit): void => {
    if (!clientRef.current) {
      console.warn('Signaling client not initialized, cannot send ICE candidate')
      return
    }
    clientRef.current.sendIceCandidate(to, candidate)
  }, [])

  const onMessageHandler = useCallback((handler: (message: SignalingMessage) => void): (() => void) | null => {
    if (!clientRef.current) return null
    return clientRef.current.onMessage(handler)
  }, [])

  const onStatusChangeHandler = useCallback((listener: (status: ConnectionStatus) => void): (() => void) | null => {
    if (!clientRef.current) return null
    return clientRef.current.onStatusChange(listener)
  }, [])

  const onMembersChangeHandler = useCallback((listener: (members: MemberInfo[]) => void): (() => void) | null => {
    if (!clientRef.current) return null
    return clientRef.current.onMembersChange(listener)
  }, [])

  useEffect(() => {
    if (autoConnect && roomId && memberId && userId && userName && memberColor) {
      connect()
    }

    return () => {
      cleanup()
    }
  }, [autoConnect, roomId, memberId, userId, userName, memberColor, connect, cleanup])

  const isConnected = useMemo(() => status === 'connected', [status])

  const result = useMemo<UseWebSocketResult>(() => ({
    client: clientRef.current,
    isConnected,
    status,
    isLoading,
    error,
    yourMemberId,

    connect,
    disconnect,
    reconnect,

    sendOffer,
    sendAnswer,
    sendIceCandidate,

    onMessage: onMessageHandler,
    onStatusChange: onStatusChangeHandler,
    onMembersChange: onMembersChangeHandler
  }), [
    isConnected, status, isLoading, error, yourMemberId,
    connect, disconnect, reconnect,
    sendOffer, sendAnswer, sendIceCandidate,
    onMessageHandler, onStatusChangeHandler, onMembersChangeHandler
  ])

  return result
}
