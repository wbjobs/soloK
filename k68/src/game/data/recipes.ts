export interface Recipe {
  id: string;
  ingredients: [string, string];
  result: string;
  discovered: boolean;
}

export const RECIPES: Recipe[] = [
  {
    id: 'explosionArrow',
    ingredients: ['fireball', 'iceArrow'],
    result: 'explosionArrow',
    discovered: false
  },
  {
    id: 'plasmaOrb',
    ingredients: ['fireball', 'lightning'],
    result: 'plasmaOrb',
    discovered: false
  },
  {
    id: 'blizzard',
    ingredients: ['iceArrow', 'windBlade'],
    result: 'blizzard',
    discovered: false
  },
  {
    id: 'thunderStorm',
    ingredients: ['lightning', 'windBlade'],
    result: 'thunderStorm',
    discovered: false
  },
  {
    id: 'tidalWave',
    ingredients: ['waterBolt', 'windBlade'],
    result: 'tidalWave',
    discovered: false
  }
];

export function findRecipe(skill1: string, skill2: string): Recipe | undefined {
  return RECIPES.find(
    recipe =>
      (recipe.ingredients[0] === skill1 && recipe.ingredients[1] === skill2) ||
      (recipe.ingredients[0] === skill2 && recipe.ingredients[1] === skill1)
  );
}
