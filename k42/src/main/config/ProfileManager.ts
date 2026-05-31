import fs from 'node:fs';
import path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import type { Profile, MappingRule, AppConfig } from '../../shared/index';
import type { ProfileImportResult, ProfileExportOptions } from './types';
import { ConfigManager } from './ConfigManager';

export interface ProfileEventMap {
  'profile:created': Profile;
  'profile:updated': Profile;
  'profile:deleted': string;
  'profile:switched': Profile | null;
  'mapping:added': { profileId: string; mapping: MappingRule };
  'mapping:updated': { profileId: string; mapping: MappingRule };
  'mapping:deleted': { profileId: string; mappingId: string };
}

export type ProfileEventName = keyof ProfileEventMap;

export interface ProfileEventListener<K extends ProfileEventName> {
  (event: K, data: ProfileEventMap[K]): void;
}

export class ProfileManager {
  private static instance: ProfileManager | null = null;
  private configManager: ConfigManager;
  private listeners: Map<ProfileEventName, Set<ProfileEventListener<ProfileEventName>>> =
    new Map();

  private constructor(configManager?: ConfigManager) {
    this.configManager = configManager ?? ConfigManager.getInstance();
  }

  public static getInstance(configManager?: ConfigManager): ProfileManager {
    if (!ProfileManager.instance) {
      ProfileManager.instance = new ProfileManager(configManager);
    }
    return ProfileManager.instance;
  }

  public getProfiles(): Profile[] {
    return this.configManager.getConfig().profiles;
  }

  public getProfile(id: string): Profile | undefined {
    return this.getProfiles().find((p: Profile) => p.id === id);
  }

  public getActiveProfile(): Profile | null {
    const config = this.configManager.getConfig();
    if (!config.activeProfileId) return null;
    return this.getProfile(config.activeProfileId) ?? null;
  }

  public async createProfile(
    data: Omit<Profile, 'id' | 'createdAt' | 'updatedAt' | 'mappings'> & {
      mappings?: MappingRule[];
    }
  ): Promise<Profile> {
    const now = Date.now();
    const newProfile: Profile = {
      id: uuidv4(),
      createdAt: now,
      updatedAt: now,
      mappings: data.mappings ?? [],
      ...data,
    };

    const config = this.configManager.getConfig();
    const updatedConfig: AppConfig = {
      ...config,
      profiles: [...config.profiles, newProfile],
    };

    await this.configManager.updateConfig(updatedConfig);
    this.emit('profile:created', newProfile);

    return newProfile;
  }

  public async updateProfile(
    id: string,
    updates: Partial<Omit<Profile, 'id' | 'createdAt'>>
  ): Promise<Profile> {
    const config = this.configManager.getConfig();
    const profileIndex = config.profiles.findIndex((p: Profile) => p.id === id);

    if (profileIndex === -1) {
      throw new Error(`Profile with id ${id} not found`);
    }

    const updatedProfile: Profile = {
      ...config.profiles[profileIndex],
      ...updates,
      updatedAt: Date.now(),
    };

    const newProfiles = [...config.profiles];
    newProfiles[profileIndex] = updatedProfile;

    await this.configManager.updateConfig({ profiles: newProfiles });
    this.emit('profile:updated', updatedProfile);

    return updatedProfile;
  }

  public async deleteProfile(id: string): Promise<void> {
    const config = this.configManager.getConfig();
    const profileExists = config.profiles.some((p: Profile) => p.id === id);

    if (!profileExists) {
      throw new Error(`Profile with id ${id} not found`);
    }

    const newProfiles = config.profiles.filter((p: Profile) => p.id !== id);
    const activeProfileId = config.activeProfileId === id ? null : config.activeProfileId;

    await this.configManager.updateConfig({
      profiles: newProfiles,
      activeProfileId,
    });

    this.emit('profile:deleted', id);
    if (activeProfileId === null) {
      this.emit('profile:switched', null);
    }
  }

  public async switchProfile(id: string | null): Promise<Profile | null> {
    if (id === null) {
      await this.configManager.updateConfig({ activeProfileId: null });
      this.emit('profile:switched', null);
      return null;
    }

    const profile = this.getProfile(id);
    if (!profile) {
      throw new Error(`Profile with id ${id} not found`);
    }

    await this.configManager.updateConfig({ activeProfileId: id });
    this.emit('profile:switched', profile);

    return profile;
  }

  public async addMapping(profileId: string, mapping: Omit<MappingRule, 'id' | 'createdAt' | 'updatedAt'>): Promise<MappingRule> {
    const profile = this.getProfile(profileId);
    if (!profile) {
      throw new Error(`Profile with id ${profileId} not found`);
    }

    const now = Date.now();
    const newMapping: MappingRule = {
      id: uuidv4(),
      createdAt: now,
      updatedAt: now,
      ...mapping,
    };

    const updatedMappings = [...profile.mappings, newMapping];
    await this.updateProfile(profileId, { mappings: updatedMappings });
    this.emit('mapping:added', { profileId, mapping: newMapping });

    return newMapping;
  }

