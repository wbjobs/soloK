import {
  Scene,
  AGV,
  Task,
  QuayCrane,
  YardCrane,
  KPIReport,
  GanttItem,
  BottleneckItem,
  Position,
  PathPoint,
  InterferenceEvent,
} from '../types';
import { AGVPhysics } from './AGVPhysics';
import { PathPlanner } from './PathPlanner';
import { Scheduler } from './Scheduler';
import { InterferenceManager } from './Interference';
import { generateId, distance, formatTime } from '../utils/math';

export class SimulationEngine {
  private scene: Scene;
  private agvPhysics: AGVPhysics;
  private pathPlanner: PathPlanner;
  private scheduler: Scheduler;
  private interferenceManager: InterferenceManager;
  private ganttData: GanttItem[] = [];
  private onUpdate?: (scene: Scene) => void;
  private lastFrameTime: number = 0;
  private accumulatedTime: number = 0;
  private fixedDeltaTime: number = 1 / 60;
  private taskGenerationTimer: number = 0;
  private pathPlanningThrottle: number = 0;
  private readonly PATH_PLANNING_INTERVAL: number = 0.5;
  private pathReplanTimers: Map<string, number> = new Map();

  constructor(scene: Scene) {
    this.scene = scene;
    this.agvPhysics = new AGVPhysics(scene.config.dwaConfig);
    this.pathPlanner = new PathPlanner(scene.roadNetwork, scene.config.congestionWeight);
    this.scheduler = new Scheduler(scene.config.taskAssignmentAlgorithm);
    this.interferenceManager = new InterferenceManager(
      scene.config.agvFaultRate,
      scene.config.agvFaultDuration,
      scene.config.quayCraneTimeVariation
    );
  }

  public setOnUpdate(callback: (scene: Scene) => void): void {
    this.onUpdate = callback;
  }

  public start(): void {
    this.scene.simulationState.isRunning = true;
  }

  public pause(): void {
    this.scene.simulationState.isRunning = false;
  }

  public reset(): void {
    this.scene.simulationState.isRunning = false;
    this.scene.simulationState.currentTime = 0;
    this.scene.simulationState.totalTEU = 0;
    this.ganttData = [];
    this.interferenceManager.clear();
    
    this.scene.agvs.forEach(agv => {
      agv.status = 'idle';
      agv.path = [];
      agv.pathIndex = 0;
      agv.currentTask = null;
      agv.battery = agv.batteryCapacity;
      agv.totalDistance = 0;
      agv.faultTimer = 0;
      agv.velocity.linear = 0;
      agv.velocity.angular = 0;
    });

    this.scene.tasks.forEach(task => {
      task.status = 'pending';
      task.assignedAGV = null;
      task.startedAt = null;
      task.completedAt = null;
      task.waitTime = 0;
    });

    this.scene.quayCranes.forEach(crane => {
      crane.status = 'idle';
      crane.currentTask = null;
      crane.operationTimer = 0;
    });

    this.scene.yardCranes.forEach(crane => {
      crane.status = 'idle';
      crane.currentTask = null;
      crane.operationTimer = 0;
    });
  }

  public setSpeed(speed: number): void {
    this.scene.simulationState.speed = speed;
  }

  public update(realDeltaTime: number): void {
    if (!this.scene.simulationState.isRunning) return;

    this.scene.simulationState.elapsedRealTime += realDeltaTime;
    const scaledDeltaTime = realDeltaTime * this.scene.simulationState.speed;
    this.accumulatedTime += scaledDeltaTime;

    while (this.accumulatedTime >= this.fixedDeltaTime) {
      this.fixedUpdate(this.fixedDeltaTime);
      this.accumulatedTime -= this.fixedDeltaTime;
    }

    if (this.onUpdate) {
      this.onUpdate(this.scene);
    }
  }

  private fixedUpdate(dt: number): void {
    const currentTime = this.scene.simulationState.currentTime;
    this.scene.simulationState.currentTime += dt;

    this.interferenceManager.update(dt, currentTime, this.scene.agvs, this.scene.quayCranes);
    this.generateNewTasks(dt);
    this.processTaskAssignment();
    this.updateAGVs(dt);
    this.updateCranes(dt);
    this.updateRoadCongestion();
    this.updateStatistics(dt);
  }

