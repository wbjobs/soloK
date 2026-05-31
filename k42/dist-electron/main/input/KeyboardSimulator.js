import { keyboard, Key } from '@nut-tree/nut-js';
import { MODIFIER_KEY_MAP, normalizeKey, extractModifiers, } from './types';
export class KeyboardSimulator {
    pressedKeys = new Set();
    constructor() {
        keyboard.config.autoDelayMs = 10;
    }
    keyToEnum(keyName) {
        const normalized = normalizeKey(keyName);
        const enumKey = Key[normalized];
        if (enumKey !== undefined) {
            return enumKey;
        }
        return normalized;
    }
    getModifierKeys(modifiers) {
        return modifiers.map(mod => {
            const keyName = MODIFIER_KEY_MAP[mod];
            return Key[keyName];
        }).filter((k) => k !== undefined);
    }
    async simulate(action) {
        const { keys, hold = false, duration = 0 } = action;
        await this.simulateKeys(keys, { hold, duration });
    }
    async simulateKeys(keys, options = {}) {
        const { hold = false, duration = 0 } = options;
        const { modifiers, regularKeys } = extractModifiers(keys);
        const modifierKeys = this.getModifierKeys(modifiers);
        const keysToPress = [];
        keysToPress.push(...modifierKeys);
        for (const key of regularKeys) {
            const keyEnum = this.keyToEnum(key);
            keysToPress.push(keyEnum);
        }
        if (hold) {
            await this.holdKeys(keysToPress, duration);
        }
        else {
            await this.pressAndRelease(keysToPress);
        }
    }
    async pressAndRelease(keys) {
        const nutKeys = keys.filter((k) => typeof k === 'number');
        const stringKeys = keys.filter((k) => typeof k === 'string');
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
    async holdKeys(keys, duration) {
        const nutKeys = keys.filter((k) => typeof k === 'number');
        const stringKeys = keys.filter((k) => typeof k === 'string');
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
    async releaseKeys(keys) {
        const nutKeys = keys.filter((k) => typeof k === 'number');
        if (nutKeys.length > 0) {
            await keyboard.releaseKey(...nutKeys.slice().reverse());
            for (const key of nutKeys) {
                this.pressedKeys.delete(Key[key]);
            }
        }
    }
    async releaseAllKeys() {
        for (const keyName of Array.from(this.pressedKeys)) {
            const keyEnum = Key[keyName];
            if (keyEnum !== undefined) {
                await keyboard.releaseKey(keyEnum);
            }
        }
        this.pressedKeys.clear();
    }
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    setAutoDelay(delayMs) {
        keyboard.config.autoDelayMs = delayMs;
    }
}
