import {
  Scene,
  AGV,
  QuayCrane,
  YardCrane,
  YardBlock,
  RoadNode,
  RoadSegment,
  ChargingStation,
  ShipSchedule,
  Task,
  SimulationState,
} from '../types';
import { DEFAULT_SIMULATION_CONFIG } from '../utils/constants';
import { generateId } from '../utils/math';

const TERMINAL_WIDTH = 200;
const TERMINAL_LENGTH = 300;
const QUAY_POSITION = -TERMINAL_LENGTH / 2 + 10;
const YARD_START = -TERMINAL_LENGTH / 2 + 40;
const YARD_END = TERMINAL_LENGTH / 2 - 20;
const ROAD_SPACING = 20;

const generateRoadNetwork = (): { nodes: RoadNode[]; segments: RoadSegment[] } => {
  const nodes: RoadNode[] = [];
  const segments: RoadSegment[] = [];
  
  const horizontalRoads = 6;
  const verticalRoads = 8;
  
  for (let row = 0; row < horizontalRoads; row++) {
    for (let col = 0; col < verticalRoads; col++) {
      const x = -TERMINAL_WIDTH / 2 + 20 + col * ROAD_SPACING;
      const y = YARD_START + row * ((YARD_END - YARD_START) / (horizontalRoads - 1));
      
      const nodeId = `node-${row}-${col}`;
      const type = row === 0 ? 'quay' : row === horizontalRoads - 1 ? 'yard' : 'normal';
      
      nodes.push({
        id: nodeId,
        position: { x, y },
        connections: [],
        congestion: 0,
        type: type as RoadNode['type'],
      });
      
      if (col > 0) {
        const leftNodeId = `node-${row}-${col - 1}`;
        const segId = `seg-h-${row}-${col}`;
        const leftNode = nodes.find(n => n.id === leftNodeId)!;
        const currentNode = nodes.find(n => n.id === nodeId)!;
        
        leftNode.connections.push(nodeId);
        currentNode.connections.push(leftNodeId);
        
        segments.push({
          id: segId,
          from: leftNodeId,
          to: nodeId,
          length: ROAD_SPACING,
          congestion: 0,
          maxSpeed: 5,
        });
      }
      
      if (row > 0) {
        const topNodeId = `node-${row - 1}-${col}`;
        const segId = `seg-v-${row}-${col}`;
        const topNode = nodes.find(n => n.id === topNodeId)!;
        const currentNode = nodes.find(n => n.id === nodeId)!;
        
        topNode.connections.push(nodeId);
        currentNode.connections.push(topNodeId);
        
        segments.push({
          id: segId,
          from: topNodeId,
          to: nodeId,
          length: (YARD_END - YARD_START) / (horizontalRoads - 1),
          congestion: 0,
          maxSpeed: 5,
        });
      }
    }
  }
  
  const chargingNodeIds = ['node-2-0', 'node-3-7'];
  chargingNodeIds.forEach(id => {
    const node = nodes.find(n => n.id === id);
    if (node) node.type = 'charging';
  });
  
  return { nodes, segments };
};

const generateAGVs = (count: number, nodes: RoadNode[]): AGV[] => {
  const agvs: AGV[] = [];
  const spawnNodes = nodes.filter(n => n.type === 'normal' || n.type === 'charging');
  
  for (let i = 0; i < count; i++) {
    const spawnNode = spawnNodes[i % spawnNodes.length];
    agvs.push({
      id: generateId('agv-'),
      name: `AGV-${(i + 1).toString().padStart(3, '0')}`,
      position: { ...spawnNode.position, angle: 0 },
      velocity: { linear: 0, angular: 0 },
      battery: 100,
      status: 'idle',
      currentTask: null,
      path: [],
      pathIndex: 0,
      maxSpeed: DEFAULT_SIMULATION_CONFIG.agvMaxSpeed,
      maxAcceleration: DEFAULT_SIMULATION_CONFIG.agvMaxAcceleration,
      batteryCapacity: DEFAULT_SIMULATION_CONFIG.agvBatteryCapacity,
      totalDistance: 0,
      faultTimer: 0,
      operationTimer: 0,
    });
  }
  
  return agvs;
};

const generateQuayCranes = (nodes: RoadNode[]): QuayCrane[] => {
  const quayNodes = nodes.filter(n => n.type === 'quay');
  return [
    {
      id: 'qc-1',
      name: '岸桥-1',
      position: { ...quayNodes[1].position },
      status: 'idle',
      currentShip: null,
      operationTime: 60,
      timeVariation: DEFAULT_SIMULATION_CONFIG.quayCraneTimeVariation,
      currentTask: null,
      operationTimer: 0,
    },
    {
      id: 'qc-2',
      name: '岸桥-2',
      position: { ...quayNodes[3].position },
      status: 'idle',
      currentShip: null,
      operationTime: 60,
      timeVariation: DEFAULT_SIMULATION_CONFIG.quayCraneTimeVariation,
      currentTask: null,
      operationTimer: 0,
    },
    {
      id: 'qc-3',
      name: '岸桥-3',
      position: { ...quayNodes[5].position },
      status: 'idle',
      currentShip: null,
      operationTime: 60,
      timeVariation: DEFAULT_SIMULATION_CONFIG.quayCraneTimeVariation,
      currentTask: null,
      operationTimer: 0,
    },
    {
      id: 'qc-4',
      name: '岸桥-4',
      position: { ...quayNodes[7].position },
      status: 'idle',
      currentShip: null,
      operationTime: 60,
      timeVariation: DEFAULT_SIMULATION_CONFIG.quayCraneTimeVariation,
      currentTask: null,
      operationTimer: 0,
    },
  ];
};

