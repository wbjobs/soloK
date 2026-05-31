import { X, BookOpen, CheckCircle, Lock } from 'lucide-react';
import { useGameStore } from '../store/useGameStore';
import { SKILLS } from '../game/data/skills';
import { RECIPES } from '../game/data/recipes';

export function RecipeBook() {
  const { showRecipeBook, toggleRecipeBook, discoveredRecipes } = useGameStore();

  if (!showRecipeBook) return null;

  return (
    <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-50">
      <div className="bg-gradient-to-b from-gray-900 to-gray-950 rounded-xl p-6 max-w-2xl w-full max-h-[80vh] overflow-hidden border-2 border-yellow-800 shadow-2xl">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-yellow-300 flex items-center gap-2" style={{ fontFamily: "'Press Start 2P', cursive" }}>
            <BookOpen className="w-6 h-6" />
            配方书
          </h2>
          <button
            onClick={toggleRecipeBook}
            className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
          >
            <X className="w-6 h-6 text-gray-400" />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto max-h-[60vh] pr-2">
          {RECIPES.map(recipe => {
            const isDiscovered = discoveredRecipes.includes(recipe.id);
            const skill1 = SKILLS[recipe.ingredients[0]];
            const skill2 = SKILLS[recipe.ingredients[1]];
            const result = SKILLS[recipe.result];

            return (
              <div
                key={recipe.id}
                className={`p-4 rounded-lg border-2 transition-all ${
                  isDiscovered
                    ? 'bg-gray-800/80 border-yellow-600/50'
                    : 'bg-gray-900/50 border-gray-700'
                }`}
                style={{
                  boxShadow: isDiscovered
                    ? `0 0 20px ${result?.color}20`
                    : 'none'
                }}
              >
                {isDiscovered ? (
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-12 h-12 rounded-lg flex items-center justify-center text-2xl"
                        style={{ backgroundColor: skill1?.color + '30', border: `2px solid ${skill1?.color}` }}
                      >
                        {skill1?.icon}
                      </div>
                      <span className="text-xl text-gray-400">+</span>
                      <div
                        className="w-12 h-12 rounded-lg flex items-center justify-center text-2xl"
                        style={{ backgroundColor: skill2?.color + '30', border: `2px solid ${skill2?.color}` }}
                      >
                        {skill2?.icon}
                      </div>
                      <span className="text-xl text-yellow-400">=</span>
                      <div
                        className="w-14 h-14 rounded-lg flex items-center justify-center text-3xl"
                        style={{ backgroundColor: result?.color + '30', border: `2px solid ${result?.color}` }}
                      >
                        {result?.icon}
                      </div>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-lg" style={{ color: result?.color }}>
                          {result?.name}
                        </p>
                        <CheckCircle className="w-4 h-4 text-green-400" />
                      </div>
                      <p className="text-sm text-gray-400">{result?.description}</p>
                      <p className="text-xs text-yellow-400 mt-1">
                        伤害: {result?.damage} | CD: {result?.cooldown}ms
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <div className="w-12 h-12 rounded-lg flex items-center justify-center text-2xl bg-gray-800 border-2 border-gray-700">
                        <Lock className="w-6 h-6 text-gray-600" />
                      </div>
                      <span className="text-xl text-gray-600">+</span>
                      <div className="w-12 h-12 rounded-lg flex items-center justify-center text-2xl bg-gray-800 border-2 border-gray-700">
                        <Lock className="w-6 h-6 text-gray-600" />
                      </div>
                      <span className="text-xl text-gray-600">=</span>
                      <div className="w-14 h-14 rounded-lg flex items-center justify-center text-3xl bg-gray-800 border-2 border-gray-700">
                        <Lock className="w-8 h-8 text-gray-600" />
                      </div>
                    </div>
                    <div className="flex-1">
                      <p className="font-bold text-lg text-gray-500">??? 未知配方</p>
                      <p className="text-sm text-gray-600">尝试组合不同的技能来发现新配方</p>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-4 pt-4 border-t border-gray-800">
          <p className="text-sm text-gray-500">
            已发现: {discoveredRecipes.length} / {RECIPES.length} 个配方
          </p>
        </div>
      </div>
    </div>
  );
}
