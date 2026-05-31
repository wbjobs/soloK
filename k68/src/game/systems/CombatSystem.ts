import { System } from '../ecs/System';
import { World } from '../ecs/World';
import { Position, Health, Projectile, Collider, Enemy, DamageText, SkillEffectType, ElementType } from '../ecs/Component';
import { ENEMIES } from '../data/enemies';
import { SKILLS } from '../data/skills';
import { findElementalReaction } from '../data/elementalReactions';
import { checkCircleCollision, getDistance } from '../utils/collision';

export class CombatSystem extends System {
  private onEnemyKilled: ((x: number, y: number) => void) | null = null;

  constructor(world: World) {
    super(world);
    this.requiredComponents = [Position, Projectile];
  }

  setOnEnemyKilled(callback: (x: number, y: number) => void): void {
    this.onEnemyKilled = callback;
  }

  update(deltaTime: number): void {
    const projectiles = this.getEntities();
    const enemies = this.world.getEntitiesWithComponents(Position, Health, Enemy, Collider);

    for (const projectile of projectiles) {
      const projPos = projectile.getComponent(Position);
      const proj = projectile.getComponent(Projectile);
      const projCollider = projectile.getComponent(Collider);

      if (!projPos || !proj) continue;

      proj.lifetime -= deltaTime;
      if (proj.lifetime <= 0) {
        this.world.removeEntity(projectile.id);
        continue;
      }

      for (const enemy of enemies) {
        if (proj.hitEntities.has(enemy.id)) continue;

        const enemyPos = enemy.getComponent(Position);
        const enemyHealth = enemy.getComponent(Health);
        const enemyCollider = enemy.getComponent(Collider);
        const enemyComp = enemy.getComponent(Enemy);

        if (!enemyPos || !enemyHealth || !enemyCollider || !enemyComp) continue;

        const collides = checkCircleCollision(
          { x: projPos.x, y: projPos.y, radius: projCollider?.radius || 8 },
          { x: enemyPos.x, y: enemyPos.y, radius: enemyCollider.radius }
        );

        if (collides) {
          this.applyDamage(enemy, enemyHealth, proj, enemyPos);
          proj.hitEntities.add(enemy.id);

          const hasPierce = proj.effects.some(e => e.type === SkillEffectType.PIERCE);
          if (!hasPierce) {
            this.world.removeEntity(projectile.id);
            break;
          } else {
            proj.pierceCount++;
            if (proj.pierceCount >= 3) {
              this.world.removeEntity(projectile.id);
              break;
            }
          }
        }
      }
    }

    this.checkEnemyDeaths(enemies);
  }

  private applyDamage(
    enemy: { id: number },
    enemyHealth: Health,
    proj: Projectile,
    enemyPos: Position
  ): void {
    const skillData = SKILLS[proj.skillId];
    const enemyComp = this.world.getEntity(enemy.id)?.getComponent(Enemy);
    
    let finalDamage = proj.damage;
    let reactionTriggered = false;
    let reactionName = '';
    let reactionColor = '#ffffff';

    if (enemyComp && skillData?.element) {
      const existingElements = enemyComp.elementalStatus.getElements();
      
      for (const existingElem of existingElements) {
        const reaction = findElementalReaction(existingElem, skillData.element);
        if (reaction) {
          finalDamage = Math.floor(finalDamage * reaction.damageMultiplier);
          reactionTriggered = true;
          reactionName = reaction.name;
          reactionColor = reaction.color;

          if (reaction.aoeRadius) {
            this.applyAOEDamage(enemyPos, finalDamage * 0.3, reaction.aoeRadius, enemy.id);
          }

          if (reaction.additionalEffects) {
            for (const addEffect of reaction.additionalEffects) {
              switch (addEffect.type) {
                case 'freeze':
                  enemyComp.slowTimer = addEffect.duration || 2000;
                  break;
                case 'paralyze':
                  enemyComp.slowTimer = addEffect.duration || 1500;
                  break;
              }
            }
          }

          enemyComp.elementalStatus.clear();
          break;
        }
      }

      if (!reactionTriggered) {
        for (const effect of proj.effects) {
          if (effect.type === SkillEffectType.ELEMENT_APPLY && effect.element) {
            enemyComp.elementalStatus.addElement(effect.element, effect.duration || 5000);
          }
        }
      }
    }

    const isCrit = Math.random() < 0.15;
    const damage = isCrit ? Math.floor(finalDamage * 1.5) : finalDamage;

    enemyHealth.current = Math.max(0, enemyHealth.current - damage);

    let color = isCrit ? '#ffd93d' : '#ff4757';
    let text = isCrit ? `${damage}!` : damage.toString();
    let scale = isCrit ? 1.5 : 1;

    if (reactionTriggered) {
      color = reactionColor;
      text = `${damage} ${reactionName}!`;
      scale = 1.8;
    }

    this.spawnDamageText(enemyPos.x, enemyPos.y - 30, text, color, scale);

    if (enemyComp) {
      for (const effect of proj.effects) {
        switch (effect.type) {
          case SkillEffectType.BURN:
            enemyComp.burnTimer = effect.duration || 3000;
            break;
          case SkillEffectType.SLOW:
            enemyComp.slowTimer = effect.duration || 3000;
            break;
          case SkillEffectType.FREEZE:
            if (Math.random() < 0.3) {
              enemyComp.slowTimer = effect.duration || 1000;
            }
            break;
          case SkillEffectType.AOE:
            this.applyAOEDamage(enemyPos, proj.damage * 0.5, effect.radius || 50, enemy.id);
            break;
          case SkillEffectType.CHAIN:
            this.applyChainDamage(enemyPos, proj.damage * 0.6, effect.chains || 2, enemy.id);
            break;
        }
      }
    }
  }

