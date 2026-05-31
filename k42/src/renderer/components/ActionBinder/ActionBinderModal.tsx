import { useState } from 'react';
import { motion } from 'framer-motion';
import { Link, Keyboard, MousePointer2, Code, Save, X, Zap, FileCode } from 'lucide-react';
import type { Action, MappingRule, ScriptCondition, ScriptAction } from '@shared/index';
import { triggerToString, actionToString } from '@shared/index';
import { v4 as uuidv4 } from 'uuid';
import { cn } from '@/lib/utils';
import Modal from '../common/Modal';
import LearnModeButton from '../LearnMode/LearnModeButton';
import MidiMessageDisplay from '../LearnMode/MidiMessageDisplay';
import KeyboardActionEditor from './KeyboardActionEditor';
import MouseActionEditor from './MouseActionEditor';
import ScriptEditor from '../ScriptEditor/ScriptEditor';
import ScriptApiDocs from '../ScriptEditor/ScriptApiDocs';
import useLearnMode from '../../hooks/useLearnMode';

type ActionTab = 'keyboard' | 'mouse' | 'script';

interface ActionBinderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (mapping: MappingRule) => void;
  editMapping?: MappingRule | null;
  className?: string;
}

export default function ActionBinderModal({
  isOpen,
  onClose,
  onSave,
  editMapping = null,
  className,
}: ActionBinderModalProps) {
  const [name, setName] = useState(editMapping?.name || '');
  const [actionTab, setActionTab] = useState<ActionTab>(
    editMapping?.action.type === 'keyboard' ? 'keyboard' :
    editMapping?.action.type === 'script' ? 'script' : 'mouse'
  );
  const [selectedAction, setSelectedAction] = useState<Action | null>(
    editMapping?.action || null
  );
  const [condition, setCondition] = useState<ScriptCondition | null>(
    editMapping?.condition || null
  );
  const [showCondition, setShowCondition] = useState(!!editMapping?.condition?.enabled);
  const [showApiDocs, setShowApiDocs] = useState(false);

  const {
    learning,
    learnedMessage,
    learnedTrigger,
    timeRemaining,
    startLearning,
    stopLearning,
    resetLearned,
  } = useLearnMode({
    onLearned: (trigger) => {
      if (!name) {
        setName(`映射 - ${triggerToString(trigger)}`);
      }
    },
  });

  const activeTrigger = editMapping?.midiTrigger || learnedTrigger;

  const handleSave = () => {
    if (!activeTrigger || !selectedAction) return;

    const finalCondition: ScriptCondition | undefined = showCondition && condition?.code
      ? { enabled: true, code: condition.code }
      : undefined;

    const mapping: MappingRule = {
      id: editMapping?.id || uuidv4(),
      name: name || `映射 - ${triggerToString(activeTrigger)}`,
      enabled: editMapping?.enabled ?? true,
      midiTrigger: activeTrigger,
      action: selectedAction,
      condition: finalCondition,
      createdAt: editMapping?.createdAt || Date.now(),
      updatedAt: Date.now(),
    };

    onSave(mapping);
    handleClose();
  };

  const handleClose = () => {
    setName('');
    setActionTab('keyboard');
    setSelectedAction(null);
    setCondition(null);
    setShowCondition(false);
    setShowApiDocs(false);
    resetLearned();
    if (learning) {
      stopLearning();
    }
    onClose();
  };

  const handleConditionChange = (code: string) => {
    setCondition({ enabled: showCondition, code });
  };

  const isValid = activeTrigger && selectedAction;

  const getDefaultScriptCode = (): string => {
    return `// 脚本动作
// 可以在这里编写自定义JavaScript代码
// 可用API: press, click, scroll, drag, delay, log等

log('触发脚本动作');

// 示例: 发送快捷键
// await press(['ctrl', 'c']);

// 示例: 鼠标点击
// await click('left');

return true;`;
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={editMapping ? '编辑映射' : '创建新映射'}
      size="max"
      className={cn('max-h-[90vh] overflow-hidden', className)}
      footer={
        <>
          <button
            onClick={handleClose}
            className="btn-secondary"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={!isValid}
            className={cn(
              'btn-primary flex items-center gap-2',
              !isValid && 'opacity-50 cursor-not-allowed'
            )}
          >
            <Save className="w-4 h-4" />
            {editMapping ? '保存修改' : '创建映射'}
          </button>
        </>
      }
    >
      <div className="space-y-6 overflow-y-auto max-h-[calc(90vh-120px)] pr-2">
        <div className="space-y-3">
          <label className="block text-sm font-medium text-text">
            映射名称
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="输入映射名称..."
            className="input-field"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-primary/10">
                <Link className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h4 className="font-medium text-text">MIDI 触发器</h4>
                <p className="text-xs text-text-muted">选择要监听的 MIDI 信号</p>
              </div>
            </div>

            {activeTrigger ? (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-4 rounded-xl bg-success/5 border border-success/30"
              >
                <div className="text-sm font-medium text-success mb-2">已选择触发器</div>
                <div className="font-mono text-sm text-text">
                  {triggerToString(activeTrigger)}
                </div>
                {!editMapping && (
                  <button
                    onClick={resetLearned}
                    className="mt-3 text-xs text-text-muted hover:text-text flex items-center gap-1"
                  >
                    <X className="w-3 h-3" />
                    重新选择
                  </button>
                )}
              </motion.div>
            ) : (
              <LearnModeButton
                learning={learning}
                learned={!!learnedTrigger}
                timeRemaining={timeRemaining}
                onStart={() => startLearning()}
                onStop={stopLearning}
                onReset={resetLearned}
              />
            )}

            <MidiMessageDisplay message={learnedMessage} />

            <div className="border-t border-border pt-4">
              <button
                onClick={() => setShowCondition(!showCondition)}
                className={cn(
                  'flex items-center gap-3 w-full p-3 rounded-xl border transition-all',
                  showCondition
                    ? 'bg-accent/10 border-accent/50'
                    : 'bg-surface-light border-border hover:border-accent/30'
                )}
              >
                <Zap className={cn('w-5 h-5', showCondition ? 'text-accent' : 'text-text-muted')} />
                <div className="flex-1 text-left">
                  <div className={cn('font-medium', showCondition ? 'text-accent' : 'text-text')}>
                    条件判断脚本
                  </div>
                  <div className="text-xs text-text-muted">
                    {showCondition ? '已启用: 只有脚本返回true时才触发动作' : '可选: 使用JavaScript控制触发条件'}
                  </div>
                </div>
              </button>

              {showCondition && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="mt-3"
                >
                  <ScriptEditor
                    value={condition?.code || '// 返回 true 触发动作，false 阻止触发\nreturn message.velocity > 50;'}
                    onChange={handleConditionChange}
                    mode="condition"
                    minHeight="120px"
                    showExamples={true}
                  />
                </motion.div>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-4">
              <div className="p-2 rounded-lg bg-secondary/10">
                {actionTab === 'keyboard' ? (
                  <Keyboard className="w-5 h-5 text-secondary" />
                ) : actionTab === 'mouse' ? (
                  <MousePointer2 className="w-5 h-5 text-secondary" />
                ) : (
                  <Code className="w-5 h-5 text-secondary" />
                )}
              </div>
              <div className="flex-1">
                <h4 className="font-medium text-text">目标动作</h4>
                <p className="text-xs text-text-muted">选择触发后执行的动作</p>
              </div>
            </div>

            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setActionTab('keyboard')}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all border',
                  actionTab === 'keyboard'
                    ? 'bg-primary/10 border-primary/50 text-primary'
                    : 'bg-surface-light border-border text-text-muted hover:border-primary/30'
                )}
              >
                <Keyboard className="w-4 h-4" />
                键盘
              </button>
              <button
                onClick={() => setActionTab('mouse')}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all border',
                  actionTab === 'mouse'
                    ? 'bg-secondary/10 border-secondary/50 text-secondary'
                    : 'bg-surface-light border-border text-text-muted hover:border-secondary/30'
                )}
              >
                <MousePointer2 className="w-4 h-4" />
                鼠标
              </button>
              <button
                onClick={() => setActionTab('script')}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all border',
                  actionTab === 'script'
                    ? 'bg-accent/10 border-accent/50 text-accent'
                    : 'bg-surface-light border-border text-text-muted hover:border-accent/30'
                )}
              >
                <FileCode className="w-4 h-4" />
                脚本
              </button>
            </div>

            {actionTab === 'keyboard' && (
              <KeyboardActionEditor
                value={selectedAction?.type === 'keyboard' ? selectedAction : null}
                onChange={setSelectedAction}
              />
            )}
            {actionTab === 'mouse' && (
              <MouseActionEditor
                value={selectedAction?.type === 'mouseClick' || selectedAction?.type === 'mouseDrag' || selectedAction?.type === 'mouseScroll' ? selectedAction : null}
                onChange={setSelectedAction}
              />
            )}
            {actionTab === 'script' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-text-muted">编写自定义脚本</span>
                  <button
                    onClick={() => setShowApiDocs(!showApiDocs)}
                    className="text-xs text-primary hover:text-primary-dark flex items-center gap-1"
                  >
                    <Code className="w-3 h-3" />
                    {showApiDocs ? '隐藏API' : '查看API'}
                  </button>
                </div>

                {showApiDocs && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    <ScriptApiDocs />
                  </motion.div>
                )}

                <ScriptEditor
                  value={selectedAction?.type === 'script' ? selectedAction.code : getDefaultScriptCode()}
                  onChange={(code) => {
                    const scriptAction: ScriptAction = { type: 'script', code, timeout: 5000 };
                    setSelectedAction(scriptAction);
                  }}
                  mode="action"
                  minHeight="200px"
                  showExamples={true}
                />
              </div>
            )}

            {selectedAction && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-3 rounded-lg bg-secondary/5 border border-secondary/30"
              >
                <div className="text-xs font-medium text-secondary mb-1">动作预览</div>
                <div className="font-mono text-sm text-text break-all">
                  {actionToString(selectedAction)}
                </div>
              </motion.div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
