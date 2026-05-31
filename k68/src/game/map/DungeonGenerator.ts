export const TILE_SIZE = 32;
export const MAP_WIDTH = 50;
export const MAP_HEIGHT = 40;

export enum TileType {
  FLOOR = 0,
  WALL = 1,
  ROOM_FLOOR = 2,
  CORRIDOR = 3
}

interface Room {
  x: number;
  y: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
}

export class DungeonGenerator {
  private map: number[][] = [];
  private rooms: Room[] = [];

  generate(): {
    map: number[][];
    rooms: Room[];
    playerSpawn: { x: number; y: number };
    enemySpawns: { x: number; y: number }[];
  } {
    this.initializeMap();
    this.generateRooms();
    this.connectRooms();
    this.carveRooms();

    const playerSpawn = this.getPlayerSpawn();
    const enemySpawns = this.getEnemySpawns();

    return {
      map: this.map,
      rooms: this.rooms,
      playerSpawn,
      enemySpawns
    };
  }

  private initializeMap(): void {
    this.map = [];
    for (let y = 0; y < MAP_HEIGHT; y++) {
      this.map[y] = [];
      for (let x = 0; x < MAP_WIDTH; x++) {
        this.map[y][x] = TileType.WALL;
      }
    }
  }

  private generateRooms(): void {
    this.rooms = [];
    const maxRooms = 10;
    const minRoomSize = 6;
    const maxRoomSize = 12;

    for (let i = 0; i < maxRooms * 3; i++) {
      if (this.rooms.length >= maxRooms) break;

      const width = Math.floor(Math.random() * (maxRoomSize - minRoomSize)) + minRoomSize;
      const height = Math.floor(Math.random() * (maxRoomSize - minRoomSize)) + minRoomSize;
      const x = Math.floor(Math.random() * (MAP_WIDTH - width - 2)) + 1;
      const y = Math.floor(Math.random() * (MAP_HEIGHT - height - 2)) + 1;

      const newRoom: Room = {
        x,
        y,
        width,
        height,
        centerX: Math.floor(x + width / 2),
        centerY: Math.floor(y + height / 2)
      };

      let overlaps = false;
      for (const room of this.rooms) {
        if (this.roomsOverlap(newRoom, room)) {
          overlaps = true;
          break;
        }
      }

      if (!overlaps) {
        this.rooms.push(newRoom);
      }
    }
  }

  private roomsOverlap(a: Room, b: Room): boolean {
    return (
      a.x < b.x + b.width + 2 &&
      a.x + a.width + 2 > b.x &&
      a.y < b.y + b.height + 2 &&
      a.y + a.height + 2 > b.y
    );
  }

  private carveRooms(): void {
    for (const room of this.rooms) {
      for (let y = room.y; y < room.y + room.height; y++) {
        for (let x = room.x; x < room.x + room.width; x++) {
          if (this.isInBounds(x, y)) {
            this.map[y][x] = TileType.ROOM_FLOOR;
          }
        }
      }
    }
  }

  private connectRooms(): void {
    for (let i = 1; i < this.rooms.length; i++) {
      const prev = this.rooms[i - 1];
      const curr = this.rooms[i];

      if (Math.random() < 0.5) {
        this.carveHorizontalCorridor(prev.centerX, curr.centerX, prev.centerY);
        this.carveVerticalCorridor(prev.centerY, curr.centerY, curr.centerX);
      } else {
        this.carveVerticalCorridor(prev.centerY, curr.centerY, prev.centerX);
        this.carveHorizontalCorridor(prev.centerX, curr.centerX, curr.centerY);
      }
    }
  }

  private carveHorizontalCorridor(x1: number, x2: number, y: number): void {
    const start = Math.min(x1, x2);
    const end = Math.max(x1, x2);
    for (let x = start; x <= end; x++) {
      if (this.isInBounds(x, y)) {
        this.map[y][x] = TileType.CORRIDOR;
      }
    }
  }

  private carveVerticalCorridor(y1: number, y2: number, x: number): void {
    const start = Math.min(y1, y2);
    const end = Math.max(y1, y2);
    for (let y = start; y <= end; y++) {
      if (this.isInBounds(x, y)) {
        this.map[y][x] = TileType.CORRIDOR;
      }
    }
  }

  private isInBounds(x: number, y: number): boolean {
    return x >= 0 && x < MAP_WIDTH && y >= 0 && y < MAP_HEIGHT;
  }

  isWalkable(x: number, y: number): boolean {
    const tileX = Math.floor(x / TILE_SIZE);
    const tileY = Math.floor(y / TILE_SIZE);
    if (!this.isInBounds(tileX, tileY)) return false;
    return this.map[tileY][tileX] !== TileType.WALL;
  }

  private getPlayerSpawn(): { x: number; y: number } {
    if (this.rooms.length === 0) {
      return { x: MAP_WIDTH * TILE_SIZE / 2, y: MAP_HEIGHT * TILE_SIZE / 2 };
    }
    const firstRoom = this.rooms[0];
    return {
      x: firstRoom.centerX * TILE_SIZE + TILE_SIZE / 2,
      y: firstRoom.centerY * TILE_SIZE + TILE_SIZE / 2
    };
  }

  private getEnemySpawns(): { x: number; y: number }[] {
    const spawns: { x: number; y: number }[] = [];
    for (let i = 1; i < this.rooms.length; i++) {
      const room = this.rooms[i];
      const enemyCount = Math.floor(Math.random() * 3) + 1;
      for (let j = 0; j < enemyCount; j++) {
        const ex = room.x + 1 + Math.floor(Math.random() * (room.width - 2));
        const ey = room.y + 1 + Math.floor(Math.random() * (room.height - 2));
        spawns.push({
          x: ex * TILE_SIZE + TILE_SIZE / 2,
          y: ey * TILE_SIZE + TILE_SIZE / 2
        });
      }
    }
    return spawns;
  }

  getTileAt(worldX: number, worldY: number): number {
    const tileX = Math.floor(worldX / TILE_SIZE);
    const tileY = Math.floor(worldY / TILE_SIZE);
    if (!this.isInBounds(tileX, tileY)) return TileType.WALL;
    return this.map[tileY][tileX];
  }
}
