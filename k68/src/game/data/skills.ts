import { SkillEffect, SkillEffectType, SkillType, ElementType } from '../ecs/Component';

export interface SkillData {
  id: string;
  name: string;
  type: SkillType;
  element: ElementType | null;
  damage: number;
  effects: SkillEffect[];
  color: string;
  icon: string;
  description: string;
  cooldown: number;
  projectileSpeed: number;
}

export const SKILLS: Record<string, SkillData> = {
  fireball: {
    id: 'fireball',
    name: '火球',
    type: SkillType.FIRE,
    element: ElementType.FIRE,
    damage: 25,
    effects: [
      { type: SkillEffectType.BURN, duration: 3000, value: 5 },
      { type: SkillEffectType.ELEMENT_APPLY, element: ElementType.FIRE, duration: 5000 }
    ],
    color: '#ff6b35',
    icon: '🔥',
    description: '发射燃烧的火球，造成范围伤害并点燃敌人',
    cooldown: 800,
    projectileSpeed: 400
  },
  iceArrow: {
    id: 'iceArrow',
    name: '冰箭',
    type: SkillType.ICE,
    element: ElementType.ICE,
    damage: 20,
    effects: [
      { type: SkillEffectType.SLOW, duration: 3000, value: 0.5 },
      { type: SkillEffectType.FREEZE, duration: 1000 },
      { type: SkillEffectType.ELEMENT_APPLY, element: ElementType.ICE, duration: 5000 }
    ],
    color: '#4ecdc4',
    icon: '❄️',
    description: '发射冰冷的箭矢，减速并有几率冰冻敌人',
    cooldown: 700,
    projectileSpeed: 500
  },
  lightning: {
    id: 'lightning',
    name: '雷击',
    type: SkillType.LIGHTNING,
    element: ElementType.LIGHTNING,
    damage: 30,
    effects: [
      { type: SkillEffectType.CHAIN, chains: 3 },
      { type: SkillEffectType.ELEMENT_APPLY, element: ElementType.LIGHTNING, duration: 5000 }
    ],
    color: '#f7dc6f',
    icon: '⚡',
    description: '召唤雷电，可连锁跳跃至附近敌人',
    cooldown: 1200,
    projectileSpeed: 600
  },
  windBlade: {
    id: 'windBlade',
    name: '风刃',
    type: SkillType.WIND,
    element: ElementType.WIND,
    damage: 15,
    effects: [
      { type: SkillEffectType.PIERCE },
      { type: SkillEffectType.ELEMENT_APPLY, element: ElementType.WIND, duration: 5000 }
    ],
    color: '#a8e6cf',
    icon: '🌪️',
    description: '发射锋利的风刃，可穿透多个敌人',
    cooldown: 500,
    projectileSpeed: 550
  },
  waterBolt: {
    id: 'waterBolt',
    name: '水弹',
    type: SkillType.WATER,
    element: ElementType.WATER,
    damage: 18,
    effects: [
      { type: SkillEffectType.WET, duration: 4000 },
      { type: SkillEffectType.ELEMENT_APPLY, element: ElementType.WATER, duration: 6000 }
    ],
    color: '#5dade2',
    icon: '💧',
    description: '发射水弹，使敌人潮湿，可与其他元素触发反应',
    cooldown: 600,
    projectileSpeed: 450
  },
  explosionArrow: {
    id: 'explosionArrow',
    name: '爆炸箭',
    type: SkillType.COMBINED,
    element: null,
    damage: 40,
    effects: [
      { type: SkillEffectType.AOE, radius: 80 },
      { type: SkillEffectType.BURN, duration: 3000, value: 8 },
      { type: SkillEffectType.SLOW, duration: 2000, value: 0.4 }
    ],
    color: '#ffd93d',
    icon: '💥',
    description: '火与冰的结合，造成大范围爆炸并附加燃烧和减速',
    cooldown: 1500,
    projectileSpeed: 450
  },
  plasmaOrb: {
    id: 'plasmaOrb',
    name: '等离子球',
    type: SkillType.COMBINED,
    element: null,
    damage: 55,
    effects: [
      { type: SkillEffectType.AOE, radius: 60 },
      { type: SkillEffectType.PARALYZE, duration: 1500 },
      { type: SkillEffectType.BURN, duration: 2000, value: 10 }
    ],
    color: '#ff6bd6',
    icon: '🔮',
    description: '火与雷的融合，高伤害电火混合攻击并麻痹敌人',
    cooldown: 2000,
    projectileSpeed: 350
  },
  blizzard: {
    id: 'blizzard',
    name: '暴风雪',
    type: SkillType.COMBINED,
    element: null,
    damage: 25,
    effects: [
      { type: SkillEffectType.AOE, radius: 100 },
      { type: SkillEffectType.SLOW, duration: 4000, value: 0.3 },
      { type: SkillEffectType.FREEZE, duration: 2000 }
    ],
    color: '#b8e0ff',
    icon: '❄️',
    description: '冰与风的共鸣，召唤持续暴风雪大范围减速冰冻',
    cooldown: 2500,
    projectileSpeed: 300
  },
  thunderStorm: {
    id: 'thunderStorm',
    name: '雷暴',
    type: SkillType.COMBINED,
    element: null,
    damage: 35,
    effects: [
      { type: SkillEffectType.AOE, radius: 120 },
      { type: SkillEffectType.CHAIN, chains: 5 },
      { type: SkillEffectType.PARALYZE, duration: 1000 }
    ],
    color: '#9b59b6',
    icon: '⛈️',
    description: '雷与风的怒吼，召唤雷电风暴打击多个目标',
    cooldown: 3000,
    projectileSpeed: 400
  },
  tidalWave: {
    id: 'tidalWave',
    name: '潮汐波',
    type: SkillType.COMBINED,
    element: null,
    damage: 30,
    effects: [
      { type: SkillEffectType.AOE, radius: 70 },
      { type: SkillEffectType.SLOW, duration: 3000, value: 0.5 },
      { type: SkillEffectType.WET, duration: 5000 },
      { type: SkillEffectType.ELEMENT_APPLY, element: ElementType.WATER, duration: 6000 }
    ],
    color: '#3498db',
    icon: '🌊',
    description: '水与风的结合，掀起潮汐波造成范围伤害并潮湿敌人',
    cooldown: 1800,
    projectileSpeed: 380
  }
};

export const BASIC_SKILLS = ['fireball', 'iceArrow', 'lightning', 'windBlade', 'waterBolt'];
export const COMBINED_SKILLS = ['explosionArrow', 'plasmaOrb', 'blizzard', 'thunderStorm', 'tidalWave'];
