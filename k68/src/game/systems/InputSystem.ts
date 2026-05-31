import { System } from '../ecs/System';
import { World } from '../ecs/World';
import { InputControlled, Velocity } from '../ecs/Component';
import { normalize } from '../utils/collision';

export class InputSystem extends System {
  private keys: Set<string> = new Set();
  private mousePosition: { x: number; y: number } = { x: 0, y: 0 };
  private mouseClicked: boolean = false;

  constructor(world: World) {
    super(world);
    this.requiredComponents = [InputControlled, Velocity];
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    window.addEventListener('keydown', (e) => {
      this.keys.add(e.key.toLowerCase());
    });

    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.key.toLowerCase());
    });

    window.addEventListener('mousemove', (e) => {
      const canvas = document.querySelector('canvas');
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        this.mousePosition = {
          x: e.clientX - rect.left,
          y: e.clientY - rect.top
        };
      }
    });

    window.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        this.mouseClicked = true;
      }
    });
  }

  getKeys(): Set<string> {
    return this.keys;
  }

  getMousePosition(): { x: number; y: number } {
    return this.mousePosition;
  }

  consumeMouseClick(): boolean {
    const clicked = this.mouseClicked;
    this.mouseClicked = false;
    return clicked;
  }

  isKeyPressed(key: string): boolean {
    return this.keys.has(key.toLowerCase());
  }

  update(deltaTime: number): void {
    const entities = this.getEntities();

    for (const entity of entities) {
      const velocity = entity.getComponent(Velocity);
      if (!velocity) continue;

      let vx = 0;
      let vy = 0;

      if (this.keys.has('w') || this.keys.has('arrowup')) vy -= 1;
      if (this.keys.has('s') || this.keys.has('arrowdown')) vy += 1;
      if (this.keys.has('a') || this.keys.has('arrowleft')) vx -= 1;
      if (this.keys.has('d') || this.keys.has('arrowright')) vx += 1;

      const normalized = normalize(vx, vy);
      velocity.vx = normalized.x * velocity.speed;
      velocity.vy = normalized.y * velocity.speed;
    }
  }
}
