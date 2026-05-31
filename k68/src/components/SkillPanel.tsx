import { X, Combine, Plus } from 'lucide-react';
import { useGameStore } from '../store/useGameStore';
import { SKILLS, BASIC_SKILLS, COMBINED_SKILLS } from '../game/data/skills';
import { findRecipe } from '../game/data/recipes';

export function SkillPanel() {
  const {
    showSkillPanel,
    toggleSkillPanel,
    unlockedSkills,
    equippedSkills,
    combineSlot1,
    combineSlot2,
    setCombineSlot1,
    setCombineSlot2,
    dragSkill,
    setDragSkill,
    equipSkill
  } = useGameStore();

  if (!showSkillPanel) return null;

  const handleCombine = () => {
    if (!combineSlot1 || !combineSlot2) return;

    const recipe = findRecipe(combineSlot1, combineSlot2);
    const state = useGameStore.getState();
    
    if (recipe) {
      const { discoverRecipe, unlockSkill, addNotification } = state;
      
      discoverRecipe(recipe.id);
      unlockSkill(recipe.result);
      
      const emptySlot = equippedSkills.findIndex(s => s === null);
      if (emptySlot !== -1) {
        state.equipSkill(emptySlot, recipe.result);
      }
    } else {
      state.addNotification('这两个技能无法组合', 'warning');
    }

    setCombineSlot1(null);
    setCombineSlot2(null);
  };

  const handleDragStart = (skillId: string) => {
    setDragSkill(skillId);
  };

  const handleDragEnd = () => {
    setDragSkill(null);
  };

  const handleDropToSlot = (slotIndex: number) => {
    if (dragSkill) {
      equipSkill(slotIndex, dragSkill);
    }
    setDragSkill(null);
  };

  const handleDropToCombine = (slot: 1 | 2) => {
    if (dragSkill) {
      if (slot === 1) setCombineSlot1(dragSkill);
      else setCombineSlot2(dragSkill);
    }
    setDragSkill(null);
  };

  const basicSkills = BASIC_SKILLS.filter(id => unlockedSkills.includes(id));
  const combinedSkills = COMBINED_SKILLS.filter(id => unlockedSkills.includes(id));
  const lockedSkills = [...BASIC_SKILLS, ...COMBINED_SKILLS].filter(id => !unlockedSkills.includes(id));

  const SkillCard = ({ skillId, locked = false }: { skillId: string; locked?: boolean }) => {
    const skill = SKILLS[skillId];
    if (!skill) return null;

    return (
      <div
        draggable={!locked}
        onDragStart={() => !locked && handleDragStart(skillId)}
        onDragEnd={handleDragEnd}
        className={`p-3 rounded-lg border-2 transition-all cursor-pointer ${
          locked
            ? 'bg-gray-900/50 border-gray-700 opacity-50 cursor-not-allowed'
            : 'bg-gray-800/90 border-gray-600 hover:border-purple-400 hover:bg-gray-700/90'
        }`}
        style={{ boxShadow: !locked ? `0 0 10px ${skill.color}30` : 'none' }}
      >
        <div className="flex items-center gap-2">
          <span className="text-2xl">{locked ? '🔒' : skill.icon}</span>
          <div className="flex-1 min-w-0">
            <p className={`font-bold text-sm truncate ${locked ? 'text-gray-500' : ''}`} style={{ color: locked ? undefined : skill.color }}>
              {locked ? '???' : skill.name}
            </p>
            <p className="text-xs text-gray-400 truncate">
              {locked ? '击败敌人解锁' : skill.description}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-yellow-400 font-bold">{skill.damage}</p>
            <p className="text-xs text-gray-500">伤害</p>
          </div>
        </div>
        {!locked && (
          <div className="mt-2 flex justify-between text-xs text-gray-500">
            <span>CD: {skill.cooldown}ms</span>
            <span>{skill.type === 'combined' ? '组合' : '基础'}</span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-50">
      <div className="bg-gradient-to-b from-gray-900 to-gray-950 rounded-xl p-6 max-w-4xl w-full max-h-[80vh] overflow-hidden border-2 border-purple-800 shadow-2xl">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold text-purple-300" style={{ fontFamily: "'Press Start 2P', cursive" }}>
            技能面板
          </h2>
          <button
            onClick={toggleSkillPanel}
            className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
          >
            <X className="w-6 h-6 text-gray-400" />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-6 h-full overflow-hidden">
          <div className="col-span-2 overflow-y-auto pr-2 space-y-4">
            {basicSkills.length > 0 && (
              <div>
                <h3 className="text-sm font-bold text-gray-400 mb-2 uppercase tracking-wider">基础技能</h3>
                <div className="grid grid-cols-2 gap-2">
                  {basicSkills.map(id => (
                    <SkillCard key={id} skillId={id} />
                  ))}
                </div>
              </div>
            )}

            {combinedSkills.length > 0 && (
              <div>
                <h3 className="text-sm font-bold text-yellow-400 mb-2 uppercase tracking-wider">组合技能</h3>
                <div className="grid grid-cols-2 gap-2">
                  {combinedSkills.map(id => (
                    <SkillCard key={id} skillId={id} />
                  ))}
                </div>
              </div>
            )}

            {lockedSkills.length > 0 && (
              <div>
                <h3 className="text-sm font-bold text-gray-600 mb-2 uppercase tracking-wider">未解锁</h3>
                <div className="grid grid-cols-2 gap-2">
                  {lockedSkills.map(id => (
                    <SkillCard key={id} skillId={id} locked />
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-bold text-gray-400 mb-2 uppercase tracking-wider">装备技能</h3>
              <p className="text-xs text-gray-500 mb-2">拖拽技能到槽位装备</p>
              <div className="grid grid-cols-2 gap-2">
                {[0, 1, 2, 3].map(index => {
                  const skillId = equippedSkills[index];
                  const skill = skillId ? SKILLS[skillId] : null;
                  return (
                    <div
                      key={index}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => handleDropToSlot(index)}
                      className={`w-full aspect-square rounded-lg border-2 border-dashed flex flex-col items-center justify-center transition-all ${
                        skill
                          ? 'bg-gray-800/80 border-purple-500'
                          : 'bg-gray-900/50 border-gray-700 hover:border-purple-400'
                      }`}
                      style={{ boxShadow: skill ? `0 0 15px ${skill.color}40` : 'none' }}
                    >
                      {skill ? (
                        <>
                          <span className="text-3xl">{skill.icon}</span>
                          <span className="text-xs text-gray-400 mt-1">{index + 1}</span>
                        </>
                      ) : (
                        <>
                          <Plus className="w-8 h-8 text-gray-600" />
                          <span className="text-xs text-gray-600 mt-1">{index + 1}</span>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div>
              <h3 className="text-sm font-bold text-yellow-400 mb-2 uppercase tracking-wider flex items-center gap-1">
                <Combine className="w-4 h-4" />
                技能组合
              </h3>
              <p className="text-xs text-gray-500 mb-2">拖拽两个技能查看是否可组合</p>
              <div className="flex items-center gap-2">
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => handleDropToCombine(1)}
                  className={`w-16 h-16 rounded-lg border-2 border-dashed flex items-center justify-center ${
                    combineSlot1
                      ? 'bg-gray-800/80 border-purple-500'
                      : 'bg-gray-900/50 border-gray-700 hover:border-purple-400'
                  }`}
                >
                  {combineSlot1 && SKILLS[combineSlot1] && (
                    <span className="text-2xl">{SKILLS[combineSlot1].icon}</span>
                  )}
                </div>
                <span className="text-2xl text-yellow-400">+</span>
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => handleDropToCombine(2)}
                  className={`w-16 h-16 rounded-lg border-2 border-dashed flex items-center justify-center ${
                    combineSlot2
                      ? 'bg-gray-800/80 border-purple-500'
                      : 'bg-gray-900/50 border-gray-700 hover:border-purple-400'
                  }`}
                >
                  {combineSlot2 && SKILLS[combineSlot2] && (
                    <span className="text-2xl">{SKILLS[combineSlot2].icon}</span>
                  )}
                </div>
              </div>

              {combineSlot1 && combineSlot2 && (
                <div className="mt-4">
                  {findRecipe(combineSlot1, combineSlot2) ? (
                    <>
                      <p className="text-green-400 text-sm mb-2">✨ 发现可组合配方!</p>
                      <button
                        onClick={handleCombine}
                        className="w-full py-2 bg-gradient-to-r from-yellow-600 to-orange-600 hover:from-yellow-500 hover:to-orange-500 text-white rounded-lg font-bold transition-all"
                      >
                        组合技能
                      </button>
                    </>
                  ) : (
                    <p className="text-red-400 text-sm">❌ 这两个技能无法组合</p>
                  )}
                </div>
              )}

              {(combineSlot1 || combineSlot2) && (
                <button
                  onClick={() => { setCombineSlot1(null); setCombineSlot2(null); }}
                  className="w-full mt-2 py-1 text-gray-500 hover:text-gray-300 text-sm"
                >
                  清空
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
