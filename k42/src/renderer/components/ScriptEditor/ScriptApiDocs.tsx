import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, BookOpen, Keyboard, MousePointer, Database, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ApiFunction {
  name: string;
  signature: string;
  description: string;
  category: 'input' | 'state' | 'utility' | 'time';
}

const API_FUNCTIONS: ApiFunction[] = [
  {
    name: 'log',
    signature: 'log(...args: any[]): void',
    description: '输出日志信息，用于调试脚本',
    category: 'utility',
  },
  {
    name: 'getNoteName',
    signature: 'getNoteName(note: number): string',
    description: '将 MIDI 音符编号转换为音符名称（如 C4, D#5）',
    category: 'utility',
  },
  {
    name: 'delay',
    signature: 'delay(ms: number): Promise<void>',
    description: '延迟指定毫秒数后继续执行',
    category: 'utility',
  },
  {
    name: 'press',
    signature: 'press(keys: string | string[]): Promise<void>',
    description: '按下并释放一个或多个键盘按键。支持组合键，如 ["ctrl", "c"]',
    category: 'input',
  },
  {
    name: 'click',
    signature: 'click(button?: "left" | "right" | "middle", x?: number, y?: number): Promise<void>',
    description: '在指定位置点击鼠标按钮。默认左键点击当前位置',
    category: 'input',
  },
  {
    name: 'scroll',
    signature: 'scroll(direction: "up" | "down" | "left" | "right", amount: number): Promise<void>',
    description: '向指定方向滚动鼠标滚轮，amount 为滚动量',
    category: 'input',
  },
  {
    name: 'drag',
    signature: 'drag(fromX: number, fromY: number, toX: number, toY: number, button?: "left" | "right" | "middle"): Promise<void>',
    description: '从起始位置拖拽鼠标到目标位置',
    category: 'input',
  },
  {
    name: 'getState',
    signature: 'getState(key: string): any',
    description: '获取全局状态中指定键的值',
    category: 'state',
  },
  {
    name: 'setState',
    signature: 'setState(key: string, value: any): void',
    description: '设置全局状态中指定键的值',
    category: 'state',
  },
  {
    name: 'getCounter',
    signature: 'getCounter(key: string): number',
    description: '获取计数器的值，不存在则返回 0',
    category: 'state',
  },
  {
    name: 'setCounter',
    signature: 'setCounter(key: string, value: number): void',
    description: '设置计数器的值',
    category: 'state',
  },
  {
    name: 'increment',
    signature: 'increment(key: string, amount?: number): number',
    description: '增加计数器的值，默认增加 1，返回新值',
    category: 'state',
  },
  {
    name: 'decrement',
    signature: 'decrement(key: string, amount?: number): number',
    description: '减少计数器的值，默认减少 1，返回新值',
    category: 'state',
  },
  {
    name: 'resetCounter',
    signature: 'resetCounter(key: string): void',
    description: '重置计数器并清除最后触发时间',
    category: 'state',
  },
  {
    name: 'getTimeSinceLast',
    signature: 'getTimeSinceLast(key?: string): number',
    description: '获取距离上次触发的毫秒数，默认键为 "default"',
    category: 'time',
  },
];

const CONTEXT_VARIABLES = [
  {
    name: 'message',
    description: '当前 MIDI 消息对象，包含 status, channel, type, note, velocity, controlNumber, controlValue 等属性',
  },
  {
    name: 'trigger',
    description: '触发规则的 MIDI 触发器配置',
  },
  {
    name: 'state',
    description: '全局状态对象，包含所有通过 setState 设置的值',
  },
  {
    name: 'counter',
    description: '计数器对象，包含所有计数器的当前值',
  },
  {
    name: 'lastTrigger',
    description: '最后触发时间对象，记录各个键的最后触发时间戳',
  },
];

const categoryIcons: Record<string, React.ReactNode> = {
  input: <MousePointer className="w-4 h-4" />,
  state: <Database className="w-4 h-4" />,
  utility: <Keyboard className="w-4 h-4" />,
  time: <Clock className="w-4 h-4" />,
};

const categoryNames: Record<string, string> = {
  input: '输入控制',
  state: '状态管理',
  utility: '工具函数',
  time: '时间函数',
};

export default function ScriptApiDocs({ className }: { className?: string }) {
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['input']));
  const [showContext, setShowContext] = useState(false);

  const toggleCategory = (category: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  const groupedFunctions = API_FUNCTIONS.reduce((acc, fn) => {
    if (!acc[fn.category]) {
      acc[fn.category] = [];
    }
    acc[fn.category].push(fn);
    return acc;
  }, {} as Record<string, ApiFunction[]>);

  return (
    <div className={cn('glass-card rounded-xl overflow-hidden', className)}>
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium text-text">脚本 API 文档</span>
        </div>
      </div>

      <div className="max-h-80 overflow-y-auto">
        <div className="px-4 py-3 border-b border-border">
          <button
            onClick={() => setShowContext(!showContext)}
            className="w-full flex items-center justify-between text-left"
          >
            <span className="text-sm font-medium text-text-muted">上下文变量</span>
            <ChevronDown
              className={cn('w-4 h-4 text-text-muted transition-transform', showContext && 'rotate-180')}
            />
          </button>
          <AnimatePresence>
            {showContext && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="pt-3 space-y-2">
                  {CONTEXT_VARIABLES.map((variable) => (
                    <div key={variable.name} className="pl-2 border-l-2 border-primary/30">
                      <code className="text-sm text-api font-mono">{variable.name}</code>
                      <p className="text-xs text-text-muted mt-1">{variable.description}</p>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {Object.entries(groupedFunctions).map(([category, functions]) => (
          <div key={category} className="border-b border-border last:border-b-0">
            <button
              onClick={() => toggleCategory(category)}
              className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-surface-hover transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="text-primary">{categoryIcons[category]}</span>
                <span className="text-sm font-medium text-text">{categoryNames[category]}</span>
                <span className="text-xs text-text-muted">({functions.length})</span>
              </div>
              <ChevronDown
                className={cn(
                  'w-4 h-4 text-text-muted transition-transform',
                  expandedCategories.has(category) && 'rotate-180'
                )}
              />
            </button>
            <AnimatePresence>
              {expandedCategories.has(category) && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="px-4 pb-3 space-y-2">
                    {functions.map((fn) => (
                      <div
                        key={fn.name}
                        className="p-3 rounded-lg bg-surface-hover/50 border border-border/50"
                      >
                        <code className="text-sm font-mono">
                          <span className="text-api">{fn.name}</span>
                          <span className="text-text-muted">
                            {fn.signature.slice(fn.name.length)}
                          </span>
                        </code>
                        <p className="text-xs text-text-muted mt-1">{fn.description}</p>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>
    </div>
  );
}
