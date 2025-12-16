/**
 * Add-On Manager
 * Handles CRUD operations for add-ons
 */

export class AddonManager {
    constructor(context) {
        this.context = context;
        this.addons = [];
        this.defaultSettings = {
            messagesCount: 10,
            includeCharCard: true,
            includeUserCard: true,
            includeWorldCard: true
        };
    }

    /**
     * Load add-ons from extension settings
     */
    async loadAddons() {
        try {
            // Try multiple possible settings paths
            const settings = this.context.extensionSettings?.addOnsExtension ||
                this.context.extensionSettings?.sidecarAi ||
                this.context.extensionSettings?.['sidecar-ai'] ||
                {};
            this.addons = settings.addons || [];

            // Ensure all add-ons have required fields
            this.addons = this.addons.map(addon => this.normalizeAddon(addon));

            console.log(`[Sidecar AI] Loaded ${this.addons.length} sidecar(s)`);
            return this.addons;
        } catch (error) {
            console.error('[Sidecar AI] Error loading sidecars:', error);
            this.addons = [];
            return [];
        }
    }

    /**
     * Save add-ons to extension settings
     */
    async saveAddons() {
        try {
            if (!this.context.extensionSettings) {
                this.context.extensionSettings = {};
            }

            // Store in multiple locations for compatibility
            if (!this.context.extensionSettings.addOnsExtension) {
                this.context.extensionSettings.addOnsExtension = {};
            }
            if (!this.context.extensionSettings.sidecarAi) {
                this.context.extensionSettings.sidecarAi = {};
            }

            this.context.extensionSettings.addOnsExtension.addons = this.addons;
            this.context.extensionSettings.sidecarAi.addons = this.addons; // For template access

            if (this.context.saveSettingsDebounced) {
                this.context.saveSettingsDebounced();
            } else if (this.context.saveSettings) {
                await this.context.saveSettings();
            }

            console.log('[Add-Ons Extension] Add-ons saved');
            return true;
        } catch (error) {
            console.error('[Add-Ons Extension] Error saving add-ons:', error);
            return false;
        }
    }

    /**
     * Get all add-ons
     */
    getAllAddons() {
        return this.addons;
    }

    /**
     * Get enabled add-ons
     */
    getEnabledAddons() {
        return this.addons.filter(addon => addon.enabled);
    }

    /**
     * Get add-on by ID
     */
    getAddon(id) {
        return this.addons.find(addon => addon.id === id);
    }

    /**
     * Create a new add-on
     */
    createAddon(addonData) {
        const addon = this.normalizeAddon({
            ...addonData,
            id: this.generateId()
        });

        this.addons.push(addon);
        this.saveAddons();
        return addon;
    }

    /**
     * Update an existing add-on
     */
    updateAddon(id, updates) {
        const index = this.addons.findIndex(addon => addon.id === id);
        if (index === -1) {
            throw new Error(`Add-on with id ${id} not found`);
        }

        this.addons[index] = this.normalizeAddon({
            ...this.addons[index],
            ...updates
        });

        this.saveAddons();
        return this.addons[index];
    }

    /**
     * Delete an add-on
     */
    deleteAddon(id) {
        const index = this.addons.findIndex(addon => addon.id === id);
        if (index === -1) {
            return false;
        }

        this.addons.splice(index, 1);
        this.saveAddons();
        return true;
    }

    /**
     * Toggle add-on enabled state
     */
    toggleAddon(id) {
        const addon = this.getAddon(id);
        if (!addon) {
            return false;
        }

        addon.enabled = !addon.enabled;
        this.saveAddons();
        return addon.enabled;
    }

    /**
     * Normalize add-on data structure
     */
    normalizeAddon(addon) {
        return {
            id: addon.id || this.generateId(),
            name: addon.name || 'Unnamed Sidecar',
            description: addon.description || '',
            prompt: addon.prompt || '',
            triggerMode: addon.triggerMode || 'auto',
            requestMode: addon.requestMode || 'standalone',
            aiProvider: addon.aiProvider || 'openai',
            aiModel: addon.aiModel || 'gpt-3.5-turbo',
            apiKey: addon.apiKey || '', // API key is required - validated in form
            apiUrl: addon.apiUrl || '', // Optional custom URL
            serviceProvider: addon.serviceProvider || [], // Array of service providers for OpenRouter
            resultFormat: addon.resultFormat || 'collapsible',
            responseLocation: addon.responseLocation || 'outsideChatlog',
            contextSettings: {
                messagesCount: addon.contextSettings?.messagesCount ?? this.defaultSettings.messagesCount,
                includeCharCard: addon.contextSettings?.includeCharCard ?? this.defaultSettings.includeCharCard,
                includeUserCard: addon.contextSettings?.includeUserCard ?? this.defaultSettings.includeUserCard,
                includeWorldCard: addon.contextSettings?.includeWorldCard ?? this.defaultSettings.includeWorldCard
            },
            enabled: addon.enabled !== undefined ? addon.enabled : true
        };
    }

    /**
     * Generate unique ID for add-on
     */
    generateId() {
        return `addon_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Get add-ons grouped by request mode and provider/model
     */
    getGroupedAddons(addons = null) {
        const addonsToGroup = addons || this.getEnabledAddons();

        const batchGroups = {};
        const standalone = [];

        addonsToGroup.forEach(addon => {
            if (addon.requestMode === 'batch') {
                const key = `${addon.aiProvider}:${addon.aiModel}`;
                if (!batchGroups[key]) {
                    batchGroups[key] = [];
                }
                batchGroups[key].push(addon);
            } else {
                standalone.push(addon);
            }
        });

        return {
            batch: Object.values(batchGroups),
            standalone
        };
    }
}
