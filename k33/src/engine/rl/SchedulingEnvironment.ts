import { AGV, Task, Position, Scene } from '../../types';
import { distance } from '../../utils/math';

export interface SchedulingState {
  taskQueueFeatures: number[];
  agvFeatures: number[][];
  globalFeatures: number[];
}

export interface SchedulingAction {
  taskAssignments: Map<string, string>;
  pathReplans: string[];
}

export interface SchedulingReward {
  totalReward: number;
  throughputReward: number;
  efficiencyReward: number;
  fairnessReward: number;
  energyReward: number;
}

export class SchedulingEnvironment {
  private scene: Scene;
  private stateSize: number;
  private actionSize: number;
  private maxAGVs: number = 50;
  private maxTasks: number = 100;

  constructor(scene: Scene) {
    this.scene = scene;
    this.stateSize = this.calculateStateSize();
    this.actionSize = this.calculateActionSize();
  }

  private calculateStateSize(): number {
    const taskFeatures = 8 * this.maxTasks;
    const agvFeatures = 10 * this.maxAGVs;
    const globalFeatures = 12;
    return taskFeatures + agvFeatures + globalFeatures;
  }

  private calculateActionSize(): number {
    return this.maxAGVs * 2 + 10;
  }

  public getStateSize(): number {
    return this.stateSize;
  }

  public getActionSize(): number {
    return this.actionSize;
  }

  public getState(): number[] {
    const state: number[] = [];

    state.push(...this.extractTaskFeatures());
    state.push(...this.extractAGVFeatures());
    state.push(...this.extractGlobalFeatures());

    return state;
  }

  private extractTaskFeatures(): number[] {
    const features: number[] = [];
    const tasks = this.scene.tasks.filter(t => t.status === 'pending').slice(0, this.maxTasks);

    for (let i = 0; i < this.maxTasks; i++) {
      if (i < tasks.length) {
        const task = tasks[i];
        features.push(task.priority / 10);
        features.push(task.origin.x / 200);
        features.push(task.origin.y / 200);
        features.push(task.destination.x / 200);
        features.push(task.destination.y / 200);
        features.push((this.scene.simulationState.currentTime - task.createdAt) / 3600);
        features.push(task.type === 'quay_to_yard' ? 1 : 0);
        features.push(task.type === 'yard_to_quay' ? 1 : 0);
      } else {
        features.push(...new Array(8).fill(0));
      }
    }

    return features;
  }

  private extractAGVFeatures(): number[] {
    const features: number[] = [];
    const agvs = this.scene.agvs.slice(0, this.maxAGVs);

    for (let i = 0; i < this.maxAGVs; i++) {
      if (i < agvs.length) {
        const agv = agvs[i];
        features.push(agv.position.x / 200);
        features.push(agv.position.y / 200);
        features.push(agv.position.angle / (Math.PI * 2));
        features.push(agv.velocity.linear / agv.maxSpeed);
        features.push(agv.velocity.angular / 2);
        features.push(agv.battery / agv.batteryCapacity);
        features.push(this.getAGVStatusCode(agv.status));
        features.push(agv.currentTask ? 1 : 0);
        features.push(agv.path.length / 100);
        features.push(agv.currentTask ? 
          distance(agv.position, agv.currentTask.destination) / 200 : 0);
      } else {
        features.push(...new Array(10).fill(0));
      }
    }

    return features;
  }

  private extractGlobalFeatures(): number[] {
    const features: number[] = [];
    const state = this.scene.simulationState;

    features.push(state.currentTime / 3600);
    features.push(state.totalTEU / 1000);
    features.push(state.teuPerHour / 50);
    features.push(state.averageWaitTime / 3600);
    features.push(state.agvUtilization / 100);
    features.push(state.craneUtilization / 100);
    features.push(state.deadlockCount / 100);
    features.push(state.faultCount / 100);
    features.push(this.scene.agvs.filter(a => a.status === 'idle').length / this.scene.agvs.length);
    features.push(this.scene.tasks.filter(t => t.status === 'pending').length / this.maxTasks);
    features.push(this.scene.agvs.filter(a => a.battery < 30).length / this.scene.agvs.length);
    features.push(this.getAverageCongestion());

    return features;
  }

  private getAGVStatusCode(status: string): number {
    const statusCodes: Record<string, number> = {
      'idle': 0,
      'moving': 0.2,
      'loading': 0.4,
      'unloading': 0.6,
      'charging': 0.8,
      'fault': 1.0,
    };
    return statusCodes[status] || 0;
  }

