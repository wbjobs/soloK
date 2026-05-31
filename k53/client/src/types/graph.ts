export type NodeType = 'concept' | 'topic' | 'note' | 'resource';

export type EdgeStyle = 'solid' | 'dashed' | 'dotted';

export interface GraphNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  color: string;
  type: NodeType;
  metadata: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  color?: string;
  style: EdgeStyle;
  metadata: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export interface GraphMetadata {
  version: number;
  lastModified: number;
  modifiedBy: string;
}

export interface GraphData {
  nodes: Record<string, GraphNode>;
  edges: Record<string, GraphEdge>;
  metadata: GraphMetadata;
}

export interface NodePosition {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface NodeUpdatePayload {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  label?: string;
  color?: string;
  type?: NodeType;
  metadata?: Record<string, unknown>;
}

export interface EdgeUpdatePayload {
  label?: string;
  color?: string;
  style?: EdgeStyle;
  metadata?: Record<string, unknown>;
}

export interface RenderStyle {
  nodeCornerRadius: number;
  nodeBorderWidth: number;
  nodeGlowBlur: number;
  edgeWidth: number;
  arrowSize: number;
  gridSize: number;
  gridColor: string;
  backgroundColor: string;
}

export const DEFAULT_STYLE: RenderStyle = {
  nodeCornerRadius: 8,
  nodeBorderWidth: 2,
  nodeGlowBlur: 15,
  edgeWidth: 2,
  arrowSize: 10,
  gridSize: 20,
  gridColor: '#e5e7eb',
  backgroundColor: '#fafafa'
};

export const NODE_COLORS: Record<NodeType, string> = {
  concept: '#3b82f6',
  topic: '#10b981',
  note: '#f59e0b',
  resource: '#8b5cf6'
};