  private applyAOEDamage(centerPos: Position, damage: number, radius: number, excludeId: number): void {
    const enemies = this.world.getEntitiesWithComponents(Position, Health, Enemy);

    for (const enemy of enemies) {
      if (enemy.id === excludeId) continue;

      const pos = enemy.getComponent(Position);
      const health = enemy.getComponent(Health);
      const enemyComp = enemy.getComponent(Enemy);

      if (!pos || !health || !enemyComp) continue;

      if (health.current <= 0) continue;

      const dist = getDistance(centerPos.x, centerPos.y, pos.x, pos.y);
      if (dist < radius) {
        health.current = Math.max(0, health.current - damage);
        this.spawnDamageText(pos.x, pos.y - 30, Math.floor(damage).toString(), '#ff6b35', 0.9);
      }
    }
  }

  private applyChainDamage(startPos: Position, damage: number, chains: number, excludeId: number): void {
    let lastPos = startPos;
    let remainingChains = chains;
    const hitIds = new Set<number>([excludeId]);

    while (remainingChains > 0) {
      const enemies = this.world.getEntitiesWithComponents(Position, Health, Enemy);
      let nearestEnemy: typeof enemies[0] | null = null;
      let nearestDist = Infinity;

      for (const enemy of enemies) {
        if (hitIds.has(enemy.id)) continue;

        const pos = enemy.getComponent(Position);
        const health = enemy.getComponent(Health);
        if (!pos || !health || health.current <= 0) continue;

        const dist = getDistance(lastPos.x, lastPos.y, pos.x, pos.y);
        if (dist < nearestDist && dist < 150) {
          nearestDist = dist;
          nearestEnemy = enemy;
        }
      }

      if (nearestEnemy) {
        const pos = nearestEnemy.getComponent(Position);
        const health = nearestEnemy.getComponent(Health);

        if (pos && health) {
          health.current = Math.max(0, health.current - damage);
          this.spawnDamageText(pos.x, pos.y - 30, Math.floor(damage).toString(), '#f7dc6f', 1.1);
          hitIds.add(nearestEnemy.id);
          lastPos = pos;
        }
      }

      remainingChains--;
    }
  }

  private checkEnemyDeaths(enemies: { id: number; getComponent: <T>(type: { new (...args: never[]): T }) => T | undefined }[]): void {
    for (const enemy of enemies) {
      const health = enemy.getComponent(Health);
      const pos = enemy.getComponent(Position);
      const enemyComp = enemy.getComponent(Enemy);

      if (health && health.current <= 0 && enemyComp) {
        enemyComp.burnTimer = 0;
        enemyComp.slowTimer = 0;

        if (pos && Math.random() < ENEMIES[enemyComp.type].skillDropChance) {
          if (this.onEnemyKilled) {
            this.onEnemyKilled(pos.x, pos.y);
          }
        }

        this.spawnDamageText(pos?.x || 0, (pos?.y || 0) - 50, '击败!', '#2ecc71', 1.3);
        this.world.removeEntity(enemy.id);
      }
    }
  }

  private spawnDamageText(x: number, y: number, text: string, color: string, scale: number = 1): void {
    const damageText = this.world.createEntity();
    damageText
      .addComponent(new Position(x + (Math.random() - 0.5) * 20, y))
      .addComponent(new DamageText(text, color, 1000, 1000, 0, scale));
  }
}
