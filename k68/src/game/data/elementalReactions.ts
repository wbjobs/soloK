import { ElementType, ElementalReactionType } from '../ecs/Component';

export interface ElementalReaction {
  id: ElementalReactionType;
  name: string;
  elements: [ElementType, ElementType];
  damageMultiplier: number;
  effect: string;
  color: string;
  aoeRadius?: number;
  additionalEffects?: {
    type: string;
    duration?: number;
    value?: number;
  }[];
}

export const ELEMENTAL_REACTIONS: ElementalReaction[] = [
  {
    id: ElementalReactionType.VAPORIZE,
    name: '蒸发',
    elements: [ElementType.FIRE, ElementType.WATER],
    damageMultiplier: 2.0,
    effect: '火与水相遇，产生猛烈蒸发，造成双倍伤害',
    color: '#ff9500'
  },
  {
    id: ElementalReactionType.OVERLOAD,
    name: '超载',
    elements: [ElementType.FIRE, ElementType.LIGHTNING],
    damageMultiplier: 1.5,
    effect: '火与雷碰撞，引发爆炸，造成范围伤害',
    color: '#ff6b35',
    aoeRadius: 60
  },
  {
    id: ElementalReactionType.FREEZE,
    name: '冻结',
    elements: [ElementType.ICE, ElementType.WATER],
    damageMultiplier: 1.2,
    effect: '冰与水结合，冻结敌人',
    color: '#4ecdc4',
    additionalEffects: [
      { type: 'freeze', duration: 2000 }
    ]
  },
  {
    id: ElementalReactionType.ELECTROCHARGE,
    name: '感电',
    elements: [ElementType.LIGHTNING, ElementType.WATER],
    damageMultiplier: 1.3,
    effect: '雷与水交汇，持续麻痹敌人',
    color: '#9b59b6',
    additionalEffects: [
      { type: 'paralyze', duration: 1500 }
    ]
  },
  {
    id: ElementalReactionType.MELT,
    name: '融化',
    elements: [ElementType.FIRE, ElementType.ICE],
    damageMultiplier: 1.8,
    effect: '火融化冰，造成高额伤害',
    color: '#ffb347'
  },
  {
    id: ElementalReactionType.SWIRL,
    name: '扩散',
    elements: [ElementType.WIND, ElementType.FIRE],
    damageMultiplier: 1.2,
    effect: '风扩散火焰，对周围敌人造成伤害',
    color: '#a8e6cf',
    aoeRadius: 80
  }
];

export function findElementalReaction(
  element1: ElementType,
  element2: ElementType
): ElementalReaction | undefined {
  return ELEMENTAL_REACTIONS.find(
    reaction =>
      (reaction.elements[0] === element1 && reaction.elements[1] === element2) ||
      (reaction.elements[0] === element2 && reaction.elements[1] === element1)
  );
}

export function getSkillElement(skillType: string): ElementType | null {
  switch (skillType) {
    case 'fire':
      return ElementType.FIRE;
    case 'ice':
      return ElementType.ICE;
    case 'lightning':
      return ElementType.LIGHTNING;
    case 'wind':
      return ElementType.WIND;
    case 'water':
      return ElementType.WATER;
    default:
      return null;
  }
}
