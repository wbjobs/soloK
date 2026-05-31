import { useEffect, useRef, useCallback } from 'react';
import { World } from '../game/ecs/World';
import { Position, Velocity, Health, InputControlled, Player, Renderable, Collider, Enemy, EnemyType } from '../game/ecs/Component';
import { DungeonGenerator } from '../game/map/DungeonGenerator';
import { InputSystem } from '../game/systems/InputSystem';
import { MovementSystem } from '../game/systems/MovementSystem';
import { AISystem } from '../game/systems/AISystem';
import { CombatSystem } from '../game/systems/CombatSystem';
import { SkillSystem } from '../game/systems/SkillSystem';
import { DamageTextSystem } from '../game/systems/DamageTextSystem';
import { RenderSystem } from '../game/systems/RenderSystem';
import { useGameLoop } from '../hooks/useGameLoop';
import { useGameStore } from '../store/useGameStore';
import { ENEMIES } from '../game/data/enemies';

interface GameCanvasProps {
  width: number;
  height: number;
}

export function GameCanvas({ width, height }: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const worldRef = useRef<World | null>(null);
  const inputSystemRef = useRef<InputSystem | null>(null);
  const skillSystemRef = useRef<SkillSystem | null>(null);
  const renderSystemRef = useRef<RenderSystem | null>(null);
  const combatSystemRef = useRef<CombatSystem | null>(null);
  const initializedRef = useRef(false);

  const {
    gameState,
    equippedSkills,
    setPlayerHealth,
    setPlayerMaxHealth,
    addScore,
    unlockSkill,
    discoverRecipe,
    addNotification,
    equipSkill
  } = useGameStore();

  const initializeGame = useCallback((ctx: CanvasRenderingContext2D) => {
    const world = new World();
    worldRef.current = world;

    const dungeon = new DungeonGenerator();
    const { playerSpawn, enemySpawns } = dungeon.generate();

    const player = world.createEntity();
    player
      .addComponent(new Position(playerSpawn.x, playerSpawn.y))
      .addComponent(new Velocity(0, 0, 220))
      .addComponent(new Health(100, 100))
      .addComponent(new InputControlled())
      .addComponent(new Player())
      .addComponent(new Renderable('player', '#64b5f6', 36))
      .addComponent(new Collider(16, true));

    for (const spawn of enemySpawns) {
      const types = Object.values(EnemyType);
      const type = types[Math.floor(Math.random() * types.length)];
      const enemyData = ENEMIES[type];
      
      const enemy = world.createEntity();
      enemy
        .addComponent(new Position(spawn.x, spawn.y))
        .addComponent(new Velocity(0, 0, enemyData.speed))
        .addComponent(new Health(enemyData.health, enemyData.health))
        .addComponent(new Enemy(type))
        .addComponent(new Renderable('enemy', enemyData.color, enemyData.size))
        .addComponent(new Collider(enemyData.size / 2 - 2, true));
    }

    const inputSystem = new InputSystem(world);
    const movementSystem = new MovementSystem(world, dungeon);
    const aiSystem = new AISystem(world);
    const combatSystem = new CombatSystem(world);
    const skillSystem = new SkillSystem(world, inputSystem);
    const damageTextSystem = new DamageTextSystem(world);
    const renderSystem = new RenderSystem(world, ctx, dungeon, width, height);

    inputSystemRef.current = inputSystem;
    skillSystemRef.current = skillSystem;
    renderSystemRef.current = renderSystem;
    combatSystemRef.current = combatSystem;

    combatSystem.setOnEnemyKilled((x, y) => {
      const skillId = skillSystem.addSkillDrop(x, y);
      addScore(100);
    });

    skillSystem.setOnSkillUnlocked((skillId, isNew) => {
      unlockSkill(skillId);
    });

    skillSystem.setOnRecipeDiscovered((recipeId, resultSkillId) => {
      discoverRecipe(recipeId);
    });

    skillSystem.setOnSkillDropped((skillId, x, y) => {
      const skill = world.createEntity();
      skill
        .addComponent(new Position(x, y))
        .addComponent(new Renderable('skill', '#ffd93d', 20));
      setTimeout(() => {
        if (world.getEntity(skill.id)) {
          world.removeEntity(skill.id);
        }
      }, 5000);
    });

    world.addSystem(inputSystem);
    world.addSystem(movementSystem);
    world.addSystem(aiSystem);
    world.addSystem(combatSystem);
    world.addSystem(skillSystem);
    world.addSystem(damageTextSystem);
    world.addSystem(renderSystem);

    initializedRef.current = true;
  }, [width, height, addScore, unlockSkill, discoverRecipe]);

  const gameLoop = useCallback((deltaTime: number) => {
    if (!worldRef.current || !renderSystemRef.current || !skillSystemRef.current) return;

    const cameraOffset = renderSystemRef.current.getCameraOffset();
    skillSystemRef.current.setCameraOffset(cameraOffset);

    worldRef.current.update(deltaTime);

    const players = worldRef.current.getEntitiesWithComponents(Position, Health, Player);
    if (players.length > 0) {
      const health = players[0].getComponent(Health);
      if (health) {
        setPlayerHealth(health.current);
        setPlayerMaxHealth(health.max);

        if (health.current <= 0) {
          useGameStore.getState().setGameState('gameover');
        }
      }
    }

    if (skillSystemRef.current) {
      const skillSlots = skillSystemRef.current.getEquippedSkills();
      for (let i = 0; i < skillSlots.length; i++) {
        if (skillSlots[i].skillId !== equippedSkills[i]) {
          if (skillSlots[i].skillId) {
            equipSkill(i, skillSlots[i].skillId!);
          }
        }
      }
    }
  }, [setPlayerHealth, setPlayerMaxHealth, equippedSkills, equipSkill]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (!initializedRef.current) {
      initializeGame(ctx);
    }
  }, [initializeGame]);

  useEffect(() => {
    if (skillSystemRef.current) {
      for (let i = 0; i < equippedSkills.length; i++) {
        if (equippedSkills[i]) {
          skillSystemRef.current.equipSkill(i, equippedSkills[i]!);
        }
      }
    }
  }, [equippedSkills]);

  useEffect(() => {
    if (renderSystemRef.current) {
      renderSystemRef.current.setCanvasSize(width, height);
    }
  }, [width, height]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (gameState === 'playing') {
          useGameStore.getState().setGameState('paused');
        } else if (gameState === 'paused') {
          useGameStore.getState().setGameState('playing');
        }
      }
      if (e.key === 'Tab' || e.key === 'e') {
        e.preventDefault();
        useGameStore.getState().toggleSkillPanel();
      }
      if (e.key === 'r') {
        useGameStore.getState().toggleRecipeBook();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gameState]);

  useGameLoop(gameLoop, gameState === 'playing');

  const handleRestart = () => {
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) {
        initializedRef.current = false;
        if (worldRef.current) {
          worldRef.current.clear();
        }
        useGameStore.getState().resetGame();
        initializeGame(ctx);
      }
    }
  };

  return (
    <div className="relative">
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="block rounded-lg shadow-2xl border-2 border-purple-900"
        style={{ imageRendering: 'pixelated' }}
      />
      
      {gameState === 'paused' && (
        <div className="absolute inset-0 bg-black/70 flex items-center justify-center rounded-lg">
          <div className="text-center">
            <h2 className="text-4xl font-bold text-white mb-4" style={{ fontFamily: "'Press Start 2P', cursive" }}>
              暂停
            </h2>
            <p className="text-purple-300 mb-6">按 ESC 继续游戏</p>
            <button
              onClick={() => useGameStore.getState().setGameState('playing')}
              className="px-6 py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-bold transition-colors mr-4"
            >
              继续
            </button>
            <button
              onClick={handleRestart}
              className="px-6 py-3 bg-red-600 hover:bg-red-500 text-white rounded-lg font-bold transition-colors"
            >
              重新开始
            </button>
          </div>
        </div>
      )}

      {gameState === 'gameover' && (
        <div className="absolute inset-0 bg-black/80 flex items-center justify-center rounded-lg">
          <div className="text-center">
            <h2 className="text-5xl font-bold text-red-500 mb-4" style={{ fontFamily: "'Press Start 2P', cursive" }}>
              游戏结束
            </h2>
            <p className="text-2xl text-white mb-2">最终得分: {useGameStore.getState().score}</p>
            <p className="text-purple-300 mb-6">到达第 {useGameStore.getState().floor} 层</p>
            <button
              onClick={handleRestart}
              className="px-8 py-4 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white rounded-lg font-bold text-xl transition-all transform hover:scale-105"
            >
              再来一局
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
