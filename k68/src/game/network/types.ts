export interface PlayerState {
  id: string;
  playerIndex: number;
  x: number;
  y: number;
  health: number;
  maxHealth: number;
  isGhost: boolean;
  isSpectating: boolean;
  name: string;
}

export interface EnemyState {
  id: number;
  x: number;
  y: number;
  health: number;
  maxHealth: number;
  type: string;
}

export interface ProjectileState {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  skillId: string;
  damage: number;
  ownerId: string;
}

export interface GameState {
  players: Record<string, PlayerState>;
  enemies: EnemyState[];
  projectiles: ProjectileState[];
  timestamp: number;
}

export type NetworkMessage = 
  | { type: 'player_join'; player: PlayerState }
  | { type: 'player_leave'; playerId: string }
  | { type: 'state_update'; state: GameState }
  | { type: 'input'; keys: string[]; mouseX: number; mouseY: number; playerId: string }
  | { type: 'skill_cast'; skillId: string; x: number; y: number; targetX: number; targetY: number; playerId: string }
  | { type: 'chat'; message: string; playerId: string };

export interface NetworkConnection {
  id: string;
  isHost: boolean;
  isConnected: boolean;
  peerId: string;
}
