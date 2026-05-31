export enum EventType {
  PASS = 'pass',
  SHOT = 'shot',
  TACKLE = 'tackle',
  OFFSIDE = 'offside',
  FOUL = 'foul',
}

export enum CameraType {
  MAIN = 'main',
  GOAL_LEFT = 'goal_left',
  GOAL_RIGHT = 'goal_right',
}

export enum FormationType {
  F442 = '4-4-2',
  F433 = '4-3-3',
  F352 = '3-5-2',
  F532 = '5-3-2',
  F4231 = '4-2-3-1',
}

export interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  role: 'admin' | 'coach' | 'analyst';
  createdAt: Date;
}

export interface Match {
  id: string;
  title: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  date: Date;
  duration: number;
  status: 'pending' | 'processing' | 'completed' | 'error';
  videoUrl?: string;
  thumbnailUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Player {
  id: string;
  matchId: string;
  teamId: 'home' | 'away';
  jerseyNumber: number;
  name: string;
  position: string;
  isStarting: boolean;
  minutesPlayed: number;
}

export interface TrackingData {
  matchId: string;
  frameNumber: number;
  timestamp: number;
  players: PlayerPosition[];
  ball?: {
    x: number;
    y: number;
    z?: number;
  };
}

export interface Event {
  id: string;
  matchId: string;
  type: EventType;
  timestamp: number;
  half: 1 | 2;
  minute: number;
  second: number;
  teamId: 'home' | 'away';
  playerId?: string;
  playerName?: string;
  x: number;
  y: number;
  endX?: number;
  endY?: number;
  outcome: 'success' | 'failed';
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface AnalysisResult {
  id: string;
  matchId: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  progress: number;
  totalFrames: number;
  processedFrames: number;
  possession: {
    home: number;
    away: number;
  };
  shots: {
    home: number;
    away: number;
  };
  passes: {
    home: number;
    away: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface TacticalBoard {
  id: string;
  name: string;
  matchId?: string;
  formation: FormationType;
  players: PlayerPosition[];
  annotations: Annotation[];
  createdAt: Date;
  updatedAt: Date;
}

export interface PlayerPosition {
  id: string;
  playerId?: string;
  jerseyNumber: number;
  name: string;
  teamId: 'home' | 'away';
  x: number;
  y: number;
  isSelected?: boolean;
}

export interface Formation {
  type: FormationType;
  name: string;
  positions: {
    role: string;
    x: number;
    y: number;
  }[];
}

export interface HeatmapCell {
  x: number;
  y: number;
  value: number;
  normalizedValue: number;
}

export interface PassNetwork {
  nodes: {
    playerId: string;
    playerName: string;
    jerseyNumber: number;
    x: number;
    y: number;
    passesMade: number;
    passesReceived: number;
  }[];
  edges: {
    fromPlayerId: string;
    toPlayerId: string;
    count: number;
    successRate: number;
  }[];
}

export interface Annotation {
  id: string;
  type: 'line' | 'arrow' | 'circle' | 'rectangle' | 'text';
  color: string;
  points: { x: number; y: number }[];
  text?: string;
}

export interface PlayerStats {
  playerId: string;
  matchId: string;
  totalDistance: number;
  highIntensityDistance: number;
  sprintCount: number;
  maxSpeed: number;
  averageSpeed: number;
  passes: number;
  successfulPasses: number;
  shots: number;
  shotsOnTarget: number;
  tackles: number;
  interceptions: number;
  heatmap: HeatmapCell[];
}

export interface FrameData {
  frameNumber: number;
  timestamp: number;
  imageUrl?: string;
  trackingData: TrackingData;
  events: Event[];
}

export interface PlayerRunData {
  playerId: string;
  playerName: string;
  runs: {
    id: string;
    startTime: number;
    endTime: number;
    distance: number;
    maxSpeed: number;
    averageSpeed: number;
    type: 'walk' | 'jog' | 'run' | 'sprint';
    coordinates: { x: number; y: number; t: number }[];
  }[];
}
