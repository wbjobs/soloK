export interface Position {
  x: number;
  y: number;
}

export interface Position3D {
  x: number;
  y: number;
  z: number;
}

export interface Velocity {
  linear: number;
  angular: number;
}

export interface PathPoint {
  x: number;
  y: number;
  timestamp?: number;
}

export type AGVStatus = 'idle' | 'moving' | 'loading' | 'unloading' | 'charging' | 'fault';

export interface AGV {
  id: string;
  name: string;
  position: Position & { angle: number };
  velocity: Velocity;
  battery: number;
  status: AGVStatus;
  currentTask: Task | null;
  path: PathPoint[];
  pathIndex: number;
  maxSpeed: number;
  maxAcceleration: number;
  batteryCapacity: number;
  totalDistance: number;
  faultTimer: number;
  operationTimer: number;
}

export type TaskType = 'quay_to_yard' | 'yard_to_quay';
export type TaskStatus = 'pending' | 'assigned' | 'loading' | 'in_progress' | 'unloading' | 'completed' | 'failed';

export interface Task {
  id: string;
  type: TaskType;
  containerId: string;
  origin: Position;
  destination: Position;
  originId: string;
  destinationId: string;
  priority: number;
  status: TaskStatus;
  assignedAGV: string | null;
  createdAt: number;
  startedAt: number | null;
  completedAt: number | null;
  waitTime: number;
}

export type CraneStatus = 'idle' | 'working' | 'fault';

export interface QuayCrane {
  id: string;
  name: string;
  position: Position;
  status: CraneStatus;
  currentShip: string | null;
  operationTime: number;
  timeVariation: number;
  currentTask: Task | null;
  operationTimer: number;
}

export interface YardCrane {
  id: string;
  name: string;
  position: Position;
  status: CraneStatus;
  operationTime: number;
  currentTask: Task | null;
  operationTimer: number;
}

export interface YardBlock {
  id: string;
  name: string;
  position: Position & { width: number; height: number };
  capacity: number;
  currentContainers: number;
  bays: number;
  rows: number;
  tiers: number;
}

export interface RoadNode {
  id: string;
  position: Position;
  connections: string[];
  congestion: number;
  type: 'normal' | 'intersection' | 'charging' | 'quay' | 'yard';
}

export interface RoadSegment {
  id: string;
  from: string;
  to: string;
  length: number;
  congestion: number;
  maxSpeed: number;
}

export interface ChargingStation {
  id: string;
  position: Position;
  nodeId: string;
  available: boolean;
}

export interface ShipSchedule {
  id: string;
  shipName: string;
  arrivalTime: number;
  departureTime: number;
  containerCount: number;
  quayCraneId: string;
  containers: string[];
}

export interface SimulationState {
  isRunning: boolean;
  speed: number;
  currentTime: number;
  totalTEU: number;
  teuPerHour: number;
  averageWaitTime: number;
  maxWaitTime: number;
  agvUtilization: number;
  craneUtilization: number;
  deadlockCount: number;
  faultCount: number;
  taskCompletionRate: number;
  elapsedRealTime: number;
}

export interface Scene {
  id: string;
  name: string;
  description: string;
  createdAt: number;
  updatedAt: number;
  thumbnail?: string;
  agvs: AGV[];
  quayCranes: QuayCrane[];
  yardCranes: YardCrane[];
  yardBlocks: YardBlock[];
  roadNetwork: RoadNode[];
  roadSegments: RoadSegment[];
  chargingStations: ChargingStation[];
  tasks: Task[];
  shipSchedules: ShipSchedule[];
  simulationState: SimulationState;
  config: SimulationConfig;
}

export interface SimulationConfig {
  agvCount: number;
  agvMaxSpeed: number;
  agvMaxAcceleration: number;
  agvBatteryCapacity: number;
  batteryConsumptionPerKm: number;
  lowBatteryThreshold: number;
  chargingRate: number;
  agvFaultRate: number;
  agvFaultDuration: number;
  quayCraneTimeVariation: number;
  taskAssignmentAlgorithm: 'greedy' | 'hungarian';
  deadlockAvoidance: 'banker' | 'reservation' | 'none';
  congestionWeight: number;
  dwaConfig: DWAConfig;
}

export interface DWAConfig {
  maxSpeed: number;
  minSpeed: number;
  maxAcceleration: number;
  maxAngularSpeed: number;
  maxAngularAcceleration: number;
  velocityResolution: number;
  angularResolution: number;
  timeToPredict: number;
  alpha: number;
  beta: number;
  gamma: number;
  obstacleRadius: number;
}

export interface GanttItem {
  id: string;
  name: string;
  type: string;
  startTime: number;
  endTime: number;
  resource: string;
  status: string;
}

export interface BottleneckItem {
  name: string;
  severity: 'low' | 'medium' | 'high';
  description: string;
  suggestion: string;
  metric: number;
  threshold: number;
}

export interface KPIReport {
  totalTEU: number;
  teuPerHour: number;
  averageWaitTime: number;
  maxWaitTime: number;
  agvUtilization: number;
  craneUtilization: number;
  deadlockCount: number;
  faultCount: number;
  taskCompletionRate: number;
  totalTasks: number;
  completedTasks: number;
  ganttData: GanttItem[];
  bottleneckAnalysis: BottleneckItem[];
  simulationDuration: number;
  timestamp: number;
}

export interface InterferenceEvent {
  id: string;
  type: 'agv_fault' | 'crane_fault' | 'delay' | 'congestion';
  targetId: string;
  startTime: number;
  endTime: number;
  duration: number;
  description: string;
  active: boolean;
}

export interface TrafficData {
  segmentId: string;
  agvCount: number;
  averageSpeed: number;
  congestion: number;
  timestamp: number;
}