  private generateNewTasks(dt: number): void {
    this.taskGenerationTimer += dt;
    
    if (this.taskGenerationTimer >= 10) {
      this.taskGenerationTimer = 0;
      
      const pendingTasks = this.scene.tasks.filter(t => t.status === 'pending').length;
      if (pendingTasks < 20) {
        this.scene.shipSchedules.forEach(ship => {
          if (this.scene.simulationState.currentTime >= ship.arrivalTime &&
              this.scene.simulationState.currentTime < ship.departureTime) {
            const remainingContainers = ship.containers.filter(c => 
              !this.scene.tasks.some(t => t.containerId === c)
            );
            
            if (remainingContainers.length > 0 && Math.random() < 0.3) {
              const containerId = remainingContainers[0];
              const crane = this.scene.quayCranes.find(qc => qc.id === ship.quayCraneId);
              const targetBlock = this.scene.yardBlocks[Math.floor(Math.random() * this.scene.yardBlocks.length)];
              
              if (crane && targetBlock) {
                const task: Task = {
                  id: generateId('task-'),
                  type: 'quay_to_yard',
                  containerId,
                  origin: { ...crane.position },
                  destination: {
                    x: targetBlock.position.x + (Math.random() - 0.5) * targetBlock.position.width * 0.8,
                    y: targetBlock.position.y + (Math.random() - 0.5) * targetBlock.position.height * 0.8,
                  },
                  originId: crane.id,
                  destinationId: targetBlock.id,
                  priority: 1,
                  status: 'pending',
                  assignedAGV: null,
                  createdAt: this.scene.simulationState.currentTime,
                  startedAt: null,
                  completedAt: null,
                  waitTime: 0,
                };
                
                this.scene.tasks.push(task);
              }
            }
          }
        });
      }
    }
  }

  private processTaskAssignment(): void {
    const idleAGVs = this.scene.agvs.filter(a => a.status === 'idle');
    const pendingTasks = this.scene.tasks.filter(t => t.status === 'pending');
    
    if (idleAGVs.length === 0 || pendingTasks.length === 0) return;

    this.pathPlanningThrottle += this.fixedDeltaTime;
    if (this.pathPlanningThrottle < this.PATH_PLANNING_INTERVAL) return;
    this.pathPlanningThrottle = 0;

    const assignments = this.scheduler.assignTasks(this.scene.agvs, this.scene.tasks);
    const batchSize = Math.min(5, idleAGVs.length);
    let assigned = 0;

    for (const [agvId, task] of assignments) {
      if (assigned >= batchSize) break;
      
      const agv = this.scene.agvs.find(a => a.id === agvId);
      if (!agv) continue;

      if (this.agvPhysics.needsCharging(agv, this.scene.config.lowBatteryThreshold)) {
        this.sendToCharge(agv);
        assigned++;
        continue;
      }

      task.assignedAGV = agvId;
      task.status = 'assigned';
      agv.currentTask = task;
      agv.status = 'moving';
      
      const path = this.pathPlanner.findPath(agv.position, task.origin);
      agv.path = path;
      agv.pathIndex = 0;

      this.ganttData.push({
        id: `${task.id}-travel`,
        name: `${agv.name} - ${task.containerId}`,
        type: 'travel_to_load',
        startTime: this.scene.simulationState.currentTime,
        endTime: this.scene.simulationState.currentTime + 60,
        resource: agvId,
        status: 'in_progress',
      });
      
      assigned++;
    }
  }

  private updateAGVs(dt: number): void {
    const movingAGVs = this.scene.agvs.filter(agv => agv.status === 'moving');

    this.scene.agvs.forEach(agv => {
      if (agv.status === 'fault') return;

      const target = this.agvPhysics.getTargetFromPath(agv);
      this.agvPhysics.update(agv, dt, [], target, this.scene.agvs);
      this.agvPhysics.updateBattery(agv, dt, this.scene.config.batteryConsumptionPerKm);

      if (agv.status === 'moving') {
        const pathComplete = this.agvPhysics.checkPathProgress(agv);
        if (pathComplete && agv.currentTask) {
          this.handleTaskProgress(agv);
        }
      }

      if (this.agvPhysics.needsCharging(agv, this.scene.config.lowBatteryThreshold) && agv.status === 'idle') {
        this.sendToCharge(agv);
      }

      if (agv.status === 'charging') {
        if (agv.battery >= agv.batteryCapacity * 0.9) {
          agv.status = 'idle';
        }
      }
    });

    if (this.scheduler.checkDeadlock(this.scene.agvs)) {
      this.scene.simulationState.deadlockCount++;
      this.scheduler.resolveDeadlock(this.scene.agvs);
    }
  }

