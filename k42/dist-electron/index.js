var $e = Object.defineProperty;
var Fe = (o, e, t) => e in o ? $e(o, e, { enumerable: !0, configurable: !0, writable: !0, value: t }) : o[e] = t;
var h = (o, e, t) => Fe(o, typeof e != "symbol" ? e + "" : e, t);
import { app as b, ipcMain as v, dialog as de, BrowserWindow as xe, nativeImage as ke, Tray as Ue, Menu as qe } from "electron";
import { fileURLToPath as Ke } from "node:url";
import _ from "node:path";
import { Input as fe } from "@julusian/midi";
import { keyboard as P, Key as $, mouse as y, Point as Q, straightTo as he, Button as Z } from "@nut-tree/nut-js";
import I from "node:fs";
import re from "crypto";
import { createContext as Ve, runInContext as Be } from "node:vm";
import { writeFile as Ge, readFile as He } from "fs/promises";
class ze {
  constructor() {
    h(this, "input");
    h(this, "devices", /* @__PURE__ */ new Map());
    h(this, "selectedDeviceId", null);
    h(this, "pollingInterval", null);
    h(this, "eventListeners", /* @__PURE__ */ new Map());
    this.input = new fe(), this.refreshDevices();
  }
  on(e, t) {
    return this.eventListeners.has(e) || this.eventListeners.set(e, /* @__PURE__ */ new Set()), this.eventListeners.get(e).add(t), () => this.off(e, t);
  }
  off(e, t) {
    const i = this.eventListeners.get(e);
    i && i.delete(t);
  }
  emit(e, ...t) {
    const i = this.eventListeners.get(e);
    if (i)
      for (const n of i)
        try {
          n(...t);
        } catch (r) {
          this.emit("error", r instanceof Error ? r : new Error(String(r)));
        }
  }
  refreshDevices() {
    try {
      const e = this.getInputDevices(), t = new Set(e.map((i) => i.id));
      for (const i of e)
        if (!this.devices.has(i.id))
          this.devices.set(i.id, { ...i, connected: !0 }), this.emit("device-added", this.devices.get(i.id));
        else {
          const n = this.devices.get(i.id);
          n.connected || (n.connected = !0, this.emit("device-added", n));
        }
      for (const [i, n] of this.devices)
        !t.has(i) && n.connected && (n.connected = !1, this.emit("device-removed", i), this.selectedDeviceId === i && (this.selectedDeviceId = null, this.emit("device-selected", null)));
      return this.getDevices();
    } catch (e) {
      return this.emit("error", e instanceof Error ? e : new Error(String(e))), this.getDevices();
    }
  }
  getDevices() {
    return Array.from(this.devices.values());
  }
  getDeviceById(e) {
    return this.devices.get(e);
  }
  getSelectedDevice() {
    return this.selectedDeviceId ? this.devices.get(this.selectedDeviceId) ?? null : null;
  }
  selectDevice(e) {
    if (e === null)
      return this.selectedDeviceId = null, this.emit("device-selected", null), !0;
    const t = this.devices.get(e);
    return !t || !t.connected ? (this.emit("error", new Error(`Device not found or not connected: ${e}`)), !1) : (this.selectedDeviceId = e, this.emit("device-selected", t), !0);
  }
  getDeviceInput(e) {
    const t = this.getDeviceInfoById(e);
    if (!t) return null;
    try {
      const i = new fe();
      return i.openPort(t.index), i;
    } catch (i) {
      return this.emit("error", i instanceof Error ? i : new Error(String(i))), null;
    }
  }
  startMonitoring(e = 2e3) {
    this.stopMonitoring(), this.pollingInterval = setInterval(() => {
      this.refreshDevices();
    }, e);
  }
  stopMonitoring() {
    this.pollingInterval && (clearInterval(this.pollingInterval), this.pollingInterval = null);
  }
  destroy() {
    this.stopMonitoring(), this.eventListeners.clear(), this.devices.clear(), this.selectedDeviceId = null;
  }
  getInputDevices() {
    const e = this.input.getPortCount(), t = [];
    for (let i = 0; i < e; i++)
      try {
        const n = this.input.getPortName(i), r = this.generateDeviceId(i, n);
        t.push({ index: i, name: n, id: r });
      } catch {
        continue;
      }
    return t;
  }
  getDeviceInfoById(e) {
    return this.getInputDevices().find((i) => i.id === e) ?? null;
  }
  generateDeviceId(e, t) {
    return `midi-input-${e}-${t.replace(/[^a-zA-Z0-9]/g, "-")}`;
  }
}
const x = {
  NOTE_OFF: 128,
  NOTE_ON: 144,
  AFTERTOUCH: 160,
  CC: 176,
  PROGRAM_CHANGE: 192,
  PITCH_BEND: 224
}, Je = 240, je = 15;
class Ye {
  constructor() {
    h(this, "connectedDevices", /* @__PURE__ */ new Map());
    h(this, "isLearning", !1);
    h(this, "learnTimeout", null);
    h(this, "learnDeviceId", null);
    h(this, "eventListeners", /* @__PURE__ */ new Map());
  }
  on(e, t) {
    return this.eventListeners.has(e) || this.eventListeners.set(e, /* @__PURE__ */ new Set()), this.eventListeners.get(e).add(t), () => this.off(e, t);
  }
  off(e, t) {
    const i = this.eventListeners.get(e);
    i && i.delete(t);
  }
  emit(e, ...t) {
    const i = this.eventListeners.get(e);
    if (i)
      for (const n of i)
        try {
          n(...t);
        } catch (r) {
          this.emit("error", r instanceof Error ? r : new Error(String(r)));
        }
  }
  connect(e, t) {
    try {
      return this.connectedDevices.has(e.id) && this.disconnectDevice(e.id), t.ignoreTypes(!1, !1, !1), t.on("message", this.createMidiMessageHandler(e)), this.connectedDevices.set(e.id, { device: e, input: t }), this.emit("device-connected", e), !0;
    } catch (i) {
      return this.emit("error", i instanceof Error ? i : new Error(String(i))), !1;
    }
  }
  disconnectDevice(e) {
    const t = this.connectedDevices.get(e);
    if (t) {
      try {
        t.input.removeAllListeners("message"), t.input.closePort();
      } catch {
      }
      this.connectedDevices.delete(e), this.emit("device-disconnected", e), this.learnDeviceId === e && this.stopLearn();
    }
  }
  disconnect() {
    this.stopLearn();
    for (const e of this.connectedDevices.keys())
      this.disconnectDevice(e);
  }
  getConnectedDevices() {
    return Array.from(this.connectedDevices.values()).map((e) => e.device);
  }
  isDeviceConnected(e) {
    return this.connectedDevices.has(e);
  }
  startLearn(e = 5e3, t) {
    this.isLearning && this.stopLearn(), this.isLearning = !0, this.learnDeviceId = t || null, e > 0 && (this.learnTimeout = setTimeout(() => {
      this.stopLearn();
    }, e));
  }
  stopLearn() {
    this.isLearning = !1, this.learnDeviceId = null, this.learnTimeout && (clearTimeout(this.learnTimeout), this.learnTimeout = null);
  }
  isInLearnMode() {
    return this.isLearning;
  }
  getLearnDeviceId() {
    return this.learnDeviceId;
  }
  destroy() {
    this.disconnect(), this.eventListeners.clear();
  }
  createMidiMessageHandler(e) {
    return (t, i) => {
      try {
        if (i.length < 1) return;
        const n = this.parseMidiMessage(i, t, e);
        if (!n) return;
        this.emit("message", n), this.isLearning && (!this.learnDeviceId || this.learnDeviceId === e.id) && (this.emit("learned", n), this.stopLearn());
      } catch (n) {
        this.emit("error", n instanceof Error ? n : new Error(String(n)));
      }
    };
  }
  parseMidiMessage(e, t, i) {
    const n = e[0], r = n & Je, s = n & je, a = Date.now();
    switch (r) {
      case x.NOTE_ON: {
        if (e.length < 3) return null;
        const l = e[1], c = e[2];
        return c === 0 ? {
          status: n,
          channel: s,
          type: "noteOff",
          note: l,
          velocity: 0,
          timestamp: a,
          deviceId: i.id,
          deviceName: i.name
        } : {
          status: n,
          channel: s,
          type: "noteOn",
          note: l,
          velocity: c,
          timestamp: a,
          deviceId: i.id,
          deviceName: i.name
        };
      }
      case x.NOTE_OFF:
        return e.length < 3 ? null : {
          status: n,
          channel: s,
          type: "noteOff",
          note: e[1],
          velocity: e[2],
          timestamp: a,
          deviceId: i.id,
          deviceName: i.name
        };
      case x.CC:
        return e.length < 3 ? null : {
          status: n,
          channel: s,
          type: "cc",
          controlNumber: e[1],
          controlValue: e[2],
          timestamp: a,
          deviceId: i.id,
          deviceName: i.name
        };
      case x.PITCH_BEND: {
        if (e.length < 3) return null;
        const l = e[2] << 7 | e[1];
        return {
          status: n,
          channel: s,
          type: "pitchBend",
          pitchBendValue: l,
          timestamp: a,
          deviceId: i.id,
          deviceName: i.name
        };
      }
      case x.AFTERTOUCH:
        return e.length < 3 ? null : {
          status: n,
          channel: s,
          type: "aftertouch",
          note: e[1],
          velocity: e[2],
          timestamp: a,
          deviceId: i.id,
          deviceName: i.name
        };
      case x.PROGRAM_CHANGE:
        return e.length < 2 ? null : {
          status: n,
          channel: s,
          type: "programChange",
          controlNumber: e[1],
          timestamp: a,
          deviceId: i.id,
          deviceName: i.name
        };
      default:
        return null;
    }
  }
}
class Xe {
  constructor(e, t) {
    h(this, "deviceManager");
    h(this, "midiListener");
    h(this, "messageUnsubscribe", null);
    h(this, "learnUnsubscribe", null);
    this.deviceManager = e, this.midiListener = t;
  }
  async getDevices() {
    return this.deviceManager.getDevices();
  }
  async connectDevice(e) {
    const t = this.deviceManager.getDeviceById(e);
    if (!t)
      return !1;
    const i = this.deviceManager.getDeviceInput(e);
    return i ? this.midiListener.connect(t, i) : !1;
  }
  async disconnectDevice(e) {
    this.midiListener.disconnectDevice(e);
  }
  async disconnectAll() {
    this.midiListener.disconnect();
  }
  getConnectedDevices() {
    return this.midiListener.getConnectedDevices();
  }
  isDeviceConnected(e) {
    return this.midiListener.isDeviceConnected(e);
  }
  onMessage(e) {
    return this.midiListener.on("message", e);
  }
  async start() {
    this.deviceManager.startMonitoring();
  }
  async stop() {
    this.midiListener.disconnect(), this.deviceManager.stopMonitoring();
  }
  isRunning() {
    return this.midiListener.getConnectedDevices().length > 0;
  }
  startLearn(e = 5e3, t) {
    this.midiListener.startLearn(e, t);
  }
  stopLearn() {
    this.midiListener.stopLearn();
  }
  isInLearnMode() {
    return this.midiListener.isInLearnMode();
  }
  onLearn(e) {
    return this.midiListener.on("learned", e);
  }
}
const Qe = {
  ctrl: "LeftControl",
  shift: "LeftShift",
  alt: "LeftAlt",
  meta: "LeftCmd"
}, Ze = {
  left: "left",
  right: "right",
  middle: "middle"
}, ge = {
  enter: "Enter",
  return: "Return",
  escape: "Escape",
  esc: "Escape",
  space: "Space",
  tab: "Tab",
  backspace: "Backspace",
  delete: "Delete",
  del: "Delete",
  arrowup: "Up",
  arrowdown: "Down",
  arrowleft: "Left",
  arrowright: "Right",
  up: "Up",
  down: "Down",
  left: "Left",
  right: "Right",
  home: "Home",
  end: "End",
  pageup: "PageUp",
  pagedown: "PageDown",
  f1: "F1",
  f2: "F2",
  f3: "F3",
  f4: "F4",
  f5: "F5",
  f6: "F6",
  f7: "F7",
  f8: "F8",
  f9: "F9",
  f10: "F10",
  f11: "F11",
  f12: "F12",
  f13: "F13",
  f14: "F14",
  f15: "F15",
  f16: "F16",
  f17: "F17",
  f18: "F18",
  f19: "F19",
  f20: "F20",
  f21: "F21",
  f22: "F22",
  f23: "F23",
  f24: "F24",
  capslock: "CapsLock",
  numlock: "NumLock",
  scrolllock: "ScrollLock",
  insert: "Insert",
  ins: "Insert",
  printscreen: "Print",
  print: "Print",
  pause: "Pause",
  menu: "Menu",
  super: "LeftSuper",
  win: "LeftWin",
  windows: "LeftWin",
  cmd: "LeftCmd",
  command: "LeftCmd",
  control: "LeftControl",
  ctrl: "LeftControl",
  alt: "LeftAlt",
  option: "LeftAlt",
  shift: "LeftShift",
  lctrl: "LeftControl",
  rctrl: "RightControl",
  lalt: "LeftAlt",
  ralt: "RightAlt",
  lshift: "LeftShift",
  rshift: "RightShift",
  lwin: "LeftWin",
  rwin: "RightWin",
  lcmd: "LeftCmd",
  rcmd: "RightCmd",
  num0: "Num0",
  num1: "Num1",
  num2: "Num2",
  num3: "Num3",
  num4: "Num4",
  num5: "Num5",
  num6: "Num6",
  num7: "Num7",
  num8: "Num8",
  num9: "Num9",
  numpad0: "NumPad0",
  numpad1: "NumPad1",
  numpad2: "NumPad2",
  numpad3: "NumPad3",
  numpad4: "NumPad4",
  numpad5: "NumPad5",
  numpad6: "NumPad6",
  numpad7: "NumPad7",
  numpad8: "NumPad8",
  numpad9: "NumPad9",
  numpadenter: "Enter",
  numpadadd: "Add",
  numpadsubtract: "Subtract",
  numpadmultiply: "Multiply",
  numpaddivide: "Divide",
  numpaddecimal: "Decimal",
  grave: "Grave",
  backtick: "Grave",
  minus: "Minus",
  dash: "Minus",
  equal: "Equal",
  equals: "Equal",
  leftbracket: "LeftBracket",
  rightbracket: "RightBracket",
  backslash: "Backslash",
  semicolon: "Semicolon",
  quote: "Quote",
  comma: "Comma",
  period: "Period",
  dot: "Period",
  slash: "Slash",
  audiomute: "AudioMute",
  audiovoldown: "AudioVolDown",
  volumedown: "AudioVolDown",
  audiovolup: "AudioVolUp",
  volumeup: "AudioVolUp",
  audioplay: "AudioPlay",
  play: "AudioPlay",
  audiostop: "AudioStop",
  stop: "AudioStop",
  audiopause: "AudioPause",
  audioprev: "AudioPrev",
  previoustrack: "AudioPrev",
  audionext: "AudioNext",
  nexttrack: "AudioNext",
  audiorewind: "AudioRewind",
  audioforward: "AudioForward",
  audiorepeat: "AudioRepeat",
  audiorandom: "AudioRandom",
  fn: "Fn"
};
function We(o) {
  return ["ctrl", "shift", "alt", "meta"].includes(o.toLowerCase());
}
function et(o) {
  const e = o.toLowerCase();
  return ge[e] ? ge[e] : e.length === 1 ? e : o;
}
function tt(o) {
  const e = [], t = [];
  for (const i of o) {
    const n = i.toLowerCase();
    We(n) ? e.includes(n) || e.push(n) : t.push(i);
  }
  return { modifiers: e, regularKeys: t };
}
class it {
  constructor() {
    h(this, "pressedKeys", /* @__PURE__ */ new Set());
    P.config.autoDelayMs = 10;
  }
  keyToEnum(e) {
    const t = et(e), i = $[t];
    return i !== void 0 ? i : t;
  }
  getModifierKeys(e) {
    return e.map((t) => {
      const i = Qe[t];
      return $[i];
    }).filter((t) => t !== void 0);
  }
  async simulate(e) {
    const { keys: t, hold: i = !1, duration: n = 0 } = e;
    await this.simulateKeys(t, { hold: i, duration: n });
  }
  async simulateKeys(e, t = {}) {
    const { hold: i = !1, duration: n = 0 } = t, { modifiers: r, regularKeys: s } = tt(e), a = this.getModifierKeys(r), l = [];
    l.push(...a);
    for (const c of s) {
      const d = this.keyToEnum(c);
      l.push(d);
    }
    i ? await this.holdKeys(l, n) : await this.pressAndRelease(l);
  }
  async pressAndRelease(e) {
    const t = e.filter((n) => typeof n == "number"), i = e.filter((n) => typeof n == "string");
    if (t.length > 0 && (await P.pressKey(...t), await P.releaseKey(...t.slice().reverse())), i.length > 0)
      for (const n of i)
        await P.type(n);
  }
  async holdKeys(e, t) {
    const i = e.filter((r) => typeof r == "number"), n = e.filter((r) => typeof r == "string");
    if (i.length > 0) {
      await P.pressKey(...i);
      for (const r of i)
        this.pressedKeys.add($[r]);
    }
    if (n.length > 0)
      for (const r of n)
        await P.type(r);
    t > 0 && (await this.sleep(t), await this.releaseKeys(e));
  }
  async releaseKeys(e) {
    const t = e.filter((i) => typeof i == "number");
    if (t.length > 0) {
      await P.releaseKey(...t.slice().reverse());
      for (const i of t)
        this.pressedKeys.delete($[i]);
    }
  }
  async releaseAllKeys() {
    for (const e of Array.from(this.pressedKeys)) {
      const t = $[e];
      t !== void 0 && await P.releaseKey(t);
    }
    this.pressedKeys.clear();
  }
  sleep(e) {
    return new Promise((t) => setTimeout(t, e));
  }
  setAutoDelay(e) {
    P.config.autoDelayMs = e;
  }
}
class nt {
  constructor() {
    y.config.autoDelayMs = 10, y.config.mouseSpeed = 1e3;
  }
  async simulateClick(e) {
    const { button: t, x: i, y: n, doubleClick: r = !1 } = e;
    await this.click(t, { doubleClick: r }, i, n);
  }
  async simulateDrag(e) {
    const { fromX: t, fromY: i, toX: n, toY: r, button: s, duration: a = 300 } = e;
    await this.drag({ x: t, y: i }, { x: n, y: r }, s, { duration: a });
  }
  async simulateScroll(e) {
    const { direction: t, amount: i } = e;
    await this.scroll(t, i);
  }
  async click(e, t = {}, i, n) {
    const { doubleClick: r = !1 } = t;
    i !== void 0 && n !== void 0 && await this.moveTo(i, n);
    const s = this.buttonToEnum(e);
    r ? await y.doubleClick(s) : await y.click(s);
  }
  async moveTo(e, t) {
    const i = new Q(e, t);
    await y.move(he(i));
  }
  async setPosition(e, t) {
    const i = new Q(e, t);
    await y.setPosition(i);
  }
  async getPosition() {
    const e = await y.getPosition();
    return { x: e.x, y: e.y };
  }
  async drag(e, t, i, n = {}) {
    const { duration: r } = n, s = this.buttonToEnum(i), a = new Q(e.x, e.y), l = new Q(t.x, t.y), c = y.config.mouseSpeed;
    if (r !== void 0 && r > 0) {
      const d = Math.sqrt(
        Math.pow(t.x - e.x, 2) + Math.pow(t.y - e.y, 2)
      ), g = Math.max(100, d / r * 1e3);
      y.config.mouseSpeed = g;
    }
    await y.setPosition(a), await y.pressButton(s), await y.move(he(l)), await y.releaseButton(s), y.config.mouseSpeed = c;
  }
  async scroll(e, t) {
    switch (e) {
      case "up":
        await y.scrollUp(t);
        break;
      case "down":
        await y.scrollDown(t);
        break;
      case "left":
        await y.scrollLeft(t);
        break;
      case "right":
        await y.scrollRight(t);
        break;
    }
  }
  async pressButton(e) {
    const t = this.buttonToEnum(e);
    await y.pressButton(t);
  }
  async releaseButton(e) {
    const t = this.buttonToEnum(e);
    await y.releaseButton(t);
  }
  buttonToEnum(e) {
    switch (Ze[e]) {
      case "left":
        return Z.LEFT;
      case "right":
        return Z.RIGHT;
      case "middle":
        return Z.MIDDLE;
      default:
        return Z.LEFT;
    }
  }
  setAutoDelay(e) {
    y.config.autoDelayMs = e;
  }
  setMouseSpeed(e) {
    y.config.mouseSpeed = e;
  }
}
class rt {
  constructor() {
    h(this, "keyboardSimulator");
    h(this, "mouseSimulator");
    this.keyboardSimulator = new it(), this.mouseSimulator = new nt();
  }
  async execute(e) {
    switch (e.type) {
      case "keyboard":
        await this.keyboardSimulator.simulate(e);
        break;
      case "mouseClick":
        await this.mouseSimulator.simulateClick(e);
        break;
      case "mouseDrag":
        await this.mouseSimulator.simulateDrag(e);
        break;
      case "mouseScroll":
        await this.mouseSimulator.simulateScroll(e);
        break;
      default:
        throw new Error(`Unknown action type: ${e.type}`);
    }
  }
  getKeyboardSimulator() {
    return this.keyboardSimulator;
  }
  getMouseSimulator() {
    return this.mouseSimulator;
  }
  async releaseAll() {
    await this.keyboardSimulator.releaseAllKeys();
  }
  setAutoDelay(e) {
    this.keyboardSimulator.setAutoDelay(e), this.mouseSimulator.setAutoDelay(e);
  }
  setMouseSpeed(e) {
    this.mouseSimulator.setMouseSpeed(e);
  }
}
class st {
  constructor(e) {
    h(this, "inputSimulator");
    this.inputSimulator = e;
  }
  async executeAction(e) {
    await this.inputSimulator.execute(e);
  }
  async testAction(e) {
    await this.inputSimulator.execute(e);
  }
  async pressKeys(e) {
    const t = {
      type: "keyboard",
      keys: e
    };
    await this.inputSimulator.execute(t);
  }
  async clickMouse(e = "left", t, i) {
    const n = {
      type: "mouseClick",
      button: e,
      x: t,
      y: i
    };
    await this.inputSimulator.execute(n);
  }
  async scrollMouse(e, t) {
    const i = {
      type: "mouseScroll",
      direction: e,
      amount: t
    };
    await this.inputSimulator.execute(i);
  }
  async dragMouse(e, t, i, n, r = "left") {
    const s = {
      type: "mouseDrag",
      fromX: e,
      fromY: t,
      toX: i,
      toY: n,
      button: r
    };
    await this.inputSimulator.execute(s);
  }
}
const L = class L {
  constructor(e = {}) {
    h(this, "filePath");
    h(this, "config", null);
    h(this, "listeners", /* @__PURE__ */ new Map());
    const t = e.fileName ?? "config.json", i = e.userDataPath ?? b.getPath("userData");
    this.filePath = _.join(i, t);
  }
  static getInstance(e) {
    return L.instance || (L.instance = new L(e)), L.instance;
  }
  getFilePath() {
    return this.filePath;
  }
  async load() {
    try {
      if (I.existsSync(this.filePath)) {
        const e = await I.promises.readFile(this.filePath, "utf-8");
        this.config = JSON.parse(e), this.validateConfig(this.config);
      } else
        this.config = this.createDefaultConfig(), await this.save();
      return this.emit("config:loaded", this.config), this.config;
    } catch (e) {
      return console.error("Failed to load config:", e), this.config = this.createDefaultConfig(), this.emit("config:loaded", this.config), this.config;
    }
  }
  async save() {
    if (!this.config)
      throw new Error("Config not loaded");
    try {
      const e = _.dirname(this.filePath);
      I.existsSync(e) || await I.promises.mkdir(e, { recursive: !0 });
      const t = JSON.stringify(this.config, null, 2);
      await I.promises.writeFile(this.filePath, t, "utf-8"), this.emit("config:saved", this.config);
    } catch (e) {
      throw console.error("Failed to save config:", e), e;
    }
  }
  getConfig() {
    if (!this.config)
      throw new Error("Config not loaded");
    return this.config;
  }
  async updateConfig(e) {
    if (!this.config)
      throw new Error("Config not loaded");
    return this.config = { ...this.config, ...e }, this.emit("config:changed", this.config), await this.save(), this.config;
  }
  on(e, t) {
    return this.listeners.has(e) || this.listeners.set(e, /* @__PURE__ */ new Set()), this.listeners.get(e).add(t), () => {
      var i;
      (i = this.listeners.get(e)) == null || i.delete(t);
    };
  }
  off(e, t) {
    var i;
    (i = this.listeners.get(e)) == null || i.delete(t);
  }
  emit(e, t) {
    const i = this.listeners.get(e);
    if (i)
      for (const n of i)
        try {
          n(e, t);
        } catch (r) {
          console.error(`Error in config event listener for ${e}:`, r);
        }
  }
  createDefaultConfig() {
    return {
      autoStart: !1,
      minimizeToTray: !0,
      startServiceOnLaunch: !1,
      activeProfileId: null,
      selectedDeviceId: null,
      connectedDeviceIds: [],
      logLevel: "info",
      profiles: []
    };
  }
  validateConfig(e) {
    if (typeof e != "object" || e === null)
      throw new Error("Invalid config: not an object");
    const t = e;
    typeof t.autoStart != "boolean" && (t.autoStart = !1), typeof t.minimizeToTray != "boolean" && (t.minimizeToTray = !0), typeof t.startServiceOnLaunch != "boolean" && (t.startServiceOnLaunch = !1), t.activeProfileId !== null && typeof t.activeProfileId != "string" && (t.activeProfileId = null), t.selectedDeviceId !== null && typeof t.selectedDeviceId != "string" && (t.selectedDeviceId = null), Array.isArray(t.connectedDeviceIds) ? t.connectedDeviceIds = t.connectedDeviceIds.filter((i) => typeof i == "string") : t.connectedDeviceIds = [], ["debug", "info", "warn", "error"].includes(t.logLevel) || (t.logLevel = "info"), Array.isArray(t.profiles) || (t.profiles = []);
  }
};
h(L, "instance", null);
let O = L;
function ot(o) {
  return o && o.__esModule && Object.prototype.hasOwnProperty.call(o, "default") ? o.default : o;
}
var ae = {}, F = {}, W = {}, pe;
function Ne() {
  if (pe) return W;
  pe = 1, Object.defineProperty(W, "__esModule", {
    value: !0
  }), W.default = n;
  var o = e(re);
  function e(r) {
    return r && r.__esModule ? r : { default: r };
  }
  const t = new Uint8Array(256);
  let i = t.length;
  function n() {
    return i > t.length - 16 && (o.default.randomFillSync(t), i = 0), t.slice(i, i += 16);
  }
  return W;
}
var N = {}, k = {}, U = {}, me;
function at() {
  if (me) return U;
  me = 1, Object.defineProperty(U, "__esModule", {
    value: !0
  }), U.default = void 0;
  var o = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|00000000-0000-0000-0000-000000000000)$/i;
  return U.default = o, U;
}
var ve;
function se() {
  if (ve) return k;
  ve = 1, Object.defineProperty(k, "__esModule", {
    value: !0
  }), k.default = void 0;
  var o = e(/* @__PURE__ */ at());
  function e(n) {
    return n && n.__esModule ? n : { default: n };
  }
  function t(n) {
    return typeof n == "string" && o.default.test(n);
  }
  var i = t;
  return k.default = i, k;
}
var ye;
function oe() {
  if (ye) return N;
  ye = 1, Object.defineProperty(N, "__esModule", {
    value: !0
  }), N.default = void 0, N.unsafeStringify = i;
  var o = e(/* @__PURE__ */ se());
  function e(s) {
    return s && s.__esModule ? s : { default: s };
  }
  const t = [];
  for (let s = 0; s < 256; ++s)
    t.push((s + 256).toString(16).slice(1));
  function i(s, a = 0) {
    return t[s[a + 0]] + t[s[a + 1]] + t[s[a + 2]] + t[s[a + 3]] + "-" + t[s[a + 4]] + t[s[a + 5]] + "-" + t[s[a + 6]] + t[s[a + 7]] + "-" + t[s[a + 8]] + t[s[a + 9]] + "-" + t[s[a + 10]] + t[s[a + 11]] + t[s[a + 12]] + t[s[a + 13]] + t[s[a + 14]] + t[s[a + 15]];
  }
  function n(s, a = 0) {
    const l = i(s, a);
    if (!(0, o.default)(l))
      throw TypeError("Stringified UUID is invalid");
    return l;
  }
  var r = n;
  return N.default = r, N;
}
var we;
function ct() {
  if (we) return F;
  we = 1, Object.defineProperty(F, "__esModule", {
    value: !0
  }), F.default = void 0;
  var o = t(/* @__PURE__ */ Ne()), e = /* @__PURE__ */ oe();
  function t(c) {
    return c && c.__esModule ? c : { default: c };
  }
  let i, n, r = 0, s = 0;
  function a(c, d, g) {
    let u = d && g || 0;
    const f = d || new Array(16);
    c = c || {};
    let w = c.node || i, p = c.clockseq !== void 0 ? c.clockseq : n;
    if (w == null || p == null) {
      const E = c.random || (c.rng || o.default)();
      w == null && (w = i = [E[0] | 1, E[1], E[2], E[3], E[4], E[5]]), p == null && (p = n = (E[6] << 8 | E[7]) & 16383);
    }
    let M = c.msecs !== void 0 ? c.msecs : Date.now(), S = c.nsecs !== void 0 ? c.nsecs : s + 1;
    const le = M - r + (S - s) / 1e4;
    if (le < 0 && c.clockseq === void 0 && (p = p + 1 & 16383), (le < 0 || M > r) && c.nsecs === void 0 && (S = 0), S >= 1e4)
      throw new Error("uuid.v1(): Can't create more than 10M uuids/sec");
    r = M, s = S, n = p, M += 122192928e5;
    const Y = ((M & 268435455) * 1e4 + S) % 4294967296;
    f[u++] = Y >>> 24 & 255, f[u++] = Y >>> 16 & 255, f[u++] = Y >>> 8 & 255, f[u++] = Y & 255;
    const X = M / 4294967296 * 1e4 & 268435455;
    f[u++] = X >>> 8 & 255, f[u++] = X & 255, f[u++] = X >>> 24 & 15 | 16, f[u++] = X >>> 16 & 255, f[u++] = p >>> 8 | 128, f[u++] = p & 255;
    for (let E = 0; E < 6; ++E)
      f[u + E] = w[E];
    return d || (0, e.unsafeStringify)(f);
  }
  var l = a;
  return F.default = l, F;
}
var q = {}, T = {}, K = {}, Me;
function be() {
  if (Me) return K;
  Me = 1, Object.defineProperty(K, "__esModule", {
    value: !0
  }), K.default = void 0;
  var o = e(/* @__PURE__ */ se());
  function e(n) {
    return n && n.__esModule ? n : { default: n };
  }
  function t(n) {
    if (!(0, o.default)(n))
      throw TypeError("Invalid UUID");
    let r;
    const s = new Uint8Array(16);
    return s[0] = (r = parseInt(n.slice(0, 8), 16)) >>> 24, s[1] = r >>> 16 & 255, s[2] = r >>> 8 & 255, s[3] = r & 255, s[4] = (r = parseInt(n.slice(9, 13), 16)) >>> 8, s[5] = r & 255, s[6] = (r = parseInt(n.slice(14, 18), 16)) >>> 8, s[7] = r & 255, s[8] = (r = parseInt(n.slice(19, 23), 16)) >>> 8, s[9] = r & 255, s[10] = (r = parseInt(n.slice(24, 36), 16)) / 1099511627776 & 255, s[11] = r / 4294967296 & 255, s[12] = r >>> 24 & 255, s[13] = r >>> 16 & 255, s[14] = r >>> 8 & 255, s[15] = r & 255, s;
  }
  var i = t;
  return K.default = i, K;
}
var De;
function Oe() {
  if (De) return T;
  De = 1, Object.defineProperty(T, "__esModule", {
    value: !0
  }), T.URL = T.DNS = void 0, T.default = s;
  var o = /* @__PURE__ */ oe(), e = t(/* @__PURE__ */ be());
  function t(a) {
    return a && a.__esModule ? a : { default: a };
  }
  function i(a) {
    a = unescape(encodeURIComponent(a));
    const l = [];
    for (let c = 0; c < a.length; ++c)
      l.push(a.charCodeAt(c));
    return l;
  }
  const n = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
  T.DNS = n;
  const r = "6ba7b811-9dad-11d1-80b4-00c04fd430c8";
  T.URL = r;
  function s(a, l, c) {
    function d(g, u, f, w) {
      var p;
      if (typeof g == "string" && (g = i(g)), typeof u == "string" && (u = (0, e.default)(u)), ((p = u) === null || p === void 0 ? void 0 : p.length) !== 16)
        throw TypeError("Namespace must be array-like (16 iterable integer values, 0-255)");
      let M = new Uint8Array(16 + g.length);
      if (M.set(u), M.set(g, u.length), M = c(M), M[6] = M[6] & 15 | l, M[8] = M[8] & 63 | 128, f) {
        w = w || 0;
        for (let S = 0; S < 16; ++S)
          f[w + S] = M[S];
        return f;
      }
      return (0, o.unsafeStringify)(M);
    }
    try {
      d.name = a;
    } catch {
    }
    return d.DNS = n, d.URL = r, d;
  }
  return T;
}
var V = {}, Ee;
function ut() {
  if (Ee) return V;
  Ee = 1, Object.defineProperty(V, "__esModule", {
    value: !0
  }), V.default = void 0;
  var o = e(re);
  function e(n) {
    return n && n.__esModule ? n : { default: n };
  }
  function t(n) {
    return Array.isArray(n) ? n = Buffer.from(n) : typeof n == "string" && (n = Buffer.from(n, "utf8")), o.default.createHash("md5").update(n).digest();
  }
  var i = t;
  return V.default = i, V;
}
var _e;
function lt() {
  if (_e) return q;
  _e = 1, Object.defineProperty(q, "__esModule", {
    value: !0
  }), q.default = void 0;
  var o = t(/* @__PURE__ */ Oe()), e = t(/* @__PURE__ */ ut());
  function t(r) {
    return r && r.__esModule ? r : { default: r };
  }
  var n = (0, o.default)("v3", 48, e.default);
  return q.default = n, q;
}
var B = {}, G = {}, Se;
function dt() {
  if (Se) return G;
  Se = 1, Object.defineProperty(G, "__esModule", {
    value: !0
  }), G.default = void 0;
  var o = e(re);
  function e(i) {
    return i && i.__esModule ? i : { default: i };
  }
  var t = {
    randomUUID: o.default.randomUUID
  };
  return G.default = t, G;
}
var Ie;
function ft() {
  if (Ie) return B;
  Ie = 1, Object.defineProperty(B, "__esModule", {
    value: !0
  }), B.default = void 0;
  var o = i(/* @__PURE__ */ dt()), e = i(/* @__PURE__ */ Ne()), t = /* @__PURE__ */ oe();
  function i(s) {
    return s && s.__esModule ? s : { default: s };
  }
  function n(s, a, l) {
    if (o.default.randomUUID && !a && !s)
      return o.default.randomUUID();
    s = s || {};
    const c = s.random || (s.rng || e.default)();
    if (c[6] = c[6] & 15 | 64, c[8] = c[8] & 63 | 128, a) {
      l = l || 0;
      for (let d = 0; d < 16; ++d)
        a[l + d] = c[d];
      return a;
    }
    return (0, t.unsafeStringify)(c);
  }
  var r = n;
  return B.default = r, B;
}
var H = {}, z = {}, Pe;
function ht() {
  if (Pe) return z;
  Pe = 1, Object.defineProperty(z, "__esModule", {
    value: !0
  }), z.default = void 0;
  var o = e(re);
  function e(n) {
    return n && n.__esModule ? n : { default: n };
  }
  function t(n) {
    return Array.isArray(n) ? n = Buffer.from(n) : typeof n == "string" && (n = Buffer.from(n, "utf8")), o.default.createHash("sha1").update(n).digest();
  }
  var i = t;
  return z.default = i, z;
}
var Ae;
function gt() {
  if (Ae) return H;
  Ae = 1, Object.defineProperty(H, "__esModule", {
    value: !0
  }), H.default = void 0;
  var o = t(/* @__PURE__ */ Oe()), e = t(/* @__PURE__ */ ht());
  function t(r) {
    return r && r.__esModule ? r : { default: r };
  }
  var n = (0, o.default)("v5", 80, e.default);
  return H.default = n, H;
}
var J = {}, Te;
function pt() {
  if (Te) return J;
  Te = 1, Object.defineProperty(J, "__esModule", {
    value: !0
  }), J.default = void 0;
  var o = "00000000-0000-0000-0000-000000000000";
  return J.default = o, J;
}
var j = {}, Le;
function mt() {
  if (Le) return j;
  Le = 1, Object.defineProperty(j, "__esModule", {
    value: !0
  }), j.default = void 0;
  var o = e(/* @__PURE__ */ se());
  function e(n) {
    return n && n.__esModule ? n : { default: n };
  }
  function t(n) {
    if (!(0, o.default)(n))
      throw TypeError("Invalid UUID");
    return parseInt(n.slice(14, 15), 16);
  }
  var i = t;
  return j.default = i, j;
}
var Re;
function vt() {
  return Re || (Re = 1, (function(o) {
    Object.defineProperty(o, "__esModule", {
      value: !0
    }), Object.defineProperty(o, "NIL", {
      enumerable: !0,
      get: function() {
        return r.default;
      }
    }), Object.defineProperty(o, "parse", {
      enumerable: !0,
      get: function() {
        return c.default;
      }
    }), Object.defineProperty(o, "stringify", {
      enumerable: !0,
      get: function() {
        return l.default;
      }
    }), Object.defineProperty(o, "v1", {
      enumerable: !0,
      get: function() {
        return e.default;
      }
    }), Object.defineProperty(o, "v3", {
      enumerable: !0,
      get: function() {
        return t.default;
      }
    }), Object.defineProperty(o, "v4", {
      enumerable: !0,
      get: function() {
        return i.default;
      }
    }), Object.defineProperty(o, "v5", {
      enumerable: !0,
      get: function() {
        return n.default;
      }
    }), Object.defineProperty(o, "validate", {
      enumerable: !0,
      get: function() {
        return a.default;
      }
    }), Object.defineProperty(o, "version", {
      enumerable: !0,
      get: function() {
        return s.default;
      }
    });
    var e = d(/* @__PURE__ */ ct()), t = d(/* @__PURE__ */ lt()), i = d(/* @__PURE__ */ ft()), n = d(/* @__PURE__ */ gt()), r = d(/* @__PURE__ */ pt()), s = d(/* @__PURE__ */ mt()), a = d(/* @__PURE__ */ se()), l = d(/* @__PURE__ */ oe()), c = d(/* @__PURE__ */ be());
    function d(g) {
      return g && g.__esModule ? g : { default: g };
    }
  })(ae)), ae;
}
var yt = /* @__PURE__ */ vt();
const A = /* @__PURE__ */ ot(yt);
A.v1;
A.v3;
const ee = A.v4;
A.v5;
A.NIL;
A.version;
A.validate;
A.stringify;
A.parse;
const R = class R {
  constructor(e) {
    h(this, "configManager");
    h(this, "listeners", /* @__PURE__ */ new Map());
    this.configManager = e ?? O.getInstance();
  }
  static getInstance(e) {
    return R.instance || (R.instance = new R(e)), R.instance;
  }
  getProfiles() {
    return this.configManager.getConfig().profiles;
  }
  getProfile(e) {
    return this.getProfiles().find((t) => t.id === e);
  }
  getActiveProfile() {
    const e = this.configManager.getConfig();
    return e.activeProfileId ? this.getProfile(e.activeProfileId) ?? null : null;
  }
  async createProfile(e) {
    const t = Date.now(), i = {
      id: ee(),
      createdAt: t,
      updatedAt: t,
      mappings: e.mappings ?? [],
      ...e
    }, n = this.configManager.getConfig(), r = {
      ...n,
      profiles: [...n.profiles, i]
    };
    return await this.configManager.updateConfig(r), this.emit("profile:created", i), i;
  }
  async updateProfile(e, t) {
    const i = this.configManager.getConfig(), n = i.profiles.findIndex((a) => a.id === e);
    if (n === -1)
      throw new Error(`Profile with id ${e} not found`);
    const r = {
      ...i.profiles[n],
      ...t,
      updatedAt: Date.now()
    }, s = [...i.profiles];
    return s[n] = r, await this.configManager.updateConfig({ profiles: s }), this.emit("profile:updated", r), r;
  }
  async deleteProfile(e) {
    const t = this.configManager.getConfig();
    if (!t.profiles.some((s) => s.id === e))
      throw new Error(`Profile with id ${e} not found`);
    const n = t.profiles.filter((s) => s.id !== e), r = t.activeProfileId === e ? null : t.activeProfileId;
    await this.configManager.updateConfig({
      profiles: n,
      activeProfileId: r
    }), this.emit("profile:deleted", e), r === null && this.emit("profile:switched", null);
  }
  async switchProfile(e) {
    if (e === null)
      return await this.configManager.updateConfig({ activeProfileId: null }), this.emit("profile:switched", null), null;
    const t = this.getProfile(e);
    if (!t)
      throw new Error(`Profile with id ${e} not found`);
    return await this.configManager.updateConfig({ activeProfileId: e }), this.emit("profile:switched", t), t;
  }
  async addMapping(e, t) {
    const i = this.getProfile(e);
    if (!i)
      throw new Error(`Profile with id ${e} not found`);
    const n = Date.now(), r = {
      id: ee(),
      createdAt: n,
      updatedAt: n,
      ...t
    }, s = [...i.mappings, r];
    return await this.updateProfile(e, { mappings: s }), this.emit("mapping:added", { profileId: e, mapping: r }), r;
  }
  async updateMapping(e, t, i) {
    const n = this.getProfile(e);
    if (!n)
      throw new Error(`Profile with id ${e} not found`);
    const r = n.mappings.findIndex((l) => l.id === t);
    if (r === -1)
      throw new Error(`Mapping with id ${t} not found`);
    const s = {
      ...n.mappings[r],
      ...i,
      updatedAt: Date.now()
    }, a = [...n.mappings];
    return a[r] = s, await this.updateProfile(e, { mappings: a }), this.emit("mapping:updated", { profileId: e, mapping: s }), s;
  }
  async deleteMapping(e, t) {
    const i = this.getProfile(e);
    if (!i)
      throw new Error(`Profile with id ${e} not found`);
    if (!i.mappings.some((s) => s.id === t))
      throw new Error(`Mapping with id ${t} not found`);
    const r = i.mappings.filter((s) => s.id !== t);
    await this.updateProfile(e, { mappings: r }), this.emit("mapping:deleted", { profileId: e, mappingId: t });
  }
  async exportProfile(e, t, i = {}) {
    const n = this.getProfile(e);
    if (!n)
      throw new Error(`Profile with id ${e} not found`);
    const { includeMappings: r = !0, prettyPrint: s = !0 } = i, a = {
      ...n,
      mappings: r ? n.mappings : []
    }, l = JSON.stringify(a, null, s ? 2 : 0), c = _.dirname(t);
    I.existsSync(c) || await I.promises.mkdir(c, { recursive: !0 }), await I.promises.writeFile(t, l, "utf-8");
  }
  async importProfile(e) {
    var t;
    try {
      if (!I.existsSync(e))
        return {
          success: !1,
          error: `File not found: ${e}`
        };
      const i = await I.promises.readFile(e, "utf-8"), n = JSON.parse(i);
      if (!this.isValidProfile(n))
        return {
          success: !1,
          error: "Invalid profile format"
        };
      const r = Date.now(), s = {
        ...n,
        id: ee(),
        name: this.generateUniqueName(n.name),
        createdAt: r,
        updatedAt: r,
        mappings: ((t = n.mappings) == null ? void 0 : t.map((l) => ({
          ...l,
          id: ee(),
          createdAt: r,
          updatedAt: r
        }))) ?? []
      }, a = this.configManager.getConfig();
      return await this.configManager.updateConfig({
        profiles: [...a.profiles, s]
      }), this.emit("profile:created", s), {
        success: !0,
        profile: s
      };
    } catch (i) {
      return {
        success: !1,
        error: i instanceof Error ? i.message : "Unknown error"
      };
    }
  }
  on(e, t) {
    return this.listeners.has(e) || this.listeners.set(e, /* @__PURE__ */ new Set()), this.listeners.get(e).add(t), () => {
      var i;
      (i = this.listeners.get(e)) == null || i.delete(t);
    };
  }
  off(e, t) {
    var i;
    (i = this.listeners.get(e)) == null || i.delete(t);
  }
  emit(e, t) {
    const i = this.listeners.get(e);
    if (i)
      for (const n of i)
        try {
          n(e, t);
        } catch (r) {
          console.error(`Error in profile event listener for ${e}:`, r);
        }
  }
  isValidProfile(e) {
    return typeof e == "object" && e !== null && typeof e.name == "string" && Array.isArray(e.mappings);
  }
  generateUniqueName(e) {
    const t = this.getProfiles(), i = new Set(t.map((r) => r.name));
    if (!i.has(e))
      return e;
    let n = 1;
    for (; i.has(`${e} (${n})`); )
      n++;
    return `${e} (${n})`;
  }
};
h(R, "instance", null);
let ie = R;
class wt {
  constructor() {
    h(this, "rules", []);
    h(this, "cache", {
      noteMatchers: /* @__PURE__ */ new Map(),
      ccMatchers: /* @__PURE__ */ new Map(),
      pitchBendMatchers: /* @__PURE__ */ new Map(),
      generalMatchers: []
    });
  }
  setRules(e) {
    this.rules = e.filter((t) => t.enabled), this.rebuildCache();
  }
  getRules() {
    return [...this.rules];
  }
  addRule(e) {
    e.enabled && (this.rules.push(e), this.addToCache(e));
  }
  removeRule(e) {
    const t = this.rules.findIndex((i) => i.id === e);
    t !== -1 && (this.rules.splice(t, 1), this.rebuildCache());
  }
  updateRule(e) {
    const t = this.rules.findIndex((i) => i.id === e.id);
    t !== -1 ? (e.enabled ? this.rules[t] = e : this.rules.splice(t, 1), this.rebuildCache()) : e.enabled && (this.rules.push(e), this.addToCache(e));
  }
  match(e) {
    const t = [], i = this.getCandidateRules(e);
    for (const n of i) {
      const r = this.tryMatch(e, n);
      r && t.push(r);
    }
    return t.sort((n, r) => r.matchScore - n.matchScore), t;
  }
  matchFirst(e) {
    const t = this.match(e);
    return t.length > 0 ? t[0] : null;
  }
  rebuildCache() {
    this.cache = {
      noteMatchers: /* @__PURE__ */ new Map(),
      ccMatchers: /* @__PURE__ */ new Map(),
      pitchBendMatchers: /* @__PURE__ */ new Map(),
      generalMatchers: []
    };
    for (const e of this.rules)
      this.addToCache(e);
  }
  getDeviceKey(e) {
    return e || "any";
  }
  addToCache(e) {
    const t = e.midiTrigger, n = `${this.getDeviceKey(t.deviceId)}:${t.channel}`;
    switch (t.type) {
      case "note":
        if (t.note !== void 0) {
          const r = `${n}:${t.note}`;
          this.cache.noteMatchers.has(r) || this.cache.noteMatchers.set(r, []), this.cache.noteMatchers.get(r).push(e);
        } else
          this.cache.noteMatchers.has(n) || this.cache.noteMatchers.set(n, []), this.cache.noteMatchers.get(n).push(e);
        break;
      case "cc":
        if (t.controlNumber !== void 0) {
          const r = `${n}:${t.controlNumber}`;
          this.cache.ccMatchers.has(r) || this.cache.ccMatchers.set(r, []), this.cache.ccMatchers.get(r).push(e);
        } else
          this.cache.ccMatchers.has(n) || this.cache.ccMatchers.set(n, []), this.cache.ccMatchers.get(n).push(e);
        break;
      case "pitchBend":
        this.cache.pitchBendMatchers.has(n) || this.cache.pitchBendMatchers.set(n, []), this.cache.pitchBendMatchers.get(n).push(e);
        break;
      default:
        this.cache.generalMatchers.push(e);
    }
  }
  getCandidateRules(e) {
    const t = [], i = this.getDeviceKey(e.deviceId), n = this.getDeviceKey(), r = `${i}:${e.channel}`, s = `${n}:${e.channel}`;
    switch (e.type) {
      case "noteOn":
      case "noteOff":
        if (e.note !== void 0) {
          const d = `${r}:${e.note}`, g = `${s}:${e.note}`, u = this.cache.noteMatchers.get(d);
          u && t.push(...u);
          const f = this.cache.noteMatchers.get(g);
          f && t.push(...f);
          const w = this.cache.noteMatchers.get(r);
          w && t.push(...w);
          const p = this.cache.noteMatchers.get(s);
          p && t.push(...p);
        }
        break;
      case "cc":
        if (e.controlNumber !== void 0) {
          const d = `${r}:${e.controlNumber}`, g = `${s}:${e.controlNumber}`, u = this.cache.ccMatchers.get(d);
          u && t.push(...u);
          const f = this.cache.ccMatchers.get(g);
          f && t.push(...f);
          const w = this.cache.ccMatchers.get(r);
          w && t.push(...w);
          const p = this.cache.ccMatchers.get(s);
          p && t.push(...p);
        }
        break;
      case "pitchBend":
        const l = this.cache.pitchBendMatchers.get(r);
        l && t.push(...l);
        const c = this.cache.pitchBendMatchers.get(s);
        c && t.push(...c);
        break;
    }
    return this.cache.generalMatchers.length > 0 && t.push(...this.cache.generalMatchers), Array.from(new Set(t));
  }
  tryMatch(e, t) {
    const i = t.midiTrigger;
    let n = 0;
    if (i.deviceId !== void 0) {
      if (e.deviceId !== i.deviceId)
        return null;
      n += 50;
    }
    if (e.channel !== i.channel)
      return null;
    switch (n += 1, i.type) {
      case "note":
        if (e.type !== "noteOn" && e.type !== "noteOff")
          return null;
        if (n += 1, i.note !== void 0) {
          if (e.note !== i.note)
            return null;
          n += 10;
        }
        if (e.type === "noteOn" && e.velocity !== void 0) {
          const r = i.minVelocity ?? 0, s = i.maxVelocity ?? 127;
          if (e.velocity < r || e.velocity > s)
            return null;
          n += 1;
        }
        break;
      case "cc":
        if (e.type !== "cc")
          return null;
        if (n += 1, i.controlNumber !== void 0) {
          if (e.controlNumber !== i.controlNumber)
            return null;
          n += 10;
        }
        if (e.controlValue !== void 0 && i.threshold !== void 0) {
          if (e.controlValue < i.threshold)
            return null;
          n += 1;
        }
        break;
      case "pitchBend":
        if (e.type !== "pitchBend")
          return null;
        if (n += 1, i.threshold !== void 0 && e.pitchBendValue !== void 0) {
          if (Math.abs(e.pitchBendValue) < i.threshold)
            return null;
          n += 1;
        }
        break;
      default:
        return null;
    }
    return {
      rule: t,
      trigger: i,
      action: t.action,
      matchScore: n
    };
  }
}
var m = /* @__PURE__ */ ((o) => (o.MIDI_GET_DEVICES = "midi:get-devices", o.MIDI_SELECT_DEVICE = "midi:select-device", o.MIDI_START_LEARN = "midi:start-learn", o.MIDI_STOP_LEARN = "midi:stop-learn", o.MIDI_MESSAGE_RECEIVED = "midi:message-received", o.MIDI_LEARNED = "midi:learned", o.SERVICE_START = "service:start", o.SERVICE_STOP = "service:stop", o.SERVICE_STATUS = "service:status", o.SERVICE_STATUS_CHANGED = "service:status-changed", o.CONFIG_GET = "config:get", o.CONFIG_SAVE = "config:save", o.PROFILE_CREATE = "profile:create", o.PROFILE_DELETE = "profile:delete", o.PROFILE_UPDATE = "profile:update", o.PROFILE_SWITCH = "profile:switch", o.PROFILE_EXPORT = "profile:export", o.PROFILE_IMPORT = "profile:import", o.MAPPING_ADD = "mapping:add", o.MAPPING_UPDATE = "mapping:update", o.MAPPING_DELETE = "mapping:delete", o.ACTION_TEST = "action:test", o.LOG_ENTRY = "log:entry", o.APP_QUIT = "app:quit", o.APP_MINIMIZE = "app:minimize", o))(m || {});
const Mt = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
function Dt(o) {
  const e = Math.floor(o / 12) - 1, t = o % 12;
  return `${Mt[t]}${e}`;
}
const Et = {
  timeout: 5e3,
  maxMemory: 1024 * 1024 * 10,
  allowAsync: !0
};
class _t {
  constructor(e) {
    h(this, "options");
    h(this, "state");
    h(this, "inputSimulator", null);
    this.options = { ...Et, ...e }, this.state = {
      globalState: /* @__PURE__ */ new Map(),
      counters: /* @__PURE__ */ new Map(),
      lastTriggerTimes: /* @__PURE__ */ new Map()
    };
  }
  setInputSimulator(e) {
    this.inputSimulator = e;
  }
  getState() {
    return this.state;
  }
  resetState() {
    this.state.globalState.clear(), this.state.counters.clear(), this.state.lastTriggerTimes.clear();
  }
  async executeCondition(e, t, i) {
    const n = performance.now(), r = [];
    try {
      const { context: s, resultPromise: a } = this.createSandbox(
        e,
        t,
        i,
        r
      ), l = new Promise((g, u) => {
        setTimeout(() => {
          u(new Error("Script execution timeout"));
        }, this.options.timeout);
      }), c = await Promise.race([a, l]);
      return {
        success: !0,
        triggered: this.isTruthy(c),
        logs: r,
        duration: performance.now() - n
      };
    } catch (s) {
      return {
        success: !1,
        triggered: !1,
        error: s instanceof Error ? s.message : String(s),
        logs: r,
        duration: performance.now() - n
      };
    }
  }
  async executeAction(e, t, i) {
    const n = performance.now(), r = [];
    try {
      const { context: s, resultPromise: a } = this.createSandbox(
        e,
        t,
        i,
        r
      ), l = new Promise((d, g) => {
        setTimeout(() => {
          g(new Error("Script execution timeout"));
        }, this.options.timeout);
      }), c = await Promise.race([a, l]);
      return {
        success: !0,
        triggered: this.isTruthy(c) || c === void 0,
        logs: r,
        duration: performance.now() - n
      };
    } catch (s) {
      return {
        success: !1,
        triggered: !1,
        error: s instanceof Error ? s.message : String(s),
        logs: r,
        duration: performance.now() - n
      };
    }
  }
  createSandbox(e, t, i, n) {
    const r = this.state, s = this.inputSimulator, a = {
      log: (...u) => {
        n.push(u);
      },
      getNoteName: Dt,
      delay: async (u) => {
        if (u < 0 || u > this.options.timeout)
          throw new Error(`Invalid delay: ${u}ms`);
        return new Promise((f) => setTimeout(f, u));
      },
      press: async (u) => {
        if (!s) throw new Error("Input simulator not available");
        const f = Array.isArray(u) ? u : [u];
        await s.pressKeys(f);
      },
      click: async (u = "left", f, w) => {
        if (!s) throw new Error("Input simulator not available");
        await s.clickMouse(u, f, w);
      },
      scroll: async (u, f) => {
        if (!s) throw new Error("Input simulator not available");
        await s.scrollMouse(u, f);
      },
      drag: async (u, f, w, p, M = "left") => {
        if (!s) throw new Error("Input simulator not available");
        await s.dragMouse(u, f, w, p, M);
      },
      getState: (u) => r.globalState.get(u),
      setState: (u, f) => {
        r.globalState.set(u, f);
      },
      getCounter: (u) => r.counters.get(u) || 0,
      setCounter: (u, f) => {
        r.counters.set(u, f);
      },
      increment: (u, f = 1) => {
        const p = (r.counters.get(u) || 0) + f;
        return r.counters.set(u, p), r.lastTriggerTimes.set(u, Date.now()), p;
      },
      decrement: (u, f = 1) => {
        const p = (r.counters.get(u) || 0) - f;
        return r.counters.set(u, p), p;
      },
      resetCounter: (u) => {
        r.counters.delete(u), r.lastTriggerTimes.delete(u);
      },
      getTimeSinceLast: (u = "default") => {
        const f = r.lastTriggerTimes.get(u);
        return f ? Date.now() - f : 1 / 0;
      }
    }, l = {
      message: t,
      trigger: i,
      state: Object.fromEntries(r.globalState),
      counter: Object.fromEntries(r.counters),
      lastTrigger: Object.fromEntries(r.lastTriggerTimes),
      ...a
    }, c = Ve({
      ...l,
      console: {
        log: a.log,
        warn: a.log,
        error: a.log
      }
    }), d = this.wrapCode(e);
    let g;
    try {
      const u = Be(d, c, {
        timeout: this.options.timeout,
        displayErrors: !0
      });
      u && typeof u == "object" && "then" in u ? g = u : g = Promise.resolve(u);
    } catch (u) {
      g = Promise.reject(u);
    }
    return { context: l, resultPromise: g };
  }
  wrapCode(e) {
    return `
(async function() {
  "use strict";
  ${e}
})();
    `.trim();
  }
  isTruthy(e) {
    return e == null ? !1 : typeof e == "boolean" ? e : !!e;
  }
  validateScript(e) {
    try {
      const t = this.wrapCode(e);
      return new Function(t), { valid: !0 };
    } catch (t) {
      return {
        valid: !1,
        error: t instanceof Error ? t.message : String(t)
      };
    }
  }
}
const C = class C {
  constructor(e = {}) {
    h(this, "configManager");
    h(this, "profileManager");
    h(this, "mapperEngine");
    h(this, "scriptEngine");
    h(this, "midiAdapter", null);
    h(this, "inputSimulator", null);
    h(this, "running", !1);
    h(this, "messageHandler", null);
    h(this, "profileUnsubscribe", null);
    h(this, "lastMessage", null);
    h(this, "listeners", /* @__PURE__ */ new Map());
    this.configManager = e.configManager ?? O.getInstance(), this.profileManager = e.profileManager ?? ie.getInstance(), this.mapperEngine = new wt(), this.scriptEngine = new _t(), e.midiAdapter && (this.midiAdapter = e.midiAdapter), e.inputSimulator && (this.inputSimulator = e.inputSimulator, this.scriptEngine.setInputSimulator(this.inputSimulator));
  }
  static getInstance(e) {
    return C.instance || (C.instance = new C(e)), C.instance;
  }
  setMidiAdapter(e) {
    if (this.running)
      throw new Error("Cannot set MIDI adapter while service is running");
    this.midiAdapter = e;
  }
  setInputSimulator(e) {
    this.inputSimulator = e, this.scriptEngine.setInputSimulator(e);
  }
  getScriptEngine() {
    return this.scriptEngine;
  }
  async start() {
    if (this.running)
      return this.getStatus();
    try {
      if (this.log("info", "Starting background service..."), !this.midiAdapter)
        throw new Error("MIDI adapter not set");
      const e = this.profileManager.getActiveProfile();
      e && this.loadProfileRules(e), this.messageHandler = this.midiAdapter.onMessage((n) => {
        this.handleMidiMessage(n);
      }), this.profileUnsubscribe = this.profileManager.on("profile:switched", (n, r) => {
        r ? (this.loadProfileRules(r), this.log("info", `Switched to profile: ${r.name}`)) : (this.mapperEngine.setRules([]), this.log("info", "No active profile")), this.emit("service:status-changed", this.getStatus());
      }), await this.midiAdapter.start();
      const t = this.configManager.getConfig();
      if (t.connectedDeviceIds && t.connectedDeviceIds.length > 0)
        for (const n of t.connectedDeviceIds)
          try {
            await this.midiAdapter.connectDevice(n) && this.log("info", `Successfully connected to device: ${n}`);
          } catch (r) {
            this.log("warn", `Failed to connect to device ${n}: ${r.message}`);
          }
      this.running = !0;
      const i = this.getStatus();
      return this.log("info", "Background service started"), this.emit("service:started", i), this.emit("service:status-changed", i), i;
    } catch (e) {
      throw this.log("error", `Failed to start service: ${e.message}`), this.emit("error", e), e;
    }
  }
  async stop() {
    if (!this.running)
      return this.getStatus();
    try {
      this.log("info", "Stopping background service..."), this.messageHandler && (this.messageHandler(), this.messageHandler = null), this.profileUnsubscribe && (this.profileUnsubscribe(), this.profileUnsubscribe = null), this.midiAdapter && await this.midiAdapter.stop(), this.running = !1, this.lastMessage = null;
      const e = this.getStatus();
      return this.log("info", "Background service stopped"), this.emit("service:stopped", e), this.emit("service:status-changed", e), e;
    } catch (e) {
      throw this.log("error", `Failed to stop service: ${e.message}`), this.emit("error", e), e;
    }
  }
  isRunning() {
    return this.running;
  }
  getStatus() {
    var s;
    const e = this.profileManager.getActiveProfile(), t = this.mapperEngine.getRules().filter((a) => a.enabled).length, i = (e == null ? void 0 : e.mappings.length) ?? 0, n = ((s = this.midiAdapter) == null ? void 0 : s.getConnectedDevices()) ?? [], r = n.length > 0;
    return {
      running: this.running,
      deviceConnected: r,
      activeMappings: t,
      totalMappings: i,
      lastMessage: this.lastMessage ?? void 0,
      connectedDevices: n
    };
  }
  async getMidiDevices() {
    if (!this.midiAdapter)
      throw new Error("MIDI adapter not set");
    return this.midiAdapter.getDevices();
  }
  async connectMidiDevice(e) {
    if (!this.midiAdapter)
      throw new Error("MIDI adapter not set");
    const t = await this.midiAdapter.connectDevice(e);
    return this.emit("service:status-changed", this.getStatus()), t && this.log("info", `Connected MIDI device: ${e}`), t;
  }
  async disconnectMidiDevice(e) {
    if (!this.midiAdapter)
      throw new Error("MIDI adapter not set");
    await this.midiAdapter.disconnectDevice(e), this.emit("service:status-changed", this.getStatus()), this.log("info", `Disconnected MIDI device: ${e}`);
  }
  getConnectedDevices() {
    var e;
    return ((e = this.midiAdapter) == null ? void 0 : e.getConnectedDevices()) ?? [];
  }
  async testAction(e) {
    if (!this.inputSimulator)
      throw new Error("Input simulator not set");
    await this.inputSimulator.testAction(e), this.log("info", `Tested action: ${e.type}`);
  }
  on(e, t) {
    return this.listeners.has(e) || this.listeners.set(e, /* @__PURE__ */ new Set()), this.listeners.get(e).add(t), () => {
      var i;
      (i = this.listeners.get(e)) == null || i.delete(t);
    };
  }
  off(e, t) {
    var i;
    (i = this.listeners.get(e)) == null || i.delete(t);
  }
  loadProfileRules(e) {
    const t = e.mappings.filter((i) => i.enabled);
    this.mapperEngine.setRules(t), this.log("debug", `Loaded ${t.length} rules from profile: ${e.name}`);
  }
  handleMidiMessage(e) {
    this.lastMessage = e, this.emit("midi:message", e);
    const t = this.mapperEngine.match(e);
    if (t.length !== 0) {
      for (const i of t)
        this.triggerAction(e, i);
      this.emit("service:status-changed", this.getStatus());
    }
  }
  async triggerAction(e, t) {
    var i;
    if (!this.inputSimulator) {
      this.log("warn", "Input simulator not set, cannot execute action");
      return;
    }
    try {
      if ((i = t.rule.condition) != null && i.enabled) {
        const n = await this.scriptEngine.executeCondition(
          t.rule.condition.code,
          e,
          t.rule.midiTrigger
        );
        if (!n.success) {
          this.log(
            "warn",
            `Script condition error for rule "${t.rule.name}": ${n.error}`
          );
          return;
        }
        if (!n.triggered)
          return;
      }
      t.action.type === "script" ? await this.scriptEngine.executeAction(
        t.action.code,
        e,
        t.rule.midiTrigger
      ) : await this.inputSimulator.executeAction(t.action), this.emit("midi:action-triggered", {
        message: e,
        match: t,
        action: t.action
      }), this.log(
        "debug",
        `Triggered action for rule "${t.rule.name}" (score: ${t.matchScore})`
      );
    } catch (n) {
      this.log(
        "error",
        `Failed to execute action for rule "${t.rule.name}": ${n.message}`
      );
    }
  }
  emit(e, t) {
    const i = this.listeners.get(e);
    if (i)
      for (const n of i)
        try {
          n(e, t);
        } catch (r) {
          console.error(`Error in service event listener for ${e}:`, r);
        }
  }
  log(e, t, i) {
    const n = {
      timestamp: Date.now(),
      level: e,
      message: t,
      data: i
    };
    this.emit("log:entry", n);
    const r = this.configManager.getConfig().logLevel, s = ["debug", "info", "warn", "error"], a = s.indexOf(e), l = s.indexOf(r);
    if (a >= l) {
      const d = console[e === "debug" ? "log" : e];
      d(`[${e.toUpperCase()}] ${t}`, i ?? "");
    }
  }
};
h(C, "instance", null);
let ce = C;
function St(o, e, t, i, n, r, s, a) {
  v.handle(m.MIDI_GET_DEVICES, async () => {
    try {
      return o.getDevices();
    } catch {
      return [];
    }
  }), v.handle(m.MIDI_SELECT_DEVICE, async (l, c) => {
    try {
      if (c === null) {
        await t.disconnectAll();
        const g = n.getConfig();
        return await n.updateConfig({ ...g, connectedDeviceIds: [] }), !0;
      }
      const d = await i.connectMidiDevice(c);
      if (d) {
        const g = n.getConfig(), u = [...g.connectedDeviceIds || [], c];
        await n.updateConfig({ ...g, connectedDeviceIds: u });
      }
      return d;
    } catch {
      return !1;
    }
  }), v.handle("midi:disconnect-device", async (l, c) => {
    try {
      await i.disconnectMidiDevice(c);
      const d = n.getConfig(), g = (d.connectedDeviceIds || []).filter((u) => u !== c);
      return await n.updateConfig({ ...d, connectedDeviceIds: g }), !0;
    } catch {
      return !1;
    }
  }), v.handle(m.MIDI_START_LEARN, async (l, c = 1e4, d) => {
    t.startLearn(c, d);
  }), v.handle(m.MIDI_STOP_LEARN, async () => {
    t.stopLearn();
  }), e.on("message", (l) => {
    a.isDestroyed() || a.webContents.send(m.MIDI_MESSAGE_RECEIVED, l);
  }), e.on("learned", (l) => {
    a.isDestroyed() || a.webContents.send(m.MIDI_LEARNED, l);
  }), e.on("device-connected", (l) => {
    a.isDestroyed() || a.webContents.send("midi:device-connected", l);
  }), e.on("device-disconnected", (l) => {
    a.isDestroyed() || a.webContents.send("midi:device-disconnected", l);
  }), v.handle(m.SERVICE_START, async () => {
    try {
      return await i.start(), !0;
    } catch {
      return !1;
    }
  }), v.handle(m.SERVICE_STOP, async () => {
    try {
      return await i.stop(), !0;
    } catch {
      return !1;
    }
  }), v.handle(m.SERVICE_STATUS, async () => i.getStatus()), i.on("service:status-changed", (l, c) => {
    a.isDestroyed() || a.webContents.send(m.SERVICE_STATUS_CHANGED, c);
  }), i.on("log:entry", (l, c) => {
    a.isDestroyed() || a.webContents.send(m.LOG_ENTRY, c);
  }), v.handle(m.CONFIG_GET, async () => n.getConfig()), v.handle(m.CONFIG_SAVE, async (l, c) => {
    try {
      return await n.updateConfig(c), !0;
    } catch {
      return !1;
    }
  }), v.handle(m.PROFILE_CREATE, async (l, c) => {
    try {
      return await r.createProfile({ name: c });
    } catch {
      return null;
    }
  }), v.handle(m.PROFILE_DELETE, async (l, c) => {
    try {
      return await r.deleteProfile(c), !0;
    } catch {
      return !1;
    }
  }), v.handle(m.PROFILE_UPDATE, async (l, c, d) => {
    try {
      return await r.updateProfile(c, d), !0;
    } catch {
      return !1;
    }
  }), v.handle(m.PROFILE_SWITCH, async (l, c) => {
    try {
      return await r.switchProfile(c), !0;
    } catch {
      return !1;
    }
  }), v.handle(m.PROFILE_EXPORT, async (l, c) => {
    try {
      const d = r.getProfile(c);
      if (!d) return !1;
      const g = await de.showSaveDialog(a, {
        title: "导出配置文件",
        defaultPath: `${d.name}.json`,
        filters: [{ name: "JSON文件", extensions: ["json"] }]
      });
      if (g.canceled || !g.filePath) return !1;
      const u = {
        version: "1.0",
        exportedAt: Date.now(),
        profile: d
      };
      return await Ge(g.filePath, JSON.stringify(u, null, 2), "utf-8"), !0;
    } catch {
      return !1;
    }
  }), v.handle(m.PROFILE_IMPORT, async () => {
    try {
      const l = await de.showOpenDialog(a, {
        title: "导入配置文件",
        filters: [{ name: "JSON文件", extensions: ["json"] }],
        properties: ["openFile"]
      });
      if (l.canceled || l.filePaths.length === 0) return null;
      const c = await He(l.filePaths[0], "utf-8"), d = JSON.parse(c), g = d.profile || d, u = await r.importProfile(g);
      return u.success ? u.profile : null;
    } catch {
      return null;
    }
  }), v.handle(m.MAPPING_ADD, async (l, c, d) => {
    try {
      return await r.addMapping(c, d), !0;
    } catch {
      return !1;
    }
  }), v.handle(m.MAPPING_UPDATE, async (l, c, d, g) => {
    try {
      return await r.updateMapping(c, d, g), !0;
    } catch {
      return !1;
    }
  }), v.handle(m.MAPPING_DELETE, async (l, c, d) => {
    try {
      return await r.deleteMapping(c, d), !0;
    } catch {
      return !1;
    }
  }), v.handle(m.ACTION_TEST, async (l, c) => {
    try {
      return await s.testAction(c), !0;
    } catch {
      return !1;
    }
  }), v.handle(m.APP_QUIT, async () => {
    try {
      await i.stop();
    } catch {
    }
    e.disconnect(), o.stopMonitoring();
    try {
      await n.save();
    } catch {
    }
  }), v.handle(m.APP_MINIMIZE, async () => {
    a.isDestroyed() || a.minimize();
  });
}
const It = _.dirname(Ke(import.meta.url));
process.env.APP_ROOT = _.join(It, "../..");
const ue = process.env.VITE_DEV_SERVER_URL, Pt = _.join(process.env.APP_ROOT, "dist-electron"), ne = _.join(process.env.APP_ROOT, "dist");
process.env.VITE_PUBLIC = ue ? _.join(process.env.APP_ROOT, "public") : ne;
let D = null, te = null;
function Ce() {
  return D = new xe({
    width: 1100,
    height: 750,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: "#0f0f1a",
    frame: !1,
    titleBarStyle: "hidden",
    icon: _.join(process.env.VITE_PUBLIC || ne, "favicon.svg"),
    webPreferences: {
      preload: _.join(Pt, "preload.js"),
      nodeIntegration: !0,
      contextIsolation: !1,
      webSecurity: !1
    }
  }), ue ? (D.loadURL(ue), D.webContents.openDevTools({ mode: "detach" })) : D.loadFile(_.join(ne, "index.html")), D.on("closed", () => {
    D = null;
  }), D;
}
function At() {
  const o = _.join(process.env.VITE_PUBLIC || ne, "favicon.svg"), e = ke.createFromPath(o).resize({ width: 16, height: 16 });
  te = new Ue(e);
  const t = qe.buildFromTemplate([
    {
      label: "显示主窗口",
      click: () => {
        D && (D.show(), D.focus());
      }
    },
    {
      label: "退出",
      click: () => {
        b.quit();
      }
    }
  ]);
  te.setToolTip("MIDI Mapper"), te.setContextMenu(t), te.on("click", () => {
    D && (D.isVisible() ? D.hide() : (D.show(), D.focus()));
  });
}
b.whenReady().then(async () => {
  const o = Ce(), e = O.getInstance(), t = ie.getInstance(e), i = new ze(), n = new Ye(), r = new Xe(i, n), s = new rt(), a = new st(s), l = ce.getInstance({
    midiAdapter: r,
    inputSimulator: a,
    profileManager: t,
    configManager: e
  });
  await e.load(), i.startMonitoring(), St(
    i,
    n,
    r,
    l,
    e,
    t,
    a,
    o
  );
  try {
    At();
  } catch {
  }
  l.getScriptEngine().setInputSimulator(a);
  const d = e.getConfig();
  if (d.startServiceOnLaunch && d.connectedDeviceIds && d.connectedDeviceIds.length > 0)
    try {
      await l.start();
    } catch {
    }
  b.on("activate", () => {
    xe.getAllWindows().length === 0 && Ce();
  });
});
b.on("window-all-closed", () => {
  process.platform;
});
b.on("before-quit", async () => {
  const o = O.getInstance();
  o && await o.save();
});
export {
  Pt as MAIN_DIST,
  ne as RENDERER_DIST,
  ue as VITE_DEV_SERVER_URL
};
