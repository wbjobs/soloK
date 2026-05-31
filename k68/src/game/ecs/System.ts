import type { Entity } from './Entity';
import type { World } from './World';

export abstract class System {
  protected world: World;
  protected requiredComponents: { new (...args: never[]): unknown }[] = [];

  constructor(world: World) {
    this.world = world;
  }

  abstract update(deltaTime: number): void;

  protected getEntities(): Entity[] {
    return this.world.getEntitiesWithComponents(...this.requiredComponents);
  }
}
