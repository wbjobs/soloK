import type { GraphData } from './graph';
import type { CRDTOperationEnvelope } from './crdt';

export interface Room {
  id: string;
  name: string;
  passwordHash?: string;
  createdBy: string;
  currentState: GraphData;
  parentRoomId?: string;
  forkedFromSnapshotId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Member {
  id: string;
  roomId: string;
  userId: string;
  userName: string;
  color: string;
  isOnline: boolean;
  joinedAt: string;
  lastActiveAt: string;
}

export interface Snapshot {
  id: string;
  roomId: string;
  name: string;
  description?: string;
  graphData: GraphData;
  operationCount: number;
  createdAt: string;
  createdBy: string;
}

export interface Operation {
  id: string;
  roomId: string;
  memberId: string;
  operationType: string;
  crdtData: CRDTOperationEnvelope;
  version: number;
  createdAt: string;
}

export interface ReplayFrame {
  operation: Operation;
  state: GraphData;
  timestamp: number;
}

export interface CreateRoomRequest {
  name: string;
  password?: string;
  userId: string;
  userName: string;
}

export interface CreateRoomResponse {
  roomId: string;
  token: string;
  room: Room;
}

export interface JoinRoomRequest {
  userId: string;
  userName: string;
  password?: string;
}

export interface JoinRoomResponse {
  token: string;
  room: Room;
  members: Member[];
}

export interface GetRoomResponse {
  room: Room;
  members: Member[];
}

export interface GetRoomsResponse {
  rooms: Room[];
}

export interface CreateSnapshotRequest {
  name: string;
  description?: string;
}

export interface CreateSnapshotResponse {
  snapshotId: string;
  snapshot: Snapshot;
}

export interface GetSnapshotsResponse {
  snapshots: Snapshot[];
}

export interface GetSnapshotResponse {
  snapshot: Snapshot;
  data: GraphData;
}

export interface RestoreSnapshotResponse {
  success: boolean;
  newSnapshotId: string;
}

export interface GetOperationsRequest {
  from?: number;
  to?: number;
  limit?: number;
  offset?: number;
}

export interface GetOperationsResponse {
  operations: Operation[];
  total: number;
}

export interface ReplayOperationsRequest {
  fromOperationId?: string;
  toOperationId?: string;
  fromTime?: number;
  toTime?: number;
}

export interface ReplayOperationsResponse {
  frames: ReplayFrame[];
}

export interface SaveOperationRequest {
  operation: CRDTOperationEnvelope;
}

export interface SaveOperationResponse {
  operationId: string;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, any>;
}

export interface ApiResponse<T> {
  data?: T;
  error?: ApiError;
  success: boolean;
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

export interface PeerConnectionState {
  peerId: string;
  status: 'connecting' | 'connected' | 'disconnected' | 'failed' | 'closed';
  dataChannel?: RTCDataChannel;
  connection?: RTCPeerConnection;
  isInitiator: boolean;
  connectedAt?: number;
}

export interface UserInfo {
  id: string;
  name: string;
  color: string;
}

export interface CursorPosition {
  userId: string;
  x: number;
  y: number;
  timestamp: number;
}

export interface Selection {
  userId: string;
  selectedNodeIds: string[];
  selectedEdgeIds: string[];
  timestamp: number;
}

export interface ForkRoomRequest {
  name: string;
  userId: string;
  userName: string;
  snapshotId?: string;
  description?: string;
}

export interface ForkRoomResponse {
  roomId: string;
  token: string;
  room: Room;
  member: Member;
}

export interface BranchInfo {
  id: string;
  name: string;
  createdBy: string;
  forkedFromSnapshotId: string | null;
  createdAt: string;
  memberCount: number;
}

export interface ListBranchesResponse {
  branches: BranchInfo[];
}
