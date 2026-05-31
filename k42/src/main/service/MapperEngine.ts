import type { MidiMessage, MidiTrigger, MappingRule, Action } from '../../shared/index.js';

export interface MatchResult {
  rule: MappingRule;
  trigger: MidiTrigger;
  action: Action;
  matchScore: number;
}

export interface MatcherCache {
  noteMatchers: Map<string, MappingRule[]>;
  ccMatchers: Map<string, MappingRule[]>;
  pitchBendMatchers: Map<string, MappingRule[]>;
  generalMatchers: MappingRule[];
}

export class MapperEngine {
  private rules: MappingRule[] = [];
  private cache: MatcherCache = {
    noteMatchers: new Map(),
    ccMatchers: new Map(),
    pitchBendMatchers: new Map(),
    generalMatchers: [],
  };

  public setRules(rules: MappingRule[]): void {
    this.rules = rules.filter((r) => r.enabled);
    this.rebuildCache();
  }

  public getRules(): MappingRule[] {
    return [...this.rules];
  }

  public addRule(rule: MappingRule): void {
    if (rule.enabled) {
      this.rules.push(rule);
      this.addToCache(rule);
    }
  }

  public removeRule(ruleId: string): void {
    const index = this.rules.findIndex((r) => r.id === ruleId);
    if (index !== -1) {
      this.rules.splice(index, 1);
      this.rebuildCache();
    }
  }

  public updateRule(rule: MappingRule): void {
    const index = this.rules.findIndex((r) => r.id === rule.id);
    if (index !== -1) {
      if (rule.enabled) {
        this.rules[index] = rule;
      } else {
        this.rules.splice(index, 1);
      }
      this.rebuildCache();
    } else if (rule.enabled) {
      this.rules.push(rule);
      this.addToCache(rule);
    }
  }

  public match(message: MidiMessage): MatchResult[] {
    const matches: MatchResult[] = [];
    const candidates = this.getCandidateRules(message);

    for (const rule of candidates) {
      const result = this.tryMatch(message, rule);
      if (result) {
        matches.push(result);
      }
    }

    matches.sort((a, b) => b.matchScore - a.matchScore);

    return matches;
  }

  public matchFirst(message: MidiMessage): MatchResult | null {
    const matches = this.match(message);
    return matches.length > 0 ? matches[0] : null;
  }

  private rebuildCache(): void {
    this.cache = {
      noteMatchers: new Map(),
      ccMatchers: new Map(),
      pitchBendMatchers: new Map(),
      generalMatchers: [],
    };

    for (const rule of this.rules) {
      this.addToCache(rule);
    }
  }

  private getDeviceKey(deviceId?: string): string {
    return deviceId || 'any';
  }

  private addToCache(rule: MappingRule): void {
    const trigger = rule.midiTrigger;
    const deviceKey = this.getDeviceKey(trigger.deviceId);
    const channelKey = `${deviceKey}:${trigger.channel}`;

    switch (trigger.type) {
      case 'note':
        if (trigger.note !== undefined) {
          const noteKey = `${channelKey}:${trigger.note}`;
          if (!this.cache.noteMatchers.has(noteKey)) {
            this.cache.noteMatchers.set(noteKey, []);
          }
          this.cache.noteMatchers.get(noteKey)!.push(rule);
        } else {
          if (!this.cache.noteMatchers.has(channelKey)) {
            this.cache.noteMatchers.set(channelKey, []);
          }
          this.cache.noteMatchers.get(channelKey)!.push(rule);
        }
        break;

      case 'cc':
        if (trigger.controlNumber !== undefined) {
          const ccKey = `${channelKey}:${trigger.controlNumber}`;
          if (!this.cache.ccMatchers.has(ccKey)) {
            this.cache.ccMatchers.set(ccKey, []);
          }
          this.cache.ccMatchers.get(ccKey)!.push(rule);
        } else {
          if (!this.cache.ccMatchers.has(channelKey)) {
            this.cache.ccMatchers.set(channelKey, []);
          }
          this.cache.ccMatchers.get(channelKey)!.push(rule);
        }
        break;

      case 'pitchBend':
        if (!this.cache.pitchBendMatchers.has(channelKey)) {
          this.cache.pitchBendMatchers.set(channelKey, []);
        }
        this.cache.pitchBendMatchers.get(channelKey)!.push(rule);
        break;

      default:
        this.cache.generalMatchers.push(rule);
    }
  }

