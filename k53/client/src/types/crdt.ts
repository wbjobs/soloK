import type { GraphNode, GraphEdge, GraphMetadata, NodeUpdatePayload, EdgeUpdatePayload } from './graph';

export type CRDTOperationType =
  | 'node/add'
  | 'node/update'
  | 'node/delete'
  | 'edge/add'
  | 'edge/update'
  | 'edge/delete'
  | 'graph/metadata';

export type SignalingMessageType =
  | 'join'
  | 'leave'
  | 'offer'
  | 'answer'
  | 'ice-candidate'
  | 'member-joined'
  | 'member-left'
  | 'sync-state'
  | 'drag-lock'
  | 'drag-unlock'
  | 'drag-position';

export interface CRDTAddNodeOperation {
  type: 'node/add';
  nodeId: string;
  node: GraphNode;
  timestamp: number;
  origin?: string;
}

export interface CRDTUpdateNodeOperation {
  type: 'node/update';
  nodeId: string;
  updates: NodeUpdatePayload;
  timestamp: number;
  origin?: string;
}

export interface CRDTDeleteNodeOperation {
  type: 'node/delete';
  nodeId: string;
  timestamp: number;
  origin?: string;
}

export interface CRDTAddEdgeOperation {
  type: 'edge/add';
  edgeId: string;
  edge: GraphEdge;
  timestamp: number;
  origin?: string;
}

export interface CRDTUpdateEdgeOperation {
  type: 'edge/update';
  edgeId: string;
  updates: EdgeUpdatePayload;
  timestamp: number;
  origin?: string;
}

export interface CRDTDeleteEdgeOperation {
  type: 'edge/delete';
  edgeId: string;
  timestamp: number;
  origin?: string;
}

export interface CRDTUpdateMetadataOperation {
  type: 'graph/metadata';
  metadata: Partial<GraphMetadata>;
  timestamp: number;
  origin?: string;
}

export type CRDTOperation =
  | CRDTAddNodeOperation
  | CRDTUpdateNodeOperation
  | CRDTDeleteNodeOperation
  | CRDTAddEdgeOperation
  | CRDTUpdateEdgeOperation
  | CRDTDeleteEdgeOperation
  | CRDTUpdateMetadataOperation;

export interface CRDTOperationEnvelope {
  id: string;
  type: CRDTOperationType;
  roomId: string;
  memberId: string;
  timestamp: number;
  version: number;
  payload: CRDTOperation;
  yjsUpdate: Uint8Array;
}

export interface CRDTOperationEvent {
  operation: CRDTOperation;
  local: boolean;
}

export type CRDTChangeListener = (event: CRDTOperationEvent) => void;

export interface JoinMessagePayload {
  userId: string;
  userName: string;
  color: string;
}

export interface LeaveMessagePayload {
  userId: string;
}

export interface OfferMessagePayload {
  offer: RTCSessionDescriptionInit;
}

export interface AnswerMessagePayload {
  answer: RTCSessionDescriptionInit;
}

export interface IceCandidateMessagePayload {
  candidate: RTCIceCandidate;
}

export interface MemberJoinedPayload {
  memberId: string;
  userId: string;
  userName: string;
  color: string;
}

export interface MemberLeftPayload {
  memberId: string;
  userId: string;
}

export interface SyncStatePayload {
  state: Uint8Array;
  version: number;
}

export type SignalingPayload =
  | JoinMessagePayload
  | LeaveMessagePayload
  | OfferMessagePayload
  | AnswerMessagePayload
  | IceCandidateMessagePayload
  | MemberJoinedPayload
  | MemberLeftPayload
  | SyncStatePayload
  | DragMessagePayload;

export interface SignalingMessage {
  type: SignalingMessageType;
  from: string;
  to?: string;
  roomId: string;
  payload: SignalingPayload;
  timestamp: number;
}

export interface MemberInfo {
  id: string;
  userId: string;
  userName: string;
  color: string;
  isOnline: boolean;
  joinedAt: number;
}

export interface SyncState {
  nodes: Record<string, GraphNode>;
  edges: Record<string, GraphEdge>;
  metadata: GraphMetadata;
  version: number;
}

export interface DragLockPayload {
  nodeId: string;
  userId: string;
  userName: string;
  timestamp: number;
  x: number;
  y: number;
}

export interface DragUnlockPayload {
  nodeId: string;
  userId: string;
  timestamp: number;
  finalX: number;
  finalY: number;
}

export interface DragPositionPayload {
  nodeId: string;
  userId: string;
  timestamp: number;
  x: number;
  y: number;
}

export interface DragLockState {
  isLocked: boolean;
  nodeId: string | null;
  userId: string | null;
  userName: string | null;
  lockTimestamp: number;
  lastPosition: { x: number; y: number } | null;
}

export type DragMessagePayload =
  | DragLockPayload
  | DragUnlockPayload
  | DragPositionPayload;
