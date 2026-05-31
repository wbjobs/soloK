export interface MidiMessage {
  status: number;
  channel: number;
  type: 'noteOn' | 'noteOff' | 'cc' | 'pitchBend' | 'aftertouch' | 'programChange';
  note?: number;
  velocity?: number;
  controlNumber?: number;
  controlValue?: number;
  pitchBendValue?: number;
  timestamp: number;
  deviceId: string;
  deviceName?: string;
}

export interface MidiDevice {
  id: string;
  name: string;
  manufacturer?: string;
  connected: boolean;
}

export type ActionType = 'keyboard' | 'mouseClick' | 'mouseDrag' | 'mouseScroll' | 'script';

export interface KeyboardAction {
  type: 'keyboard';
  keys: string[];
  hold?: boolean;
  duration?: number;
}

export interface MouseClickAction {
  type: 'mouseClick';
  button: 'left' | 'right' | 'middle';
  x?: number;
  y?: number;
  doubleClick?: boolean;
}

export interface MouseDragAction {
  type: 'mouseDrag';
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  button: 'left' | 'right' | 'middle';
  duration?: number;
}

export interface MouseScrollAction {
  type: 'mouseScroll';
  direction: 'up' | 'down' | 'left' | 'right';
  amount: number;
}

export interface ScriptAction {
  type: 'script';
  code: string;
  timeout?: number;
}

export type Action = KeyboardAction | MouseClickAction | MouseDragAction | MouseScrollAction | ScriptAction;

export interface ScriptContext {
  message: MidiMessage;
  trigger: MidiTrigger;
  state: Record<string, unknown>;
  counter: Record<string, number>;
  lastTrigger: Record<string, number>;
}

export interface ScriptAPI {
  log: (...args: unknown[]) => void;
  getNoteName: (note: number) => string;
  delay: (ms: number) => Promise<void>;
  press: (keys: string | string[]) => Promise<void>;
  click: (button?: 'left' | 'right' | 'middle', x?: number, y?: number) => Promise<void>;
  scroll: (direction: 'up' | 'down' | 'left' | 'right', amount: number) => Promise<void>;
  drag: (fromX: number, fromY: number, toX: number, toY: number, button?: 'left' | 'right' | 'middle') => Promise<void>;
  getState: (key: string) => unknown;
  setState: (key: string, value: unknown) => void;
  getCounter: (key: string) => number;
  setCounter: (key: string, value: number) => void;
  increment: (key: string, amount?: number) => number;
  decrement: (key: string, amount?: number) => number;
  resetCounter: (key: string) => void;
  getTimeSinceLast: (key?: string) => number;
}

export interface MidiTrigger {
  type: 'note' | 'cc' | 'pitchBend';
  channel: number;
  note?: number;
  controlNumber?: number;
  minVelocity?: number;
  maxVelocity?: number;
  threshold?: number;
  deviceId?: string;
  deviceName?: string;
}

export interface ScriptCondition {
  enabled: boolean;
  code: string;
}

export interface MappingRule {
  id: string;
  name: string;
  enabled: boolean;
  midiTrigger: MidiTrigger;
  action: Action;
  condition?: ScriptCondition;
  createdAt: number;
  updatedAt: number;
}

export interface ScriptExample {
  name: string;
  description: string;
  code: string;
  category: 'condition' | 'action' | 'advanced';
}

export interface Profile {
  id: string;
  name: string;
  description?: string;
  deviceName?: string;
  mappings: MappingRule[];
  createdAt: number;
  updatedAt: number;
}

export interface AppConfig {
  autoStart: boolean;
  minimizeToTray: boolean;
  startServiceOnLaunch: boolean;
  activeProfileId: string | null;
  selectedDeviceId: string | null;
  connectedDeviceIds: string[];
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  profiles: Profile[];
}

export interface ServiceStatus {
  running: boolean;
  deviceConnected: boolean;
  activeMappings: number;
  totalMappings: number;
  lastMessage?: MidiMessage;
  connectedDevices: MidiDevice[];
}

export interface LogEntry {
  timestamp: number;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  data?: unknown;
}

export enum IpcChannel {
  MIDI_GET_DEVICES = 'midi:get-devices',
  MIDI_SELECT_DEVICE = 'midi:select-device',
  MIDI_START_LEARN = 'midi:start-learn',
  MIDI_STOP_LEARN = 'midi:stop-learn',
  MIDI_MESSAGE_RECEIVED = 'midi:message-received',
  MIDI_LEARNED = 'midi:learned',

  SERVICE_START = 'service:start',
  SERVICE_STOP = 'service:stop',
  SERVICE_STATUS = 'service:status',
  SERVICE_STATUS_CHANGED = 'service:status-changed',

