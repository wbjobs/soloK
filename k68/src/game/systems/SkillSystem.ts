import { System } from '../ecs/System';
import { World } from '../ecs/World';
import { Position, Velocity, SkillComponent, Projectile, Collider, Renderable, Player } from '../ecs/Component';
import type { InputSystem } from './InputSystem';
import { SKILLS } from '../data/skills';
import { findRecipe } from '../data/recipes';
import { unlockSkill, discoverRecipe } from '../utils/storage';
import { normalize } from '../utils/collision';

export interface SkillSlot {
  skillId: string | null;
  cooldown: number;
}

export class SkillSystem extends System {
  private inputSystem: InputSystem;
  private equippedSkills: SkillSlot[] = [
    { skillId: null, cooldown: 0 },
    { skillId: null, cooldown: 0 },
    { skillId: null, cooldown: 0 },
    { skillId: null, cooldown: 0 }
  ];
  private cameraOffset: { x: number; y: number } = { x: 0, y: 0 };
  private onSkillDropped: ((skillId: string, x: number, y: number) => void) | null = null;
  private onSkillUnlocked: ((skillId: string, isNew: boolean) => void) | null = null;
  private onRecipeDiscovered: ((recipeId: string, resultSkillId: string) => void) | null = null;

  constructor(world: World, inputSystem: InputSystem) {
    super(world);
    this.requiredComponents = [];
    this.inputSystem = inputSystem;
  }

  setCameraOffset(offset: { x: number; y: number }): void {
    this.cameraOffset = offset;
  }

  setOnSkillDropped(callback: (skillId: string, x: number, y: number) => void): void {
    this.onSkillDropped = callback;
  }

  setOnSkillUnlocked(callback: (skillId: string, isNew: boolean) => void): void {
    this.onSkillUnlocked = callback;
  }

  setOnRecipeDiscovered(callback: (recipeId: string, resultSkillId: string) => void): void {
    this.onRecipeDiscovered = callback;
  }

  equipSkill(slotIndex: number, skillId: string): void {
    if (slotIndex >= 0 && slotIndex < this.equippedSkills.length) {
      this.equippedSkills[slotIndex].skillId = skillId;
      this.equippedSkills[slotIndex].cooldown = 0;
    }
  }

  getEquippedSkills(): SkillSlot[] {
    return [...this.equippedSkills];
  }

  combineSkills(skill1: string, skill2: string): { success: boolean; result?: string; isNew?: boolean } {
    const recipe = findRecipe(skill1, skill2);
    if (!recipe) {
      return { success: false };
    }

    const isNewRecipe = discoverRecipe(recipe.id);
    const isNewSkill = unlockSkill(recipe.result);

    if (this.onRecipeDiscovered && isNewRecipe) {
      this.onRecipeDiscovered(recipe.id, recipe.result);
    }

    if (this.onSkillUnlocked) {
      this.onSkillUnlocked(recipe.result, isNewSkill);
    }

    return { success: true, result: recipe.result, isNew: isNewSkill };
  }

  addSkillDrop(x: number, y: number): string {
    const basicSkills = ['fireball', 'iceArrow', 'lightning', 'windBlade'];
    const skillId = basicSkills[Math.floor(Math.random() * basicSkills.length)];
    
    const isNew = unlockSkill(skillId);
    if (this.onSkillDropped) {
      this.onSkillDropped(skillId, x, y);
    }
    if (this.onSkillUnlocked) {
      this.onSkillUnlocked(skillId, isNew);
    }
    
    return skillId;
  }

  update(deltaTime: number): void {
    for (const slot of this.equippedSkills) {
      if (slot.cooldown > 0) {
        slot.cooldown = Math.max(0, slot.cooldown - deltaTime);
      }
    }

    const players = this.world.getEntitiesWithComponents(Position, Player);
    if (players.length === 0) return;
    const player = players[0];
    const playerPos = player.getComponent(Position);
    if (!playerPos) return;

    if (this.inputSystem.consumeMouseClick()) {
      const mousePos = this.inputSystem.getMousePosition();
      const worldMouseX = mousePos.x + this.cameraOffset.x;
      const worldMouseY = mousePos.y + this.cameraOffset.y;

      this.fireSkill(playerPos, worldMouseX, worldMouseY);
    }

    for (let i = 0; i < 4; i++) {
      const key = (i + 1).toString();
      if (this.inputSystem.isKeyPressed(key)) {
        const mousePos = this.inputSystem.getMousePosition();
        const worldMouseX = mousePos.x + this.cameraOffset.x;
        const worldMouseY = mousePos.y + this.cameraOffset.y;
        this.fireSkill(playerPos, worldMouseX, worldMouseY, i);
      }
    }
  }

  private fireSkill(
    playerPos: Position,
    targetX: number,
    targetY: number,
    slotIndex: number = 0
  ): void {
    const slot = this.equippedSkills[slotIndex];
    if (!slot.skillId || slot.cooldown > 0) return;

    const skillData = SKILLS[slot.skillId];
    if (!skillData) return;

    const dx = targetX - playerPos.x;
    const dy = targetY - playerPos.y;
    const dir = normalize(dx, dy);

    const projectile = this.world.createEntity();
    projectile
      .addComponent(new Position(playerPos.x, playerPos.y))
      .addComponent(new Velocity(dir.x * skillData.projectileSpeed, dir.y * skillData.projectileSpeed, skillData.projectileSpeed))
      .addComponent(new Projectile(skillData.id, skillData.damage, 3000, dir.x * skillData.projectileSpeed, dir.y * skillData.projectileSpeed, [...skillData.effects]))
      .addComponent(new Collider(10, false))
      .addComponent(new Renderable('projectile', skillData.color, 12));

    slot.cooldown = skillData.cooldown;
  }
}
