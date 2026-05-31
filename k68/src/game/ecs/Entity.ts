export class Entity {
  private static nextId = 0;
  public readonly id: number;
  private components: Map<string, unknown> = new Map();

  constructor() {
    this.id = Entity.nextId++;
  }

  addComponent<T>(component: T): this {
    const name = (component as { constructor: { name: string } }).constructor.name;
    this.components.set(name, component);
    return this;
  }

  getComponent<T>(componentType: { new (...args: never[]): T }): T | undefined {
    return this.components.get(componentType.name) as T | undefined;
  }

  hasComponent(componentType: { new (...args: never[]): unknown }): boolean {
    return this.components.has(componentType.name);
  }

  hasComponents(...componentTypes: { new (...args: never[]): unknown }[]): boolean {
    return componentTypes.every(type => this.components.has(type.name));
  }

  removeComponent(componentType: { new (...args: never[]): unknown }): void {
    this.components.delete(componentType.name);
  }

  destroy(): void {
    this.components.clear();
  }
}
