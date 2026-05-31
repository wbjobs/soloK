import { Scene, AGV, Task, ShipSchedule, QuayCrane, YardCrane } from '../../types';
import { createDefaultScene } from '../../mock/defaultScene';
import { distance } from '../../utils/math';

export interface TOSData {
  timestamp: number;
  agvs: TOSAGVData[];
  tasks: TOSTaskData[];
  cranes: TOSCraneData[];
  ships: TOSShipData[];
  statistics: TOSStatistics;
}

export interface TOSAGVData {
  id: string;
  position: { x: number; y: number; angle: number };
  battery: number;
  status: string;
  currentTaskId: string | null;
  speed: number;
}

export interface TOSTaskData {
  id: string;
  containerId: string;
  status: string;
  originId: string;
  destinationId: string;
  priority: number;
  assignedAGV: string | null;
}

export interface TOSCraneData {
  id: string;
  type: 'quay' | 'yard';
  position: { x: number; y: number };
  status: string;
  currentTaskId: string | null;
  operationProgress: number;
}

export interface TOSShipData {
  id: string;
  name: string;
  status: string;
  containersToUnload: number;
  containersToLoad: number;
  berthPosition: number;
}

export interface TOSStatistics {
  totalTEU: number;
  teuPerHour: number;
  avgWaitTime: number;
  agvUtilization: number;
  craneUtilization: number;
}

export interface TwinMappingConfig {
  syncInterval: number;
  tolerance: number;
  autoCorrect: boolean;
  predictAheadMinutes: number;
}

export class DigitalTwin {
  private scene: Scene;
  private config: TwinMappingConfig;
  private lastSyncTime: number = 0;
  private syncHistory: { real: TOSData; sim: Scene }[] = [];
  private predictions: PredictionResult[] = [];
  private isSyncing: boolean = false;
  private onSyncCallback?: (data: TOSData) => void;

  constructor(scene: Scene, config?: Partial<TwinMappingConfig>) {
    this.scene = scene;
    this.config = {
      syncInterval: 5000,
      tolerance: 0.1,
      autoCorrect: true,
      predictAheadMinutes: 15,
      ...config,
    };
  }

  public syncFromTOS(tosData: TOSData): SyncReport {
    const report: SyncReport = {
      timestamp: Date.now(),
      agvSynced: 0,
      taskSynced: 0,
      craneSynced: 0,
      deviations: [],
      errors: [],
    };

    for (const tosAGV of tosData.agvs) {
      const agv = this.scene.agvs.find(a => a.id === tosAGV.id);
      if (agv) {
        const deviation = this.syncAGV(agv, tosAGV);
        if (deviation) {
          report.deviations.push(deviation);
          if (this.config.autoCorrect && deviation.deviation > this.config.tolerance) {
            this.correctAGV(agv, tosAGV);
          }
        }
        report.agvSynced++;
      }
    }

    for (const tosTask of tosData.tasks) {
      const task = this.scene.tasks.find(t => t.id === tosTask.id);
      if (task) {
        const deviation = this.syncTask(task, tosTask);
        if (deviation) {
          report.deviations.push(deviation);
        }
        report.taskSynced++;
      }
    }

    for (const tosCrane of tosData.cranes) {
      const crane = tosCrane.type === 'quay'
        ? this.scene.quayCranes.find(c => c.id === tosCrane.id)
        : this.scene.yardCranes.find(c => c.id === tosCrane.id);
      
      if (crane) {
        const deviation = this.syncCrane(crane, tosCrane);
        if (deviation) {
          report.deviations.push(deviation);
        }
        report.craneSynced++;
      }
    }

    this.lastSyncTime = Date.now();
    this.syncHistory.push({ real: tosData, sim: this.scene });

    if (this.syncHistory.length > 100) {
      this.syncHistory.shift();
    }

    if (this.onSyncCallback) {
      this.onSyncCallback(tosData);
    }

    return report;
  }