const generateYardCranes = (nodes: RoadNode[]): YardCrane[] => {
  const yardNodes = nodes.filter(n => n.type === 'yard');
  return [
    {
      id: 'yc-1',
      name: '场桥-1',
      position: { ...yardNodes[1].position },
      status: 'idle',
      operationTime: 45,
      currentTask: null,
      operationTimer: 0,
    },
    {
      id: 'yc-2',
      name: '场桥-2',
      position: { ...yardNodes[3].position },
      status: 'idle',
      operationTime: 45,
      currentTask: null,
      operationTimer: 0,
    },
    {
      id: 'yc-3',
      name: '场桥-3',
      position: { ...yardNodes[5].position },
      status: 'idle',
      operationTime: 45,
      currentTask: null,
      operationTimer: 0,
    },
    {
      id: 'yc-4',
      name: '场桥-4',
      position: { ...yardNodes[7].position },
      status: 'idle',
      operationTime: 45,
      currentTask: null,
      operationTimer: 0,
    },
  ];
};

const generateYardBlocks = (): YardBlock[] => {
  const blocks: YardBlock[] = [];
  const blockWidth = 15;
  const blockLength = 40;
  
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 6; col++) {
      const x = -TERMINAL_WIDTH / 2 + 30 + col * (blockWidth + 5);
      const y = YARD_START + 30 + row * (blockLength + 10);
      
      blocks.push({
        id: `block-${row}-${col}`,
        name: `箱区-${String.fromCharCode(65 + row)}${col + 1}`,
        position: { x, y, width: blockWidth, height: blockLength },
        capacity: 200,
        currentContainers: Math.floor(Math.random() * 50),
        bays: 10,
        rows: 4,
        tiers: 5,
      });
    }
  }
  
  return blocks;
};

const generateChargingStations = (nodes: RoadNode[]): ChargingStation[] => {
  const chargingNodes = nodes.filter(n => n.type === 'charging');
  return chargingNodes.map(node => ({
    id: `charger-${node.id}`,
    position: { ...node.position },
    nodeId: node.id,
    available: true,
  }));
};

const generateShipSchedules = (): ShipSchedule[] => {
  return [
    {
      id: generateId('ship-'),
      shipName: '中远之星',
      arrivalTime: 0,
      departureTime: 7200,
      containerCount: 50,
      quayCraneId: 'qc-1',
      containers: Array.from({ length: 50 }, (_, i) => `CNT-中远之星-${i.toString().padStart(4, '0')}`),
    },
    {
      id: generateId('ship-'),
      shipName: '海丝号',
      arrivalTime: 1800,
      departureTime: 9000,
      containerCount: 40,
      quayCraneId: 'qc-2',
      containers: Array.from({ length: 40 }, (_, i) => `CNT-海丝号-${i.toString().padStart(4, '0')}`),
    },
    {
      id: generateId('ship-'),
      shipName: '丝路之舟',
      arrivalTime: 3600,
      departureTime: 10800,
      containerCount: 60,
      quayCraneId: 'qc-3',
      containers: Array.from({ length: 60 }, (_, i) => `CNT-丝路之舟-${i.toString().padStart(4, '0')}`),
    },
    {
      id: generateId('ship-'),
      shipName: '远洋先锋',
      arrivalTime: 5400,
      departureTime: 12600,
      containerCount: 45,
      quayCraneId: 'qc-4',
      containers: Array.from({ length: 45 }, (_, i) => `CNT-远洋先锋-${i.toString().padStart(4, '0')}`),
    },
  ];
};

const generateInitialTasks = (shipSchedules: ShipSchedule[], quayCranes: QuayCrane[], yardBlocks: YardBlock[]): Task[] => {
  const tasks: Task[] = [];
  
  shipSchedules.forEach(ship => {
    const crane = quayCranes.find(qc => qc.id === ship.quayCraneId);
    if (!crane) return;
    
    ship.containers.slice(0, 5).forEach((containerId, index) => {
      const targetBlock = yardBlocks[Math.floor(Math.random() * yardBlocks.length)];
      
      tasks.push({
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
        createdAt: ship.arrivalTime + index * 30,
        startedAt: null,
        completedAt: null,
        waitTime: 0,
      });
    });
  });
  
  return tasks;
};

export const createDefaultScene = (): Scene => {
  const { nodes, segments } = generateRoadNetwork();
  const agvs = generateAGVs(DEFAULT_SIMULATION_CONFIG.agvCount, nodes);
  const quayCranes = generateQuayCranes(nodes);
  const yardCranes = generateYardCranes(nodes);
  const yardBlocks = generateYardBlocks();
  const chargingStations = generateChargingStations(nodes);
  const shipSchedules = generateShipSchedules();
  const tasks = generateInitialTasks(shipSchedules, quayCranes, yardBlocks);
  
  const simulationState: SimulationState = {
    isRunning: false,
    speed: 1,
    currentTime: 0,
    totalTEU: 0,
    teuPerHour: 0,
    averageWaitTime: 0,
    maxWaitTime: 0,
    agvUtilization: 0,
    craneUtilization: 0,
    deadlockCount: 0,
    faultCount: 0,
    taskCompletionRate: 0,
    elapsedRealTime: 0,
  };
  
  return {
    id: generateId('scene-'),
    name: '默认场景',
    description: '包含4台岸桥、4台场桥、10台AGV的标准自动化码头场景',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    agvs,
    quayCranes,
    yardCranes,
    yardBlocks,
    roadNetwork: nodes,
    roadSegments: segments,
    chargingStations,
    tasks,
    shipSchedules,
    simulationState,
    config: { ...DEFAULT_SIMULATION_CONFIG },
  };
};
