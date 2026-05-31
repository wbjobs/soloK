import { System } from '../ecs/System';
import { World } from '../ecs/World';
import { Position, Velocity, Enemy, Health, Player, AIState, Collider, DamageText } from '../ecs/Component';
import { ENEMIES } from '../data/enemies';
import { getDistance, normalize } from '../utils/collision';

export class AISystem extends System {
  constructor(world: World) {
    super(world);
    this.requiredComponents = [Position, Velocity, Enemy];
  }

  update(deltaTime: number): void {
    const enemies = this.getEntities();
    const players = this.world.getEntitiesWithComponents(Position, Player);

    if (players.length === 0) return;
    const player = players[0];
    const playerPos = player.getComponent(Position);
    const playerHealth = player.getComponent(Health);

    if (!playerPos || !playerHealth) return;

    for (const entity of enemies) {
      const position = entity.getComponent(Position);
      const velocity = entity.getComponent(Velocity);
      const enemy = entity.getComponent(Enemy);
      const health = entity.getComponent(Health);
      const collider = entity.getComponent(Collider);

      if (!position || !velocity || !enemy || !health) continue;

      const enemyData = ENEMIES[enemy.type];
      const distance = getDistance(position.x, position.y, playerPos.x, playerPos.y);

      if (enemy.attackCooldown > 0) {
        enemy.attackCooldown -= deltaTime;
      }

      if (distance < enemyData.attackRange) {
        enemy.aiState = AIState.ATTACK;
      } else if (distance < 300) {
        enemy.aiState = AIState.CHASE;
      } else {
        enemy.aiState = AIState.PATROL;
      }

      switch (enemy.aiState) {
        case AIState.CHASE:
          this.chasePlayer(position, velocity, playerPos, enemyData.speed);
          break;
        case AIState.ATTACK:
          velocity.vx = 0;
          velocity.vy = 0;
          if (enemy.attackCooldown <= 0) {
            this.attackPlayer(playerHealth, enemyData.damage, playerPos);
            enemy.attackCooldown = enemyData.attackCooldown;
          }
          break;
        case AIState.PATROL:
          this.patrol(position, velocity, enemy, enemyData.speed);
          break;
      }
    }
  }

  private chasePlayer(
    position: Position,
    velocity: Velocity,
    playerPos: Position,
    speed: number
  ): void {
    const dx = playerPos.x - position.x;
    const dy = playerPos.y - position.y;
    const normalized = normalize(dx, dy);
    velocity.vx = normalized.x * speed;
    velocity.vy = normalized.y * speed;
  }

  private attackPlayer(playerHealth: Health, damage: number, playerPos: Position): void {
    playerHealth.current = Math.max(0, playerHealth.current - damage);

    this.spawnDamageText(playerPos.x, playerPos.y - 30, damage.toString(), '#ff4757');
  }

  private patrol(
    position: Position,
    velocity: Velocity,
    enemy: Enemy,
    speed: number
  ): void {
    if (Math.random() < 0.01) {
      const angle = Math.random() * Math.PI * 2;
      velocity.vx = Math.cos(angle) * speed * 0.3;
      velocity.vy = Math.sin(angle) * speed * 0.3;
    }
  }

  private spawnDamageText(x: number, y: number, text: string, color: string): void {
    const damageText = this.world.createEntity();
    damageText
      .addComponent(new Position(x, y))
      .addComponent(new DamageText(text, color, 1000, 1000, 0, 1.2));
  }
}
