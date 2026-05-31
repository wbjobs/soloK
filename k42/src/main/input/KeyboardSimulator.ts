import { keyboard, Key } from '@nut-tree/nut-js';
import type { KeyboardAction } from '../../shared/index';
import {
  type ModifierKey,
  type KeyboardSimulateOptions,
  MODIFIER_KEY_MAP,
  normalizeKey,
  extractModifiers,
} from './types';

export class KeyboardSimulator {
  private pressedKeys: Set<string> = new Set();

  constructor() {
    keyboard.config.autoDelayMs = 10;
  }

  private keyToEnum(keyName: string): Key | string {
    const normalized = normalizeKey(keyName);
    const enumKey = Key[normalized as keyof typeof Key];
    if (enumKey !== undefined) {
      return enumKey;
    }
    return normalized;
  }

  private getModifierKeys(modifiers: ModifierKey[]): Key[] {
    return modifiers.map(mod => {
      const keyName = MODIFIER_KEY_MAP[mod];
      return Key[keyName as keyof typeof Key];
    }).filter((k): k is Key => k !== undefined);
  }

  async simulate(action: KeyboardAction): Promise<void> {
    const { keys, hold = false, duration = 0 } = action;
    await this.simulateKeys(keys, { hold, duration });
  }

  async simulateKeys(keys: string[], options: KeyboardSimulateOptions = {}): Promise<void> {
    const { hold = false, duration = 0 } = options;
    const { modifiers, regularKeys } = extractModifiers(keys);
    const modifierKeys = this.getModifierKeys(modifiers);

    const keysToPress: (Key | string)[] = [];
    keysToPress.push(...modifierKeys);

    for (const key of regularKeys) {
      const keyEnum = this.keyToEnum(key);
      keysToPress.push(keyEnum);
    }

    if (hold) {
      await this.holdKeys(keysToPress, duration);
    } else {
      await this.pressAndRelease(keysToPress);
    }
  }

  private async pressAndRelease(keys: (Key | string)[]): Promise<void> {
    const nutKeys = keys.filter((k): k is Key => typeof k === 'number');
    const stringKeys = keys.filter((k): k is string => typeof k === 'string');

    if (nutKeys.length > 0) {
      await keyboard.pressKey(...nutKeys);
      await keyboard.releaseKey(...nutKeys.slice().reverse());
    }

    if (stringKeys.length > 0) {
      for (const key of stringKeys) {
        await keyboard.type(key);
      }
    }
  }

  private async holdKeys(keys: (Key | string)[], duration: number): Promise<void> {
    const nutKeys = keys.filter((k): k is Key => typeof k === 'number');
    const stringKeys = keys.filter((k): k is string => typeof k === 'string');

    if (nutKeys.length > 0) {
      await keyboard.pressKey(...nutKeys);
      for (const key of nutKeys) {
        this.pressedKeys.add(Key[key]);
      }
    }

    if (stringKeys.length > 0) {
      for (const key of stringKeys) {
        await keyboard.type(key);
      }
    }

    if (duration > 0) {
      await this.sleep(duration);
      await this.releaseKeys(keys);
    }
  }

  async releaseKeys(keys: (Key | string)[]): Promise<void> {
    const nutKeys = keys.filter((k): k is Key => typeof k === 'number');
    if (nutKeys.length > 0) {
      await keyboard.releaseKey(...nutKeys.slice().reverse());
      for (const key of nutKeys) {
        this.pressedKeys.delete(Key[key]);
      }
    }
  }

  async releaseAllKeys(): Promise<void> {
    for (const keyName of Array.from(this.pressedKeys)) {
      const keyEnum = Key[keyName as keyof typeof Key];
      if (keyEnum !== undefined) {
        await keyboard.releaseKey(keyEnum);
      }
    }
    this.pressedKeys.clear();
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  setAutoDelay(delayMs: number): void {
    keyboard.config.autoDelayMs = delayMs;
  }
}
