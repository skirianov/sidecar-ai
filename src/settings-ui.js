export class SettingsUI {
    constructor(context, addonManager, aiClient) {
        this.context = context;
        this.addonManager = addonManager;
        this.aiClient = aiClient;
        this.initialized = false;
        this.selectedAddons = new Set(); // Track selected add-ons for bulk operations
    }

    init() {
        if (this.initialized) return;

        console.log('[Sidecar AI] Initializing Settings UI...');
        this.bindEvents();
        this.renderAddonsList();
        this.initDrawer();

        this.initialized = true;
    }

    initDrawer() {
        // Let SillyTavern handle drawer toggle natively - don't interfere
        // Remove any custom handlers that might conflict
        $('#sidecar_ai_settings .inline-drawer-toggle').off('click.sidecar-custom');
    }

    renderAddonsList() {
        if (!this.addonManager) {
            console.warn('[Sidecar AI] Add-on manager not available for settings UI');
            return;
        }

        const addons = this.addonManager.getAllAddons();
        const listContainer = document.getElementById('add_ons_list');

        if (!listContainer) {
            // This might happen if the settings tab isn't open yet
            console.log('[Sidecar AI] Add-ons list container not found (settings tab might be closed)');
            return;
        }

        // Clear existing content
        listContainer.innerHTML = '';

        if (addons.length === 0) {
            listContainer.innerHTML = '<div class="add_ons_empty"><p>No Sidecars configured. Click "Create Sidecar" to create one.</p></div>';
            this.updateBulkActionBar();
            return;
        }

        // Render header with select all checkbox
        const header = document.createElement('div');
        header.className = 'add_ons_list_header';
        const allSelected = addons.length > 0 && addons.every(a => this.selectedAddons.has(a.id));
        header.innerHTML = `
            <div class="add_ons_list_header_content">
                <label class="add_ons_checkbox_label">
                    <input type="checkbox" id="add_ons_select_all" ${allSelected ? 'checked' : ''} class="add_ons_select_all_checkbox">
                    <span>Select All</span>
                </label>
                <span class="add_ons_selected_count" id="add_ons_selected_count">${this.selectedAddons.size} selected</span>
            </div>
        `;
        listContainer.appendChild(header);

        // Render add-ons
        addons.forEach((addon, index) => {
            const item = document.createElement('div');
            item.className = 'add_ons_item';
            if (this.selectedAddons.has(addon.id)) {
                item.classList.add('add_ons_item_selected');
            }
            item.setAttribute('data-addon-id', addon.id);

            const enabledBadge = addon.enabled ?
                '<span class="add_ons_badge add_ons_badge_enabled">Enabled</span>' :
                '<span class="add_ons_badge add_ons_badge_disabled">Disabled</span>';

            const isSelected = this.selectedAddons.has(addon.id);

            item.innerHTML = `
                <div class="add_ons_item_header">
                    <div class="add_ons_item_select">
                        <label class="add_ons_checkbox_label">
                            <input type="checkbox" class="add_ons_item_checkbox" data-addon-id="${addon.id}" ${isSelected ? 'checked' : ''}>
                            <span></span>
                        </label>
                    </div>
                    <div class="add_ons_item_info">
                        <h4>${addon.name || 'Unnamed Sidecar'}</h4>
                        <span class="add_ons_item_meta">
                            ${enabledBadge}
                            <span class="add_ons_badge">${addon.triggerMode || 'auto'}</span>
                            <span class="add_ons_badge">${addon.requestMode || 'standalone'}</span>
                            <span class="add_ons_badge">${addon.responseLocation || 'outsideChatlog'}</span>
                            ${addon.formatStyle && addon.formatStyle !== 'markdown' ? `<span class="add_ons_badge" title="Format Style">${addon.formatStyle}</span>` : ''}
                        </span>
                    </div>
                    <div class="add_ons_item_actions">
                        ${index > 0 ? `<button class="menu_button add_ons_button_small" data-action="move-up" data-addon-id="${addon.id}" title="Move Up">
                            <i class="fa-solid fa-arrow-up"></i>
                        </button>` : ''}
                        ${index < addons.length - 1 ? `<button class="menu_button add_ons_button_small" data-action="move-down" data-addon-id="${addon.id}" title="Move Down">
                            <i class="fa-solid fa-arrow-down"></i>
                        </button>` : ''}
                        <label class="add_ons_toggle" title="Enable/Disable">
                            <input type="checkbox" ${addon.enabled ? 'checked' : ''} data-addon-id="${addon.id}" class="add_ons_enable_toggle">
                            <span class="add_ons_toggle_slider"></span>
                        </label>
                        <button class="menu_button add_ons_button_small" data-action="edit" data-addon-id="${addon.id}">
                            <i class="fa-solid fa-edit"></i> Edit
                        </button>
                        <button class="menu_button add_ons_button_small" data-action="history" data-addon-id="${addon.id}" title="View History">
                            <i class="fa-solid fa-history"></i> History
                        </button>
                        <button class="menu_button add_ons_button_small" data-action="duplicate" data-addon-id="${addon.id}" title="Duplicate">
                            <i class="fa-solid fa-copy"></i>
                        </button>
                        <button class="menu_button add_ons_button_small add_ons_button_danger" data-action="delete" data-addon-id="${addon.id}">
                            <i class="fa-solid fa-trash"></i> Delete
                        </button>
                    </div>
                </div>
                ${addon.description ? `<p class="add_ons_item_description">${addon.description}</p>` : ''}
            `;

            listContainer.appendChild(item);
        });

        // Update bulk action bar
        this.updateBulkActionBar();
    }

    bindEvents() {
        const self = this;

        // Create Sidecar button
        $(document).off('click.sidecar', '#sidecar_create_button').on('click.sidecar', '#sidecar_create_button', function (e) {
            e.preventDefault();
            e.stopPropagation();
            self.openModal();
        });

        // Export button
        $(document).off('click.sidecar', '#sidecar_export_button').on('click.sidecar', '#sidecar_export_button', function (e) {
            e.preventDefault();
            e.stopPropagation();
            self.handleExport();
        });

        // Import button
        $(document).off('click.sidecar', '#sidecar_import_button').on('click.sidecar', '#sidecar_import_button', function (e) {
            e.preventDefault();
            e.stopPropagation();
            self.handleImport();
        });

        // Modal close
        $(document).off('click.sidecar', '#add_ons_modal_close, #add_ons_form_cancel').on('click.sidecar', '#add_ons_modal_close, #add_ons_form_cancel', function (e) {
            e.preventDefault();
            e.stopPropagation();
            self.closeModal();
        });

        // Edit button
        $(document).off('click.sidecar', '[data-action="edit"]').on('click.sidecar', '[data-action="edit"]', function (e) {
            e.preventDefault();
            e.stopPropagation();
            const addonId = $(this).data('addon-id');
            self.openModal(addonId);
        });

        // Delete button
        $(document).off('click.sidecar', '[data-action="delete"]').on('click.sidecar', '[data-action="delete"]', function (e) {
            e.preventDefault();
            e.stopPropagation();
            const addonId = $(this).data('addon-id');
            if (confirm('Are you sure you want to delete this Sidecar?')) {
                self.deleteAddon(addonId);
            }
        });

        // Enable toggle
        $(document).off('change.sidecar', '.add_ons_enable_toggle').on('change.sidecar', '.add_ons_enable_toggle', function (e) {
            e.stopPropagation();
            const addonId = $(this).data('addon-id');
            const enabled = $(this).is(':checked');
            self.toggleAddon(addonId, enabled);
        });

        // Save form
        $(document).off('click.sidecar', '#add_ons_form_save').on('click.sidecar', '#add_ons_form_save', function (e) {
            e.preventDefault();
            e.stopPropagation();
            self.saveAddon();
        });

        // Response location hint - prevent event bubbling
        $(document).off('change.sidecar', '#add_ons_form_response_location').on('change.sidecar', '#add_ons_form_response_location', function (e) {
            e.stopPropagation();
            const location = $(this).val();
            const hint = $('#add_ons_response_location_hint');
            if (location === 'chatHistory') {
                hint.text('Results hidden in HTML comment at end of message, accessible to main AI');
            } else {
                hint.text('Results appear in expandable dropdown below chat area');
            }
        });

        // Prevent select dropdowns from being interfered with
        $(document).off('click.sidecar', '.add_ons_modal select').on('click.sidecar', '.add_ons_modal select', function (e) {
            e.stopPropagation();
        });

        // Variable insertion buttons removed - no longer needed

        // Provider change - load models and check for saved API key
        $(document).off('change.sidecar', '#add_ons_form_ai_provider').on('change.sidecar', '#add_ons_form_ai_provider', async function (e) {
            e.stopPropagation();
            const provider = $(this).val();
            self.loadModelsForProvider(provider);
            await self.checkAndPrefillAPIKey(provider);
            self.toggleServiceProviderField(provider);
        });

        // Test Connection button
        $(document).off('click.sidecar', '#add_ons_test_connection').on('click.sidecar', '#add_ons_test_connection', function (e) {
            e.preventDefault();
            e.stopPropagation();
            self.testConnection();
        });

        // Clear "Using saved key" placeholder when user starts typing
        $(document).off('focus.sidecar input.sidecar', '#add_ons_form_api_key').on('focus.sidecar input.sidecar', '#add_ons_form_api_key', function (e) {
            const $field = $(this);
            if ($field.val() === 'Using saved key from SillyTavern') {
                $field.val('');
                $field.removeAttr('data-using-st-key');
                $field.css('font-style', 'normal');
                $field.css('color', '');
            }
        });

        // Toggle history depth input
        $(document).off('change.sidecar', '#add_ons_form_include_history').on('change.sidecar', '#add_ons_form_include_history', function (e) {
            e.stopPropagation();
            const checked = $(this).is(':checked');
            const historyDepthGroup = $('#add_ons_history_depth_group');
            if (checked) {
                historyDepthGroup.slideDown(200);
            } else {
                historyDepthGroup.slideUp(200);
            }
        });

        // Bulk selection: Select all checkbox
        $(document).off('change.sidecar', '#add_ons_select_all').on('change.sidecar', '#add_ons_select_all', function (e) {
            e.stopPropagation();
            const checked = $(this).is(':checked');
            const checkboxes = $('.add_ons_item_checkbox');
            checkboxes.prop('checked', checked);

            if (checked) {
                checkboxes.each(function () {
                    const addonId = $(this).data('addon-id');
                    self.selectedAddons.add(addonId);
                });
            } else {
                self.selectedAddons.clear();
            }

            self.updateBulkActionBar();
            self.updateSelectedCount();
        });

        // Bulk selection: Individual item checkbox
        $(document).off('change.sidecar', '.add_ons_item_checkbox').on('change.sidecar', '.add_ons_item_checkbox', function (e) {
            e.stopPropagation();
            const addonId = $(this).data('addon-id');
            const checked = $(this).is(':checked');

            if (checked) {
                self.selectedAddons.add(addonId);
            } else {
                self.selectedAddons.delete(addonId);
            }

            // Update select all checkbox state
            const allAddons = self.addonManager.getAllAddons();
            const allSelected = allAddons.length > 0 && allAddons.every(a => self.selectedAddons.has(a.id));
            $('#add_ons_select_all').prop('checked', allSelected);

            // Update item visual state
            const item = $(this).closest('.add_ons_item');
            if (checked) {
                item.addClass('add_ons_item_selected');
            } else {
                item.removeClass('add_ons_item_selected');
            }

            self.updateBulkActionBar();
            self.updateSelectedCount();
        });

        // Bulk actions
        $(document).off('click.sidecar', '#add_ons_bulk_enable').on('click.sidecar', '#add_ons_bulk_enable', function (e) {
            e.preventDefault();
            e.stopPropagation();
            self.bulkEnable();
        });

        $(document).off('click.sidecar', '#add_ons_bulk_disable').on('click.sidecar', '#add_ons_bulk_disable', function (e) {
            e.preventDefault();
            e.stopPropagation();
            self.bulkDisable();
        });

        $(document).off('click.sidecar', '#add_ons_bulk_delete').on('click.sidecar', '#add_ons_bulk_delete', function (e) {
            e.preventDefault();
            e.stopPropagation();
            self.bulkDelete();
        });

        $(document).off('click.sidecar', '#add_ons_bulk_duplicate').on('click.sidecar', '#add_ons_bulk_duplicate', function (e) {
            e.preventDefault();
            e.stopPropagation();
            self.bulkDuplicate();
        });

        $(document).off('click.sidecar', '#add_ons_bulk_clear').on('click.sidecar', '#add_ons_bulk_clear', function (e) {
            e.preventDefault();
            e.stopPropagation();
            self.clearSelection();
        });

        // History button
        $(document).off('click.sidecar', '[data-action="history"]').on('click.sidecar', '[data-action="history"]', function (e) {
            e.preventDefault();
            e.stopPropagation();
            const addonId = $(this).data('addon-id');
            self.showHistoryViewer(addonId);
        });

        // Duplicate button
        $(document).off('click.sidecar', '[data-action="duplicate"]').on('click.sidecar', '[data-action="duplicate"]', function (e) {
            e.preventDefault();
            e.stopPropagation();
            const addonId = $(this).data('addon-id');
            self.duplicateAddon(addonId);
        });

        // Move up/down buttons
        $(document).off('click.sidecar', '[data-action="move-up"]').on('click.sidecar', '[data-action="move-up"]', function (e) {
            e.preventDefault();
            e.stopPropagation();
            const addonId = $(this).data('addon-id');
            self.moveAddonUp(addonId);
        });

        $(document).off('click.sidecar', '[data-action="move-down"]').on('click.sidecar', '[data-action="move-down"]', function (e) {
            e.preventDefault();
            e.stopPropagation();
            const addonId = $(this).data('addon-id');
            self.moveAddonDown(addonId);
        });

        // History viewer
        $(document).off('click.sidecar', '#add_ons_history_modal_close, #add_ons_history_close').on('click.sidecar', '#add_ons_history_modal_close, #add_ons_history_close', function (e) {
            e.preventDefault();
            e.stopPropagation();
            $('#add_ons_history_modal').hide();
        });

        // History filters
        $(document).off('input.sidecar', '#add_ons_history_search').on('input.sidecar', '#add_ons_history_search', function () {
            self.filterHistory();
        });

        $(document).off('change.sidecar', '#add_ons_history_sort').on('change.sidecar', '#add_ons_history_sort', function () {
            self.filterHistory();
        });

        $(document).off('click.sidecar', '#add_ons_history_clear_filters').on('click.sidecar', '#add_ons_history_clear_filters', function () {
            $('#add_ons_history_search').val('');
            $('#add_ons_history_sort').val('newest');
            self.filterHistory();
        });

    }

    async openModal(addonId = null) {
        const modal = $('#add_ons_modal');
        const form = $('#add_ons_form')[0];

        if (addonId) {
            // Edit mode
            if (this.addonManager) {
                const addon = this.addonManager.getAddon(addonId);
                if (addon) {
                    await this.populateForm(addon);
                    $('#add_ons_modal_title').text('Edit Sidecar');
                    $('#add_ons_form_save').text('Save Sidecar');
                }
            }
        } else {
            // Add mode
            form.reset();
            $('#add_ons_form_id').val('');
            $('#add_ons_modal_title').text('Create New Sidecar');
            $('#add_ons_form_save').text('Create Sidecar');
            // Load models for default provider and check for saved API key
            setTimeout(async () => {
                this.loadModelsForProvider('openai');
                await this.checkAndPrefillAPIKey('openai');
                this.toggleServiceProviderField('openai');
            }, 100);
        }

        // FORCE dark theme colors from actual computed styles
        this.applyThemeColors();
        modal.show();
    }

    loadModelsForProvider(provider) {
        const modelSelect = $('#add_ons_form_ai_model');
        modelSelect.empty();
        modelSelect.append('<option value="">Loading models...</option>');

        // Try to get models - if we don't find any, retry after a delay (dropdown might not be populated yet)
        let models = this.getProviderModels(provider);

        // For OpenRouter, if we got fallback models (5 or less), wait longer and retry to get full list
        // The dropdown might need more time to populate
        if (provider === 'openrouter' && models.length <= 5) {
            console.log(`[Sidecar AI] OpenRouter only found ${models.length} models, retrying after longer delay to get full list...`);
            setTimeout(() => {
                models = this.getProviderModels(provider);
                this.populateModelDropdown(modelSelect, models);
            }, 1500); // Longer delay for OpenRouter
            return;
        }

        // If no models found, wait a bit and retry (dropdown might be loading)
        if (models.length === 0) {
            console.log(`[Sidecar AI] No models found for ${provider}, retrying after delay...`);
            setTimeout(() => {
                models = this.getProviderModels(provider);
                this.populateModelDropdown(modelSelect, models);
            }, 500);
            return;
        }

        this.populateModelDropdown(modelSelect, models);
    }

    populateModelDropdown(modelSelect, models) {
        setTimeout(() => {
            modelSelect.empty();
            if (models.length === 0) {
                modelSelect.append('<option value="">No models available</option>');
                $('#add_ons_model_hint').text('No models found. Check provider configuration.');
                return;
            }

            modelSelect.append('<option value="">Select a model...</option>');
            models.forEach(model => {
                const option = $('<option></option>').val(model.value).text(model.label);
                if (model.default) {
                    option.prop('selected', true);
                }
                modelSelect.append(option);
            });
            $('#add_ons_model_hint').text(`Loaded ${models.length} model(s)`);
        }, 100);
    }

    getProviderModels(provider) {
        let models = [];
        console.log('[Sidecar AI] Loading models for provider:', provider);

        // STRATEGY 1: "Steal" from SillyTavern's existing UI (The "Lazy" but effective method)
        // If the user has the API Connections tab loaded, the dropdowns might already be populated
        // IMPORTANT: Exclude sorting/grouping dropdowns - only get actual model dropdowns
        const excludeSelectors = [
            '#openrouter_sort_models',
            '#openrouter_group_models',
            '#openrouter_group_models_chat',
            '#openrouter_sort_models_chat'
        ];

        // For OpenRouter, use the exact selector SillyTavern uses
        const domSelectors = provider === 'openrouter' ? [
            `#model_openrouter_select`, // Exact selector from SillyTavern
            `#openrouter_model`, // Alternative selector
            `#model_${provider}_select`, // Fallback
            `select[name="${provider}_model"]`, // By name attribute
            `select[id*="${provider}"][id*="model"]:not([id*="sort"]):not([id*="group"])`, // Partial match, exclude sort/group
            `select[id*="model"][id*="${provider}"]:not([id*="sort"]):not([id*="group"])` // Reverse partial match, exclude sort/group
        ] : [
            `#model_${provider}_select`, // Most common format (e.g., #model_openrouter_select)
            `#model_${provider}`, // Alternative format
            `#${provider}_model`, // Another alternative
            `select[name="${provider}_model"]`, // By name attribute
            `select[id*="${provider}"][id*="model"]:not([id*="sort"]):not([id*="group"])`, // Partial match, exclude sort/group
            `select[id*="model"][id*="${provider}"]:not([id*="sort"]):not([id*="group"])` // Reverse partial match, exclude sort/group
        ];

        for (const selector of domSelectors) {
            try {
                // Skip excluded selectors
                if (excludeSelectors.some(exclude => selector.includes(exclude))) {
                    continue;
                }

                const $el = $(selector);
                if ($el.length && $el.is('select') && $el.find('option').length > 1) {
                    // Check if this is a sorting/grouping dropdown by examining option values
                    const firstOption = $el.find('option').eq(0).val();
                    const isSortingDropdown = firstOption === 'alphabetically' ||
                        firstOption === 'price' ||
                        firstOption === 'context' ||
                        $el.attr('id')?.includes('sort') ||
                        $el.attr('id')?.includes('group');

                    if (isSortingDropdown) {
                        console.log(`[Sidecar AI] Skipping sorting/grouping dropdown: ${selector}`);
                        continue;
                    }

                    const optionCount = $el.find('option').length;
                    console.log(`[Sidecar AI] Found populated dropdown at ${selector} with ${optionCount} options`);

                    // For OpenRouter, if we only find 2 options, it might not be fully loaded yet
                    // But let's still try to extract what we can
                    $el.find('option').each(function () {
                        const val = $(this).val();
                        const txt = $(this).text();
                        // Exclude sorting options and empty values
                        if (val && val !== '' &&
                            val !== 'Select a model...' && val !== 'Select...' &&
                            val !== 'alphabetically' && val !== 'price' && val !== 'context' &&
                            !txt.toLowerCase().includes('alphabetically') &&
                            !txt.toLowerCase().includes('price (cheapest)') &&
                            !txt.toLowerCase().includes('context size')) {
                            models.push({
                                value: val,
                                label: txt,
                                default: false
                            });
                        }
                    });

                    // For OpenRouter, if we got very few models (2 or less), don't return yet
                    // Continue to next strategies to get the full list
                    if (models.length > 0) {
                        if (provider === 'openrouter' && models.length <= 2) {
                            console.log(`[Sidecar AI] OpenRouter dropdown only has ${models.length} models, continuing to other strategies...`);
                            // Don't return yet, continue to other strategies
                        } else {
                            console.log('[Sidecar AI] Successfully stole models from UI:', models.length);
                            return models;
                        }
                    }
                }
            } catch (e) {
                console.warn(`[Sidecar AI] Error checking selector ${selector}:`, e);
            }
        }

        // STRATEGY 2: Check for openRouterModels global (from textgen-models.js)
        // This is the most reliable source for OpenRouter models
        if (provider === 'openrouter') {
            // Try to access openRouterModels from window or module exports
            let openRouterModelsList = null;

            if (typeof window !== 'undefined') {
                // Check if it's on window
                if (window.openRouterModels && Array.isArray(window.openRouterModels)) {
                    openRouterModelsList = window.openRouterModels;
                    console.log('[Sidecar AI] Found openRouterModels on window:', openRouterModelsList.length);
                }
                // Check if it's in SillyTavern global
                else if (window.SillyTavern && window.SillyTavern.openRouterModels && Array.isArray(window.SillyTavern.openRouterModels)) {
                    openRouterModelsList = window.SillyTavern.openRouterModels;
                    console.log('[Sidecar AI] Found openRouterModels in SillyTavern:', openRouterModelsList.length);
                }
            }

            if (openRouterModelsList && openRouterModelsList.length > 0) {
                openRouterModelsList.forEach(m => {
                    const id = m.id || m.name || m;
                    const name = m.name || m.id || m;
                    models.push({
                        value: id,
                        label: name,
                        default: false
                    });
                });
                console.log('[Sidecar AI] Loaded', models.length, 'models from openRouterModels');
                if (models.length > 0) {
                    return models;
                }
            }
        }

        // STRATEGY 3: Check OpenRouter specific cache (openrouter_providers)
        // NOTE: openrouter_providers only contains provider names, not models
        // So we skip this strategy if it doesn't have actual model data
        if (provider === 'openrouter' && this.context && this.context.chatCompletionSettings) {
            const ccSettings = this.context.chatCompletionSettings;
            if (ccSettings.openrouter_providers) {
                console.log('[Sidecar AI] Found openrouter_providers data type:', typeof ccSettings.openrouter_providers);

                // Debug log to see structure
                try {
                    // Safe stringify to avoid circular refs
                    const structure = JSON.stringify(ccSettings.openrouter_providers).substring(0, 200);
                    console.log('[Sidecar AI] openrouter_providers preview:', structure);
                } catch (e) { }

                const providers = ccSettings.openrouter_providers;
                let foundModels = false;

                // Case A: Object of providers { "openai": { models: [...] } }
                if (typeof providers === 'object' && !Array.isArray(providers)) {
                    for (const [providerName, providerData] of Object.entries(providers)) {
                        if (providerData && providerData.models && Array.isArray(providerData.models) && providerData.models.length > 0) {
                            foundModels = true;
                            // Normalize models array
                            const pModels = Array.isArray(providerData.models) ? providerData.models : [];
                            pModels.forEach(m => {
                                const id = m.id || m; // Some formats just have strings
                                const name = m.name || m.id || m;
                                models.push({
                                    value: id,
                                    label: `${providerName}: ${name}`,
                                    default: false
                                });
                            });
                        } else if (Array.isArray(providerData) && providerData.length > 0) {
                            // Case B: Object where values are arrays directly (check if they're models, not just provider names)
                            // If first item has .id or .name, it's likely a model
                            if (providerData[0] && (providerData[0].id || providerData[0].name)) {
                                foundModels = true;
                                providerData.forEach(m => {
                                    const id = m.id || m;
                                    models.push({
                                        value: id,
                                        label: `${providerName}: ${id}`,
                                        default: false
                                    });
                                });
                            }
                        }
                    }
                }
                // Case C: Array of providers
                else if (Array.isArray(providers)) {
                    providers.forEach(p => {
                        if (p.models && Array.isArray(p.models) && p.models.length > 0) {
                            foundModels = true;
                            p.models.forEach(m => {
                                const id = m.id || m;
                                models.push({
                                    value: id,
                                    label: `${p.name || 'Unknown'}: ${m.name || id}`,
                                    default: false
                                });
                            });
                        }
                    });
                }

                // Only return if we actually found models (not just provider names)
                if (foundModels && models.length > 0) {
                    console.log('[Sidecar AI] Loaded', models.length, 'models from openrouter_providers');
                    return models;
                } else {
                    console.log('[Sidecar AI] openrouter_providers only contains provider names, not models. Continuing...');
                }
            }
        }

        if (models.length > 0) {
            console.log('[Sidecar AI] Parsed', models.length, 'models from settings cache');
            return models;
        }

        // STRATEGY 4: Iterate mainApi array (Connection Profiles)
        if (this.context && this.context.mainApi && Array.isArray(this.context.mainApi)) {
            const mainApi = this.context.mainApi;
            for (const profile of mainApi) {
                if (!profile) continue;

                // Normalize provider check (case insensitive)
                const pName = (profile.api_provider || profile.provider || profile.name || '').toLowerCase();
                if (pName === provider.toLowerCase()) {
                    console.log(`[Sidecar AI] Found matching profile for ${provider}`);

                    // Check common model list properties
                    const list = profile.models || profile.modelList || profile.availableModels;
                    if (list && Array.isArray(list)) {
                        models = list.map(m => {
                            if (typeof m === 'string') return { value: m, label: m };
                            return {
                                value: m.id || m.value || m.name,
                                label: m.label || m.name || m.id,
                                default: m.default
                            };
                        });
                        if (models.length > 0) return models;
                    }
                }
            }
        }

        // FALLBACK: Use default static lists if nothing found


        // Method 3: Check if there's a global model registry
        if (models.length === 0 && typeof window !== 'undefined') {
            // Check for model registries that SillyTavern might use
            const registryKeys = ['modelRegistry', 'apiModelRegistry', 'providerModels', 'availableModels'];
            for (const key of registryKeys) {
                if (window[key] && window[key][provider]) {
                    const providerModels = window[key][provider];
                    if (Array.isArray(providerModels)) {
                        console.log(`[Sidecar AI] Found models in window.${key}`);
                        models = providerModels.map(m => ({
                            value: m.id || m.value || m.name || m,
                            label: m.label || m.name || m.id || m.value || m,
                            default: m.default || false
                        }));
                        break;
                    }
                }
            }
        }

        // Method 3: Try connection profiles in settings
        if (models.length === 0 && this.context && this.context.settings) {
            console.log('[Sidecar AI] Checking context.settings...');
            console.log('[Sidecar AI] settings keys:', Object.keys(this.context.settings));
            if (this.context.settings.connection_profiles) {
                console.log('[Sidecar AI] Found settings.connection_profiles');
                const profiles = Object.values(this.context.settings.connection_profiles || {});
                for (const profile of profiles) {
                    if (profile && (profile.api_provider === provider || profile.provider === provider)) {
                        console.log('[Sidecar AI] Profile in settings keys:', Object.keys(profile));
                        if (profile.models && Array.isArray(profile.models)) {
                            models = profile.models.map(m => ({
                                value: m.id || m.name || m,
                                label: m.name || m.label || m.id || m,
                                default: m.default || false
                            }));
                            if (models.length > 0) break;
                        }
                    }
                }
            }
        }

        // Method 3: Try connection profiles directly in context
        if (models.length === 0 && this.context && this.context.connection_profiles) {
            console.log('[Sidecar AI] Found connection_profiles in context');
            const profiles = Object.values(this.context.connection_profiles || {});
            for (const profile of profiles) {
                if (profile && (profile.api_provider === provider || profile.provider === provider)) {
                    if (profile.models && Array.isArray(profile.models)) {
                        models = profile.models.map(m => ({
                            value: m.id || m.name || m,
                            label: m.name || m.label || m.id || m,
                            default: m.default || false
                        }));
                        if (models.length > 0) break;
                    }
                }
            }
        }

        // Method 4: Try to access ST's global model registry
        if (models.length === 0 && typeof window !== 'undefined') {
            // Check for mainApiManager or similar
            if (window.mainApiManager) {
                console.log('[Sidecar AI] Found window.mainApiManager');
                try {
                    if (window.mainApiManager.getModels) {
                        const stModels = window.mainApiManager.getModels(provider);
                        if (stModels && Array.isArray(stModels)) {
                            models = stModels.map(m => ({
                                value: m.id || m.name || m,
                                label: m.name || m.label || m.id || m,
                                default: m.default || false
                            }));
                        }
                    }
                } catch (e) {
                    console.log('[Sidecar AI] mainApiManager.getModels error:', e);
                }
            }

            // Try connectionProfilesManager if it exists
            if (models.length === 0 && window.connectionProfilesManager) {
                console.log('[Sidecar AI] Found connectionProfilesManager');
                try {
                    const profiles = window.connectionProfilesManager.getProfiles();
                    for (const profile of profiles || []) {
                        if (profile && (profile.api_provider === provider || profile.provider === provider)) {
                            if (profile.models) {
                                models = profile.models.map(m => ({
                                    value: m.id || m.name || m,
                                    label: m.name || m.label || m.id || m,
                                    default: m.default || false
                                }));
                                break;
                            }
                        }
                    }
                } catch (e) {
                    console.log('[Sidecar AI] connectionProfilesManager error:', e);
                }
            }

            // Try apiProvidersManager
            if (models.length === 0 && window.apiProvidersManager) {
                console.log('[Sidecar AI] Found apiProvidersManager');
                try {
                    const providerData = window.apiProvidersManager.getProvider(provider);
                    if (providerData && providerData.models) {
                        models = providerData.models.map(m => ({
                            value: m.id || m.name || m,
                            label: m.name || m.label || m.id || m,
                            default: m.default || false
                        }));
                    }
                } catch (e) {
                    console.log('[Sidecar AI] apiProvidersManager error:', e);
                }
            }
        }

        // Method 4: Fallback to default models if nothing found
        if (models.length === 0) {
            console.log('[Sidecar AI] Using fallback models for provider:', provider);
            const defaultModels = {
                'openai': [
                    { value: 'gpt-4o', label: 'GPT-4o', default: false },
                    { value: 'gpt-4-turbo', label: 'GPT-4 Turbo', default: false },
                    { value: 'gpt-4', label: 'GPT-4', default: false },
                    { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo', default: true }
                ],
                'openrouter': [
                    { value: 'openai/gpt-4o', label: 'OpenAI GPT-4o', default: false },
                    { value: 'openai/gpt-4-turbo', label: 'OpenAI GPT-4 Turbo', default: false },
                    { value: 'anthropic/claude-3.5-sonnet', label: 'Claude 3.5 Sonnet', default: false },
                    { value: 'google/gemini-pro-1.5', label: 'Google Gemini Pro 1.5', default: false },
                    { value: 'openai/gpt-3.5-turbo', label: 'OpenAI GPT-3.5 Turbo', default: true }
                ],
                'deepseek': [
                    { value: 'deepseek-chat', label: 'DeepSeek Chat', default: true },
                    { value: 'deepseek-coder', label: 'DeepSeek Coder', default: false }
                ],
                'anthropic': [
                    { value: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet', default: true },
                    { value: 'claude-3-opus-20240229', label: 'Claude 3 Opus', default: false },
                    { value: 'claude-3-sonnet-20240229', label: 'Claude 3 Sonnet', default: false },
                    { value: 'claude-3-haiku-20240307', label: 'Claude 3 Haiku', default: false }
                ],
                'google': [
                    { value: 'gemini-pro', label: 'Gemini Pro', default: true },
                    { value: 'gemini-pro-vision', label: 'Gemini Pro Vision', default: false }
                ],
                'cohere': [
                    { value: 'command', label: 'Command', default: true },
                    { value: 'command-light', label: 'Command Light', default: false }
                ]
            };
            models = defaultModels[provider] || [];
        }

        console.log('[Sidecar AI] Returning', models.length, 'models for provider:', provider);
        return models;
    }

    applyThemeColors() {
        // Get actual computed colors from SillyTavern's body
        const body = document.body;
        const computedStyle = window.getComputedStyle(body);
        const bgColor = computedStyle.backgroundColor || computedStyle.getPropertyValue('--SmartThemeBodyColor') || '#1e1e1e';
        const textColor = computedStyle.color || computedStyle.getPropertyValue('--SmartThemeBodyColor') || '#eee';
        const borderColor = computedStyle.getPropertyValue('--SmartThemeBorderColor') || '#555';

        // Force apply to modal
        const modalContent = document.querySelector('.add_ons_modal_content');
        if (modalContent) {
            modalContent.style.setProperty('background-color', bgColor, 'important');
            modalContent.style.setProperty('background', bgColor, 'important');
            modalContent.style.setProperty('color', textColor, 'important');
        }

        // Apply to all child elements
        const allElements = document.querySelectorAll('.add_ons_modal_content, .add_ons_modal_content *');
        allElements.forEach(el => {
            if (el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA' && el.tagName !== 'SELECT') {
                el.style.setProperty('background-color', bgColor, 'important');
                el.style.setProperty('background', bgColor, 'important');
            }
            if (el.tagName === 'LABEL' || el.tagName === 'H3' || el.tagName === 'H4' || el.tagName === 'P' || el.tagName === 'SMALL' || el.tagName === 'SPAN') {
                el.style.setProperty('color', textColor, 'important');
            }
        });
    }

    closeModal() {
        $('#add_ons_modal').hide();
        $('#add_ons_form')[0].reset();
    }

    /**
     * Check if API key exists in SillyTavern settings and prefill form
     */
    async checkAndPrefillAPIKey(provider) {
        if (!provider || !this.aiClient) {
            return;
        }

        const apiKeyField = $('#add_ons_form_api_key');
        const currentValue = apiKeyField.val();

        // Don't override if user has already entered something
        if (currentValue && currentValue.trim() !== '' && currentValue !== 'Using saved key from SillyTavern') {
            return;
        }

        // Check if ST has API key configured (check existence without fetching value)
        // This avoids 403 errors and is faster
        const hasApiKey = await this.aiClient.hasProviderApiKey(provider);
        if (hasApiKey) {
            apiKeyField.val('Using saved key from SillyTavern');
            apiKeyField.attr('data-using-st-key', 'true');
            apiKeyField.css('font-style', 'italic');
            apiKeyField.css('color', 'var(--SmartThemeBodyColor, #9fc)');
            console.log(`[Sidecar AI] Prefilled API key field for ${provider} (using saved key)`);
        } else {
            apiKeyField.val('');
            apiKeyField.removeAttr('data-using-st-key');
            apiKeyField.css('font-style', 'normal');
            apiKeyField.css('color', '');
            console.log(`[Sidecar AI] No saved API key found for ${provider}`);
        }
    }

    async populateForm(addon) {
        $('#add_ons_form_id').val(addon.id);
        $('#add_ons_form_name').val(addon.name);
        $('#add_ons_form_description').val(addon.description);
        $('#add_ons_form_prompt').val(addon.prompt);
        $('#add_ons_form_trigger_mode').val(addon.triggerMode);
        $('#add_ons_form_request_mode').val(addon.requestMode);
        $('#add_ons_form_ai_provider').val(addon.aiProvider);

        // Handle API key - if addon has one, use it; otherwise check ST's saved key
        if (addon.apiKey && addon.apiKey.trim() !== '') {
            $('#add_ons_form_api_key').val(addon.apiKey);
            $('#add_ons_form_api_key').removeAttr('data-using-st-key');
            $('#add_ons_form_api_key').css('font-style', 'normal');
            $('#add_ons_form_api_key').css('color', '');
        } else {
            // Check for ST's saved key
            await this.checkAndPrefillAPIKey(addon.aiProvider);
        }

        $('#add_ons_form_api_url').val(addon.apiUrl || '');

        // Handle service provider (OpenRouter only)
        if (addon.serviceProvider && Array.isArray(addon.serviceProvider)) {
            $('#add_ons_form_service_provider').val(addon.serviceProvider);
        } else {
            $('#add_ons_form_service_provider').val([]);
        }
        this.toggleServiceProviderField(addon.aiProvider);

        $('#add_ons_form_result_format').val(addon.resultFormat);
        $('#add_ons_form_response_location').val(addon.responseLocation);
        $('#add_ons_form_format_style').val(addon.formatStyle || 'markdown');

        // Load models for provider, then set selected model
        this.loadModelsForProvider(addon.aiProvider);
        setTimeout(() => {
            $('#add_ons_form_ai_model').val(addon.aiModel);
        }, 200);

        const ctx = addon.contextSettings || {};
        $('#add_ons_form_messages_count').val(ctx.messagesCount || 10);
        $('#add_ons_form_include_char_card').prop('checked', ctx.includeCharCard !== false);
        $('#add_ons_form_include_user_card').prop('checked', ctx.includeUserCard !== false);
        $('#add_ons_form_include_world_card').prop('checked', ctx.includeWorldCard !== false);

        // Add-on History settings
        const includeHistory = ctx.includeHistory === true;
        $('#add_ons_form_include_history').prop('checked', includeHistory);
        $('#add_ons_form_history_depth').val(ctx.historyDepth || 5);

        if (includeHistory) {
            $('#add_ons_history_depth_group').show();
        } else {
            $('#add_ons_history_depth_group').hide();
        }
    }

    /**
     * Test API connection with current form values
     */
    async testConnection() {
        const provider = $('#add_ons_form_ai_provider').val();
        const model = $('#add_ons_form_ai_model').val();
        const apiUrl = $('#add_ons_form_api_url').val()?.trim() || null;

        // Validate required fields
        if (!provider) {
            alert('Please select an AI Provider first.');
            $('#add_ons_form_ai_provider').focus();
            this.highlightError('#add_ons_form_ai_provider');
            return;
        }

        if (!model) {
            alert('Please select a Model first.');
            $('#add_ons_form_ai_model').focus();
            this.highlightError('#add_ons_form_ai_model');
            return;
        }

        // Get API key - check if using ST's saved key or user-entered key
        const apiKeyField = $('#add_ons_form_api_key');
        let apiKey = apiKeyField.val();
        const isUsingSTKey = apiKeyField.attr('data-using-st-key') === 'true' || apiKey === 'Using saved key from SillyTavern';

        // Get service provider for OpenRouter
        const serviceProvider = provider === 'openrouter'
            ? ($('#add_ons_form_service_provider').val() || [])
            : [];

        // If using ST's saved key, we'll use ChatCompletionService which handles keys internally
        // Otherwise, we need the actual key for testing
        if (!isUsingSTKey) {
            apiKey = apiKey.trim();
            if (!apiKey || apiKey.trim() === '') {
                alert('Please enter an API Key or configure it in SillyTavern\'s API Connection settings.');
                $('#add_ons_form_api_key').focus();
                this.highlightError('#add_ons_form_api_key');
                return;
            }
        } else {
            // Check if key exists (without fetching)
            const hasKey = this.aiClient.hasProviderApiKey(provider);
            if (!hasKey) {
                alert('No API key found in SillyTavern\'s settings. Please configure it in API Connection settings or enter a key manually.');
                $('#add_ons_form_api_key').focus();
                this.highlightError('#add_ons_form_api_key');
                return;
            }
            // Set apiKey to null - ChatCompletionService will fetch it
            apiKey = null;
        }

        // Clear previous errors
        this.clearErrors();

        // Show loading state
        const testButton = $('#add_ons_test_connection');
        const originalText = testButton.text();
        testButton.prop('disabled', true).text('Testing...');

        try {
            if (!this.aiClient) {
                throw new Error('AI Client not initialized');
            }

            // Use ChatCompletionService for testing if using ST key (avoids 403 errors)
            const result = await this.aiClient.testConnection(provider, model, apiKey, apiUrl, serviceProvider, isUsingSTKey);

            if (result.success) {
                alert('✓ Connection successful!');
                this.highlightSuccess('#add_ons_form_api_key');
                this.highlightSuccess('#add_ons_form_ai_provider');
                this.highlightSuccess('#add_ons_form_ai_model');
            } else {
                alert(`✗ Connection failed: ${result.message}`);
                this.highlightError('#add_ons_form_api_key');
                this.highlightError('#add_ons_form_ai_provider');
                this.highlightError('#add_ons_form_ai_model');
            }
        } catch (error) {
            console.error('[Sidecar AI] Connection test error:', error);
            alert(`✗ Connection test failed: ${error.message || String(error)}`);
            this.highlightError('#add_ons_form_api_key');
            this.highlightError('#add_ons_form_ai_provider');
            this.highlightError('#add_ons_form_ai_model');
        } finally {
            testButton.prop('disabled', false).text(originalText);
        }
    }

    /**
     * Highlight field with error styling
     */
    highlightError(selector) {
        $(selector).addClass('add_ons_field_error');
        setTimeout(() => {
            $(selector).removeClass('add_ons_field_error');
        }, 3000);
    }

    /**
     * Highlight field with success styling
     */
    highlightSuccess(selector) {
        $(selector).addClass('add_ons_field_success');
        setTimeout(() => {
            $(selector).removeClass('add_ons_field_success');
        }, 2000);
    }

    /**
     * Clear all error/success highlights
     */
    clearErrors() {
        $('.add_ons_field_error, .add_ons_field_success').removeClass('add_ons_field_error add_ons_field_success');
    }

    /**
     * Toggle service provider field visibility based on selected provider
     */
    toggleServiceProviderField(provider) {
        const serviceProviderRow = $('#add_ons_service_provider_row');
        if (provider === 'openrouter') {
            serviceProviderRow.show();
            this.loadServiceProviders();
        } else {
            serviceProviderRow.hide();
        }
    }

    /**
     * Load service providers from SillyTavern's OpenRouter providers dropdown
     */
    loadServiceProviders() {
        const $serviceProviderSelect = $('#add_ons_form_service_provider');

        // Try to get options from SillyTavern's OpenRouter providers dropdown
        const $stSelect = $('#openrouter_providers_chat');
        if ($stSelect.length > 0 && $stSelect.find('option').length > 0) {
            // Clear existing options
            $serviceProviderSelect.empty();

            // Copy options from SillyTavern's dropdown
            $stSelect.find('option').each(function () {
                const $option = $(this);
                const value = $option.val();
                const text = $option.text();

                if (value) {
                    $serviceProviderSelect.append(
                        $('<option></option>')
                            .attr('value', value)
                            .text(text)
                    );
                }
            });

            console.log(`[Sidecar AI] Loaded ${$serviceProviderSelect.find('option').length} service providers`);
        } else {
            console.log('[Sidecar AI] OpenRouter providers dropdown not found, service providers not loaded');
        }
    }

    async saveAddon() {
        const form = $('#add_ons_form')[0];
        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }

        // Get form values first
        const provider = $('#add_ons_form_ai_provider').val();
        const model = $('#add_ons_form_ai_model').val();
        const apiUrl = $('#add_ons_form_api_url').val()?.trim() || null;

        // Get API key - check if using ST's saved key or user-entered key
        const apiKeyField = $('#add_ons_form_api_key');
        let apiKey = apiKeyField.val();
        const isUsingSTKey = apiKeyField.attr('data-using-st-key') === 'true' ||
            apiKey === 'Using saved key from SillyTavern';

        // Get service provider for OpenRouter
        const serviceProvider = provider === 'openrouter'
            ? ($('#add_ons_form_service_provider').val() || [])
            : [];

        // If using ST's saved key, we don't need to fetch it - testConnection will use ChatCompletionService
        // Only validate that a key exists (for UI prefilling check)
        if (!isUsingSTKey) {
            apiKey = apiKey.trim();
            // Validate API key is available
            if (!apiKey || apiKey.trim() === '') {
                alert('API Key is required. Please enter your API key or configure it in SillyTavern\'s API Connection settings.');
                $('#add_ons_form_api_key').focus();
                this.highlightError('#add_ons_form_api_key');
                return;
            }
        } else {
            // Check if key exists in ST (without fetching to avoid 403)
            const hasKey = await this.aiClient.hasProviderApiKey(provider);
            if (!hasKey) {
                alert('API Key is required. Please configure it in SillyTavern\'s API Connection settings.');
                $('#add_ons_form_api_key').focus();
                this.highlightError('#add_ons_form_api_key');
                return;
            }
            // Set to empty string - testConnection will use ChatCompletionService when isUsingSTKey=true
            apiKey = '';
        }

        // Test connection before saving
        const saveButton = $('#add_ons_form_save');
        const originalText = saveButton.text();
        saveButton.prop('disabled', true).text('Testing connection...');

        try {
            // Clear previous errors
            this.clearErrors();

            if (this.aiClient) {
                // Pass isUsingSTKey and serviceProvider to testConnection
                // When isUsingSTKey=true, testConnection will use ChatCompletionService without fetching the key
                const testResult = await this.aiClient.testConnection(
                    provider,
                    model,
                    apiKey,
                    apiUrl,
                    serviceProvider,
                    isUsingSTKey
                );

                if (!testResult.success) {
                    alert(`✗ Cannot save: Connection test failed.\n\n${testResult.message}\n\nPlease check your API key, model, and endpoint settings.`);
                    this.highlightError('#add_ons_form_api_key');
                    this.highlightError('#add_ons_form_ai_provider');
                    this.highlightError('#add_ons_form_ai_model');
                    if (apiUrl) {
                        this.highlightError('#add_ons_form_api_url');
                    }
                    saveButton.prop('disabled', false).text(originalText);
                    return;
                }
            }

            // Connection test passed, proceed with save
            saveButton.text('Saving...');

            // Get actual API key for saving (reuse isUsingSTKey from above)
            const fieldValue = apiKeyField.val();
            let savedApiKey = '';
            if (!isUsingSTKey && fieldValue && fieldValue.trim() !== '' && fieldValue !== 'Using saved key from SillyTavern') {
                savedApiKey = fieldValue.trim();
            }
            // If using ST key, save empty string (we'll fetch from ST when needed)

            // serviceProvider is already defined above (line 982), reuse it

            const formData = {
                id: $('#add_ons_form_id').val(),
                name: $('#add_ons_form_name').val(),
                description: $('#add_ons_form_description').val(),
                prompt: $('#add_ons_form_prompt').val(),
                triggerMode: $('#add_ons_form_trigger_mode').val(),
                requestMode: $('#add_ons_form_request_mode').val(),
                aiProvider: provider,
                aiModel: model,
                apiKey: savedApiKey, // Save empty if using ST key, otherwise save the entered key
                apiUrl: apiUrl || '', // Optional
                serviceProvider: serviceProvider, // Array of service providers for OpenRouter
                resultFormat: $('#add_ons_form_result_format').val(),
                responseLocation: $('#add_ons_form_response_location').val(),
                formatStyle: $('#add_ons_form_format_style').val() || 'markdown',
                contextSettings: {
                    messagesCount: parseInt($('#add_ons_form_messages_count').val()) || 10,
                    includeCharCard: $('#add_ons_form_include_char_card').is(':checked'),
                    includeUserCard: $('#add_ons_form_include_user_card').is(':checked'),
                    includeWorldCard: $('#add_ons_form_include_world_card').is(':checked'),
                    includeHistory: $('#add_ons_form_include_history').is(':checked'),
                    historyDepth: parseInt($('#add_ons_form_history_depth').val()) || 5
                },
                enabled: true
            };

            if (!this.addonManager) {
                alert('Sidecar AI not initialized. Please refresh the page.');
                return;
            }

            if (formData.id) {
                this.addonManager.updateAddon(formData.id, formData);
            } else {
                this.addonManager.createAddon(formData);
            }

            // Ensure settings are saved (API keys persist in extension settings)
            await this.addonManager.saveAddons();

            this.closeModal();
            this.refreshSettings();
        } catch (error) {
            console.error('Error saving Sidecar:', error);
            alert('Error saving Sidecar: ' + error.message);
            this.highlightError('#add_ons_form_api_key');
        } finally {
            saveButton.prop('disabled', false).text(originalText);
        }
    }

    deleteAddon(addonId) {
        if (!this.addonManager) {
            alert('Sidecar AI not initialized. Please refresh the page.');
            return;
        }

        try {
            this.addonManager.deleteAddon(addonId);
            this.refreshSettings();
        } catch (error) {
            console.error('Error deleting Sidecar:', error);
            alert('Error deleting Sidecar: ' + error.message);
        }
    }

    toggleAddon(addonId, enabled) {
        if (!this.addonManager) {
            return;
        }

        try {
            const addon = this.addonManager.getAddon(addonId);
            if (addon) {
                addon.enabled = enabled;
                this.addonManager.updateAddon(addonId, { enabled: enabled });
            }
        } catch (error) {
            console.error('Error toggling Sidecar:', error);
        }
    }

    refreshSettings() {
        // Trigger settings refresh in SillyTavern
        if (this.context && this.context.saveSettingsDebounced) {
            this.context.saveSettingsDebounced();
        }

        // Re-render the list
        this.renderAddonsList();
    }

    updateSelectedCount() {
        const count = this.selectedAddons.size;
        $('#add_ons_selected_count').text(`${count} selected`);
    }

    updateBulkActionBar() {
        const controlsContainer = $('.add_ons_controls');
        let bulkBar = $('#add_ons_bulk_action_bar');

        if (this.selectedAddons.size > 0) {
            if (bulkBar.length === 0) {
                bulkBar = $('<div id="add_ons_bulk_action_bar" class="add_ons_bulk_action_bar"></div>');
                bulkBar.html(`
                    <div class="add_ons_bulk_action_content">
                        <span class="add_ons_bulk_action_info">${this.selectedAddons.size} item(s) selected</span>
                        <div class="add_ons_bulk_action_buttons">
                            <button class="menu_button add_ons_button_small" id="add_ons_bulk_enable" title="Enable Selected">
                                <i class="fa-solid fa-check"></i> Enable
                            </button>
                            <button class="menu_button add_ons_button_small" id="add_ons_bulk_disable" title="Disable Selected">
                                <i class="fa-solid fa-times"></i> Disable
                            </button>
                            <button class="menu_button add_ons_button_small" id="add_ons_bulk_duplicate" title="Duplicate Selected">
                                <i class="fa-solid fa-copy"></i> Duplicate
                            </button>
                            <button class="menu_button add_ons_button_small add_ons_button_danger" id="add_ons_bulk_delete" title="Delete Selected">
                                <i class="fa-solid fa-trash"></i> Delete
                            </button>
                            <button class="menu_button add_ons_button_small" id="add_ons_bulk_clear" title="Clear Selection">
                                <i class="fa-solid fa-times-circle"></i> Clear
                            </button>
                        </div>
                    </div>
                `);
                controlsContainer.after(bulkBar);
            } else {
                bulkBar.find('.add_ons_bulk_action_info').text(`${this.selectedAddons.size} item(s) selected`);
            }
            bulkBar.show();
        } else {
            if (bulkBar.length > 0) {
                bulkBar.hide();
            }
        }
    }

    clearSelection() {
        this.selectedAddons.clear();
        $('.add_ons_item_checkbox').prop('checked', false);
        $('#add_ons_select_all').prop('checked', false);
        $('.add_ons_item').removeClass('add_ons_item_selected');
        this.updateBulkActionBar();
        this.updateSelectedCount();
    }

    bulkEnable() {
        if (this.selectedAddons.size === 0) {
            alert('Please select at least one add-on.');
            return;
        }

        const count = this.addonManager.bulkEnable(Array.from(this.selectedAddons));
        if (count > 0) {
            this.clearSelection();
            this.refreshSettings();
            console.log(`[Sidecar AI] Enabled ${count} add-on(s)`);
        }
    }

    bulkDisable() {
        if (this.selectedAddons.size === 0) {
            alert('Please select at least one add-on.');
            return;
        }

        const count = this.addonManager.bulkDisable(Array.from(this.selectedAddons));
        if (count > 0) {
            this.clearSelection();
            this.refreshSettings();
            console.log(`[Sidecar AI] Disabled ${count} add-on(s)`);
        }
    }

    bulkDelete() {
        if (this.selectedAddons.size === 0) {
            alert('Please select at least one add-on.');
            return;
        }

        const count = this.selectedAddons.size;
        if (!confirm(`Are you sure you want to delete ${count} add-on(s)? This cannot be undone.`)) {
            return;
        }

        const deleted = this.addonManager.bulkDelete(Array.from(this.selectedAddons));
        if (deleted > 0) {
            this.clearSelection();
            this.refreshSettings();
            console.log(`[Sidecar AI] Deleted ${deleted} add-on(s)`);
        }
    }

    bulkDuplicate() {
        if (this.selectedAddons.size === 0) {
            alert('Please select at least one add-on.');
            return;
        }

        const duplicated = this.addonManager.bulkDuplicate(Array.from(this.selectedAddons));
        if (duplicated.length > 0) {
            this.clearSelection();
            this.refreshSettings();
            console.log(`[Sidecar AI] Duplicated ${duplicated.length} add-on(s)`);
        }
    }

    duplicateAddon(addonId) {
        const duplicated = this.addonManager.duplicateAddon(addonId);
        if (duplicated) {
            this.refreshSettings();
            console.log(`[Sidecar AI] Duplicated add-on: ${duplicated.name}`);
        }
    }

    moveAddonUp(addonId) {
        if (this.addonManager.moveAddonUp(addonId)) {
            this.refreshSettings();
        }
    }

    moveAddonDown(addonId) {
        if (this.addonManager.moveAddonDown(addonId)) {
            this.refreshSettings();
        }
    }

    showHistoryViewer(addonId) {
        const addon = this.addonManager.getAddon(addonId);
        if (!addon) {
            alert('Add-on not found');
            return;
        }

        // Get result formatter from context (we need to access it)
        // For now, we'll create a temporary one or access it differently
        // Since we don't have direct access, we'll need to get it from window or context
        let resultFormatter = null;
        if (window.addOnsExtension && window.addOnsExtension.getEventHandler) {
            const eventHandler = window.addOnsExtension.getEventHandler();
            if (eventHandler && eventHandler.resultFormatter) {
                resultFormatter = eventHandler.resultFormatter;
            }
        }

        if (!resultFormatter) {
            alert('Unable to access result formatter. Please refresh the page.');
            return;
        }

        // Get all results for this add-on
        const results = resultFormatter.getAllResultsForAddon(addonId);

        // Set modal title
        $('#add_ons_history_modal_title').text(`Result History: ${addon.name} (${results.length} results)`);

        // Store current addon and results for filtering
        this.currentHistoryAddon = addon;
        this.currentHistoryResults = results;

        // Render history list
        this.renderHistoryList(results);

        // Show modal
        $('#add_ons_history_modal').show();
    }

    renderHistoryList(results) {
        const listContainer = $('#add_ons_history_list');
        listContainer.empty();

        if (results.length === 0) {
            listContainer.html('<div style="text-align: center; padding: 20px; color: rgba(255, 255, 255, 0.5);">No results found for this add-on.</div>');
            return;
        }

        results.forEach((result, index) => {
            const item = document.createElement('div');
            item.className = 'add_ons_history_item';
            item.style.cssText = 'padding: 12px; border: 1px solid var(--SmartThemeBorderColor, #555); border-radius: 5px; background: rgba(128, 128, 128, 0.05);';

            const date = new Date(result.timestamp);
            const dateStr = date.toLocaleString();

            item.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">
                    <div>
                        <strong style="color: #eee;">Result #${results.length - index}</strong>
                        ${result.edited ? '<span style="margin-left: 8px; padding: 2px 6px; background: rgba(255, 193, 7, 0.2); border: 1px solid rgba(255, 193, 7, 0.5); border-radius: 3px; color: #ffc107; font-size: 0.8em;">EDITED</span>' : ''}
                        <div style="font-size: 0.85em; color: rgba(255, 255, 255, 0.5); margin-top: 4px;">${dateStr}</div>
                    </div>
                    <div style="display: flex; gap: 5px;">
                        <button class="menu_button add_ons_button_small" data-action="view-result" data-index="${index}" title="View Full">
                            <i class="fa-solid fa-eye"></i>
                        </button>
                        <button class="menu_button add_ons_button_small add_ons_button_danger" data-action="delete-result" data-index="${index}" title="Delete">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                </div>
                <div style="font-size: 0.9em; color: rgba(255, 255, 255, 0.7); margin-bottom: 4px;">
                    <strong>Message:</strong> ${result.messagePreview || 'N/A'}
                </div>
                <div style="font-size: 0.85em; color: rgba(255, 255, 255, 0.6); max-height: 60px; overflow: hidden; text-overflow: ellipsis;">
                    ${result.content.substring(0, 150)}${result.content.length > 150 ? '...' : ''}
                </div>
            `;

            // View button
            $(item).find('[data-action="view-result"]').on('click', () => {
                this.viewFullResult(result, index);
            });

            // Delete button
            $(item).find('[data-action="delete-result"]').on('click', () => {
                if (confirm('Are you sure you want to delete this result?')) {
                    this.deleteHistoryResult(result, index);
                }
            });

            listContainer.append(item);
        });
    }

    viewFullResult(result, index) {
        const modal = $('<div class="add_ons_modal" style="display: flex;"><div class="add_ons_modal_content" style="max-width: 800px;"><div class="add_ons_modal_header"><h3>Full Result</h3><button class="add_ons_modal_close">&times;</button></div><div class="add_ons_modal_body"><pre style="white-space: pre-wrap; word-wrap: break-word; max-height: 60vh; overflow-y: auto; background: #2e2e2e; padding: 15px; border-radius: 5px;">' +
            this.escapeHtml(result.content) +
            '</pre></div><div class="add_ons_modal_footer"><button class="menu_button" data-close-view>Close</button></div></div></div>');

        modal.find('.add_ons_modal_close, [data-close-view]').on('click', () => {
            modal.remove();
        });

        $('body').append(modal);
        modal.show();
    }

    deleteHistoryResult(result, index) {
        // Get result formatter
        let resultFormatter = null;
        if (window.addOnsExtension && window.addOnsExtension.getEventHandler) {
            const eventHandler = window.addOnsExtension.getEventHandler();
            if (eventHandler && eventHandler.resultFormatter) {
                resultFormatter = eventHandler.resultFormatter;
            }
        }

        if (!resultFormatter) {
            alert('Unable to access result formatter.');
            return;
        }

        // Find message in chat log
        const chatLog = this.context.chat || this.context.chatLog || [];
        const message = chatLog[result.messageIndex];

        if (message && resultFormatter.deleteResultFromMetadata(message, result.addonId)) {
            // Save chat
            if (this.context.saveChat) {
                this.context.saveChat();
            } else if (this.context.saveSettingsDebounced) {
                this.context.saveSettingsDebounced();
            }

            // Remove from current results
            this.currentHistoryResults.splice(index, 1);
            this.renderHistoryList(this.currentHistoryResults);
            console.log(`[Sidecar AI] Deleted result from history`);
        } else {
            alert('Failed to delete result. It may have already been removed.');
        }
    }

    filterHistory() {
        if (!this.currentHistoryResults) {
            return;
        }

        const searchTerm = $('#add_ons_history_search').val().toLowerCase();
        const sortOrder = $('#add_ons_history_sort').val();

        let filtered = this.currentHistoryResults.filter(result => {
            if (!searchTerm) return true;
            return result.content.toLowerCase().includes(searchTerm) ||
                result.messagePreview.toLowerCase().includes(searchTerm);
        });

        // Sort
        if (sortOrder === 'oldest') {
            filtered.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
        } else {
            filtered.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        }

        this.renderHistoryList(filtered);
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    handleExport() {
        try {
            // Check if there are selected add-ons for bulk export
            const selectedIds = this.selectedAddons.size > 0
                ? Array.from(this.selectedAddons)
                : null;

            // Ask if user wants to include API keys
            const includeApiKeys = confirm(
                'Include API keys in export?\n\n' +
                'Click OK to include API keys (less secure but convenient).\n' +
                'Click Cancel to exclude API keys (more secure, you\'ll need to re-enter them).'
            );

            // Export add-ons
            const exportData = this.addonManager.exportAddons(selectedIds, includeApiKeys);

            // Convert to JSON string
            const jsonString = JSON.stringify(exportData, null, 2);

            // Create blob and download
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `sidecar-addons-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            console.log(`[Sidecar AI] Exported ${exportData.addons.length} add-on(s)`);

            // Show success message
            if (selectedIds) {
                alert(`Successfully exported ${exportData.addons.length} selected add-on(s).`);
            } else {
                alert(`Successfully exported ${exportData.addons.length} add-on(s).`);
            }
        } catch (error) {
            console.error('[Sidecar AI] Export error:', error);
            alert('Error exporting add-ons: ' + error.message);
        }
    }

    handleImport() {
        // Create file input element
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.json';
        fileInput.style.display = 'none';

        fileInput.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const importData = JSON.parse(event.target.result);
                    this.processImport(importData);
                } catch (error) {
                    console.error('[Sidecar AI] Import parse error:', error);
                    alert('Error parsing import file: ' + error.message + '\n\nPlease ensure the file is valid JSON.');
                }
            };
            reader.readAsText(file);
        };

        // Also allow paste from clipboard
        const pasteOption = confirm(
            'Import from file or clipboard?\n\n' +
            'OK = Choose file\n' +
            'Cancel = Paste from clipboard'
        );

        if (pasteOption) {
            document.body.appendChild(fileInput);
            fileInput.click();
            document.body.removeChild(fileInput);
        } else {
            // Paste from clipboard
            const pastePrompt = prompt(
                'Paste the JSON export data below:',
                ''
            );

            if (pastePrompt && pastePrompt.trim()) {
                try {
                    const importData = JSON.parse(pastePrompt.trim());
                    this.processImport(importData);
                } catch (error) {
                    console.error('[Sidecar AI] Import parse error:', error);
                    alert('Error parsing pasted data: ' + error.message + '\n\nPlease ensure the data is valid JSON.');
                }
            }
        }
    }

    processImport(importData) {
        try {
            // Validate import data
            if (!importData || !importData.addons || !Array.isArray(importData.addons)) {
                throw new Error('Invalid import data: addons array is required');
            }

            // Show preview and ask for merge mode
            const addonCount = importData.addons.length;
            const addonNames = importData.addons.slice(0, 5).map(a => a.name || 'Unnamed').join(', ');
            const moreText = addonCount > 5 ? ` and ${addonCount - 5} more` : '';

            const mergeMode = confirm(
                `Import ${addonCount} add-on(s):\n${addonNames}${moreText}\n\n` +
                `How would you like to import?\n\n` +
                `OK = Merge (add new, keep existing)\n` +
                `Cancel = Replace (replace all existing add-ons)`
            ) ? 'merge' : 'replace';

            // Confirm replace mode
            if (mergeMode === 'replace') {
                if (!confirm(`WARNING: This will replace ALL existing add-ons with the imported ones.\n\nAre you sure?`)) {
                    return;
                }
            }

            // Import add-ons
            const result = this.addonManager.importAddons(importData, mergeMode);

            // Show result
            let message = `Import completed!\n\n`;
            message += `Imported: ${result.imported}\n`;
            if (result.skipped > 0) {
                message += `Skipped: ${result.skipped}\n`;
            }
            if (result.errors.length > 0) {
                message += `Errors: ${result.errors.length}\n`;
                console.error('[Sidecar AI] Import errors:', result.errors);
            }

            alert(message);

            // Refresh UI
            this.clearSelection();
            this.refreshSettings();
        } catch (error) {
            console.error('[Sidecar AI] Import error:', error);
            alert('Error importing add-ons: ' + error.message);
        }
    }
}
