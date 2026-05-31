import { RoadNode, PathPoint, Position } from '../types';
import { distance, manhattanDistance } from '../utils/math';

interface AStarNode {
  id: string;
  node: RoadNode;
  g: number;
  h: number;
  f: number;
  parent: AStarNode | null;
}

interface CachedPath {
  startId: string;
  endId: string;
  path: RoadNode[];
  createdAt: number;
  expiresAt: number;
}

class PriorityQueue<T> {
  private heap: { item: T; priority: number }[] = [];

  public push(item: T, priority: number): void {
    this.heap.push({ item, priority });
    this.bubbleUp(this.heap.length - 1);
  }

  public pop(): T | null {
    if (this.heap.length === 0) return null;
    const top = this.heap[0];
    const last = this.heap.pop();
    if (this.heap.length > 0 && last) {
      this.heap[0] = last;
      this.bubbleDown(0);
    }
    return top.item;
  }

  public get size(): number {
    return this.heap.length;
  }

  public clear(): void {
    this.heap = [];
  }

  private bubbleUp(index: number): void {
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);
      if (this.heap[index].priority < this.heap[parentIndex].priority) {
        [this.heap[index], this.heap[parentIndex]] = [this.heap[parentIndex], this.heap[index]];
        index = parentIndex;
      } else {
        break;
      }
    }
  }

  private bubbleDown(index: number): void {
    const length = this.heap.length;
    while (true) {
      let smallest = index;
      const left = 2 * index + 1;
      const right = 2 * index + 2;

      if (left < length && this.heap[left].priority < this.heap[smallest].priority) {
        smallest = left;
      }
      if (right < length && this.heap[right].priority < this.heap[smallest].priority) {
        smallest = right;
      }
      if (smallest !== index) {
        [this.heap[index], this.heap[smallest]] = [this.heap[smallest], this.heap[index]];
        index = smallest;
      } else {
        break;
      }
    }
  }
}

export class PathPlanner {
  private nodes: Map<string, RoadNode>;
  private congestionWeight: number;
  private pathCache: Map<string, CachedPath> = new Map();
  private cacheExpiryMs: number = 2000;
  private maxCacheSize: number = 500;
  private openSet: PriorityQueue<AStarNode> = new PriorityQueue();
  private gScores: Map<string, number> = new Map();
  private closedSet: Set<string> = new Set();
  private nodeLookupGrid: Map<string, RoadNode[]> = new Map();
  private gridSize: number = 50;

  constructor(nodes: RoadNode[], congestionWeight: number = 0.5) {
    this.nodes = new Map();
    this.congestionWeight = congestionWeight;
    this.updateNodes(nodes);
  }

  public updateNodes(nodes: RoadNode[]): void {
    this.nodes.clear();
    this.nodeLookupGrid.clear();
    nodes.forEach(node => {
      this.nodes.set(node.id, node);
      const gridX = Math.floor(node.position.x / this.gridSize);
      const gridY = Math.floor(node.position.y / this.gridSize);
      const key = `${gridX},${gridY}`;
      if (!this.nodeLookupGrid.has(key)) {
        this.nodeLookupGrid.set(key, []);
      }
      this.nodeLookupGrid.get(key)!.push(node);
    });
    this.invalidateCache();
  }

  public invalidateCache(): void {
    this.pathCache.clear();
  }

  public findPath(start: Position, end: Position): PathPoint[] {
    const startNode = this.findNearestNodeOptimized(start);
    const endNode = this.findNearestNodeOptimized(end);
    
    if (!startNode || !endNode) {
      return [start, end];
    }
    
    if (startNode.id === endNode.id) {
      return [start, end];
    }

    const cacheKey = `${startNode.id}_${endNode.id}`;
    const cached = this.pathCache.get(cacheKey);
    const now = Date.now();

    if (cached && cached.expiresAt > now) {
      const congestionChanged = this.checkCongestionChanged(cached.path);
      if (!congestionChanged) {
        return this.buildPathFromNodes(start, end, cached.path);
      }
    }

    const path = this.aStarOptimized(startNode, endNode);
    
    if (path.length === 0) {
      return [start, end];
    }

    if (this.pathCache.size >= this.maxCacheSize) {
      this.evictOldestCache();
    }

    this.pathCache.set(cacheKey, {
      startId: startNode.id,
      endId: endNode.id,
      path,
      createdAt: now,
      expiresAt: now + this.cacheExpiryMs,
    });

    return this.buildPathFromNodes(start, end, path);
  }

