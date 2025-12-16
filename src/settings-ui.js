export class SettingsUI {
    constructor(context, addonManager, aiClient) {
        this.context = context;
        this.addonManager = addonManager;
        this.aiClient = aiClient;
        this.initialized = false;
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
            return;
        }

        // Render add-ons
        addons.forEach(addon => {
            const item = document.createElement('div');
            item.className = 'add_ons_item';
            item.setAttribute('data-addon-id', addon.id);

            const enabledBadge = addon.enabled ?
                '<span class="add_ons_badge add_ons_badge_enabled">Enabled</span>' :
                '<span class="add_ons_badge add_ons_badge_disabled">Disabled</span>';

            item.innerHTML = `
                <div class="add_ons_item_header">
                    <div class="add_ons_item_info">
                        <h4>${addon.name || 'Unnamed Sidecar'}</h4>
                        <span class="add_ons_item_meta">
                            ${enabledBadge}
                            <span class="add_ons_badge">${addon.triggerMode || 'auto'}</span>
                            <span class="add_ons_badge">${addon.requestMode || 'standalone'}</span>
                            <span class="add_ons_badge">${addon.responseLocation || 'outsideChatlog'}</span>
                        </span>
                    </div>
                    <div class="add_ons_item_actions">
                        <label class="add_ons_toggle" title="Enable/Disable">
                            <input type="checkbox" ${addon.enabled ? 'checked' : ''} data-addon-id="${addon.id}" class="add_ons_enable_toggle">
                            <span class="add_ons_toggle_slider"></span>
                        </label>
                        <button class="menu_button add_ons_button_small" data-action="edit" data-addon-id="${addon.id}">
                            <i class="fa-solid fa-edit"></i> Edit
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
    }

    bindEvents() {
        const self = this;

        // Create Sidecar button
        $(document).off('click.sidecar', '#sidecar_create_button').on('click.sidecar', '#sidecar_create_button', function (e) {
            e.preventDefault();
            e.stopPropagation();
            self.openModal();
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
        $(document).off('change.sidecar', '#add_ons_form_ai_provider').on('change.sidecar', '#add_ons_form_ai_provider', function (e) {
            e.stopPropagation();
            const provider = $(this).val();
            self.loadModelsForProvider(provider);
            self.checkAndPrefillAPIKey(provider);
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

    }

    openModal(addonId = null) {
        const modal = $('#add_ons_modal');
        const form = $('#add_ons_form')[0];

        if (addonId) {
            // Edit mode
            if (this.addonManager) {
                const addon = this.addonManager.getAddon(addonId);
                if (addon) {
                    this.populateForm(addon);
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
            setTimeout(() => {
                this.loadModelsForProvider('openai');
                this.checkAndPrefillAPIKey('openai');
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

        const models = this.getProviderModels(provider);

        setTimeout(() => {
            modelSelect.empty();
            if (models.length === 0) {
                modelSelect.append('<option value="">No models available</option>');
                return;
            }

            models.forEach(model => {
                const option = $('<option></option>').val(model.value).text(model.label);
                if (model.default) {
                    option.prop('selected', true);
                }
                modelSelect.append(option);
            });
        }, 100);
    }

    getProviderModels(provider) {
        let models = [];
        console.log('[Sidecar AI] Loading models for provider:', provider);

        // STRATEGY 1: "Steal" from SillyTavern's existing UI (The "Lazy" but effective method)
        // If the user has the API Connections tab loaded, the dropdowns might already be populated
        const domSelectors = [
            `#model_${provider}`,
            `#${provider}_model`,
            `select[name="${provider}_model"]`,
            `#model_${provider}_select`,
            `#api_button_${provider}` // Sometimes attached to buttons
        ];

        for (const selector of domSelectors) {
            const $el = $(selector);
            if ($el.length && $el.is('select') && $el.find('option').length > 1) { // >1 because of default "Select..." option
                console.log(`[Sidecar AI] Found populated dropdown at ${selector}`);
                $el.find('option').each(function () {
                    const val = $(this).val();
                    const txt = $(this).text();
                    if (val && val !== '') {
                        models.push({
                            value: val,
                            label: txt,
                            default: false
                        });
                    }
                });
                if (models.length > 0) {
                    console.log('[Sidecar AI] Successfully stole models from UI:', models.length);
                    return models;
                }
            }
        }

        // STRATEGY 2: Check OpenRouter specific cache (openrouter_providers)
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

                // Case A: Object of providers { "openai": { models: [...] } }
                if (typeof providers === 'object' && !Array.isArray(providers)) {
                    for (const [providerName, providerData] of Object.entries(providers)) {
                        if (providerData && providerData.models) {
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
                        } else if (Array.isArray(providerData)) {
                            // Case B: Object where values are arrays directly
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
                // Case C: Array of providers
                else if (Array.isArray(providers)) {
                    providers.forEach(p => {
                        if (p.models) {
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
            }
        }

        if (models.length > 0) {
            console.log('[Sidecar AI] Parsed', models.length, 'models from settings cache');
            return models;
        }

        // STRATEGY 3: Iterate mainApi array (Connection Profiles)
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
    checkAndPrefillAPIKey(provider) {
        if (!provider || !this.aiClient) {
            return;
        }

        const apiKeyField = $('#add_ons_form_api_key');
        const currentValue = apiKeyField.val();

        // Don't override if user has already entered something
        if (currentValue && currentValue.trim() !== '' && currentValue !== 'Using saved key from SillyTavern') {
            return;
        }

        // Check if ST has API key configured
        const stApiKey = this.aiClient.getProviderApiKey(provider);
        if (stApiKey) {
            apiKeyField.val('Using saved key from SillyTavern');
            apiKeyField.attr('data-using-st-key', 'true');
            apiKeyField.css('font-style', 'italic');
            apiKeyField.css('color', 'var(--SmartThemeBodyColor, #9fc)');
        } else {
            apiKeyField.val('');
            apiKeyField.removeAttr('data-using-st-key');
            apiKeyField.css('font-style', 'normal');
            apiKeyField.css('color', '');
        }
    }

    populateForm(addon) {
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
            this.checkAndPrefillAPIKey(addon.aiProvider);
        }

        $('#add_ons_form_api_url').val(addon.apiUrl || '');
        $('#add_ons_form_result_format').val(addon.resultFormat);
        $('#add_ons_form_response_location').val(addon.responseLocation);

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

        // If using ST's saved key, get it from ST settings
        if (isUsingSTKey) {
            if (this.aiClient) {
                apiKey = this.aiClient.getProviderApiKey(provider);
            } else {
                apiKey = null;
            }
        } else {
            apiKey = apiKey.trim();
        }

        if (!apiKey || apiKey.trim() === '') {
            alert('Please enter an API Key or configure it in SillyTavern\'s API Connection settings.');
            $('#add_ons_form_api_key').focus();
            this.highlightError('#add_ons_form_api_key');
            return;
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

            const result = await this.aiClient.testConnection(provider, model, apiKey, apiUrl);

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

        // If using ST's saved key, get it from ST settings
        if (isUsingSTKey) {
            if (this.aiClient) {
                apiKey = this.aiClient.getProviderApiKey(provider);
            } else {
                apiKey = null;
            }
        } else {
            apiKey = apiKey.trim();
        }

        // Validate API key is available
        if (!apiKey || apiKey.trim() === '') {
            alert('API Key is required. Please enter your API key or configure it in SillyTavern\'s API Connection settings.');
            $('#add_ons_form_api_key').focus();
            this.highlightError('#add_ons_form_api_key');
            return;
        }

        // Test connection before saving
        const saveButton = $('#add_ons_form_save');
        const originalText = saveButton.text();
        saveButton.prop('disabled', true).text('Testing connection...');

        try {
            // Clear previous errors
            this.clearErrors();

            if (this.aiClient) {
                const testResult = await this.aiClient.testConnection(provider, model, apiKey.trim(), apiUrl);

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
                resultFormat: $('#add_ons_form_result_format').val(),
                responseLocation: $('#add_ons_form_response_location').val(),
                contextSettings: {
                    messagesCount: parseInt($('#add_ons_form_messages_count').val()) || 10,
                    includeCharCard: $('#add_ons_form_include_char_card').is(':checked'),
                    includeUserCard: $('#add_ons_form_include_user_card').is(':checked'),
                    includeWorldCard: $('#add_ons_form_include_world_card').is(':checked')
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
}