  private handleTaskProgress(agv: AGV): void {
    const task = agv.currentTask;
    if (!task) return;

    if (task.status === 'assigned') {
      agv.status = 'loading';
      task.status = 'loading';
      
      const crane = this.scene.quayCranes.find(qc => qc.id === task.originId) ||
                    this.scene.yardCranes.find(yc => yc.id === task.originId);
      
      if (crane) {
        crane.status = 'working';
        crane.currentTask = task;
        crane.operationTimer = this.interferenceManager.getAdjustedOperationTime(crane.operationTime);
      }

      setTimeout(() => {
        if (agv.status === 'loading') {
          const path = this.pathPlanner.findPath(agv.position, task.destination);
          agv.path = path;
          agv.pathIndex = 0;
          agv.status = 'moving';
          task.status = 'in_progress';
          task.startedAt = this.scene.simulationState.currentTime;
        }
      }, 3000);
    } else if (task.status === 'in_progress') {
      agv.status = 'unloading';
      task.status = 'unloading';
      
      const crane = this.scene.quayCranes.find(qc => qc.id === task.destinationId) ||
                    this.scene.yardCranes.find(yc => yc.id === task.destinationId);
      
      if (crane) {
        crane.status = 'working';
        crane.currentTask = task;
        crane.operationTimer = this.interferenceManager.getAdjustedOperationTime(crane.operationTime);
      }

      setTimeout(() => {
        if (agv.status === 'unloading') {
          this.completeTask(task);
          agv.status = 'idle';
          agv.currentTask = null;
        }
      }, 3000);
    }
  }

  private updateCranes(dt: number): void {
    this.scene.quayCranes.forEach(crane => {
      if (crane.status === 'working' && crane.operationTimer > 0) {
        crane.operationTimer -= dt;
        if (crane.operationTimer <= 0) {
          const completedTask = crane.currentTask;
          crane.status = 'idle';
          crane.currentTask = null;
          
          if (completedTask) {
            this.completeTask(completedTask);
          }
        }
      }
    });

    this.scene.yardCranes.forEach(crane => {
      if (crane.status === 'working' && crane.operationTimer > 0) {
        crane.operationTimer -= dt;
        if (crane.operationTimer <= 0) {
          crane.status = 'idle';
          crane.currentTask = null;
        }
      }
    });
  }

  private completeTask(task: Task): void {
    task.status = 'completed';
    task.completedAt = this.scene.simulationState.currentTime;
    
    const agv = this.scene.agvs.find(a => a.id === task.assignedAGV);
    if (agv) {
      agv.status = 'idle';
      agv.currentTask = null;
      agv.path = [];
      agv.pathIndex = 0;
    }

    this.scene.simulationState.totalTEU++;

    const lastGanttItem = this.ganttData.find(g => g.id.startsWith(task.id));
    if (lastGanttItem) {
      lastGanttItem.endTime = this.scene.simulationState.currentTime;
      lastGanttItem.status = 'completed';
    }
  }

  private sendToCharge(agv: AGV): void {
    const nearestCharger = this.findNearestChargingStation(agv.position);
    if (nearestCharger) {
      agv.status = 'moving';
      agv.currentTask = null;
      const path = this.pathPlanner.findPath(agv.position, nearestCharger.position);
      agv.path = path;
      agv.pathIndex = 0;
    }
  }

  private findNearestChargingStation(position: Position) {
    let nearest = null;
    let minDist = Infinity;
    
    this.scene.chargingStations.forEach(station => {
      const dist = distance(position, station.position);
      if (dist < minDist && station.available) {
        minDist = dist;
        nearest = station;
      }
    });
    
    return nearest;
  }

  private updateRoadCongestion(): void {
    this.scene.roadSegments.forEach(segment => {
      const agvsOnSegment = this.scene.agvs.filter(agv => {
        if (agv.status !== 'moving') return false;
        return true;
      }).length;
      
      segment.congestion = Math.min(1, agvsOnSegment / 3);
    });

    this.scene.roadNetwork.forEach(node => {
      const connectedSegments = this.scene.roadSegments.filter(
        s => s.from === node.id || s.to === node.id
      );
      node.congestion = connectedSegments.reduce((sum, s) => sum + s.congestion, 0) / connectedSegments.length;
    });
  }

