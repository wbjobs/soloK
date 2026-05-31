import { System } from '../ecs/System';
import { World } from '../ecs/World';
import { Position, DamageText } from '../ecs/Component';

export class DamageTextSystem extends System {
  constructor(world: World) {
    super(world);
    this.requiredComponents = [Position, DamageText];
  }

  update(deltaTime: number): void {
    const entities = this.getEntities();

    for (const entity of entities) {
      const position = entity.getComponent(Position);
      const damageText = entity.getComponent(DamageText);

      if (!position || !damageText) continue;

      damageText.lifetime -= deltaTime;
      damageText.offsetY -= (deltaTime / 1000) * 50;
      damageText.scale = 0.8 + (damageText.lifetime / damageText.maxLifetime) * 0.4;

      if (damageText.lifetime <= 0) {
        this.world.removeEntity(entity.id);
      }
    }
  }
}
