import { Entity } from './Entity';
import type { System } from './System';

export class World {
  private entities: Map<number, Entity> = new Map();
  private systems: System[] = [];
  private entityIdCounter = 0;

  createEntity(): Entity {
    const entity = new Entity();
    this.entities.set(entity.id, entity);
    return entity;
  }

  getEntity(id: number): Entity | undefined {
    return this.entities.get(id);
  }

  removeEntity(id: number): void {
    const entity = this.entities.get(id);
    if (entity) {
      entity.destroy();
      this.entities.delete(id);
    }
  }

  getEntitiesWithComponents(...componentTypes: { new (...args: never[]): unknown }[]): Entity[] {
    const result: Entity[] = [];
    for (const entity of this.entities.values()) {
      if (entity.hasComponents(...componentTypes)) {
        result.push(entity);
      }
    }
    return result;
  }

  getAllEntities(): Entity[] {
    return Array.from(this.entities.values());
  }

  addSystem(system: System): void {
    this.systems.push(system);
  }

  update(deltaTime: number): void {
    for (const system of this.systems) {
      system.update(deltaTime);
    }
  }

  clear(): void {
    for (const entity of this.entities.values()) {
      entity.destroy();
    }
    this.entities.clear();
    this.systems = [];
    this.entityIdCounter = 0;
  }

  getEntityCount(): number {
    return this.entities.size;
  }
}