  private updateStatistics(dt: number): void {
    const state = this.scene.simulationState;
    
    if (state.currentTime > 0) {
      state.teuPerHour = state.totalTEU / (state.currentTime / 3600);
    }

    const completedTasks = this.scene.tasks.filter(t => t.status === 'completed');
    if (completedTasks.length > 0) {
      const totalWaitTime = completedTasks.reduce((sum, t) => {
        if (t.startedAt && t.createdAt) {
          return sum + (t.startedAt - t.createdAt);
        }
        return sum;
      }, 0);
      state.averageWaitTime = totalWaitTime / completedTasks.length;
      
      state.maxWaitTime = Math.max(...completedTasks.map(t => 
        t.startedAt ? t.startedAt - t.createdAt : 0
      ));
    }

    const workingAGVs = this.scene.agvs.filter(a => 
      a.status === 'moving' || a.status === 'loading' || a.status === 'unloading'
    ).length;
    state.agvUtilization = (workingAGVs / this.scene.agvs.length) * 100;

    const workingCranes = this.scene.quayCranes.filter(c => c.status === 'working').length;
    state.craneUtilization = (workingCranes / this.scene.quayCranes.length) * 100;

    const totalTasks = this.scene.tasks.length;
    state.taskCompletionRate = totalTasks > 0 
      ? (completedTasks.length / totalTasks) * 100 
      : 0;

    state.faultCount = this.interferenceManager.getFaultCount();
  }

  public getActiveEvents(): InterferenceEvent[] {
    return this.interferenceManager.getActiveEvents();
  }

  public getEventHistory(): InterferenceEvent[] {
    return this.interferenceManager.getEventHistory();
  }

  public generateReport(): KPIReport {
    const state = this.scene.simulationState;
    const bottlenecks: BottleneckItem[] = [];

    if (state.averageWaitTime > 300) {
      bottlenecks.push({
        name: '任务等待时间过长',
        severity: state.averageWaitTime > 600 ? 'high' : 'medium',
        description: `平均等待时间为 ${formatTime(state.averageWaitTime)}`,
        suggestion: '增加AGV数量或优化路径规划算法',
        metric: state.averageWaitTime,
        threshold: 300,
      });
    }

    if (state.agvUtilization > 85) {
      bottlenecks.push({
        name: 'AGV利用率过高',
        severity: state.agvUtilization > 95 ? 'high' : 'medium',
        description: `AGV利用率为 ${state.agvUtilization.toFixed(1)}%`,
        suggestion: '考虑增加AGV数量',
        metric: state.agvUtilization,
        threshold: 85,
      });
    }

    if (state.deadlockCount > 5) {
      bottlenecks.push({
        name: '死锁频繁发生',
        severity: state.deadlockCount > 10 ? 'high' : 'medium',
        description: `已发生 ${state.deadlockCount} 次死锁`,
        suggestion: '优化死锁避免策略或调整路径规划',
        metric: state.deadlockCount,
        threshold: 5,
      });
    }

    if (state.faultCount > 3) {
      bottlenecks.push({
        name: 'AGV故障频繁',
        severity: state.faultCount > 5 ? 'high' : 'medium',
        description: `已发生 ${state.faultCount} 次故障`,
        suggestion: '降低故障率或增加备用AGV',
        metric: state.faultCount,
        threshold: 3,
      });
    }

    return {
      totalTEU: state.totalTEU,
      teuPerHour: state.teuPerHour,
      averageWaitTime: state.averageWaitTime,
      maxWaitTime: state.maxWaitTime,
      agvUtilization: state.agvUtilization,
      craneUtilization: state.craneUtilization,
      deadlockCount: state.deadlockCount,
      faultCount: state.faultCount,
      taskCompletionRate: state.taskCompletionRate,
      totalTasks: this.scene.tasks.length,
      completedTasks: this.scene.tasks.filter(t => t.status === 'completed').length,
      ganttData: [...this.ganttData],
      bottleneckAnalysis: bottlenecks,
      simulationDuration: state.currentTime,
      timestamp: Date.now(),
    };
  }

  public getScene(): Scene {
    return this.scene;
  }

  public setScene(scene: Scene): void {
    this.scene = scene;
    this.pathPlanner.updateNodes(scene.roadNetwork);
  }

  public getAGVPhysics(): AGVPhysics {
    return this.agvPhysics;
  }

  public triggerAGVFault(agvId: string): InterferenceEvent | null {
    return this.interferenceManager.manuallyTriggerFault(
      agvId,
      this.scene.simulationState.currentTime
    );
  }
}