  private getAverageCongestion(): number {
    const nodes = this.scene.roadNetwork;
    if (nodes.length === 0) return 0;
    const totalCongestion = nodes.reduce((sum, node) => sum + node.congestion, 0);
    return totalCongestion / nodes.length;
  }

  public executeAction(action: number[]): SchedulingReward {
    const assignments = this.decodeAction(action);
    const reward: SchedulingReward = {
      totalReward: 0,
      throughputReward: 0,
      efficiencyReward: 0,
      fairnessReward: 0,
      energyReward: 0,
    };

    const beforeTEU = this.scene.simulationState.totalTEU;
    const beforeWaitTime = this.scene.simulationState.averageWaitTime;

    for (const [agvId, taskId] of assignments.taskAssignments) {
      const agv = this.scene.agvs.find(a => a.id === agvId);
      const task = this.scene.tasks.find(t => t.id === taskId);
      
      if (agv && task && agv.status === 'idle' && task.status === 'pending') {
        task.assignedAGV = agvId;
        task.status = 'assigned';
        agv.currentTask = task;
        agv.status = 'moving';
        
        reward.throughputReward += task.priority;
        reward.efficiencyReward += this.calculateEfficiencyBonus(agv, task);
      }
    }

    for (const agvId of assignments.pathReplans) {
      const agv = this.scene.agvs.find(a => a.id === agvId);
      if (agv && agv.status === 'moving' && agv.currentTask) {
        reward.efficiencyReward += 0.5;
      }
    }

    const afterTEU = this.scene.simulationState.totalTEU;
    const teuDelta = afterTEU - beforeTEU;
    reward.throughputReward += teuDelta * 10;

    const lowBatteryPenalty = this.scene.agvs.filter(a => a.battery < 10).length * -5;
    reward.energyReward = lowBatteryPenalty;

    const idleAGVs = this.scene.agvs.filter(a => a.status === 'idle').length;
    reward.fairnessReward = idleAGVs > this.scene.agvs.length * 0.3 ? -2 : 1;

    reward.totalReward = 
      reward.throughputReward + 
      reward.efficiencyReward + 
      reward.fairnessReward + 
      reward.energyReward;

    return reward;
  }

  private decodeAction(action: number[]): SchedulingAction {
    const taskAssignments = new Map<string, string>();
    const pathReplans: string[] = [];
    
    const idleAGVs = this.scene.agvs.filter(a => a.status === 'idle');
    const pendingTasks = this.scene.tasks.filter(t => t.status === 'pending');

    const actionSize = Math.min(idleAGVs.length * 2, action.length - 10);
    
    for (let i = 0; i < actionSize && i < idleAGVs.length * 2; i += 2) {
      const agvIndex = Math.floor(action[i] * idleAGVs.length) % idleAGVs.length;
      const taskIndex = Math.floor(Math.abs(action[i + 1]) * pendingTasks.length) % pendingTasks.length;

      if (agvIndex < idleAGVs.length && taskIndex < pendingTasks.length) {
        const agv = idleAGVs[agvIndex];
        const task = pendingTasks[taskIndex];
        if (!taskAssignments.has(agv.id) && !Array.from(taskAssignments.values()).includes(task.id)) {
          taskAssignments.set(agv.id, task.id);
        }
      }
    }

    for (let i = actionSize; i < action.length; i++) {
      if (Math.abs(action[i]) > 0.5) {
        const agvIndex = (i - actionSize) % this.scene.agvs.length;
        if (this.scene.agvs[agvIndex] && this.scene.agvs[agvIndex].status === 'moving') {
          pathReplans.push(this.scene.agvs[agvIndex].id);
        }
      }
    }

    return { taskAssignments, pathReplans };
  }

  private calculateEfficiencyBonus(agv: AGV, task: Task): number {
    const dist = distance(agv.position, task.origin);
    if (dist < 20) return 2;
    if (dist < 50) return 1;
    return 0.5;
  }

  public isDone(): boolean {
    const pendingTasks = this.scene.tasks.filter(t => t.status === 'pending').length;
    const activeAGVs = this.scene.agvs.filter(a => 
      a.status === 'moving' || a.status === 'loading' || a.status === 'unloading'
    ).length;
    
    return pendingTasks === 0 && activeAGVs === 0;
  }

  public reset(scene: Scene): void {
    this.scene = scene;
  }

  public getScene(): Scene {
    return this.scene;
  }

  public setScene(scene: Scene): void {
    this.scene = scene;
  }
}
