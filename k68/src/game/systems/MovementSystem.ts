import { System } from '../ecs/System';
import { World } from '../ecs/World';
import { Position, Velocity, Collider, Enemy } from '../ecs/Component';
import type { DungeonGenerator } from '../map/DungeonGenerator';
import { TILE_SIZE, MAP_WIDTH, MAP_HEIGHT } from '../map/DungeonGenerator';
import { checkCircleCollision } from '../utils/collision';

export class MovementSystem extends System {
  private dungeon: DungeonGenerator;

  constructor(world: World, dungeon: DungeonGenerator) {
    super(world);
    this.requiredComponents = [Position, Velocity];
    this.dungeon = dungeon;
  }

  update(deltaTime: number): void {
    const entities = this.getEntities();
    const dt = deltaTime / 1000;

    for (const entity of entities) {
      const position = entity.getComponent(Position);
      const velocity = entity.getComponent(Velocity);
      const collider = entity.getComponent(Collider);
      const enemy = entity.getComponent(Enemy);

      if (!position || !velocity) continue;

      let speedMultiplier = 1;
      if (enemy && enemy.slowTimer > 0) {
        speedMultiplier = 0.5;
      }
      if (enemy && enemy.burnTimer > 0) {
        enemy.burnTimer -= deltaTime;
      }
      if (enemy && enemy.slowTimer > 0) {
        enemy.slowTimer -= deltaTime;
      }

      const newX = position.x + velocity.vx * dt * speedMultiplier;
      const newY = position.y + velocity.vy * dt * speedMultiplier;

      if (collider) {
        if (this.canMoveTo(newX, position.y, collider.radius)) {
          position.x = newX;
        }
        if (this.canMoveTo(position.x, newY, collider.radius)) {
          position.y = newY;
        }
      } else {
        position.x = newX;
        position.y = newY;
      }

      position.x = Math.max(collider?.radius || 0, Math.min(MAP_WIDTH * TILE_SIZE - (collider?.radius || 0), position.x));
      position.y = Math.max(collider?.radius || 0, Math.min(MAP_HEIGHT * TILE_SIZE - (collider?.radius || 0), position.y));

      this.resolveCollisions(entity, position, collider);
    }
  }

  private canMoveTo(x: number, y: number, radius: number): boolean {
    const corners = [
      { x: x - radius, y: y - radius },
      { x: x + radius, y: y - radius },
      { x: x - radius, y: y + radius },
      { x: x + radius, y: y + radius }
    ];

    for (const corner of corners) {
      if (!this.dungeon.isWalkable(corner.x, corner.y)) {
        return false;
      }
    }
    return true;
  }

  private resolveCollisions(
    currentEntity: { id: number },
    position: Position,
    collider: Collider | undefined
  ): void {
    if (!collider) return;

    const allEntities = this.world.getAllEntities();

    for (const other of allEntities) {
      if (other.id === currentEntity.id) continue;

      const otherPos = other.getComponent(Position);
      const otherCollider = other.getComponent(Collider);
      const otherEnemy = other.getComponent(Enemy);
      const currentEnemy = this.world.getEntity(currentEntity.id)?.getComponent(Enemy);

      if (!otherPos || !otherCollider || !otherCollider.isSolid) continue;

      if (currentEnemy && otherEnemy) continue;

      if (checkCircleCollision(
        { x: position.x, y: position.y, radius: collider.radius },
        { x: otherPos.x, y: otherPos.y, radius: otherCollider.radius }
      )) {
        const dx = position.x - otherPos.x;
        const dy = position.y - otherPos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const overlap = collider.radius + otherCollider.radius - dist;

        if (dist > 0) {
          position.x += (dx / dist) * overlap;
          position.y += (dy / dist) * overlap;
        }
      }
    }
  }
}
