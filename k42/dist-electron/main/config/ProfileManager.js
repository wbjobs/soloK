import fs from 'node:fs';
import path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import { ConfigManager } from './ConfigManager';
export class ProfileManager {
    static instance = null;
    configManager;
    listeners = new Map();
    constructor(configManager) {
        this.configManager = configManager ?? ConfigManager.getInstance();
    }
    static getInstance(configManager) {
        if (!ProfileManager.instance) {
            ProfileManager.instance = new ProfileManager(configManager);
        }
        return ProfileManager.instance;
    }
    getProfiles() {
        return this.configManager.getConfig().profiles;
    }
    getProfile(id) {
        return this.getProfiles().find((p) => p.id === id);
    }
    getActiveProfile() {
        const config = this.configManager.getConfig();
        if (!config.activeProfileId)
            return null;
        return this.getProfile(config.activeProfileId) ?? null;
    }
    async createProfile(data) {
        const now = Date.now();
        const newProfile = {
            id: uuidv4(),
            createdAt: now,
            updatedAt: now,
            mappings: data.mappings ?? [],
            ...data,
        };
        const config = this.configManager.getConfig();
        const updatedConfig = {
            ...config,
            profiles: [...config.profiles, newProfile],
        };
        await this.configManager.updateConfig(updatedConfig);
        this.emit('profile:created', newProfile);
        return newProfile;
    }
    async updateProfile(id, updates) {
        const config = this.configManager.getConfig();
        const profileIndex = config.profiles.findIndex((p) => p.id === id);
        if (profileIndex === -1) {
            throw new Error(`Profile with id ${id} not found`);
        }
        const updatedProfile = {
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
    async deleteProfile(id) {
        const config = this.configManager.getConfig();
        const profileExists = config.profiles.some((p) => p.id === id);
        if (!profileExists) {
            throw new Error(`Profile with id ${id} not found`);
        }
        const newProfiles = config.profiles.filter((p) => p.id !== id);
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
    async switchProfile(id) {
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
    async addMapping(profileId, mapping) {
        const profile = this.getProfile(profileId);
        if (!profile) {
            throw new Error(`Profile with id ${profileId} not found`);
        }
        const now = Date.now();
        const newMapping = {
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
    async updateMapping(profileId, mappingId, updates) {
        const profile = this.getProfile(profileId);
        if (!profile) {
            throw new Error(`Profile with id ${profileId} not found`);
        }
        const mappingIndex = profile.mappings.findIndex((m) => m.id === mappingId);
        if (mappingIndex === -1) {
            throw new Error(`Mapping with id ${mappingId} not found`);
        }
        const updatedMapping = {
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
    async deleteMapping(profileId, mappingId) {
        const profile = this.getProfile(profileId);
        if (!profile) {
            throw new Error(`Profile with id ${profileId} not found`);
        }
        const mappingExists = profile.mappings.some((m) => m.id === mappingId);
        if (!mappingExists) {
            throw new Error(`Mapping with id ${mappingId} not found`);
        }
        const newMappings = profile.mappings.filter((m) => m.id !== mappingId);
        await this.updateProfile(profileId, { mappings: newMappings });
        this.emit('mapping:deleted', { profileId, mappingId });
    }
    async exportProfile(id, filePath, options = {}) {
        const profile = this.getProfile(id);
        if (!profile) {
            throw new Error(`Profile with id ${id} not found`);
        }
        const { includeMappings = true, prettyPrint = true } = options;
        const exportData = {
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
    async importProfile(filePath) {
        try {
            if (!fs.existsSync(filePath)) {
                return {
                    success: false,
                    error: `File not found: ${filePath}`,
                };
            }
            const rawData = await fs.promises.readFile(filePath, 'utf-8');
            const importedData = JSON.parse(rawData);
            if (!this.isValidProfile(importedData)) {
                return {
                    success: false,
                    error: 'Invalid profile format',
                };
            }
            const now = Date.now();
            const newProfile = {
                ...importedData,
                id: uuidv4(),
                name: this.generateUniqueName(importedData.name),
                createdAt: now,
                updatedAt: now,
                mappings: importedData.mappings?.map((m) => ({
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
        }
        catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    }
    on(event, listener) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        this.listeners.get(event).add(listener);
        return () => {
            this.listeners.get(event)?.delete(listener);
        };
    }
    off(event, listener) {
        this.listeners.get(event)?.delete(listener);
    }
    emit(event, data) {
        const eventListeners = this.listeners.get(event);
        if (eventListeners) {
            for (const listener of eventListeners) {
                try {
                    listener(event, data);
                }
                catch (error) {
                    console.error(`Error in profile event listener for ${event}:`, error);
                }
            }
        }
    }
    isValidProfile(data) {
        return (typeof data === 'object' &&
            data !== null &&
            typeof data.name === 'string' &&
            Array.isArray(data.mappings));
    }
    generateUniqueName(baseName) {
        const profiles = this.getProfiles();
        const existingNames = new Set(profiles.map((p) => p.name));
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
