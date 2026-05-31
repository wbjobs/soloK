export class Position {
  constructor(
    public x: number,
    public y: number
  ) {}
}

export class Velocity {
  constructor(
    public vx: number = 0,
    public vy: number = 0,
    public speed: number = 200
  ) {}
}

export class Health {
  constructor(
    public current: number,
    public max: number
  ) {}
}

export class InputControlled {
  public keys: Set<string> = new Set();
  constructor() {}
}

export enum EnemyType {
  SLIME = 'slime',
  SKELETON = 'skeleton',
  GHOST = 'ghost'
}

export enum AIState {
  PATROL = 'patrol',
  CHASE = 'chase',
  ATTACK = 'attack'
}

export class Enemy {
  constructor(
    public type: EnemyType,
    public aiState: AIState = AIState.PATROL,
    public attackCooldown: number = 0,
    public slowTimer: number = 0,
    public burnTimer: number = 0,
    public elementalStatus: ElementalStatus = new ElementalStatus(),
    public targetPlayerIndex: number = 0
  ) {}
}

export class Player {
  constructor(
    public playerIndex: number = 0,
    public isGhost: boolean = false,
    public isSpectating: boolean = false
  ) {}
}

export class Spectator {
  constructor(
    public targetPlayerId: number | null = null
  ) {}
}

export class Renderable {
  constructor(
    public sprite: string,
    public color: string,
    public size: number = 32
  ) {}
}

export enum SkillType {
  FIRE = 'fire',
  ICE = 'ice',
  LIGHTNING = 'lightning',
  WIND = 'wind',
  WATER = 'water',
  COMBINED = 'combined'
}

export enum ElementType {
  FIRE = 'fire',
  ICE = 'ice',
  LIGHTNING = 'lightning',
  WIND = 'wind',
  WATER = 'water'
}

export enum ElementalReactionType {
  VAPORIZE = 'vaporize',
  OVERLOAD = 'overload',
  FREEZE = 'freeze_reaction',
  ELECTROCHARGE = 'electrocharge',
  MELT = 'melt',
  SWIRL = 'swirl'
}

export enum SkillEffectType {
  BURN = 'burn',
  SLOW = 'slow',
  FREEZE = 'freeze',
  CHAIN = 'chain',
  PIERCE = 'pierce',
  AOE = 'aoe',
  PARALYZE = 'paralyze',
  WET = 'wet',
  ELEMENT_APPLY = 'element_apply'
}

export interface SkillEffect {
  type: SkillEffectType;
  duration?: number;
  value?: number;
  radius?: number;
  chains?: number;
  element?: ElementType;
}

export interface AppliedElement {
  element: ElementType;
  duration: number;
  maxDuration: number;
}

export class ElementalStatus {
  public appliedElements: AppliedElement[] = [];

  addElement(element: ElementType, duration: number): void {
    const existing = this.appliedElements.find(e => e.element === element);
    if (existing) {
      existing.duration = Math.max(existing.duration, duration);
      existing.maxDuration = Math.max(existing.maxDuration, duration);
    } else {
      this.appliedElements.push({
        element,
        duration,
        maxDuration: duration
      });
    }
  }

  removeElement(element: ElementType): void {
    this.appliedElements = this.appliedElements.filter(e => e.element !== element);
  }

  hasElement(element: ElementType): boolean {
    return this.appliedElements.some(e => e.element === element && e.duration > 0);
  }

  getElements(): ElementType[] {
    return this.appliedElements.filter(e => e.duration > 0).map(e => e.element);
  }

  update(deltaTime: number): void {
    for (const elem of this.appliedElements) {
      elem.duration -= deltaTime;
    }
    this.appliedElements = this.appliedElements.filter(e => e.duration > 0);
  }

  clear(): void {
    this.appliedElements = [];
  }
}

export class SkillComponent {
  constructor(
    public skillId: string,
    public damage: number,
    public cooldown: number = 0,
    public maxCooldown: number = 1000
  ) {}
}

export class Projectile {
  constructor(
    public skillId: string,
    public damage: number,
    public lifetime: number = 3000,
    public vx: number = 0,
    public vy: number = 0,
    public effects: SkillEffect[] = [],
    public hitEntities: Set<number> = new Set(),
    public pierceCount: number = 0
  ) {}
}

export class DamageText {
  constructor(
    public text: string,
    public color: string = '#ff4757',
    public lifetime: number = 1000,
    public maxLifetime: number = 1000,
    public offsetY: number = 0,
    public scale: number = 1
  ) {}
}

export class Collider {
  constructor(
    public radius: number = 16,
    public isSolid: boolean = true
  ) {}
}