  private syncAGV(agv: AGV, tosAGV: TOSAGVData): Deviation | null {
    const posDist = distance(agv.position, tosAGV.position);
    const batteryDiff = Math.abs(agv.battery - tosAGV.battery);
    const maxDiff = Math.max(posDist / 100, batteryDiff / 100);

    if (maxDiff > this.config.tolerance) {
      return {
        type: 'agv',
        id: agv.id,
        deviation: maxDiff,
        details: {
          position: posDist,
          battery: batteryDiff,
          status: agv.status !== tosAGV.status ? 'status_mismatch' : 'ok',
        },
      };
    }
    return null;
  }

  private syncTask(task: Task, tosTask: TOSTaskData): Deviation | null {
    const statusMismatch = task.status !== tosTask.status;
    const assignmentMismatch = task.assignedAGV !== tosTask.assignedAGV;

    if (statusMismatch || assignmentMismatch) {
      return {
        type: 'task',
        id: task.id,
        deviation: (statusMismatch ? 0.5 : 0) + (assignmentMismatch ? 0.5 : 0),
        details: {
          simStatus: task.status,
          realStatus: tosTask.status,
          simAssigned: task.assignedAGV,
          realAssigned: tosTask.assignedAGV,
        },
      };
    }
    return null;
  }

  private syncCrane(crane: QuayCrane | YardCrane, tosCrane: TOSCraneData): Deviation | null {
    if (crane.status !== tosCrane.status) {
      return {
        type: 'crane',
        id: crane.id,
        deviation: 0.5,
        details: {
          simStatus: crane.status,
          realStatus: tosCrane.status,
        },
      };
    }
    return null;
  }

  private correctAGV(agv: AGV, tosAGV: TOSAGVData): void {
    agv.position.x = tosAGV.position.x;
    agv.position.y = tosAGV.position.y;
    agv.position.angle = tosAGV.position.angle;
    agv.battery = tosAGV.battery;
    agv.status = tosAGV.status as any;
  }

  public startSync(getTOSData: () => Promise<TOSData>): void {
    if (this.isSyncing) return;

    this.isSyncing = true;
    this.syncLoop(getTOSData);
  }

  private async syncLoop(getTOSData: () => Promise<TOSData>): Promise<void> {
    while (this.isSyncing) {
      try {
        const tosData = await getTOSData();
        this.syncFromTOS(tosData);
      } catch (error) {
        console.error('TOS sync error:', error);
      }

      await new Promise(resolve => setTimeout(resolve, this.config.syncInterval));
    }
  }

  public stopSync(): void {
    this.isSyncing = false;
  }

  public getSyncStatus(): {
    isSyncing: boolean;
    lastSyncTime: number;
    syncInterval: number;
    historySize: number;
  } {
    return {
      isSyncing: this.isSyncing,
      lastSyncTime: this.lastSyncTime,
      syncInterval: this.config.syncInterval,
      historySize: this.syncHistory.length,
    };
  }

  public onSync(callback: (data: TOSData) => void): void {
    this.onSyncCallback = callback;
  }

  public getScene(): Scene {
    return this.scene;
  }

  public setScene(scene: Scene): void {
    this.scene = scene;
  }

  public getConfig(): TwinMappingConfig {
    return { ...this.config };
  }

  public updateConfig(config: Partial<TwinMappingConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

export interface SyncReport {
  timestamp: number;
  agvSynced: number;
  taskSynced: number;
  craneSynced: number;
  deviations: Deviation[];
  errors: string[];
}

export interface Deviation {
  type: 'agv' | 'task' | 'crane';
  id: string;
  deviation: number;
  details: Record<string, any>;
}

export interface PredictionResult {
  timestamp: number;
  predictions: {
    congestionZones: CongestionZone[];
    throughputForecast: number;
    agvUtilizationForecast: number;
    bottlenecks: string[];
  };
  confidence: number;
}

export interface CongestionZone {
  position: { x: number; y: number };
  severity: 'low' | 'medium' | 'high' | 'critical';
  predictedTime: number;
  duration: number;
}