  CONFIG_GET = 'config:get',
  CONFIG_SAVE = 'config:save',

  PROFILE_CREATE = 'profile:create',
  PROFILE_DELETE = 'profile:delete',
  PROFILE_UPDATE = 'profile:update',
  PROFILE_SWITCH = 'profile:switch',
  PROFILE_EXPORT = 'profile:export',
  PROFILE_IMPORT = 'profile:import',

  MAPPING_ADD = 'mapping:add',
  MAPPING_UPDATE = 'mapping:update',
  MAPPING_DELETE = 'mapping:delete',

  ACTION_TEST = 'action:test',

  LOG_ENTRY = 'log:entry',

  APP_QUIT = 'app:quit',
  APP_MINIMIZE = 'app:minimize',
}

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function getNoteName(note: number): string {
  const octave = Math.floor(note / 12) - 1;
  const noteIndex = note % 12;
  return `${NOTE_NAMES[noteIndex]}${octave}`;
}

export function formatKeys(keys: string[]): string {
  return keys.map(k => k.charAt(0).toUpperCase() + k.slice(1)).join(' + ');
}

export function actionToString(action: Action): string {
  switch (action.type) {
    case 'keyboard':
      return `键盘: ${formatKeys(action.keys)}`;
    case 'mouseClick':
      return `点击: ${action.button}${action.x ? ` (${action.x}, ${action.y})` : ''}`;
    case 'mouseDrag':
      return `拖拽: (${action.fromX}, ${action.fromY}) → (${action.toX}, ${action.toY})`;
    case 'mouseScroll':
      return `滚动: ${action.direction} ${action.amount}`;
    case 'script':
      return `脚本: ${action.code.substring(0, 50)}${action.code.length > 50 ? '...' : ''}`;
    default:
      return '未知动作';
  }
}

export const SCRIPT_EXAMPLES: ScriptExample[] = [
  {
    name: '力度阈值判断',
    description: '当力度值大于100时触发强力度快捷键',
    category: 'condition',
    code: `// 力度大于100时返回true触发动作
if (message.velocity > 100) {
  return true;
}
return false;`
  },
  {
    name: '连续按三次触发',
    description: '500ms内连续按三次触发特殊操作',
    category: 'condition',
    code: `// 500ms内连续按3次触发
const key = \`triple_\${message.note}\`;
const count = increment(key);
const lastTime = getTimeSinceLast(key);

if (count >= 3 && lastTime < 500) {
  resetCounter(key);
  return true;
}

// 超过500ms重置计数
if (lastTime > 500) {
  setCounter(key, 1);
}
return false;`
  },
  {
    name: '交替触发',
    description: '按奇数次触发A，偶数次触发B',
    category: 'action',
    code: `// 交替触发不同快捷键
const count = increment('toggle');

if (count % 2 === 1) {
  await press(['ctrl', 'c']); // 奇数: 复制
} else {
  await press(['ctrl', 'v']); // 偶数: 粘贴
}
return true;`
  },
  {
    name: '长按时触发',
    description: '按住音符超过1秒触发',
    category: 'condition',
    code: `// noteOn时记录时间，noteOff时判断时长
const key = \`hold_\${message.note}\`;

if (message.type === 'noteOn') {
  setState(key, Date.now());
  return false;
}

if (message.type === 'noteOff') {
  const startTime = getState(key) as number;
  if (startTime && Date.now() - startTime > 1000) {
    return true; // 按住超过1秒
  }
}
return false;`
  },
  {
    name: 'CC值范围判断',
    description: 'CC控制器值在特定范围时触发',
    category: 'condition',
    code: `// CC值在64-127范围时触发
if (message.type === 'cc') {
  if (message.controlValue >= 64) {
    return true;
  }
}
return false;`
  },
  {
    name: '力度映射到鼠标点击',
    description: '根据力度值决定点击次数',
    category: 'action',
    code: `// 力度越大点击越快
const velocity = message.velocity || 64;
const clicks = Math.floor(velocity / 32); // 1-4次点击

for (let i = 0; i < clicks; i++) {
  await click('left');
  await delay(50);
}
return true;`
  }
];

export function triggerToString(trigger: MidiTrigger): string {
  let result = '';
  if (trigger.deviceName) {
    result += `[${trigger.deviceName}] `;
  }
  if (trigger.type === 'note') {
    result += `音符 ${getNoteName(trigger.note!)} (通道 ${trigger.channel + 1})`;
  } else if (trigger.type === 'cc') {
    result += `CC ${trigger.controlNumber} (通道 ${trigger.channel + 1})`;
  } else {
    result += `弯音轮 (通道 ${trigger.channel + 1})`;
  }
  return result;
}
