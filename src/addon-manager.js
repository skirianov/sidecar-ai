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
            includeWorldCard: true,
            includeHistory: true,
            historyDepth: 1  // Minimum 1 for style consistency
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

            // Ensure all add-ons have required fields and order
            this.addons = this.addons.map((addon, index) => {
                const normalized = this.normalizeAddon(addon);
                // If order wasn't set, assign based on index
                if (normalized.order === undefined || normalized.order === null) {
                    normalized.order = index + 1;
                }
                return normalized;
            });

            // Sort by order
            this.addons.sort((a, b) => (a.order || 0) - (b.order || 0));

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
        // Ensure order is set - use existing order or assign based on position
        let order = addon.order;
        if (order === undefined || order === null) {
            // If no order, assign based on current position or use a high number
            const maxOrder = this.addons.length > 0
                ? Math.max(...this.addons.map(a => a.order || 0))
                : 0;
            order = maxOrder + 1;
        }

        // ALWAYS use minimum historyDepth of 1 for style/context consistency
        let includeHistory = addon.contextSettings?.includeHistory ?? this.defaultSettings.includeHistory;
        let historyDepth = addon.contextSettings?.historyDepth ?? this.defaultSettings.historyDepth;

        // Enforce minimum historyDepth of 1
        historyDepth = Math.max(historyDepth, 1);

        return {
            id: addon.id || this.generateId(),
            name: addon.name || 'Unnamed Sidecar',
            description: addon.description || '',
            prompt: addon.prompt || '',
            triggerMode: addon.triggerMode || 'auto',
            triggerConfig: {
                triggerType: addon.triggerConfig?.triggerType || 'keyword',
                triggers: Array.isArray(addon.triggerConfig?.triggers) ? addon.triggerConfig.triggers : []
            },
            requestMode: addon.requestMode || 'standalone',
            aiProvider: addon.aiProvider || 'openai',
            aiModel: addon.aiModel || 'gpt-3.5-turbo',
            apiKey: addon.apiKey || '', // API key is required - validated in form
            apiUrl: addon.apiUrl || '', // Optional custom URL
            serviceProvider: addon.serviceProvider || [], // Array of service providers for OpenRouter
            resultFormat: addon.resultFormat || 'collapsible',
            responseLocation: addon.responseLocation || 'outsideChatlog',
            formatStyle: addon.formatStyle || 'html-css',
            contextSettings: {
                messagesCount: addon.contextSettings?.messagesCount ?? this.defaultSettings.messagesCount,
                includeCharCard: addon.contextSettings?.includeCharCard ?? this.defaultSettings.includeCharCard,
                includeUserCard: addon.contextSettings?.includeUserCard ?? this.defaultSettings.includeUserCard,
                includeWorldCard: addon.contextSettings?.includeWorldCard ?? this.defaultSettings.includeWorldCard,
                includeHistory: includeHistory,
                historyDepth: historyDepth  // Always minimum 1
            },
            enabled: addon.enabled !== undefined ? addon.enabled : true,
            order: order
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

    /**
     * Bulk enable add-ons
     */
    bulkEnable(addonIds) {
        let count = 0;
        addonIds.forEach(id => {
            const addon = this.getAddon(id);
            if (addon && !addon.enabled) {
                addon.enabled = true;
                count++;
            }
        });
        if (count > 0) {
            this.saveAddons();
        }
        return count;
    }

    /**
     * Bulk disable add-ons
     */
    bulkDisable(addonIds) {
        let count = 0;
        addonIds.forEach(id => {
            const addon = this.getAddon(id);
            if (addon && addon.enabled) {
                addon.enabled = false;
                count++;
            }
        });
        if (count > 0) {
            this.saveAddons();
        }
        return count;
    }

    /**
     * Bulk delete add-ons
     */
    bulkDelete(addonIds) {
        let count = 0;
        addonIds.forEach(id => {
            if (this.deleteAddon(id)) {
                count++;
            }
        });
        // Save is already called in deleteAddon, but ensure it's saved
        this.saveAddons();
        return count;
    }

    /**
     * Duplicate add-on
     */
    duplicateAddon(id) {
        const addon = this.getAddon(id);
        if (!addon) {
            return null;
        }

        const duplicated = {
            ...addon,
            id: this.generateId(),
            name: `${addon.name} - Copy`,
            order: Math.max(...this.addons.map(a => a.order || 0)) + 1
        };

        const normalized = this.normalizeAddon(duplicated);
        this.addons.push(normalized);
        this.saveAddons();
        return normalized;
    }

    /**
     * Bulk duplicate add-ons
     */
    bulkDuplicate(addonIds) {
        const duplicated = [];
        addonIds.forEach(id => {
            const dup = this.duplicateAddon(id);
            if (dup) {
                duplicated.push(dup);
            }
        });
        return duplicated;
    }

    /**
     * Reorder add-ons
     */
    reorderAddons(newOrder) {
        // newOrder is an array of addon IDs in the desired order
        newOrder.forEach((id, index) => {
            const addon = this.getAddon(id);
            if (addon) {
                addon.order = index + 1;
            }
        });
        // Re-sort and save
        this.addons.sort((a, b) => (a.order || 0) - (b.order || 0));
        this.saveAddons();
        return true;
    }

    /**
     * Move add-on up in order
     */
    moveAddonUp(id) {
        const index = this.addons.findIndex(a => a.id === id);
        if (index <= 0) return false;

        const temp = this.addons[index].order;
        this.addons[index].order = this.addons[index - 1].order;
        this.addons[index - 1].order = temp;

        this.addons.sort((a, b) => (a.order || 0) - (b.order || 0));
        this.saveAddons();
        return true;
    }

    /**
     * Move add-on down in order
     */
    moveAddonDown(id) {
        const index = this.addons.findIndex(a => a.id === id);
        if (index < 0 || index >= this.addons.length - 1) return false;

        const temp = this.addons[index].order;
        this.addons[index].order = this.addons[index + 1].order;
        this.addons[index + 1].order = temp;

        this.addons.sort((a, b) => (a.order || 0) - (b.order || 0));
        this.saveAddons();
        return true;
    }

    /**
     * Export add-ons to JSON
     * @param {Array<string>} addonIds - Optional array of addon IDs to export. If not provided, exports all.
     * @param {boolean} includeApiKeys - Whether to include API keys in export
     * @returns {Object} Export data with metadata
     */
    exportAddons(addonIds = null, includeApiKeys = false) {
        let addonsToExport = addonIds
            ? this.addons.filter(a => addonIds.includes(a.id))
            : this.addons;

        // Create export data
        const exportData = {
            version: '1.0',
            exportDate: new Date().toISOString(),
            addons: addonsToExport.map(addon => {
                const exported = { ...addon };

                // Remove or mask API keys if not including them
                if (!includeApiKeys) {
                    if (exported.apiKey && exported.apiKey.trim() !== '') {
                        exported.apiKey = '[REDACTED]';
                    }
                }

                return exported;
            })
        };

        return exportData;
    }

    /**
     * Import add-ons from JSON data
     * @param {Object} importData - Import data object
     * @param {string} mergeMode - 'merge' (add new, update existing) or 'replace' (replace all)
     * @returns {Object} Import result with stats
     */
    importAddons(importData, mergeMode = 'merge') {
        if (!importData || !importData.addons || !Array.isArray(importData.addons)) {
            throw new Error('Invalid import data: addons array is required');
        }

        const result = {
            imported: 0,
            updated: 0,
            skipped: 0,
            errors: []
        };

        if (mergeMode === 'replace') {
            // Replace all add-ons
            this.addons = [];
            importData.addons.forEach(addonData => {
                try {
                    const normalized = this.normalizeAddon(addonData);
                    // Generate new ID to avoid conflicts
                    normalized.id = this.generateId();
                    this.addons.push(normalized);
                    result.imported++;
                } catch (error) {
                    result.errors.push({ addon: addonData.name || 'Unknown', error: error.message });
                    result.skipped++;
                }
            });
        } else {
            // Merge mode: add new, update existing
            importData.addons.forEach(addonData => {
                try {
                    const existingIndex = this.addons.findIndex(a => a.id === addonData.id);

                    if (existingIndex >= 0) {
                        // Update existing - but generate new ID to avoid conflicts
                        const normalized = this.normalizeAddon({
                            ...addonData,
                            id: this.generateId() // New ID to avoid conflicts
                        });
                        this.addons.push(normalized);
                        result.imported++;
                    } else {
                        // Add new
                        const normalized = this.normalizeAddon(addonData);
                        // Generate new ID to avoid conflicts
                        normalized.id = this.generateId();
                        this.addons.push(normalized);
                        result.imported++;
                    }
                } catch (error) {
                    result.errors.push({ addon: addonData.name || 'Unknown', error: error.message });
                    result.skipped++;
                }
            });
        }

        // Re-sort by order
        this.addons.sort((a, b) => (a.order || 0) - (b.order || 0));
        this.saveAddons();

        return result;
    }
}
