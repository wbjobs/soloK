import { DWAConfig, SimulationConfig } from '../types';

export const DEFAULT_DWA_CONFIG: DWAConfig = {
  maxSpeed: 5.0,
  minSpeed: 0.0,
  maxAcceleration: 1.0,
  maxAngularSpeed: Math.PI / 2,
  maxAngularAcceleration: Math.PI,
  velocityResolution: 0.1,
  angularResolution: Math.PI / 36,
  timeToPredict: 2.0,
  alpha: 0.5,
  beta: 0.3,
  gamma: 0.2,
  obstacleRadius: 2.0,
};

export const DEFAULT_SIMULATION_CONFIG: SimulationConfig = {
  agvCount: 10,
  agvMaxSpeed: 5.0,
  agvMaxAcceleration: 1.0,
  agvBatteryCapacity: 100,
  batteryConsumptionPerKm: 2,
  lowBatteryThreshold: 20,
  chargingRate: 10,
  agvFaultRate: 0.001,
  agvFaultDuration: 30,
  quayCraneTimeVariation: 0.2,
  taskAssignmentAlgorithm: 'hungarian',
  deadlockAvoidance: 'banker',
  congestionWeight: 0.5,
  dwaConfig: DEFAULT_DWA_CONFIG,
};

export const COLORS = {
  primary: '#0A2463',
  secondary: '#3E92CC',
  accent: '#D8315B',
  success: '#3FB618',
  warning: '#FF7518',
  danger: '#D8315B',
  dark: '#1A1A2E',
  light: '#F5F5F5',
  agv: {
    idle: '#6B7280',
    moving: '#3E92CC',
    loading: '#FF7518',
    unloading: '#FF7518',
    charging: '#3FB618',
    fault: '#D8315B',
  },
  heatmap: {
    low: '#3FB618',
    medium: '#FF7518',
    high: '#D8315B',
  },
};

export const SIMULATION_SPEEDS = [0.5, 1, 2, 5, 10];

export const TERMINAL_SIZE = {
  width: 200,
  length: 300,
  quayLength: 200,
};

export const ROAD_WIDTH = 3;
export const AGV_SIZE = { width: 2.5, length: 4.0, height: 1.5 };
export const CONTAINER_SIZE = { width: 2.44, length: 6.06, height: 2.59 };

export const STORAGE_KEYS = {
  scenes: 'agv_sim_scenes',
  currentScene: 'agv_sim_current_scene',
  reports: 'agv_sim_reports',
  settings: 'agv_sim_settings',
};
