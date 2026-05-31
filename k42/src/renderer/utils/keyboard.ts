import { formatKeys, actionToString } from '@shared/index';
import type { KeyboardAction } from '@shared/index';

export const MODIFIER_KEYS = new Set([
  'Control',
  'Shift',
  'Alt',
  'Meta',
  'ControlLeft',
  'ControlRight',
  'ShiftLeft',
  'ShiftRight',
  'AltLeft',
  'AltRight',
  'MetaLeft',
  'MetaRight',
]);

export const KEY_DISPLAY_MAP: Record<string, string> = {
  Control: 'Ctrl',
  Meta: 'Win',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Escape: 'Esc',
  Delete: 'Del',
  Backspace: '⌫',
  Enter: '↵',
  Tab: '⇥',
  Space: '空格',
  CapsLock: 'Caps',
  NumLock: 'Num',
  ScrollLock: 'Scroll',
  Insert: 'Ins',
  Home: '⇱',
  End: '⇲',
  PageUp: '⇞',
  PageDown: '⇟',
};

export function isModifierKey(key: string): boolean {
  return MODIFIER_KEYS.has(key);
}

export function normalizeKey(key: string): string {
  if (key.startsWith('Control')) return 'Control';
  if (key.startsWith('Shift')) return 'Shift';
  if (key.startsWith('Alt')) return 'Alt';
  if (key.startsWith('Meta')) return 'Meta';
  return key;
}

export function getKeyDisplay(key: string): string {
  const normalized = normalizeKey(key);
  return KEY_DISPLAY_MAP[normalized] || normalized;
}

export function eventToKeys(e: KeyboardEvent): string[] {
  const keys: string[] = [];

  if (e.ctrlKey) keys.push('Control');
  if (e.shiftKey) keys.push('Shift');
  if (e.altKey) keys.push('Alt');
  if (e.metaKey) keys.push('Meta');

  if (!isModifierKey(e.key)) {
    keys.push(e.key.length === 1 ? e.key.toUpperCase() : e.key);
  }

  return [...new Set(keys)];
}

export function sortKeys(keys: string[]): string[] {
  const modifierOrder = ['Control', 'Shift', 'Alt', 'Meta'];
  const modifiers: string[] = [];
  const others: string[] = [];

  for (const key of keys) {
    const normalized = normalizeKey(key);
    if (modifierOrder.includes(normalized)) {
      modifiers.push(normalized);
    } else {
      others.push(key);
    }
  }

  modifiers.sort((a, b) => modifierOrder.indexOf(a) - modifierOrder.indexOf(b));
  return [...modifiers, ...others];
}

export function areKeysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = sortKeys(a.map(normalizeKey));
  const sortedB = sortKeys(b.map(normalizeKey));
  return sortedA.every((key, i) => key === sortedB[i]);
}

export function keysToDisplay(keys: string[]): string {
  const sorted = sortKeys(keys);
  return formatKeys(sorted.map(getKeyDisplay));
}

export function createKeyboardAction(keys: string[], hold = false, duration?: number): KeyboardAction {
  return {
    type: 'keyboard',
    keys: sortKeys(keys.map(normalizeKey)),
    hold,
    duration,
  };
}

export { formatKeys, actionToString };
