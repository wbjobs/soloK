import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'
import type { Room, Member, Snapshot, Operation, ConnectionStatus, PeerConnectionState, BranchInfo } from '../types/api'
import type { GraphData } from '../types/graph'

interface RoomState {
  currentRoom: Room | null
  members: Member[]
  snapshots: Snapshot[]
  operations: Operation[]
  branches: BranchInfo[]
  connectionStatus: ConnectionStatus
  peerStates: Map<string, PeerConnectionState>
  isLoading: boolean
  error: string | null
  roomToken: string | null
  isForking: boolean

  setCurrentRoom: (room: Room | null) => void
  setMembers: (members: Member[]) => void
  addMember: (member: Member) => void
  updateMember: (memberId: string, updates: Partial<Member>) => void
  removeMember: (memberId: string) => void

  setSnapshots: (snapshots: Snapshot[]) => void
  addSnapshot: (snapshot: Snapshot) => void
  removeSnapshot: (snapshotId: string) => void

  setOperations: (operations: Operation[]) => void
  addOperation: (operation: Operation) => void

  setBranches: (branches: BranchInfo[]) => void
  addBranch: (branch: BranchInfo) => void
  setForking: (isForking: boolean) => void

  setConnectionStatus: (status: ConnectionStatus) => void
  setPeerState: (peerId: string, state: PeerConnectionState) => void
  removePeerState: (peerId: string) => void
  clearPeerStates: () => void

  setLoading: (isLoading: boolean) => void
  setError: (error: string | null) => void
  setRoomToken: (token: string | null) => void

  getMemberById: (memberId: string) => Member | undefined
  getOnlineMembers: () => Member[]
  getPeerById: (peerId: string) => PeerConnectionState | undefined
  getConnectedPeers: () => string[]

  reset: () => void
  updateRoomData: (data: Partial<Room>) => void
  updateGraphData: (graphData: GraphData) => void
}

const initialState: Omit<RoomState, 'setCurrentRoom' | 'setMembers' | 'addMember' | 'updateMember' | 'removeMember' | 'setSnapshots' | 'addSnapshot' | 'removeSnapshot' | 'setOperations' | 'addOperation' | 'setBranches' | 'addBranch' | 'setForking' | 'setConnectionStatus' | 'setPeerState' | 'removePeerState' | 'clearPeerStates' | 'setLoading' | 'setError' | 'setRoomToken' | 'getMemberById' | 'getOnlineMembers' | 'getPeerById' | 'getConnectedPeers' | 'reset' | 'updateRoomData' | 'updateGraphData'> = {
  currentRoom: null,
  members: [],
  snapshots: [],
  operations: [],
  branches: [],
  connectionStatus: 'disconnected',
  peerStates: new Map(),
  isLoading: false,
  error: null,
  roomToken: null,
  isForking: false
}

export const useRoomStore = create<RoomState>()(
  devtools(
    persist(
      (set, get) => ({
        ...initialState,

        setCurrentRoom: (room) => set({ currentRoom: room }),

        setMembers: (members) => set({ members }),

        addMember: (member) => set((state) => ({
          members: [...state.members, member]
        })),

        updateMember: (memberId, updates) => set((state) => ({
          members: state.members.map((m) =>
            m.id === memberId ? { ...m, ...updates } : m
          )
        })),

        removeMember: (memberId) => set((state) => ({
          members: state.members.filter((m) => m.id !== memberId)
        })),

        setSnapshots: (snapshots) => set({ snapshots }),

        addSnapshot: (snapshot) => set((state) => ({
          snapshots: [...state.snapshots, snapshot]
        })),

        removeSnapshot: (snapshotId) => set((state) => ({
          snapshots: state.snapshots.filter((s) => s.id !== snapshotId)
        })),

        setOperations: (operations) => set({ operations }),

        addOperation: (operation) => set((state) => ({
          operations: [...state.operations, operation]
        })),

        setBranches: (branches) => set({ branches }),

        addBranch: (branch) => set((state) => ({
          branches: [...state.branches, branch]
        })),

        setForking: (isForking) => set({ isForking }),

        setConnectionStatus: (status) => set({ connectionStatus: status }),

        setPeerState: (peerId, state) => set((prevState) => {
          const newPeerStates = new Map(prevState.peerStates)
          newPeerStates.set(peerId, state)
          return { peerStates: newPeerStates }
        }),

        removePeerState: (peerId) => set((state) => {
          const newPeerStates = new Map(state.peerStates)
          newPeerStates.delete(peerId)
          return { peerStates: newPeerStates }
        }),

        clearPeerStates: () => set({ peerStates: new Map() }),

        setLoading: (isLoading) => set({ isLoading }),

        setError: (error) => set({ error }),

        setRoomToken: (token) => set({ roomToken: token }),

        getMemberById: (memberId) => {
          return get().members.find((m) => m.id === memberId)
        },

        getOnlineMembers: () => {
          return get().members.filter((m) => m.isOnline)
        },

        getPeerById: (peerId) => {
          return get().peerStates.get(peerId)
        },

        getConnectedPeers: () => {
          const result: string[] = []
          get().peerStates.forEach((state, peerId) => {
            if (state.status === 'connected') {
              result.push(peerId)
            }
          })
          return result
        },

        reset: () => set(initialState),

        updateRoomData: (data) => set((state) => {
          if (!state.currentRoom) return state
          return {
            currentRoom: { ...state.currentRoom, ...data }
          }
        }),

        updateGraphData: (graphData) => set((state) => {
          if (!state.currentRoom) return state
          return {
            currentRoom: {
              ...state.currentRoom,
              currentState: graphData,
              updatedAt: new Date().toISOString()
            }
          }
        })
      }),
      {
        name: 'room-store',
        partialize: (state) => ({
          roomToken: state.roomToken
        })
      }
    )
  )
)

export const useCurrentRoom = () => useRoomStore((state) => state.currentRoom)
export const useRoomMembers = () => useRoomStore((state) => state.members)
export const useOnlineMembers = () => useRoomStore((state) => state.getOnlineMembers())
export const useConnectionStatus = () => useRoomStore((state) => state.connectionStatus)
export const usePeerStates = () => useRoomStore((state) =>
  Array.from(state.peerStates.values())
)
export const useIsRoomLoading = () => useRoomStore((state) => state.isLoading)
export const useRoomError = () => useRoomStore((state) => state.error)
export const useRoomSnapshots = () => useRoomStore((state) => state.snapshots)
export const useRoomOperations = () => useRoomStore((state) => state.operations)
export const useRoomBranches = () => useRoomStore((state) => state.branches)
export const useIsForking = () => useRoomStore((state) => state.isForking)
export const useHasRoom = () => useRoomStore((state) => state.currentRoom !== null)
