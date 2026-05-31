export type ModifierKey = 'ctrl' | 'shift' | 'alt' | 'meta';

export type MouseButton = 'left' | 'right' | 'middle';

export type ScrollDirection = 'up' | 'down' | 'left' | 'right';

export interface Point {
  x: number;
  y: number;
}

export interface KeyboardSimulateOptions {
  hold?: boolean;
  duration?: number;
}

export interface MouseClickOptions {
  doubleClick?: boolean;
}

export interface MouseDragOptions {
  duration?: number;
}

export const MODIFIER_KEY_MAP: Record<ModifierKey, string> = {
  ctrl: 'LeftControl',
  shift: 'LeftShift',
  alt: 'LeftAlt',
  meta: 'LeftCmd',
};

export const MOUSE_BUTTON_MAP: Record<MouseButton, 'left' | 'right' | 'middle'> = {
  left: 'left',
  right: 'right',
  middle: 'middle',
};

export const SPECIAL_KEY_MAP: Record<string, string> = {
  enter: 'Enter',
  return: 'Return',
  escape: 'Escape',
  esc: 'Escape',
  space: 'Space',
  tab: 'Tab',
  backspace: 'Backspace',
  delete: 'Delete',
  del: 'Delete',
  arrowup: 'Up',
  arrowdown: 'Down',
  arrowleft: 'Left',
  arrowright: 'Right',
  up: 'Up',
  down: 'Down',
  left: 'Left',
  right: 'Right',
  home: 'Home',
  end: 'End',
  pageup: 'PageUp',
  pagedown: 'PageDown',
  f1: 'F1',
  f2: 'F2',
  f3: 'F3',
  f4: 'F4',
  f5: 'F5',
  f6: 'F6',
  f7: 'F7',
  f8: 'F8',
  f9: 'F9',
  f10: 'F10',
  f11: 'F11',
  f12: 'F12',
  f13: 'F13',
  f14: 'F14',
  f15: 'F15',
  f16: 'F16',
  f17: 'F17',
  f18: 'F18',
  f19: 'F19',
  f20: 'F20',
  f21: 'F21',
  f22: 'F22',
  f23: 'F23',
  f24: 'F24',
  capslock: 'CapsLock',
  numlock: 'NumLock',
  scrolllock: 'ScrollLock',
  insert: 'Insert',
  ins: 'Insert',
  printscreen: 'Print',
  print: 'Print',
  pause: 'Pause',
  menu: 'Menu',
  'super': 'LeftSuper',
  'win': 'LeftWin',
  'windows': 'LeftWin',
  'cmd': 'LeftCmd',
  'command': 'LeftCmd',
  'control': 'LeftControl',
  'ctrl': 'LeftControl',
  'alt': 'LeftAlt',
  'option': 'LeftAlt',
  'shift': 'LeftShift',
  'lctrl': 'LeftControl',
  'rctrl': 'RightControl',
  'lalt': 'LeftAlt',
  'ralt': 'RightAlt',
  'lshift': 'LeftShift',
  'rshift': 'RightShift',
  'lwin': 'LeftWin',
  'rwin': 'RightWin',
  'lcmd': 'LeftCmd',
  'rcmd': 'RightCmd',
  'num0': 'Num0',
  'num1': 'Num1',
  'num2': 'Num2',
  'num3': 'Num3',
  'num4': 'Num4',
  'num5': 'Num5',
  'num6': 'Num6',
  'num7': 'Num7',
  'num8': 'Num8',
  'num9': 'Num9',
  'numpad0': 'NumPad0',
  'numpad1': 'NumPad1',
  'numpad2': 'NumPad2',
  'numpad3': 'NumPad3',
  'numpad4': 'NumPad4',
  'numpad5': 'NumPad5',
  'numpad6': 'NumPad6',
  'numpad7': 'NumPad7',
  'numpad8': 'NumPad8',
  'numpad9': 'NumPad9',
  'numpadenter': 'Enter',
  'numpadadd': 'Add',
  'numpadsubtract': 'Subtract',
  'numpadmultiply': 'Multiply',
  'numpaddivide': 'Divide',
  'numpaddecimal': 'Decimal',
  'grave': 'Grave',
  'backtick': 'Grave',
  'minus': 'Minus',
  'dash': 'Minus',
  'equal': 'Equal',
  'equals': 'Equal',
  'leftbracket': 'LeftBracket',
  'rightbracket': 'RightBracket',
  'backslash': 'Backslash',
  'semicolon': 'Semicolon',
  'quote': 'Quote',
  'comma': 'Comma',
  'period': 'Period',
  'dot': 'Period',
  'slash': 'Slash',
  'audiomute': 'AudioMute',
  'audiovoldown': 'AudioVolDown',
  'volumedown': 'AudioVolDown',
  'audiovolup': 'AudioVolUp',
  'volumeup': 'AudioVolUp',
  'audioplay': 'AudioPlay',
  'play': 'AudioPlay',
  'audiostop': 'AudioStop',
  'stop': 'AudioStop',
  'audiopause': 'AudioPause',
  'audioprev': 'AudioPrev',
  'previoustrack': 'AudioPrev',
  'audionext': 'AudioNext',
  'nexttrack': 'AudioNext',
  'audiorewind': 'AudioRewind',
  'audioforward': 'AudioForward',
  'audiorepeat': 'AudioRepeat',
  'audiorandom': 'AudioRandom',
  'fn': 'Fn',
};

export function isModifierKey(key: string): key is ModifierKey {
  return ['ctrl', 'shift', 'alt', 'meta'].includes(key.toLowerCase());
}

export function normalizeKey(key: string): string {
  const lowerKey = key.toLowerCase();
  if (SPECIAL_KEY_MAP[lowerKey]) {
    return SPECIAL_KEY_MAP[lowerKey];
  }
  if (lowerKey.length === 1) {
    return lowerKey;
  }
  return key;
}

export function extractModifiers(keys: string[]): { modifiers: ModifierKey[]; regularKeys: string[] } {
  const modifiers: ModifierKey[] = [];
  const regularKeys: string[] = [];

  for (const key of keys) {
    const lowerKey = key.toLowerCase();
    if (isModifierKey(lowerKey)) {
      if (!modifiers.includes(lowerKey as ModifierKey)) {
        modifiers.push(lowerKey as ModifierKey);
      }
    } else {
      regularKeys.push(key);
    }
  }

  return { modifiers, regularKeys };
}
