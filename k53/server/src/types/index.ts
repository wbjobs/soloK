export interface GraphNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  color: string;
  type: 'concept' | 'topic' | 'note' | 'resource';
  metadata: Record<string, any>;
  createdAt: number;
  updatedAt: number;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  color?: string;
  style: 'solid' | 'dashed' | 'dotted';
  metadata: Record<string, any>;
  createdAt: number;
  updatedAt: number;
}

export interface GraphData {
  nodes: Record<string, GraphNode>;
  edges: Record<string, GraphEdge>;
  metadata: {
    version: number;
    lastModified: number;
    modifiedBy: string;
  };
}

export type CRDTOperationType =
  | 'node/add'
  | 'node/update'
  | 'node/delete'
  | 'edge/add'
  | 'edge/update'
  | 'edge/delete'
  | 'graph/metadata';

export interface CRDTOperation {
  id: string;
  type: CRDTOperationType;
  roomId: string;
  memberId: string;
  timestamp: number;
  version: number;
  payload: any;
  yjsUpdate: Uint8Array;
}

export type SignalingMessageType =
  | 'join'
  | 'leave'
  | 'offer'
  | 'answer'
  | 'ice-candidate'
  | 'member-joined'
  | 'member-left'
  | 'member-list'
  | 'sync-state'
  | 'error'
  | 'operation';

export interface SignalingMessage {
  type: SignalingMessageType;
  from: string;
  to?: string;
  roomId: string;
  payload: any;
  timestamp: number;
}

export interface Room {
  id: string;
  name: string;
  passwordHash: string | null;
  createdBy: string;
  currentState: any;
  parentRoomId: string | null;
  forkedFromSnapshotId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Member {
  id: string;
  roomId: string;
  userId: string;
  userName: string;
  color: string;
  isOnline: boolean;
  joinedAt: Date;
  lastActiveAt: Date;
}

export interface Snapshot {
  id: string;
  roomId: string;
  name: string;
  description?: string;
  graphData: any;
  operationCount: number;
  createdAt: Date;
  createdBy: string;
}

export interface Operation {
  id: string;
  roomId: string;
  memberId: string;
  operationType: string;
  crdtData: any;
  version: number;
  createdAt: Date;
  snapshotId?: string;
}

export interface JWTPayload {
  roomId: string;
  userId: string;
  iat?: number;
  exp?: number;
}

export interface ApiError {
  error: string;
  code?: string;
  details?: any;
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
  member: Member;
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

export interface CreateSnapshotRequest {
  name: string;
  description?: string;
}

export interface CreateSnapshotResponse {
  snapshotId: string;
  snapshot: Snapshot;
}

export interface ReplayFrame {
  frame: number;
  operationId: string;
  operationType: string;
  crdtData: any;
  timestamp: number;
  memberId: string;
  memberName?: string;
}

export interface ReplayOperationsRequest {
  fromOperationId?: string;
  toOperationId?: string;
  fromTime?: number;
  toTime?: number;
}

export interface ReplayOperationsResponse {
  frames: ReplayFrame[];
  totalFrames: number;
  timeRange?: {
    start: number;
    end: number;
  };
}

export interface SaveOperationRequest {
  operation: CRDTOperation;
}

export interface SaveOperationResponse {
  operationId: string;
}

export interface ListOperationsResponse {
  operations: Operation[];
  total: number;
}

export interface ListSnapshotsResponse {
  snapshots: Snapshot[];
}

export interface GetSnapshotResponse {
  snapshot: Snapshot;
  data: any;
}

export interface RestoreSnapshotResponse {
  success: boolean;
  newSnapshotId: string;
}

export interface ExportSnapshotResponse {
  id: string;
  name: string;
  description: string | undefined;
  graphData: any;
  createdAt: Date;
  createdBy: string;
  version: string;
}

export interface ListRoomsResponse {
  rooms: Room[];
}

export interface GetRoomResponse {
  room: Room;
  members: Member[];
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
  createdAt: Date;
  memberCount: number;
}

export interface ListBranchesResponse {
  branches: BranchInfo[];
}
