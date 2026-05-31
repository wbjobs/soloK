import { create } from 'zustand';
import { SKILLS } from '../game/data/skills';
import { RECIPES } from '../game/data/recipes';
import { loadDiscoveredRecipes, loadUnlockedSkills } from '../game/utils/storage';

export interface Notification {
  id: number;
  message: string;
  type: 'info' | 'success' | 'warning';
  timestamp: number;
}

interface GameState {
  playerHealth: number;
  playerMaxHealth: number;
  score: number;
  floor: number;
  gameState: 'menu' | 'playing' | 'paused' | 'gameover';
  showSkillPanel: boolean;
  showRecipeBook: boolean;
  unlockedSkills: string[];
  discoveredRecipes: string[];
  equippedSkills: (string | null)[];
  notifications: Notification[];
  combineSlot1: string | null;
  combineSlot2: string | null;
  dragSkill: string | null;

  setGameState: (state: 'menu' | 'playing' | 'paused' | 'gameover') => void;
  setPlayerHealth: (health: number) => void;
  setPlayerMaxHealth: (max: number) => void;
  addScore: (points: number) => void;
  setFloor: (floor: number) => void;
  toggleSkillPanel: () => void;
  toggleRecipeBook: () => void;
  equipSkill: (slotIndex: number, skillId: string) => void;
  addNotification: (message: string, type?: 'info' | 'success' | 'warning') => void;
  removeNotification: (id: number) => void;
  setCombineSlot1: (skillId: string | null) => void;
  setCombineSlot2: (skillId: string | null) => void;
  setDragSkill: (skillId: string | null) => void;
  unlockSkill: (skillId: string) => void;
  discoverRecipe: (recipeId: string) => void;
  loadPersistentData: () => void;
  resetGame: () => void;
}

export const useGameStore = create<GameState>((set, get) => ({
  playerHealth: 100,
  playerMaxHealth: 100,
  score: 0,
  floor: 1,
  gameState: 'menu',
  showSkillPanel: false,
  showRecipeBook: false,
  unlockedSkills: [],
  discoveredRecipes: [],
  equippedSkills: [null, null, null, null],
  notifications: [],
  combineSlot1: null,
  combineSlot2: null,
  dragSkill: null,

  setGameState: (state) => set({ gameState: state }),
  setPlayerHealth: (health) => set({ playerHealth: Math.max(0, Math.min(get().playerMaxHealth, health)) }),
  setPlayerMaxHealth: (max) => set({ playerMaxHealth: max }),
  addScore: (points) => set({ score: get().score + points }),
  setFloor: (floor) => set({ floor }),
  toggleSkillPanel: () => set({ showSkillPanel: !get().showSkillPanel, showRecipeBook: false }),
  toggleRecipeBook: () => set({ showRecipeBook: !get().showRecipeBook, showSkillPanel: false }),
  
  equipSkill: (slotIndex, skillId) => {
    const equipped = [...get().equippedSkills];
    equipped[slotIndex] = skillId;
    set({ equippedSkills: equipped });
  },

  addNotification: (message, type = 'info') => {
    const id = Date.now();
    set({
      notifications: [...get().notifications, { id, message, type, timestamp: Date.now() }]
    });
    setTimeout(() => {
      get().removeNotification(id);
    }, 3000);
  },

  removeNotification: (id) => {
    set({
      notifications: get().notifications.filter(n => n.id !== id)
    });
  },

  setCombineSlot1: (skillId) => set({ combineSlot1: skillId }),
  setCombineSlot2: (skillId) => set({ combineSlot2: skillId }),
  setDragSkill: (skillId) => set({ dragSkill: skillId }),

  unlockSkill: (skillId) => {
    const unlocked = get().unlockedSkills;
    if (!unlocked.includes(skillId)) {
      set({ unlockedSkills: [...unlocked, skillId] });
      const skill = SKILLS[skillId];
      if (skill) {
        get().addNotification(`获得技能: ${skill.icon} ${skill.name}`, 'success');
      }
    }
  },

  discoverRecipe: (recipeId) => {
    const discovered = get().discoveredRecipes;
    if (!discovered.includes(recipeId)) {
      set({ discoveredRecipes: [...discovered, recipeId] });
      const recipe = RECIPES.find(r => r.id === recipeId);
      const resultSkill = recipe ? SKILLS[recipe.result] : null;
      if (resultSkill) {
        get().addNotification(`发现新配方: ${resultSkill.icon} ${resultSkill.name}!`, 'success');
      }
    }
  },

  loadPersistentData: () => {
    const discovered = loadDiscoveredRecipes();
    const unlocked = loadUnlockedSkills();
    set({
      discoveredRecipes: discovered,
      unlockedSkills: unlocked
    });
  },

  resetGame: () => {
    set({
      playerHealth: 100,
      playerMaxHealth: 100,
      score: 0,
      floor: 1,
      gameState: 'playing',
      showSkillPanel: false,
      showRecipeBook: false,
      equippedSkills: [null, null, null, null],
      combineSlot1: null,
      combineSlot2: null
    });
  }
}));
