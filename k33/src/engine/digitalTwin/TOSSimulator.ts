import { TOSData, TOSAGVData, TOSTaskData, TOSCraneData, TOSShipData, TOSStatistics } from './DigitalTwin';
import { Scene, AGV, Task, QuayCrane, YardCrane } from '../../types';

export class TOSSimulator {
  private scene: Scene;
  private updateInterval: number = 5000;
  private lastUpdate: number = 0;

  constructor(scene: Scene) {
    this.scene = scene;
  }

  public generateTOSData(): TOSData {
    const agvs: TOSAGVData[] = this.scene.agvs.map(agv => ({
      id: agv.id,
      position: { x: agv.position.x, y: agv.position.y, angle: agv.position.angle },
      battery: agv.battery,
      status: agv.status,
      currentTaskId: agv.currentTask?.id || null,
      speed: agv.velocity.linear,
    }));

    const tasks: TOSTaskData[] = this.scene.tasks.map(task => ({
      id: task.id,
      containerId: task.containerId,
      status: task.status,
      originId: task.originId,
      destinationId: task.destinationId,
      priority: task.priority,
      assignedAGV: task.assignedAGV,
    }));

    const cranes: TOSCraneData[] = [
      ...this.scene.quayCranes.map(crane => ({
        id: crane.id,
        type: 'quay' as const,
        position: { x: crane.position.x, y: crane.position.y },
        status: crane.status,
        currentTaskId: crane.currentTask?.id || null,
        operationProgress: crane.operationTimer > 0 ? (1 - crane.operationTimer / crane.operationTime) * 100 : 0,
      })),
      ...this.scene.yardCranes.map(crane => ({
        id: crane.id,
        type: 'yard' as const,
        position: { x: crane.position.x, y: crane.position.y },
        status: crane.status,
        currentTaskId: crane.currentTask?.id || null,
        operationProgress: crane.operationTimer > 0 ? (1 - crane.operationTimer / crane.operationTime) * 100 : 0,
      })),
    ];

    const ships: TOSShipData[] = this.scene.shipSchedules.map(ship => ({
      id: ship.id,
      name: ship.shipName,
      status: 'berthed',
      containersToUnload: ship.containerCount,
      containersToLoad: ship.containerCount,
      berthPosition: 0,
    }));

    const statistics: TOSStatistics = {
      totalTEU: this.scene.simulationState.totalTEU,
      teuPerHour: this.scene.simulationState.teuPerHour,
      avgWaitTime: this.scene.simulationState.averageWaitTime,
      agvUtilization: this.scene.simulationState.agvUtilization,
      craneUtilization: this.scene.simulationState.craneUtilization,
    };

    return {
      timestamp: Date.now(),
      agvs,
      tasks,
      cranes,
      ships,
      statistics,
    };
  }

  public updateScene(scene: Scene): void {
    this.scene = scene;
  }

  public getUpdateInterval(): number {
    return this.updateInterval;
  }

  public setUpdateInterval(interval: number): void {
    this.updateInterval = interval;
  }
}

export class TOSDataGenerator {
  public static generateRandomTOSData(baseData?: Partial<TOSData>): TOSData {
    const now = Date.now();
    
    return {
      timestamp: baseData?.timestamp || now,
      agvs: baseData?.agvs || this.generateRandomAGVs(20),
      tasks: baseData?.tasks || this.generateRandomTasks(50),
      cranes: baseData?.cranes || this.generateRandomCranes(10),
      ships: baseData?.ships || this.generateRandomShips(3),
      statistics: baseData?.statistics || this.generateRandomStatistics(),
    };
  }

  private static generateRandomAGVs(count: number): TOSAGVData[] {
    const statuses = ['idle', 'moving', 'loading', 'unloading', 'charging', 'fault'];
    const agvs: TOSAGVData[] = [];

    for (let i = 0; i < count; i++) {
      agvs.push({
        id: `agv-${String(i + 1).padStart(3, '0')}`,
        position: {
          x: Math.random() * 200 - 100,
          y: Math.random() * 100 - 50,
          angle: Math.random() * Math.PI * 2,
        },
        battery: 20 + Math.random() * 80,
        status: statuses[Math.floor(Math.random() * statuses.length)],
        currentTaskId: Math.random() > 0.5 ? `task-${Math.floor(Math.random() * 50)}` : null,
        speed: Math.random() * 5,
      });
    }

    return agvs;
  }

  private static generateRandomTasks(count: number): TOSTaskData[] {
    const statuses = ['pending', 'assigned', 'in_progress', 'completed', 'failed'];
    const tasks: TOSTaskData[] = [];

    for (let i = 0; i < count; i++) {
      tasks.push({
        id: `task-${String(i + 1).padStart(3, '0')}`,
        containerId: `CONT-${String(Math.floor(Math.random() * 10000)).padStart(6, '0')}`,
        status: statuses[Math.floor(Math.random() * statuses.length)],
        originId: `node-${Math.floor(Math.random() * 20)}`,
        destinationId: `node-${Math.floor(Math.random() * 20)}`,
        priority: 1 + Math.floor(Math.random() * 5),
        assignedAGV: Math.random() > 0.3 ? `agv-${String(Math.floor(Math.random() * 20) + 1).padStart(3, '0')}` : null,
      });
    }

    return tasks;
  }

  private static generateRandomCranes(count: number): TOSCraneData[] {
    const statuses = ['idle', 'working', 'maintenance'];
    const cranes: TOSCraneData[] = [];

    for (let i = 0; i < count; i++) {
      cranes.push({
        id: `crane-${String(i + 1).padStart(3, '0')}`,
        type: i < count / 2 ? 'quay' : 'yard',
        position: {
          x: Math.random() * 200 - 100,
          y: Math.random() * 100 - 50,
        },
        status: statuses[Math.floor(Math.random() * statuses.length)],
        currentTaskId: Math.random() > 0.4 ? `task-${Math.floor(Math.random() * 50)}` : null,
        operationProgress: Math.random() * 100,
      });
    }

    return cranes;
  }

  private static generateRandomShips(count: number): TOSShipData[] {
    const statuses = ['arriving', 'berthed', 'loading', 'unloading', 'departing'];
    const shipNames = ['MV Pacific', 'MV Atlantic', 'MV Ocean Star', 'MV Sea Lord', 'MV Bay Express'];
    const ships: TOSShipData[] = [];

    for (let i = 0; i < count; i++) {
      ships.push({
        id: `ship-${String(i + 1).padStart(3, '0')}`,
        name: shipNames[i % shipNames.length],
        status: statuses[Math.floor(Math.random() * statuses.length)],
        containersToUnload: Math.floor(Math.random() * 500),
        containersToLoad: Math.floor(Math.random() * 500),
        berthPosition: Math.random() * 100,
      });
    }

    return ships;
  }

  private static generateRandomStatistics(): TOSStatistics {
    return {
      totalTEU: Math.floor(Math.random() * 10000),
      teuPerHour: Math.random() * 50,
      avgWaitTime: Math.random() * 1800,
      agvUtilization: Math.random() * 100,
      craneUtilization: Math.random() * 100,
    };
  }
}
