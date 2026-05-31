import { EnemyType } from '../ecs/Component';

export interface EnemyData {
  type: EnemyType;
  name: string;
  health: number;
  damage: number;
  speed: number;
  color: string;
  size: number;
  attackRange: number;
  attackCooldown: number;
  skillDropChance: number;
}

export const ENEMIES: Record<EnemyType, EnemyData> = {
  [EnemyType.SLIME]: {
    type: EnemyType.SLIME,
    name: '史莱姆',
    health: 40,
    damage: 8,
    speed: 80,
    color: '#2ecc71',
    size: 28,
    attackRange: 40,
    attackCooldown: 1500,
    skillDropChance: 0.4
  },
  [EnemyType.SKELETON]: {
    type: EnemyType.SKELETON,
    name: '骷髅',
    health: 60,
    damage: 15,
    speed: 120,
    color: '#ecf0f1',
    size: 30,
    attackRange: 50,
    attackCooldown: 1200,
    skillDropChance: 0.5
  },
  [EnemyType.GHOST]: {
    type: EnemyType.GHOST,
    name: '幽灵',
    health: 50,
    damage: 20,
    speed: 150,
    color: '#9b59b6',
    size: 26,
    attackRange: 60,
    attackCooldown: 1000,
    skillDropChance: 0.6
  }
};
