import { useState, useMemo, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, CheckCircle, XCircle, Code, Play } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SCRIPT_EXAMPLES } from '../../../shared/index.js';

interface ScriptEditorProps {
  value: string;
  onChange: (code: string) => void;
  mode?: 'condition' | 'action';
  minHeight?: string;
  showExamples?: boolean;
  error?: string | null;
  onValidate?: (code: string) => void;
  className?: string;
}

const KEYWORDS = [
  'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue',
  'return', 'function', 'const', 'let', 'var', 'new', 'this', 'async', 'await',
  'true', 'false', 'null', 'undefined', 'typeof', 'instanceof', 'in', 'of',
  'throw', 'try', 'catch', 'finally', 'class', 'extends', 'import', 'export',
  'default', 'from', 'as'
];

const API_FUNCTIONS = [
  'log', 'getNoteName', 'delay', 'press', 'click', 'scroll', 'drag',
  'getState', 'setState', 'getCounter', 'setCounter', 'increment',
  'decrement', 'resetCounter', 'getTimeSinceLast'
];

export default function ScriptEditor({
  value,
  onChange,
  mode = 'action',
  minHeight = '200px',
  showExamples = true,
  error,
  onValidate,
  className,
}: ScriptEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const preRef = useRef<HTMLPreElement>(null);
  const [showExampleDropdown, setShowExampleDropdown] = useState(false);
  const [validationResult, setValidationResult] = useState<{ valid: boolean; message?: string } | null>(null);

  const lines = useMemo(() => value.split('\n'), [value]);

  const highlightedCode = useMemo(() => {
    let result = value;

    result = result.replace(/\/\/.*$/gm, '<span class="text-comment">//$&</span>');
    result = result.replace(/\/\*[\s\S]*?\*\//g, '<span class="text-comment">/*$&*/</span>');
    result = result.replace(/(["'`])(?:(?!\1)[^\\]|\\.)*\1/g, '<span class="text-string">$&</span>');
    result = result.replace(/\b(\d+\.?\d*)\b/g, '<span class="text-number">$1</span>');

    KEYWORDS.forEach(keyword => {
      const regex = new RegExp(`\\b(${keyword})\\b(?![^<]*>)`, 'g');
      result = result.replace(regex, '<span class="text-keyword">$1</span>');
    });

    API_FUNCTIONS.forEach(func => {
      const regex = new RegExp(`\\b(${func})\\s*\\((?![^<]*>)`, 'g');
      result = result.replace(regex, '<span class="text-api">$1</span>(');
    });

    result = result.replace(/\b(message|trigger|state|counter|lastTrigger)\b(?![^<]*>)/g, '<span class="text-context">$1</span>');

    return result;
  }, [value]);

  const handleScroll = () => {
    if (textareaRef.current && preRef.current) {
      preRef.current.scrollTop = textareaRef.current.scrollTop;
      preRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  };

  const handleValidate = () => {
    try {
      new Function(value);
      setValidationResult({ valid: true, message: '语法正确' });
    } catch (e) {
      setValidationResult({ valid: false, message: (e as Error).message });
    }
    onValidate?.(value);
  };

  const handleExampleSelect = (example: typeof SCRIPT_EXAMPLES[0]) => {
    onChange(example.code);
    setShowExampleDropdown(false);
  };

  const filteredExamples = useMemo(() => {
    return SCRIPT_EXAMPLES.filter(ex => ex.category === mode || ex.category === 'advanced');
  }, [mode]);

  useEffect(() => {
    setValidationResult(null);
  }, [value]);

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Code className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium text-text">
            {mode === 'condition' ? '条件脚本' : '动作脚本'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {showExamples && (
            <div className="relative">
              <button
                onClick={() => setShowExampleDropdown(!showExampleDropdown)}
                className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg bg-surface hover:bg-surface-hover text-text-muted hover:text-text transition-colors"
              >
                示例代码
                <ChevronDown className={cn('w-3 h-3 transition-transform', showExampleDropdown && 'rotate-180')} />
              </button>
              <AnimatePresence>
                {showExampleDropdown && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="absolute right-0 top-full mt-1 w-64 max-h-64 overflow-y-auto glass-card rounded-lg shadow-xl z-10"
                  >
                    {filteredExamples.map((example, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleExampleSelect(example)}
                        className="w-full text-left px-3 py-2 hover:bg-surface-hover transition-colors border-b border-border last:border-b-0"
                      >
                        <div className="text-sm font-medium text-text">{example.name}</div>
                        <div className="text-xs text-text-muted">{example.description}</div>
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
          <button
            onClick={handleValidate}
            className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg bg-primary/20 hover:bg-primary/30 text-primary transition-colors"
          >
            <Play className="w-3 h-3" />
            验证
          </button>
        </div>
      </div>

      <div
        className="relative font-mono text-sm rounded-xl overflow-hidden border border-border bg-surface"
        style={{ minHeight }}
      >
        <div className="flex h-full" style={{ minHeight }}>
          <div className="flex-shrink-0 py-3 px-2 bg-surface/50 border-r border-border text-right select-none">
            {lines.map((_, idx) => (
              <div key={idx} className="leading-6 text-text-muted text-xs">
                {idx + 1}
              </div>
            ))}
          </div>

          <div className="flex-1 relative">
            <pre
              ref={preRef}
              className="absolute inset-0 p-3 m-0 overflow-auto leading-6 pointer-events-none"
              style={{ minHeight }}
              aria-hidden="true"
            >
              <code
                className="block"
                dangerouslySetInnerHTML={{ __html: highlightedCode + '\n' }}
              />
            </pre>
            <textarea
              ref={textareaRef}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onScroll={handleScroll}
              className="absolute inset-0 w-full h-full p-3 m-0 font-mono text-sm leading-6 bg-transparent text-transparent caret-primary resize-none focus:outline-none"
              style={{ minHeight }}
              spellCheck={false}
              placeholder={mode === 'condition' ? '// 输入条件脚本，返回 true 或 false\n// 例如: return message.velocity > 100' : '// 输入动作脚本\n// 例如: await press(["ctrl", "c"])'}
            />
          </div>
        </div>
      </div>

      <AnimatePresence>
        {(error || validationResult) && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className={cn(
              'flex items-start gap-2 p-3 rounded-lg text-sm overflow-hidden',
              error || validationResult?.valid === false
                ? 'bg-red-500/10 border border-red-500/30'
                : 'bg-green-500/10 border border-green-500/30'
            )}
          >
            {error || validationResult?.valid === false ? (
              <XCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
            ) : (
              <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
            )}
            <span className={error || validationResult?.valid === false ? 'text-red-400' : 'text-green-400'}>
              {error || validationResult?.message}
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
