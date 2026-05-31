import { AGV, Task, Position } from '../types';
import { distance } from '../utils/math';

export type AssignmentAlgorithm = 'greedy' | 'hungarian';

export class Scheduler {
  private algorithm: AssignmentAlgorithm;

  constructor(algorithm: AssignmentAlgorithm = 'hungarian') {
    this.algorithm = algorithm;
  }

  public assignTasks(agvs: AGV[], tasks: Task[]): Map<string, Task> {
    const idleAGVs = agvs.filter(agv => agv.status === 'idle' && agv.battery > 20);
    const pendingTasks = tasks.filter(task => task.status === 'pending');

    if (idleAGVs.length === 0 || pendingTasks.length === 0) {
      return new Map();
    }

    const assignments = this.algorithm === 'hungarian'
      ? this.hungarianAssignment(idleAGVs, pendingTasks)
      : this.greedyAssignment(idleAGVs, pendingTasks);

    return assignments;
  }

  private greedyAssignment(agvs: AGV[], tasks: Task[]): Map<string, Task> {
    const assignments = new Map<string, Task>();
    const assignedTasks = new Set<string>();

    for (const agv of agvs) {
      let bestTask: Task | null = null;
      let bestCost = Infinity;

      for (const task of tasks) {
        if (assignedTasks.has(task.id)) continue;

        const cost = this.calculateCost(agv, task);
        if (cost < bestCost) {
          bestCost = cost;
          bestTask = task;
        }
      }

      if (bestTask) {
        assignments.set(agv.id, bestTask);
        assignedTasks.add(bestTask.id);
      }
    }

    return assignments;
  }

  private hungarianAssignment(agvs: AGV[], tasks: Task[]): Map<string, Task> {
    const n = Math.min(agvs.length, tasks.length);
    const m = Math.max(agvs.length, tasks.length);

    const costMatrix: number[][] = [];
    for (let i = 0; i < n; i++) {
      costMatrix[i] = [];
      for (let j = 0; j < m; j++) {
        if (j < tasks.length) {
          costMatrix[i][j] = this.calculateCost(agvs[i], tasks[j]);
        } else {
          costMatrix[i][j] = 0;
        }
      }
    }

    const assignment = this.hungarianAlgorithm(costMatrix, n, m);
    const result = new Map<string, Task>();

    for (let i = 0; i < n; i++) {
      const taskIndex = assignment[i];
      if (taskIndex < tasks.length) {
        result.set(agvs[i].id, tasks[taskIndex]);
      }
    }

    return result;
  }

  private hungarianAlgorithm(cost: number[][], n: number, m: number): number[] {
    const INF = Number.MAX_SAFE_INTEGER;
    const u = new Array(n + 1).fill(0);
    const v = new Array(m + 1).fill(0);
    const p = new Array(m + 1).fill(0);
    const way = new Array(m + 1).fill(0);

    for (let i = 1; i <= n; i++) {
      p[0] = i;
      let j0 = 0;
      const minv = new Array(m + 1).fill(INF);
      const used = new Array(m + 1).fill(false);

      do {
        used[j0] = true;
        const i0 = p[j0];
        let delta = INF;
        let j1 = 0;

        for (let j = 1; j <= m; j++) {
          if (!used[j]) {
            const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
            if (cur < minv[j]) {
              minv[j] = cur;
              way[j] = j0;
            }
            if (minv[j] < delta) {
              delta = minv[j];
              j1 = j;
            }
          }
        }

        for (let j = 0; j <= m; j++) {
          if (used[j]) {
            u[p[j]] += delta;
            v[j] -= delta;
          } else {
            minv[j] -= delta;
          }
        }

        j0 = j1;
      } while (p[j0] !== 0);

      do {
        const j1 = way[j0];
        p[j0] = p[j1];
        j0 = j1;
      } while (j0 !== 0);
    }

    const result = new Array(n).fill(-1);
    for (let j = 1; j <= m; j++) {
      if (p[j] > 0 && p[j] <= n) {
        result[p[j] - 1] = j - 1;
      }
    }

    return result;
  }

  private calculateCost(agv: AGV, task: Task): number {
    const distToOrigin = distance(agv.position, task.origin);
    const distTask = distance(task.origin, task.destination);
    
    const batteryCost = (100 - agv.battery) * 0.1;
    const priorityCost = (5 - task.priority) * 10;
    
    return distToOrigin + distTask * 0.5 + batteryCost + priorityCost;
  }

  public checkDeadlock(agvs: AGV[]): boolean {
    const movingAGVs = agvs.filter(agv => agv.status === 'moving');
    
    for (let i = 0; i < movingAGVs.length; i++) {
      for (let j = i + 1; j < movingAGVs.length; j++) {
        const agv1 = movingAGVs[i];
        const agv2 = movingAGVs[j];
        
        const dist = distance(agv1.position, agv2.position);
        if (dist < 3.0 && agv1.velocity.linear < 0.1 && agv2.velocity.linear < 0.1) {
          return true;
        }
      }
    }
    
    return false;
  }

  public resolveDeadlock(agvs: AGV[]): void {
    const movingAGVs = agvs.filter(agv => agv.status === 'moving');
    
    if (movingAGVs.length < 2) return;
    
    const sortedByPriority = [...movingAGVs].sort((a, b) => {
      const priorityA = a.currentTask?.priority || 0;
      const priorityB = b.currentTask?.priority || 0;
      return priorityB - priorityA;
    });
    
    for (let i = 1; i < sortedByPriority.length; i++) {
      const agv = sortedByPriority[i];
      const tempPath = this.findAlternativePath(agv);
      if (tempPath.length > 0) {
        agv.path = tempPath;
        agv.pathIndex = 0;
      }
    }
  }

  private findAlternativePath(agv: AGV): Position[] {
    if (agv.path.length === 0) return [];
    
    const alternativePath: Position[] = [];
    for (let i = agv.pathIndex; i < agv.path.length; i++) {
      const point = agv.path[i];
      alternativePath.push({
        x: point.x + (Math.random() - 0.5) * 2,
        y: point.y + (Math.random() - 0.5) * 2,
      });
    }
    
    return alternativePath;
  }
}