  private getCandidateRules(message: MidiMessage): MappingRule[] {
    const candidates: MappingRule[] = [];
    const deviceKey = this.getDeviceKey(message.deviceId);
    const anyDeviceKey = this.getDeviceKey();
    const channelKey = `${deviceKey}:${message.channel}`;
    const anyDeviceChannelKey = `${anyDeviceKey}:${message.channel}`;

    switch (message.type) {
      case 'noteOn':
      case 'noteOff':
        if (message.note !== undefined) {
          const noteKey = `${channelKey}:${message.note}`;
          const anyDeviceNoteKey = `${anyDeviceChannelKey}:${message.note}`;
          
          const exactMatch = this.cache.noteMatchers.get(noteKey);
          if (exactMatch) {
            candidates.push(...exactMatch);
          }
          
          const anyDeviceNoteMatch = this.cache.noteMatchers.get(anyDeviceNoteKey);
          if (anyDeviceNoteMatch) {
            candidates.push(...anyDeviceNoteMatch);
          }
          
          const channelMatch = this.cache.noteMatchers.get(channelKey);
          if (channelMatch) {
            candidates.push(...channelMatch);
          }
          
          const anyDeviceChannelMatch = this.cache.noteMatchers.get(anyDeviceChannelKey);
          if (anyDeviceChannelMatch) {
            candidates.push(...anyDeviceChannelMatch);
          }
        }
        break;

      case 'cc':
        if (message.controlNumber !== undefined) {
          const ccKey = `${channelKey}:${message.controlNumber}`;
          const anyDeviceCcKey = `${anyDeviceChannelKey}:${message.controlNumber}`;
          
          const exactMatch = this.cache.ccMatchers.get(ccKey);
          if (exactMatch) {
            candidates.push(...exactMatch);
          }
          
          const anyDeviceCcMatch = this.cache.ccMatchers.get(anyDeviceCcKey);
          if (anyDeviceCcMatch) {
            candidates.push(...anyDeviceCcMatch);
          }
          
          const channelMatch = this.cache.ccMatchers.get(channelKey);
          if (channelMatch) {
            candidates.push(...channelMatch);
          }
          
          const anyDeviceChannelMatch = this.cache.ccMatchers.get(anyDeviceChannelKey);
          if (anyDeviceChannelMatch) {
            candidates.push(...anyDeviceChannelMatch);
          }
        }
        break;

      case 'pitchBend':
        const pitchBendMatch = this.cache.pitchBendMatchers.get(channelKey);
        if (pitchBendMatch) {
          candidates.push(...pitchBendMatch);
        }
        
        const anyDevicePitchBendMatch = this.cache.pitchBendMatchers.get(anyDeviceChannelKey);
        if (anyDevicePitchBendMatch) {
          candidates.push(...anyDevicePitchBendMatch);
        }
        break;

      default:
        break;
    }

    if (this.cache.generalMatchers.length > 0) {
      candidates.push(...this.cache.generalMatchers);
    }

    const uniqueCandidates = Array.from(new Set(candidates));
    return uniqueCandidates;
  }

  private tryMatch(message: MidiMessage, rule: MappingRule): MatchResult | null {
    const trigger = rule.midiTrigger;
    let score = 0;

    if (trigger.deviceId !== undefined) {
      if (message.deviceId !== trigger.deviceId) {
        return null;
      }
      score += 50;
    }

    if (message.channel !== trigger.channel) {
      return null;
    }
    score += 1;

    switch (trigger.type) {
      case 'note':
        if (message.type !== 'noteOn' && message.type !== 'noteOff') {
          return null;
        }
        score += 1;

        if (trigger.note !== undefined) {
          if (message.note !== trigger.note) {
            return null;
          }
          score += 10;
        }

        if (message.type === 'noteOn' && message.velocity !== undefined) {
          const minVel = trigger.minVelocity ?? 0;
          const maxVel = trigger.maxVelocity ?? 127;
          if (message.velocity < minVel || message.velocity > maxVel) {
            return null;
          }
          score += 1;
        }
        break;

      case 'cc':
        if (message.type !== 'cc') {
          return null;
        }
        score += 1;

        if (trigger.controlNumber !== undefined) {
          if (message.controlNumber !== trigger.controlNumber) {
            return null;
          }
          score += 10;
        }

        if (message.controlValue !== undefined && trigger.threshold !== undefined) {
          if (message.controlValue < trigger.threshold) {
            return null;
          }
          score += 1;
        }
        break;

      case 'pitchBend':
        if (message.type !== 'pitchBend') {
          return null;
        }
        score += 1;

        if (trigger.threshold !== undefined && message.pitchBendValue !== undefined) {
          if (Math.abs(message.pitchBendValue) < trigger.threshold) {
            return null;
          }
          score += 1;
        }
        break;

      default:
        return null;
    }

    return {
      rule,
      trigger,
      action: rule.action,
      matchScore: score,
    };
  }
}

export default MapperEngine;