  private buildPathFromNodes(start: Position, end: Position, nodes: RoadNode[]): PathPoint[] {
    const fullPath: PathPoint[] = [start];
    nodes.forEach(node => {
      fullPath.push({ x: node.position.x, y: node.position.y });
    });
    fullPath.push(end);
    return fullPath;
  }

  private checkCongestionChanged(path: RoadNode[]): boolean {
    for (const node of path) {
      const currentNode = this.nodes.get(node.id);
      if (!currentNode) return true;
      if (Math.abs(currentNode.congestion - node.congestion) > 0.3) {
        return true;
      }
    }
    return false;
  }

  private evictOldestCache(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    
    this.pathCache.forEach((value, key) => {
      if (value.createdAt < oldestTime) {
        oldestTime = value.createdAt;
        oldestKey = key;
      }
    });
    
    if (oldestKey) {
      this.pathCache.delete(oldestKey);
    }
  }

  private aStarOptimized(startNode: RoadNode, endNode: RoadNode): RoadNode[] {
    this.openSet.clear();
    this.gScores.clear();
    this.closedSet.clear();

    const startAStar: AStarNode = {
      id: startNode.id,
      node: startNode,
      g: 0,
      h: this.heuristic(startNode.position, endNode.position),
      f: 0,
      parent: null,
    };
    startAStar.f = startAStar.g + startAStar.h;
    
    this.openSet.push(startAStar, startAStar.f);
    this.gScores.set(startNode.id, 0);

    while (this.openSet.size > 0) {
      const current = this.openSet.pop();
      if (!current) break;

      if (this.closedSet.has(current.id)) continue;
      this.closedSet.add(current.id);

      if (current.id === endNode.id) {
        return this.reconstructPath(current);
      }

      for (const neighborId of current.node.connections) {
        if (this.closedSet.has(neighborId)) continue;

        const neighbor = this.nodes.get(neighborId);
        if (!neighbor) continue;

        const movementCost = this.calculateCost(current.node, neighbor);
        const tentativeG = current.g + movementCost;

        const existingG = this.gScores.get(neighborId);
        if (existingG === undefined || tentativeG < existingG) {
          const neighborAStar: AStarNode = {
            id: neighborId,
            node: neighbor,
            g: tentativeG,
            h: this.heuristic(neighbor.position, endNode.position),
            f: 0,
            parent: current,
          };
          neighborAStar.f = neighborAStar.g + neighborAStar.h;
          this.openSet.push(neighborAStar, neighborAStar.f);
          this.gScores.set(neighborId, tentativeG);
        }
      }
    }

    return [];
  }

  private heuristic(a: Position, b: Position): number {
    return manhattanDistance(a, b);
  }

  private calculateCost(from: RoadNode, to: RoadNode): number {
    const dist = distance(from.position, to.position);
    const avgCongestion = (from.congestion + to.congestion) / 2;
    return dist * (1 + this.congestionWeight * avgCongestion);
  }

  private reconstructPath(endNode: AStarNode): RoadNode[] {
    const path: RoadNode[] = [];
    let current: AStarNode | null = endNode;
    
    while (current) {
      path.unshift(current.node);
      current = current.parent;
    }
    
    return path;
  }

  public findNearestNodeOptimized(position: Position): RoadNode | null {
    const gridX = Math.floor(position.x / this.gridSize);
    const gridY = Math.floor(position.y / this.gridSize);

    for (let dx = 0; dx <= 2; dx++) {
      for (let dy = 0; dy <= 2; dy++) {
        for (const signX of [1, -1]) {
          for (const signY of [1, -1]) {
            const key = `${gridX + dx * signX},${gridY + dy * signY}`;
            const gridNodes = this.nodeLookupGrid.get(key);
            if (gridNodes && gridNodes.length > 0) {
              let nearest: RoadNode | null = null;
              let minDist = Infinity;
              
              for (const node of gridNodes) {
                const dist = distance(position, node.position);
                if (dist < minDist) {
                  minDist = dist;
                  nearest = node;
                }
              }
              
              if (nearest && minDist < this.gridSize * 2) {
                return nearest;
              }
            }
          }
        }
      }
    }

    return this.findNearestNode(position);
  }

  public findNearestNode(position: Position): RoadNode | null {
    let nearest: RoadNode | null = null;
    let minDist = Infinity;
    
    this.nodes.forEach(node => {
      const dist = distance(position, node.position);
      if (dist < minDist) {
        minDist = dist;
        nearest = node;
      }
    });
    
    return nearest;
  }

  public getCacheStats(): { size: number; maxSize: number } {
    return { size: this.pathCache.size, maxSize: this.maxCacheSize };
  }
}
