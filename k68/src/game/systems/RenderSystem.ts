import { System } from '../ecs/System';
import { World } from '../ecs/World';
import { Position, Renderable, Health, Enemy, DamageText, Player, ElementType } from '../ecs/Component';
import type { DungeonGenerator } from '../map/DungeonGenerator';
import { TILE_SIZE, MAP_WIDTH, MAP_HEIGHT, TileType } from '../map/DungeonGenerator';
import { ENEMIES } from '../data/enemies';

export class RenderSystem extends System {
  private ctx: CanvasRenderingContext2D;
  private dungeon: DungeonGenerator;
  private camera: { x: number; y: number } = { x: 0, y: 0 };
  private canvasWidth: number = 1280;
  private canvasHeight: number = 720;

  constructor(
    world: World,
    ctx: CanvasRenderingContext2D,
    dungeon: DungeonGenerator,
    width: number,
    height: number
  ) {
    super(world);
    this.requiredComponents = [Position, Renderable];
    this.ctx = ctx;
    this.dungeon = dungeon;
    this.canvasWidth = width;
    this.canvasHeight = height;
  }

  getCameraOffset(): { x: number; y: number } {
    return { ...this.camera };
  }

  setCanvasSize(width: number, height: number): void {
    this.canvasWidth = width;
    this.canvasHeight = height;
  }

  update(deltaTime: number): void {
    this.updateCamera();
    this.render();
  }

  private updateCamera(): void {
    const players = this.world.getEntitiesWithComponents(Position, Player);
    if (players.length > 0) {
      const playerPos = players[0].getComponent(Position);
      if (playerPos) {
        this.camera.x = playerPos.x - this.canvasWidth / 2;
        this.camera.y = playerPos.y - this.canvasHeight / 2;

        this.camera.x = Math.max(0, Math.min(MAP_WIDTH * TILE_SIZE - this.canvasWidth, this.camera.x));
        this.camera.y = Math.max(0, Math.min(MAP_HEIGHT * TILE_SIZE - this.canvasHeight, this.camera.y));
      }
    }
  }

  private render(): void {
    const ctx = this.ctx;

    ctx.fillStyle = '#0a0415';
    ctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight);

    ctx.save();
    ctx.translate(-this.camera.x, -this.camera.y);

    this.renderDungeon();
    this.renderEntities();
    this.renderDamageTexts();

