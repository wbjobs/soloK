const STORAGE_KEYS = {
  RECIPES: 'dungeon_skill_recipes',
  SKILLS: 'dungeon_player_skills',
  STATS: 'dungeon_game_stats'
};

export interface GameStats {
  discoveredRecipes: string[];
  unlockedSkills: string[];
  highScore: number;
  deepestFloor: number;
  playTime: number;
}

const defaultStats: GameStats = {
  discoveredRecipes: [],
  unlockedSkills: [],
  highScore: 0,
  deepestFloor: 1,
  playTime: 0
};

function safeParse<T>(json: string | null, defaultValue: T): T {
  if (!json) return defaultValue;
  try {
    const parsed = JSON.parse(json);
    if (Array.isArray(parsed)) {
      return [...new Set(parsed)] as unknown as T;
    }
    return parsed;
  } catch (e) {
    console.error('Failed to parse JSON:', e);
    return defaultValue;
  }
}

export function loadGameStats(): GameStats {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.STATS);
    if (stored) {
      const parsed = JSON.parse(stored);
      const recipes = loadDiscoveredRecipes();
      const skills = loadUnlockedSkills();
      return {
        ...defaultStats,
        ...parsed,
        discoveredRecipes: recipes.length > 0 ? recipes : (parsed.discoveredRecipes || []),
        unlockedSkills: skills.length > 0 ? skills : (parsed.unlockedSkills || [])
      };
    }
  } catch (e) {
    console.error('Failed to load game stats:', e);
  }
  return { ...defaultStats };
}

export function saveGameStats(stats: Partial<GameStats>): void {
  try {
    const current = loadGameStats();
    const updated = { ...current, ...stats };
    localStorage.setItem(STORAGE_KEYS.STATS, JSON.stringify(updated));
  } catch (e) {
    console.error('Failed to save game stats:', e);
  }
}

export function loadDiscoveredRecipes(): string[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.RECIPES);
    const recipes = safeParse<string[]>(stored, []);
    return [...new Set(recipes)];
  } catch (e) {
    console.error('Failed to load recipes:', e);
  }
  return [];
}

export function saveDiscoveredRecipes(recipes: string[]): void {
  try {
    const uniqueRecipes = [...new Set(recipes)];
    localStorage.setItem(STORAGE_KEYS.RECIPES, JSON.stringify(uniqueRecipes));
  } catch (e) {
    console.error('Failed to save recipes:', e);
  }
}

export function loadUnlockedSkills(): string[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.SKILLS);
    const skills = safeParse<string[]>(stored, []);
    return [...new Set(skills)];
  } catch (e) {
    console.error('Failed to load skills:', e);
  }
  return [];
}

export function saveUnlockedSkills(skills: string[]): void {
  try {
    const uniqueSkills = [...new Set(skills)];
    localStorage.setItem(STORAGE_KEYS.SKILLS, JSON.stringify(uniqueSkills));
  } catch (e) {
    console.error('Failed to save skills:', e);
  }
}

export function discoverRecipe(recipeId: string): boolean {
  const discovered = loadDiscoveredRecipes();
  if (!discovered.includes(recipeId)) {
    discovered.push(recipeId);
    saveDiscoveredRecipes(discovered);
    return true;
  }
  return false;
}

export function unlockSkill(skillId: string): boolean {
  const unlocked = loadUnlockedSkills();
  if (!unlocked.includes(skillId)) {
    unlocked.push(skillId);
    saveUnlockedSkills(unlocked);
    return true;
  }
  return false;
}

export function clearAllData(): void {
  localStorage.removeItem(STORAGE_KEYS.RECIPES);
  localStorage.removeItem(STORAGE_KEYS.SKILLS);
  localStorage.removeItem(STORAGE_KEYS.STATS);
}
