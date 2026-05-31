export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export interface Device {
  id: string;
  name: string;
  type: DeviceType;
  status: DeviceStatus;
  position: Vector3;
  rotation: Vector3;
  created_at: string;
  updated_at: string;
  metadata?: Record<string, any>;
}

export type DeviceType = 'robotic_arm' | 'conveyor_belt' | 'vision_inspector';
export type DeviceStatus = 'online' | 'offline' | 'fault';

export interface DeviceTelemetry {
  device_id: string;
  timestamp: string;
  position?: Vector3;
  velocity?: Vector3;
  temperature: number;
  vibration: number;
  current: number;
  velocity_magnitude: number;
  is_anomaly?: boolean;
  anomaly_score?: number;
  anomaly_type?: string;
}

export interface RoboticArmState {
  device_id: string;
  timestamp: string;
  joint_angles: number[];
  end_effector_pos: Vector3;
  end_effector_rot: Vector3;
  gripper_state: number;
  is_moving: boolean;
  target_pos?: Vector3;
}

export interface ConveyorBeltState {
  device_id: string;
  timestamp: string;
  speed: number;
  is_running: boolean;
  direction: number;
  load_count: number;
}

export interface VisionInspectorState {
  device_id: string;
  timestamp: string;
  last_capture_at?: string;
  image_url?: string;
  defect_detected: boolean;
  defect_type?: string;
  confidence?: number;
}

export interface ControlCommand {
  id: string;
  device_id: string;
  type: CommandType;
  params?: Record<string, any>;
  user_id: string;
  timestamp: string;
  status: CommandStatus;
  result?: string;
  error?: string;
}

export type CommandType =
  | 'robotic_arm_move'
  | 'robotic_arm_stop'
  | 'conveyor_start'
  | 'conveyor_stop'
  | 'conveyor_set_speed'
  | 'vision_capture'
  | 'vision_calibrate';

export type CommandStatus = 'pending' | 'executing' | 'completed' | 'failed' | 'rejected';

export interface AnomalyEvent {
  id: string;
  device_id: string;
  type: string;
  severity: string;
  description: string;
  score: number;
  data?: Record<string, any>;
  position?: Vector3;
  timestamp: string;
  acknowledged: boolean;
}

export interface VirtualLimit {
  id: string;
  device_id: string;
  bounds: Bounds3D;
  color?: string;
  opacity?: number;
  is_active: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface Bounds3D {
  x_min: number;
  x_max: number;
  y_min: number;
  y_max: number;
  z_min: number;
  z_max: number;
}

export interface CalibrationPoint {
  id: string;
  device_id: string;
  point_index: number;
  measured_pos: Vector3;
  design_pos: Vector3;
  offset: Vector3;
  timestamp: string;
}

export interface CalibrationReport {
  id: string;
  device_id: string;
  points: CalibrationPoint[];
  average_offset: Vector3;
  max_offset: number;
  rmse: number;
  status: string;
  generated_by: string;
  generated_at: string;
}

export interface User {
  id: string;
  username: string;
  role: UserRole;
  token?: string;
  last_login?: string;
  created_at: string;
}

export type UserRole = 'admin' | 'engineer' | 'maintainer' | 'viewer';
export type Permission = 'control' | 'calibrate' | 'view' | 'admin';

export interface OperationLog {
  id: string;
  user_id: string;
  username: string;
  action: string;
  resource: string;
  resource_id?: string;
  detail?: string;
  ip_address?: string;
  status: string;
  timestamp: string;
}

export interface MutexLock {
  device_id: string;
  user_id: string;
  username: string;
  reason?: string;
  acquired_at: string;
  expires_at: string;
}

export interface WebSocketMessage {
  type: string;
  data: any;
}

export const RolePermissions: Record<UserRole, Permission[]> = {
  admin: ['admin', 'control', 'calibrate', 'view'],
  engineer: ['control', 'calibrate', 'view'],
  maintainer: ['view', 'calibrate'],
  viewer: ['view']
};
