import type { AppConfig, Profile, MappingRule, MidiTrigger, Action } from '../../shared/index';

export type { AppConfig, Profile, MappingRule, MidiTrigger, Action };

export interface ConfigManagerOptions {
  fileName?: string;
  userDataPath?: string;
}

export interface ProfileImportResult {
  success: boolean;
  profile?: Profile;
  error?: string;
}

export interface ProfileExportOptions {
  includeMappings?: boolean;
  prettyPrint?: boolean;
}

export interface ConfigEventMap {
  'config:loaded': AppConfig;
  'config:changed': AppConfig;
  'config:saved': AppConfig;
  'profile:created': Profile;
  'profile:updated': Profile;
  'profile:deleted': string;
  'profile:switched': Profile | null;
  'mapping:added': { profileId: string; mapping: MappingRule };
  'mapping:updated': { profileId: string; mapping: MappingRule };
  'mapping:deleted': { profileId: string; mappingId: string };
}

export type ConfigEventName = keyof ConfigEventMap;

export interface ConfigEventListener<K extends ConfigEventName> {
  (event: K, data: ConfigEventMap[K]): void;
}