  public async updateMapping(profileId: string, mappingId: string, updates: Partial<Omit<MappingRule, 'id' | 'createdAt'>>): Promise<MappingRule> {
    const profile = this.getProfile(profileId);
    if (!profile) {
      throw new Error(`Profile with id ${profileId} not found`);
    }

    const mappingIndex = profile.mappings.findIndex((m: MappingRule) => m.id === mappingId);
    if (mappingIndex === -1) {
      throw new Error(`Mapping with id ${mappingId} not found`);
    }

    const updatedMapping: MappingRule = {
      ...profile.mappings[mappingIndex],
      ...updates,
      updatedAt: Date.now(),
    };

    const newMappings = [...profile.mappings];
    newMappings[mappingIndex] = updatedMapping;

    await this.updateProfile(profileId, { mappings: newMappings });
    this.emit('mapping:updated', { profileId, mapping: updatedMapping });

    return updatedMapping;
  }

  public async deleteMapping(profileId: string, mappingId: string): Promise<void> {
    const profile = this.getProfile(profileId);
    if (!profile) {
      throw new Error(`Profile with id ${profileId} not found`);
    }

    const mappingExists = profile.mappings.some((m: MappingRule) => m.id === mappingId);
    if (!mappingExists) {
      throw new Error(`Mapping with id ${mappingId} not found`);
    }

    const newMappings = profile.mappings.filter((m: MappingRule) => m.id !== mappingId);
    await this.updateProfile(profileId, { mappings: newMappings });
    this.emit('mapping:deleted', { profileId, mappingId });
  }

  public async exportProfile(id: string, filePath: string, options: ProfileExportOptions = {}): Promise<void> {
    const profile = this.getProfile(id);
    if (!profile) {
      throw new Error(`Profile with id ${id} not found`);
    }

    const { includeMappings = true, prettyPrint = true } = options;

    const exportData: Profile = {
      ...profile,
      mappings: includeMappings ? profile.mappings : [],
    };

    const data = JSON.stringify(exportData, null, prettyPrint ? 2 : 0);
    const dir = path.dirname(filePath);

    if (!fs.existsSync(dir)) {
      await fs.promises.mkdir(dir, { recursive: true });
    }

    await fs.promises.writeFile(filePath, data, 'utf-8');
  }

  public async importProfile(filePath: string): Promise<ProfileImportResult> {
    try {
      if (!fs.existsSync(filePath)) {
        return {
          success: false,
          error: `File not found: ${filePath}`,
        };
      }

      const rawData = await fs.promises.readFile(filePath, 'utf-8');
      const importedData = JSON.parse(rawData) as Partial<Profile>;

      if (!this.isValidProfile(importedData)) {
        return {
          success: false,
          error: 'Invalid profile format',
        };
      }

      const now = Date.now();
      const newProfile: Profile = {
        ...importedData,
        id: uuidv4(),
        name: this.generateUniqueName(importedData.name),
        createdAt: now,
        updatedAt: now,
        mappings: importedData.mappings?.map((m: MappingRule) => ({
          ...m,
          id: uuidv4(),
          createdAt: now,
          updatedAt: now,
        })) ?? [],
      };

      const config = this.configManager.getConfig();
      await this.configManager.updateConfig({
        profiles: [...config.profiles, newProfile],
      });

      this.emit('profile:created', newProfile);

      return {
        success: true,
        profile: newProfile,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  public on<K extends ProfileEventName>(
    event: K,
    listener: ProfileEventListener<K>
  ): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener as ProfileEventListener<ProfileEventName>);

    return () => {
      this.listeners.get(event)?.delete(listener as ProfileEventListener<ProfileEventName>);
    };
  }

  public off<K extends ProfileEventName>(
    event: K,
    listener: ProfileEventListener<K>
  ): void {
    this.listeners.get(event)?.delete(listener as ProfileEventListener<ProfileEventName>);
  }

  private emit<K extends ProfileEventName>(event: K, data: ProfileEventMap[K]): void {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      for (const listener of eventListeners) {
        try {
          listener(event, data);
        } catch (error) {
          console.error(`Error in profile event listener for ${event}:`, error);
        }
      }
    }
  }

  private isValidProfile(data: Partial<Profile>): data is Profile {
    return (
      typeof data === 'object' &&
      data !== null &&
      typeof data.name === 'string' &&
      Array.isArray(data.mappings)
    );
  }

  private generateUniqueName(baseName: string): string {
    const profiles = this.getProfiles();
    const existingNames = new Set(profiles.map((p: Profile) => p.name));

    if (!existingNames.has(baseName)) {
      return baseName;
    }

    let counter = 1;
    while (existingNames.has(`${baseName} (${counter})`)) {
      counter++;
    }

    return `${baseName} (${counter})`;
  }
}

export default ProfileManager;