    ctx.restore();
  }

  private renderDungeon(): void {
    const ctx = this.ctx;
    const startTileX = Math.max(0, Math.floor(this.camera.x / TILE_SIZE) - 1);
    const startTileY = Math.max(0, Math.floor(this.camera.y / TILE_SIZE) - 1);
    const endTileX = Math.min(MAP_WIDTH, Math.ceil((this.camera.x + this.canvasWidth) / TILE_SIZE) + 1);
    const endTileY = Math.min(MAP_HEIGHT, Math.ceil((this.camera.y + this.canvasHeight) / TILE_SIZE) + 1);

    for (let y = startTileY; y < endTileY; y++) {
      for (let x = startTileX; x < endTileX; x++) {
        const tile = this.dungeon.getTileAt(x * TILE_SIZE, y * TILE_SIZE);
        const px = x * TILE_SIZE;
        const py = y * TILE_SIZE;

        switch (tile) {
          case TileType.WALL:
            ctx.fillStyle = '#1a0a2e';
            ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
            ctx.fillStyle = '#2d1b4e';
            ctx.fillRect(px + 2, py + 2, TILE_SIZE - 4, TILE_SIZE - 4);
            break;
          case TileType.ROOM_FLOOR:
            ctx.fillStyle = '#2d1b4e';
            ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
            ctx.fillStyle = '#3d2b5e';
            ctx.fillRect(px + 1, py + 1, TILE_SIZE - 2, TILE_SIZE - 2);
            break;
          case TileType.CORRIDOR:
            ctx.fillStyle = '#251540';
            ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
            break;
        }
      }
    }
  }

  private renderEntities(): void {
    const entities = this.getEntities();

    for (const entity of entities) {
      const position = entity.getComponent(Position);
      const renderable = entity.getComponent(Renderable);
      const health = entity.getComponent(Health);
      const enemy = entity.getComponent(Enemy);
      const player = entity.getComponent(Player);

      if (!position || !renderable) continue;

      if (enemy) {
        this.renderEnemy(position, renderable, enemy, health);
      } else if (player) {
        this.renderPlayer(position, renderable, health);
      } else {
        this.renderProjectile(position, renderable);
      }
    }
  }

  private renderPlayer(
    position: Position,
    renderable: Renderable,
    health: Health | undefined
  ): void {
    const ctx = this.ctx;
    const size = renderable.size;

    const gradient = ctx.createRadialGradient(position.x, position.y, 0, position.x, position.y, size * 2);
    gradient.addColorStop(0, 'rgba(100, 200, 255, 0.3)');
    gradient.addColorStop(1, 'rgba(100, 200, 255, 0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(position.x, position.y, size * 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = renderable.color;
    ctx.beginPath();
    ctx.arc(position.x, position.y, size / 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#4ecdc4';
    ctx.lineWidth = 3;
    ctx.stroke();

    if (health) {
      this.renderHealthBar(position.x, position.y - size / 2 - 15, health, size + 10);
    }
  }

  private renderEnemy(
    position: Position,
    renderable: Renderable,
    enemy: Enemy,
    health: Health | undefined
  ): void {
    const ctx = this.ctx;
    const size = renderable.size;
    const enemyData = ENEMIES[enemy.type];

    if (enemy.burnTimer > 0) {
      ctx.fillStyle = 'rgba(255, 107, 53, 0.3)';
      ctx.beginPath();
      ctx.arc(position.x, position.y, size / 2 + 5, 0, Math.PI * 2);
      ctx.fill();
    }

    if (enemy.slowTimer > 0) {
      ctx.fillStyle = 'rgba(78, 205, 196, 0.3)';
      ctx.beginPath();
      ctx.arc(position.x, position.y, size / 2 + 5, 0, Math.PI * 2);
      ctx.fill();
    }

    const elements = enemy.elementalStatus.getElements();
    if (elements.length > 0) {
      const elementColors: Record<ElementType, string> = {
        [ElementType.FIRE]: '#ff6b35',
        [ElementType.ICE]: '#4ecdc4',
        [ElementType.LIGHTNING]: '#f7dc6f',
        [ElementType.WIND]: '#a8e6cf',
        [ElementType.WATER]: '#5dade2'
      };

      elements.forEach((elem, index) => {
        const color = elementColors[elem] || '#ffffff';
        const offsetAngle = (index / elements.length) * Math.PI * 2;
        const offsetX = Math.cos(offsetAngle) * (size / 2 + 8);
        const offsetY = Math.sin(offsetAngle) * (size / 2 + 8);
        
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.8;
        ctx.beginPath();
        ctx.arc(position.x + offsetX, position.y + offsetY, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      });
    }

    ctx.fillStyle = renderable.color;

    switch (enemy.type) {
      case 'slime':
        ctx.beginPath();
        ctx.ellipse(position.x, position.y + size / 6, size / 2, size / 3, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(position.x, position.y, size / 2.5, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'skeleton':
        ctx.fillRect(position.x - size / 3, position.y - size / 2, size / 1.5, size);
        ctx.beginPath();
        ctx.arc(position.x, position.y - size / 2 + size / 6, size / 3, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'ghost':
        ctx.globalAlpha = 0.8;
        ctx.beginPath();
        ctx.arc(position.x, position.y - size / 6, size / 2, Math.PI, 0);
        ctx.lineTo(position.x + size / 2, position.y + size / 3);
        for (let i = 0; i < 3; i++) {
          const waveX = position.x + size / 2 - (i + 1) * size / 3;
          ctx.quadraticCurveTo(waveX - size / 6, position.y + size / 2, waveX, position.y + size / 3);
        }
        ctx.fill();
        ctx.globalAlpha = 1;
        break;
    }

    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(position.x - size / 5, position.y - size / 8, size / 10, 0, Math.PI * 2);
    ctx.arc(position.x + size / 5, position.y - size / 8, size / 10, 0, Math.PI * 2);
    ctx.fill();

    if (health) {
      this.renderHealthBar(position.x, position.y - size / 2 - 12, health, size + 10);
    }
  }

  private renderProjectile(position: Position, renderable: Renderable): void {
    const ctx = this.ctx;
    const size = renderable.size;

    const gradient = ctx.createRadialGradient(position.x, position.y, 0, position.x, position.y, size);
    gradient.addColorStop(0, renderable.color);
    gradient.addColorStop(0.5, renderable.color + '88');
    gradient.addColorStop(1, 'transparent');

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(position.x, position.y, size, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(position.x, position.y, size / 3, 0, Math.PI * 2);
    ctx.fill();
  }

  private renderHealthBar(
    x: number,
    y: number,
    health: Health,
    width: number
  ): void {
    const ctx = this.ctx;
    const height = 6;

    ctx.fillStyle = '#333';
    ctx.fillRect(x - width / 2, y, width, height);

    const healthPercent = health.current / health.max;
    let healthColor = '#2ecc71';
    if (healthPercent < 0.3) healthColor = '#e74c3c';
    else if (healthPercent < 0.6) healthColor = '#f39c12';

    ctx.fillStyle = healthColor;
    ctx.fillRect(x - width / 2 + 1, y + 1, (width - 2) * healthPercent, height - 2);

    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.strokeRect(x - width / 2, y, width, height);
  }

  private renderDamageTexts(): void {
    const ctx = this.ctx;
    const damageTexts = this.world.getEntitiesWithComponents(Position, DamageText);

    for (const entity of damageTexts) {
      const position = entity.getComponent(Position);
      const damageText = entity.getComponent(DamageText);

      if (!position || !damageText) continue;

      const alpha = damageText.lifetime / damageText.maxLifetime;
      const y = position.y + damageText.offsetY;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = `bold ${Math.floor(18 * damageText.scale)}px VT323, monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      ctx.strokeStyle = '#000';
      ctx.lineWidth = 3;
      ctx.strokeText(damageText.text, position.x, y);

      ctx.fillStyle = damageText.color;
      ctx.fillText(damageText.text, position.x, y);

      ctx.restore();
    }
  }
}
