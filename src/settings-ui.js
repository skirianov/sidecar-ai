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

            let triggerBadgeClass = 'manual';
            if (addon.triggerMode === 'auto') triggerBadgeClass = 'auto';
            if (addon.triggerMode === 'trigger') triggerBadgeClass = 'trigger'; // You'll need CSS for this

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
                            <span class="add_ons_badge add_ons_badge_${triggerBadgeClass}">${addon.triggerMode || 'auto'}</span>
                            <span class="add_ons_badge">${addon.requestMode || 'standalone'}</span>
                            <span class="add_ons_badge">${addon.responseLocation || 'outsideChatlog'}</span>
                            ${addon.formatStyle && addon.formatStyle !== 'html-css' ? `<span class="add_ons_badge" title="Format Style">${addon.formatStyle}</span>` : ''}
                        </span>
                    </div>
                    <div class="add_ons_item_actions">
                        <label class="add_ons_toggle" title="Enable/Disable">
                            <input type="checkbox" ${addon.enabled ? 'checked' : ''} data-addon-id="${addon.id}" class="add_ons_enable_toggle">
                            <span class="add_ons_toggle_slider"></span>
                        </label>
                        <button class="menu_button add_ons_button_small" data-action="edit" data-addon-id="${addon.id}" title="Edit">
                            <i class="fa-solid fa-edit"></i>
                        </button>
                        <button class="menu_button add_ons_button_small" data-action="history" data-addon-id="${addon.id}" title="View History">
                            <i class="fa-solid fa-history"></i>
                        </button>
                        <button class="menu_button add_ons_button_small" data-action="duplicate" data-addon-id="${addon.id}" title="Duplicate">
                            <i class="fa-solid fa-copy"></i>
                        </button>
                        <button class="menu_button add_ons_button_small add_ons_button_danger" data-action="delete" data-addon-id="${addon.id}" title="Delete">
                            <i class="fa-solid fa-trash"></i>
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

        // AI Template Maker button
        $(document).off('click.sidecar', '#sidecar_ai_maker_button').on('click.sidecar', '#sidecar_ai_maker_button', function (e) {
            e.preventDefault();
            e.stopPropagation();
            self.openAIMakerModal();
        });

        // Templates button
        $(document).off('click.sidecar', '#sidecar_templates_button').on('click.sidecar', '#sidecar_templates_button', function (e) {
            e.preventDefault();
            e.stopPropagation();
            self.openTemplatesModal();
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

        // Result format hint
        $(document).off('change.sidecar', '#add_ons_form_result_format').on('change.sidecar', '#add_ons_form_result_format', function (e) {
            e.stopPropagation();
            const format = $(this).val();
            const hint = $('#add_ons_result_format_hint');

            switch (format) {
                case 'collapsible':
                    hint.html('Collapsible: &lt;details&gt; tag - <strong>Click to expand/collapse</strong> (best for long content)');
                    break;
                case 'separate':
                    hint.html('Separate Block: <strong>Always visible</strong> with --- Name --- borders (good for short content)');
                    break;
                case 'append':
                    hint.html('Append: <strong>Seamlessly inline</strong> - No wrapper, flows with message (use carefully)');
                    break;
            }
        });

        // Response location hint - prevent event bubbling
        $(document).off('change.sidecar', '#add_ons_form_response_location').on('change.sidecar', '#add_ons_form_response_location', function (e) {
            e.stopPropagation();
            const location = $(this).val();
            const hint = $('#add_ons_response_location_hint');
            if (location === 'chatHistory') {
                hint.text('Chat History: Injected as HTML comment inside message (main AI can see it)');
            } else {
                hint.text('Outside: Shows in card below message (clean, doesn\'t clutter chat)');
            }
        });

        // Prevent modal content clicks from closing modal (stop propagation)
        $(document).off('click.sidecar', '.add_ons_modal_content').on('click.sidecar', '.add_ons_modal_content', function (e) {
            e.stopPropagation();
        });

        // Close modal when clicking backdrop (outside content)
        $(document).off('click.sidecar', '.add_ons_modal').on('click.sidecar', '.add_ons_modal', function (e) {
            if (e.target === this) {
                self.closeModal();
            }
        });

        // Close history modal when clicking backdrop
        $(document).off('click.sidecar', '#add_ons_history_modal').on('click.sidecar', '#add_ons_history_modal', function (e) {
            if (e.target === this) {
                $('#add_ons_history_modal').hide();
            }
        });

        // Close templates modal when clicking backdrop
        $(document).off('click.sidecar', '#add_ons_templates_modal').on('click.sidecar', '#add_ons_templates_modal', function (e) {
            if (e.target === this) {
                $('#add_ons_templates_modal').hide();
            }
        });

        // AI Maker modal close
        $(document).off('click.sidecar', '#add_ons_ai_maker_modal_close, #ai_maker_cancel').on('click.sidecar', '#add_ons_ai_maker_modal_close, #ai_maker_cancel', function (e) {
            e.preventDefault();
            e.stopPropagation();
            self.closeAIMakerModal();
        });

        // Close AI Maker modal when clicking backdrop
        $(document).off('click.sidecar', '#add_ons_ai_maker_modal').on('click.sidecar', '#add_ons_ai_maker_modal', function (e) {
            if (e.target === this) {
                self.closeAIMakerModal();
            }
        });

        // AI Maker generate button
        $(document).off('click.sidecar', '#ai_maker_generate').on('click.sidecar', '#ai_maker_generate', function (e) {
            e.preventDefault();
            e.stopPropagation();
            self.generateTemplate();
        });

        // AI Maker export button
        $(document).off('click.sidecar', '#ai_maker_export').on('click.sidecar', '#ai_maker_export', function (e) {
            e.preventDefault();
            e.stopPropagation();
            self.exportGeneratedTemplate();
        });

        // AI Maker add button
        $(document).off('click.sidecar', '#ai_maker_add').on('click.sidecar', '#ai_maker_add', function (e) {
            e.preventDefault();
            e.stopPropagation();
            self.addGeneratedTemplate();
        });

        // AI Maker test button
        $(document).off('click.sidecar', '#ai_maker_test').on('click.sidecar', '#ai_maker_test', function (e) {
            e.preventDefault();
            e.stopPropagation();
            self.testTemplate();
        });

        // AI Maker publish button
        $(document).off('click.sidecar', '#ai_maker_publish').on('click.sidecar', '#ai_maker_publish', function (e) {
            e.preventDefault();
            e.stopPropagation();
            self.publishTemplate();
        });

        // Prevent select dropdowns from being interfered with
        $(document).off('click.sidecar', '.add_ons_modal select').on('click.sidecar', '.add_ons_modal select', function (e) {
            e.stopPropagation();
        });

        // Format style change - ensure history depth minimum for beautify
        $(document).off('change.sidecar', '#add_ons_form_format_style').on('change.sidecar', '#add_ons_form_format_style', function (e) {
            const formatStyle = $(this).val();
            const historyDepthInput = $('#add_ons_form_history_depth');

            // Enforce minimum depth of 1 (always, but especially for beautify)
            const currentDepth = parseInt(historyDepthInput.val()) || 0;
            if (currentDepth < 1) {
                historyDepthInput.val(1);
            }
        });

        // History depth input validation - enforce minimum of 1
        $(document).off('change.sidecar input.sidecar', '#add_ons_form_history_depth').on('change.sidecar input.sidecar', '#add_ons_form_history_depth', function (e) {
            const val = parseInt($(this).val()) || 0;
            if (val < 1) {
                $(this).val(1);
            }
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

        // Trigger mode change - show/hide trigger config
        $(document).off('change.sidecar', '#add_ons_form_trigger_mode').on('change.sidecar', '#add_ons_form_trigger_mode', function (e) {
            e.stopPropagation();
            const mode = $(this).val();
            const triggerConfigRow = $('#add_ons_trigger_config_row');
            const regexTesterRow = $('#add_ons_regex_tester_row');
            if (mode === 'trigger') {
                triggerConfigRow.slideDown(200);
                // Show regex tester if trigger type is regex
                const triggerType = $('#add_ons_form_trigger_type').val();
                if (triggerType === 'regex') {
                    regexTesterRow.slideDown(200);
                }
            } else {
                triggerConfigRow.slideUp(200);
                regexTesterRow.slideUp(200);
            }
        });

        // Trigger type change - show/hide regex tester
        $(document).off('change.sidecar', '#add_ons_form_trigger_type').on('change.sidecar', '#add_ons_form_trigger_type', function (e) {
            e.stopPropagation();
            const triggerType = $(this).val();
            const regexTesterRow = $('#add_ons_regex_tester_row');
            const triggerMode = $('#add_ons_form_trigger_mode').val();
            if (triggerMode === 'trigger' && triggerType === 'regex') {
                regexTesterRow.slideDown(200);
            } else {
                regexTesterRow.slideUp(200);
            }
        });

        // Regex tester button
        $(document).off('click.sidecar', '#add_ons_regex_test_btn').on('click.sidecar', '#add_ons_regex_test_btn', function (e) {
            e.preventDefault();
            e.stopPropagation();
            self.testRegexPatterns();
        });

        // Test on Enter key in regex test input
        $(document).off('keypress.sidecar', '#add_ons_regex_test_input').on('keypress.sidecar', '#add_ons_regex_test_input', function (e) {
            if (e.which === 13) { // Enter key
                e.preventDefault();
                self.testRegexPatterns();
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

        // Templates modal close
        $(document).off('click.sidecar', '#add_ons_templates_modal_close, #add_ons_templates_close').on('click.sidecar', '#add_ons_templates_modal_close, #add_ons_templates_close', function (e) {
            e.preventDefault();
            e.stopPropagation();
            $('#add_ons_templates_modal').hide();
        });

        // Browse local templates
        $(document).off('click.sidecar', '#sidecar_browse_local_templates').on('click.sidecar', '#sidecar_browse_local_templates', function (e) {
            e.preventDefault();
            e.stopPropagation();
            self.loadLocalTemplates();
        });

        // Browse community templates
        $(document).off('click.sidecar', '#sidecar_browse_community_templates').on('click.sidecar', '#sidecar_browse_community_templates', function (e) {
            e.preventDefault();
            e.stopPropagation();
            self.loadCommunityTemplates();
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
            // Hide trigger config and regex tester
            $('#add_ons_trigger_config_row').hide();
            $('#add_ons_regex_tester_row').hide();
            $('#add_ons_regex_test_result').hide().html('');
            $('#add_ons_regex_test_input').val('');
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

    async loadModelsForProvider(provider, retryCount = 0, selectedModel = null) {
        const modelSelect = $('#add_ons_form_ai_model');
        const maxRetries = 3;
        const minModelsExpected = provider === 'openrouter' ? 10 : 1;

        if (retryCount === 0) {
            modelSelect.empty();
            modelSelect.append('<option value="">Loading models...</option>');
        }

        // Try to get models - if we don't find any, retry after a delay (dropdown might not be populated yet)
        // Now using await as getProviderModels can perform API calls
        let models = await this.getProviderModels(provider);

        // For OpenRouter, if we got very few models, retry a few times
        // The dropdown might still be loading from SillyTavern
        if (models.length < minModelsExpected && retryCount < maxRetries) {
            const delay = provider === 'openrouter' ? 1000 + (retryCount * 500) : 500;
            console.log(`[Sidecar AI] ${provider} only found ${models.length} models (expected at least ${minModelsExpected}), retrying (${retryCount + 1}/${maxRetries}) after ${delay}ms...`);
            setTimeout(() => {
                this.loadModelsForProvider(provider, retryCount + 1, selectedModel);
            }, delay);
            return;
        }

        // If we still don't have enough models after retries, show a warning
        if (provider === 'openrouter' && models.length < minModelsExpected && retryCount >= maxRetries) {
            console.warn(`[Sidecar AI] OpenRouter: After ${maxRetries} retries, only found ${models.length} models. This might indicate:
1. SillyTavern hasn't loaded OpenRouter models yet (try opening API Connections > OpenRouter tab first)
2. No API key configured for OpenRouter in SillyTavern
3. Network issues preventing model list fetch`);
        }

        this.populateModelDropdown(modelSelect, models, selectedModel);
    }

    populateModelDropdown(modelSelect, models, selectedModel = null) {
        setTimeout(() => {
            modelSelect.empty();
            if (models.length === 0) {
                modelSelect.append('<option value="">No models available</option>');
                $('#add_ons_model_hint').text('No models found. Check provider configuration.');
                return;
            }

            modelSelect.append('<option value="">Select a model...</option>');
            let foundSelected = false;
            models.forEach(model => {
                const option = $('<option></option>').val(model.value).text(model.label);
                // If a selectedModel was provided, check if this is it
                if (selectedModel && (model.value === selectedModel || model.id === selectedModel)) {
                    option.prop('selected', true);
                    foundSelected = true;
                } else if (model.default) {
                    option.prop('selected', true);
                }
                modelSelect.append(option);
            });

            // If we have a selectedModel but didn't find it, try to set it anyway (might be a different format)
            if (selectedModel && !foundSelected) {
                modelSelect.val(selectedModel);
            }

            $('#add_ons_model_hint').text(`Loaded ${models.length} model(s)`);
        }, 100);
    }

    async getProviderModels(provider) {
        let models = [];
        console.log('[Sidecar AI] ========== Loading models for provider:', provider, '==========');

        // Debug: Log what's available in window
        if (provider === 'openrouter') {
            console.log('[Sidecar AI] Debug - window.openRouterModels:', typeof window.openRouterModels, window.openRouterModels?.length || 'N/A');
            console.log('[Sidecar AI] Debug - window.model_list:', typeof window.model_list, window.model_list?.length || 'N/A');
            console.log('[Sidecar AI] Debug - #model_openrouter_select exists:', $('#model_openrouter_select').length > 0);
            console.log('[Sidecar AI] Debug - #model_openrouter_select option count:', $('#model_openrouter_select option').length);
            console.log('[Sidecar AI] Debug - #openrouter_model exists:', $('#openrouter_model').length > 0);
            console.log('[Sidecar AI] Debug - #openrouter_model option count:', $('#openrouter_model option').length);
        }

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
            `#model_openrouter_select`, // Exact selector from SillyTavern (main API Connections tab)
            `#model_openrouter_select_chat`, // Chat-specific selector
            `#openrouter_model`, // Alternative selector
            `#openrouter_model_chat`, // Chat-specific alternative
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
                if ($el.length && $el.is('select')) {
                    // Check if select2 is initialized on this element
                    const hasSelect2 = $el.hasClass('select2-hidden-accessible') || $el.data('select2');

                    let optionCount = 0;
                    let optionsSource = 'native';

                    // If select2 is active, try to get options from select2 data
                    if (hasSelect2) {
                        try {
                            const select2Data = $el.select2('data');
                            if (select2Data && select2Data.length > 0) {
                                optionCount = select2Data.length;
                                optionsSource = 'select2 data';
                                console.log(`[Sidecar AI] Found select2 dropdown at ${selector} with ${optionCount} options from select2 data`);
                            }
                        } catch (e) {
                            console.log(`[Sidecar AI] select2 data() call failed for ${selector}, falling back to native options`);
                        }
                    }

                    // Fall back to native option elements
                    if (optionCount === 0) {
                        optionCount = $el.find('option').length;
                        optionsSource = 'native options';
                    }

                    if (optionCount > 1) {
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

                        console.log(`[Sidecar AI] Found populated dropdown at ${selector} with ${optionCount} ${optionsSource}`);

                        // Extract options (always use native <option> elements as they're the source of truth)
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

                        // For OpenRouter, always continue to check globals for the full list
                        // For other providers, return if we found models
                        if (models.length > 0) {
                            if (provider === 'openrouter') {
                                console.log(`[Sidecar AI] OpenRouter dropdown has ${models.length} models, continuing to check globals for full list...`);
                                // Don't return yet, continue to check globals which might have more
                                // Keep models found so far, we'll use the best source later
                            } else {
                                console.log('[Sidecar AI] Successfully stole models from UI:', models.length);
                                return models;
                            }
                        }
                    }
                }
            } catch (e) {
                console.warn(`[Sidecar AI] Error checking selector ${selector}:`, e);
            }
        }

        // STRATEGY 2: Check SillyTavern's model_list globals
        // OpenRouter models can be in different places depending on which API interface is active
        if (provider === 'openrouter') {
            let modelsList = null;
            let source = '';

            if (typeof window !== 'undefined') {
                // Try to dynamically import and access the model_list from openai.js module
                // This requires checking if the module is already loaded
                try {
                    // Check if openai.js module exports are accessible
                    // SillyTavern uses ES6 modules, so we need to check window scope for the export
                    const scripts = document.querySelectorAll('script[src*="openai.js"]');
                    if (scripts.length > 0) {
                        console.log('[Sidecar AI] Found openai.js script loaded');
                    }
                } catch (e) { }

                // Try accessing model_list from window scope (Chat Completions)
                // This is the most reliable method as SillyTavern exports it globally
                if (window.model_list && Array.isArray(window.model_list) && window.model_list.length > 0) {
                    modelsList = window.model_list;
                    source = 'window.model_list (Chat Completions)';
                }

                // Try Text Completions openRouterModels (from textgen-models.js)
                if (!modelsList && window.openRouterModels && Array.isArray(window.openRouterModels) && window.openRouterModels.length > 0) {
                    modelsList = window.openRouterModels;
                    source = 'window.openRouterModels (Text Completions)';
                }

                // Try SillyTavern global namespace (backup)
                if (!modelsList && window.SillyTavern) {
                    if (window.SillyTavern.model_list && Array.isArray(window.SillyTavern.model_list) && window.SillyTavern.model_list.length > 0) {
                        modelsList = window.SillyTavern.model_list;
                        source = 'SillyTavern.model_list';
                    } else if (window.SillyTavern.openRouterModels && Array.isArray(window.SillyTavern.openRouterModels) && window.SillyTavern.openRouterModels.length > 0) {
                        modelsList = window.SillyTavern.openRouterModels;
                        source = 'SillyTavern.openRouterModels';
                    }
                }
            }

            if (modelsList && modelsList.length > 0) {
                console.log(`[Sidecar AI] Found ${modelsList.length} models from ${source}`);

                // Convert to our format
                const newModels = [];
                modelsList.forEach(m => {
                    const id = m.id || m.name || m;
                    const name = m.name || m.id || m;
                    newModels.push({
                        value: id,
                        label: name,
                        default: false
                    });
                });

                // Use the model list with more models
                if (newModels.length > models.length) {
                    console.log(`[Sidecar AI] ${source} has ${newModels.length} models (more than DOM's ${models.length}), using ${source}`);
                    models = newModels;
                } else if (models.length === 0) {
                    console.log(`[Sidecar AI] No models found in DOM, using ${source}`);
                    models = newModels;
                } else {
                    console.log(`[Sidecar AI] DOM has ${models.length} models, ${source} has ${newModels.length}, keeping DOM models`);
                }

                // If we have models, return them
                if (models.length > 0) {
                    console.log('[Sidecar AI] Loaded', models.length, 'OpenRouter models successfully');
                    return models;
                }
            } else {
                console.warn('[Sidecar AI] Could not find OpenRouter models in window.model_list or window.openRouterModels');
                console.log('[Sidecar AI] Available window properties:', Object.keys(window).filter(k => k.toLowerCase().includes('model') || k.toLowerCase().includes('router')));
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

        // STRATEGY 4: Fetch directly from OpenRouter API
        if (provider === 'openrouter' && models.length === 0) {
            try {
                console.log('[Sidecar AI] Strategy 4: Attempting to fetch OpenRouter models directly from API...');
                const response = await fetch('https://openrouter.ai/api/v1/models');
                if (response.ok) {
                    const data = await response.json();
                    if (data && data.data && Array.isArray(data.data)) {
                        console.log(`[Sidecar AI] Fetched ${data.data.length} models from OpenRouter API`);
                        data.data.forEach(m => {
                            models.push({
                                value: m.id,
                                label: m.name || m.id,
                                default: false
                            });
                        });

                        // Sort by provider name (company) first, then alphabetically by model name
                        models.sort((a, b) => {
                            // Extract provider name (part before /) or use empty string
                            const getProvider = (id) => {
                                const parts = id.split('/');
                                return parts.length > 1 ? parts[0].toLowerCase() : '';
                            };

                            const providerA = getProvider(a.value);
                            const providerB = getProvider(b.value);

                            // First sort by provider name
                            if (providerA !== providerB) {
                                return providerA.localeCompare(providerB);
                            }

                            // If same provider, sort by model name/id alphabetically
                            return a.label.localeCompare(b.label);
                        });

                        console.log(`[Sidecar AI] Sorted ${models.length} OpenRouter models by provider and name`);
                        return models;
                    }
                }
            } catch (e) {
                console.error('[Sidecar AI] Failed to fetch OpenRouter models:', e);
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
        // Clear regex tester
        $('#add_ons_regex_test_result').hide().html('');
        $('#add_ons_regex_test_input').val('');
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

        // Handle trigger config visibility
        if (addon.triggerMode === 'trigger') {
            $('#add_ons_trigger_config_row').show();
        } else {
            $('#add_ons_trigger_config_row').hide();
            $('#add_ons_regex_tester_row').hide();
        }

        // Load trigger config
        const triggerConfig = addon.triggerConfig || {};
        const triggerType = triggerConfig.triggerType || 'keyword';
        $('#add_ons_form_trigger_type').val(triggerType);
        $('#add_ons_form_triggers').val((triggerConfig.triggers || []).join('\n'));

        // Show regex tester if trigger mode is trigger and type is regex
        if (addon.triggerMode === 'trigger' && triggerType === 'regex') {
            $('#add_ons_regex_tester_row').show();
        } else {
            $('#add_ons_regex_tester_row').hide();
        }

        // Clear test result when editing
        $('#add_ons_regex_test_result').hide().html('');
        $('#add_ons_regex_test_input').val('');

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
        // Must set AFTER loadServiceProviders() completes, as it clears the dropdown
        this.toggleServiceProviderField(addon.aiProvider);
        if (addon.aiProvider === 'openrouter') {
            // Wait for loadServiceProviders to finish populating options, then set the value
            // Use a small delay to ensure dropdown is populated
            setTimeout(() => {
                const $serviceProviderSelect = $('#add_ons_form_service_provider');
                if (addon.serviceProvider && Array.isArray(addon.serviceProvider) && addon.serviceProvider.length > 0) {
                    // Check if the options exist before setting value
                    const hasOptions = $serviceProviderSelect.find('option').length > 0;
                    if (hasOptions) {
                        $serviceProviderSelect.val(addon.serviceProvider);
                        console.log('[Sidecar AI] Restored service provider selection:', addon.serviceProvider);
                    } else {
                        // If options aren't loaded yet, try again after a longer delay
                        setTimeout(() => {
                            $serviceProviderSelect.val(addon.serviceProvider);
                            console.log('[Sidecar AI] Restored service provider selection (delayed):', addon.serviceProvider);
                        }, 200);
                    }
                } else {
                    $serviceProviderSelect.val([]);
                }
            }, 150);
        } else {
            $('#add_ons_form_service_provider').val([]);
        }

        $('#add_ons_form_result_format').val(addon.resultFormat);
        $('#add_ons_form_response_location').val(addon.responseLocation);
        $('#add_ons_form_format_style').val(addon.formatStyle || 'html-css');

        // Load models for provider, then set selected model
        // Pass the model to set so it can be applied after dropdown is populated
        await this.loadModelsForProvider(addon.aiProvider, 0, addon.aiModel);

        const ctx = addon.contextSettings || {};
        $('#add_ons_form_messages_count').val(ctx.messagesCount || 10);
        $('#add_ons_form_include_char_card').prop('checked', ctx.includeCharCard !== false);
        $('#add_ons_form_include_user_card').prop('checked', ctx.includeUserCard !== false);
        $('#add_ons_form_include_world_card').prop('checked', ctx.includeWorldCard !== false);

        // Add-on History settings
        const includeHistory = ctx.includeHistory !== false;  // Default to true
        $('#add_ons_form_include_history').prop('checked', includeHistory);

        // Enforce minimum historyDepth of 1
        const historyDepth = Math.max(1, ctx.historyDepth || 1);
        $('#add_ons_form_history_depth').val(historyDepth);

        if (includeHistory) {
            $('#add_ons_history_depth_group').show();
        } else {
            $('#add_ons_history_depth_group').hide();
        }
    }

    /**
     * Test regex patterns against test input
     */
    testRegexPatterns() {
        const testInput = $('#add_ons_regex_test_input').val().trim();
        const triggersText = $('#add_ons_form_triggers').val();
        const triggerType = $('#add_ons_form_trigger_type').val();
        const resultDiv = $('#add_ons_regex_test_result');

        if (!testInput) {
            resultDiv.html('<span style="color: #ffc107;">⚠️ Please enter a test message</span>').show();
            return;
        }

        if (!triggersText.trim()) {
            resultDiv.html('<span style="color: #ffc107;">⚠️ Please enter at least one trigger pattern</span>').show();
            return;
        }

        const triggers = triggersText.split('\n')
            .map(t => t.trim())
            .filter(t => t.length > 0);

        if (triggers.length === 0) {
            resultDiv.html('<span style="color: #ffc107;">⚠️ Please enter at least one trigger pattern</span>').show();
            return;
        }

        const results = [];
        let hasMatch = false;
        let hasError = false;

        if (triggerType === 'regex') {
            // Test regex patterns
            triggers.forEach((pattern, index) => {
                try {
                    // Clean pattern (remove invalid inline flags)
                    const cleanedPattern = pattern.replace(/\(\?[imsux-]+\)/gi, '').trim();
                    const regex = new RegExp(cleanedPattern, 'i');
                    const matches = regex.test(testInput);
                    
                    if (matches) {
                        hasMatch = true;
                        // Find the match position for highlighting
                        const match = testInput.match(regex);
                        results.push(`<div style="color: #28a745; margin: 4px 0;"><strong>✓ Pattern ${index + 1}: "${pattern}"</strong> - MATCHED</div>`);
                    } else {
                        results.push(`<div style="color: #6c757d; margin: 4px 0;">✗ Pattern ${index + 1}: "${pattern}" - No match</div>`);
                    }
                } catch (e) {
                    hasError = true;
                    results.push(`<div style="color: #dc3545; margin: 4px 0;"><strong>✗ Pattern ${index + 1}: "${pattern}"</strong> - ERROR: ${e.message}</div>`);
                }
            });
        } else {
            // Test keyword patterns
            const lowerTestInput = testInput.toLowerCase();
            triggers.forEach((keyword, index) => {
                const matches = lowerTestInput.includes(keyword.toLowerCase());
                if (matches) {
                    hasMatch = true;
                    results.push(`<div style="color: #28a745; margin: 4px 0;"><strong>✓ Keyword ${index + 1}: "${keyword}"</strong> - MATCHED</div>`);
                } else {
                    results.push(`<div style="color: #6c757d; margin: 4px 0;">✗ Keyword ${index + 1}: "${keyword}" - No match</div>`);
                }
            });
        }

        // Build result HTML
        let resultHTML = '';
        if (hasMatch) {
            resultHTML += '<div style="background: #d4edda; border: 1px solid #c3e6cb; color: #155724; padding: 8px; border-radius: 4px; margin-bottom: 8px;"><strong>✓ At least one pattern matched!</strong></div>';
        } else if (hasError) {
            resultHTML += '<div style="background: #f8d7da; border: 1px solid #f5c6cb; color: #721c24; padding: 8px; border-radius: 4px; margin-bottom: 8px;"><strong>✗ Errors found in patterns</strong></div>';
        } else {
            resultHTML += '<div style="background: #fff3cd; border: 1px solid #ffeaa7; color: #856404; padding: 8px; border-radius: 4px; margin-bottom: 8px;"><strong>⚠ No patterns matched</strong></div>';
        }
        
        resultHTML += '<div style="font-size: 0.9em;">' + results.join('') + '</div>';
        resultDiv.html(resultHTML).show();
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
                triggerConfig: {
                    triggerType: $('#add_ons_form_trigger_type').val(),
                    triggers: $('#add_ons_form_triggers').val().split('\n')
                        .map(t => t.trim())
                        .filter(t => t.length > 0)
                },
                requestMode: $('#add_ons_form_request_mode').val(),
                aiProvider: provider,
                aiModel: model,
                apiKey: savedApiKey, // Save empty if using ST key, otherwise save the entered key
                apiUrl: apiUrl || '', // Optional
                serviceProvider: serviceProvider, // Array of service providers for OpenRouter
                resultFormat: $('#add_ons_form_result_format').val(),
                responseLocation: $('#add_ons_form_response_location').val(),
                formatStyle: $('#add_ons_form_format_style').val() || 'html-css',
                contextSettings: {
                    messagesCount: parseInt($('#add_ons_form_messages_count').val()) || 10,
                    includeCharCard: $('#add_ons_form_include_char_card').is(':checked'),
                    includeUserCard: $('#add_ons_form_include_user_card').is(':checked'),
                    includeWorldCard: $('#add_ons_form_include_world_card').is(':checked'),
                    includeHistory: $('#add_ons_form_include_history').is(':checked'),
                    historyDepth: Math.max(1, parseInt($('#add_ons_form_history_depth').val()) || 1)  // Minimum 1 always
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

    /**
     * Open templates browser modal
     */
    openTemplatesModal() {
        $('#add_ons_templates_modal').show();
        this.loadLocalTemplates();
    }

    /**
     * Load local templates from templates folder
     */
    async loadLocalTemplates() {
        const listContainer = $('#add_ons_templates_list');
        listContainer.html('<p style="opacity: 0.7;">Loading local templates...</p>');

        try {
            // Get extension directory
            const extensionDir = this.getExtensionDirectory();

            // List of known template files
            const templateFiles = [
                'starter-pack.json',  // Bundle of 4 essential templates
                'directors-commentary.json',
                'soundtrack-suggester.json',
                'art-prompt-generator.json',
                'commentary-section.json',
                'actor-interview.json',
                'relationship-matrix.json'
            ];

            listContainer.html('');

            // Load each template
            for (const filename of templateFiles) {
                try {
                    const response = await fetch(`${extensionDir}/templates/${filename}`);
                    if (!response.ok) continue;

                    const template = await response.json();
                    this.renderTemplateCard(listContainer, template, filename);
                } catch (error) {
                    console.warn(`[Sidecar AI] Failed to load template: ${filename}`, error);
                }
            }

            if (listContainer.children().length === 0) {
                listContainer.html('<p style="opacity: 0.7;">No templates found in templates folder.</p>');
            }
        } catch (error) {
            console.error('[Sidecar AI] Error loading templates:', error);
            listContainer.html('<p style="color: #ef4444;">Error loading templates. Check console for details.</p>');
        }
    }

    /**
     * Load community templates from GitHub
     */
    async loadCommunityTemplates() {
        const listContainer = $('#add_ons_templates_list');
        listContainer.html('<p style="opacity: 0.7;"><i class="fa-solid fa-spinner fa-spin"></i> Loading community templates from GitHub...</p>');

        try {
            // GitHub API endpoint for templates folder
            const repo = 'skirianov/sidecar-ai';
            const branch = 'main';
            const apiUrl = `https://api.github.com/repos/${repo}/contents/templates/community?ref=${branch}`;

            const response = await fetch(apiUrl);

            if (!response.ok) {
                if (response.status === 404) {
                    listContainer.html('<p style="opacity: 0.7;">No community templates available yet. Be the first to contribute!</p>');
                    return;
                }
                throw new Error(`GitHub API error: ${response.status}`);
            }

            const files = await response.json();
            const jsonFiles = files.filter(f => f.name.endsWith('.json') && f.type === 'file');

            if (jsonFiles.length === 0) {
                listContainer.html('<p style="opacity: 0.7;">No community templates found.</p>');
                return;
            }

            listContainer.html('');

            // Load each template
            for (const file of jsonFiles) {
                try {
                    const templateResponse = await fetch(file.download_url);
                    const template = await templateResponse.json();
                    this.renderTemplateCard(listContainer, template, file.name, true);
                } catch (error) {
                    console.warn(`[Sidecar AI] Failed to load community template: ${file.name}`, error);
                }
            }
        } catch (error) {
            console.error('[Sidecar AI] Error loading community templates:', error);
            listContainer.html(`
                <div style="padding: 15px; background: rgba(239,100,100,0.1); border: 1px solid #ef4444; border-radius: 8px;">
                    <p style="margin: 0 0 10px 0; color: #ef4444; font-weight: 600;">⚠️ Unable to load community templates</p>
                    <p style="margin: 0; font-size: 0.9em; opacity: 0.8;">This might be because:</p>
                    <ul style="margin: 5px 0 10px 20px; font-size: 0.9em; opacity: 0.8;">
                        <li>Repository not set up yet</li>
                        <li>No internet connection</li>
                        <li>GitHub API rate limit reached</li>
                    </ul>
                    <p style="margin: 0; font-size: 0.85em; opacity: 0.7;">Check console for details.</p>
                </div>
            `);
        }
    }

    /**
     * Render template card in list
     */
    renderTemplateCard(container, template, filename, isCommunity = false) {
        const addon = template.addons && template.addons[0];
        if (!addon) return;

        const card = $('<div></div>').css({
            'padding': '12px',
            'border': '1px solid var(--SmartThemeBorderColor)',
            'border-radius': '8px',
            'background': 'var(--SmartThemeBlurTintColor)',
            'transition': 'border-color 0.2s ease'
        }).hover(
            function () { $(this).css('border-color', 'var(--SmartThemeEmColor)'); },
            function () { $(this).css('border-color', 'var(--SmartThemeBorderColor)'); }
        );

        const header = $('<div></div>').css({
            'display': 'flex',
            'justify-content': 'space-between',
            'align-items': 'center',
            'margin-bottom': '8px',
            'gap': '10px'
        });

        const info = $('<div></div>').css('flex', '1');
        const title = $('<h4></h4>').css({
            'margin': '0 0 4px 0',
            'font-size': '1em'
        }).text(addon.name);
        const desc = $('<p></p>').css({
            'margin': '0',
            'font-size': '0.9em',
            'opacity': '0.8'
        }).text(addon.description || template.description || '');

        info.append(title).append(desc);

        const badges = $('<div></div>').css({
            'display': 'flex',
            'gap': '5px',
            'margin-top': '6px',
            'flex-wrap': 'wrap'
        });

        // Add badges
        const triggerBadge = $('<span></span>').css({
            'padding': '2px 6px',
            'border-radius': '3px',
            'border': '1px solid var(--SmartThemeBorderColor)',
            'font-size': '0.8em',
            'white-space': 'nowrap'
        }).text(addon.triggerMode);

        const formatBadge = $('<span></span>').css({
            'padding': '2px 6px',
            'border-radius': '3px',
            'border': '1px solid var(--SmartThemeBorderColor)',
            'font-size': '0.8em',
            'white-space': 'nowrap'
        }).text(addon.formatStyle);

        if (isCommunity) {
            const communityBadge = $('<span></span>').css({
                'padding': '2px 6px',
                'border-radius': '3px',
                'background': 'rgba(59,130,246,0.2)',
                'color': '#3b82f6',
                'border': '1px solid #3b82f6',
                'font-size': '0.8em',
                'white-space': 'nowrap'
            }).html('<i class="fa-brands fa-github"></i> Community');
            badges.append(communityBadge);
        }

        badges.append(triggerBadge).append(formatBadge);
        info.append(badges);

        const importBtn = $('<button></button>')
            .addClass('menu_button add_ons_button_small')
            .html('<i class="fa-solid fa-download"></i> Import')
            .css('flex-shrink', '0')
            .on('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.importTemplate(template, filename);
            });

        header.append(info).append(importBtn);
        card.append(header);
        container.append(card);
    }

    /**
     * Import a template
     */
    importTemplate(template, filename) {
        try {
            console.log('[Sidecar AI] Importing template:', filename, template);

            if (!template) {
                alert('Invalid template: Template data is empty.');
                return;
            }

            if (!template.addons || !Array.isArray(template.addons) || template.addons.length === 0) {
                console.error('[Sidecar AI] Invalid template format:', template);
                alert('Invalid template format: Missing "addons" array or it is empty.\n\nTemplate structure should be:\n{\n  "version": "1.0",\n  "name": "...",\n  "addons": [{...}]\n}');
                return;
            }

            const addon = template.addons[0];
            console.log('[Sidecar AI] Template addon:', addon);

            // Validate required fields
            if (!addon.name) {
                alert('Invalid template: Addon is missing required "name" field.');
                return;
            }

            // Confirm import
            if (!confirm(`Import template: ${addon.name}?\n\nYou can edit it after import to customize settings and add your API key.`)) {
                return;
            }

            // Import as new addon
            const result = this.addonManager.importAddons(template, 'merge');
            console.log('[Sidecar AI] Import result:', result);

            if (result.imported > 0) {
                console.log(`[Sidecar AI] Successfully imported template: ${filename}`);
                alert(`✓ Template imported successfully!\n\nDon't forget to:\n1. Edit it to add your API key (or use SillyTavern's saved keys)\n2. Enable it using the toggle switch\n3. Test it by triggering manually or waiting for auto-trigger`);

                // Close templates modal and refresh
                $('#add_ons_templates_modal').hide();
                this.refreshSettings();
            } else {
                let errorMsg = 'Failed to import template.\n\n';
                if (result.errors && result.errors.length > 0) {
                    errorMsg += 'Errors:\n' + result.errors.map(e => `- ${e}`).join('\n');
                } else {
                    errorMsg += 'No addons were imported. Check console for details.';
                }
                console.error('[Sidecar AI] Import failed:', result);
                alert(errorMsg);
            }
        } catch (error) {
            console.error('[Sidecar AI] Template import error:', error);
            console.error('[Sidecar AI] Error stack:', error.stack);
            alert('Error importing template: ' + error.message + '\n\nCheck browser console (F12) for more details.');
        }
    }

    /**
     * Get extension directory path
     */
    getExtensionDirectory() {
        // Try to get from script tag
        const scripts = document.querySelectorAll('script[src*="sidecar"]');
        if (scripts.length > 0) {
            const scriptSrc = scripts[0].src;
            return scriptSrc.substring(0, scriptSrc.lastIndexOf('/'));
        }

        // Fallback: assume standard extension path
        return '/scripts/extensions/third-party/sidecar-ai';
    }

    /**
     * Open AI Template Maker modal
     */
    openAIMakerModal() {
        $('#add_ons_ai_maker_modal').show();
        this.loadConnectionProfiles();
        this.loadCompletionPresets();

        // Reset state
        $('#ai_maker_description').val('');
        $('#ai_maker_result').hide();
        $('#ai_maker_export').hide();
        $('#ai_maker_add').hide();
        $('#ai_maker_test').hide();
        $('#ai_maker_publish').hide();
        $('#ai_maker_test_result').hide();
        $('#ai_maker_generate').show();
        this.generatedTemplate = null;
    }

    /**
     * Close AI Maker modal
     */
    closeAIMakerModal() {
        $('#add_ons_ai_maker_modal').hide();
        this.generatedTemplate = null;
    }

    /**
     * Load connection profiles for AI Maker
     */
    loadConnectionProfiles() {
        const select = $('#ai_maker_connection');
        select.empty();

        try {
            // Get connection profiles from SillyTavern
            const profiles = this.context?.extensionSettings?.connectionManager?.profiles || [];

            if (profiles.length === 0) {
                select.append('<option value="">No API connections configured</option>');
                return;
            }

            profiles.forEach(profile => {
                const option = $('<option></option>')
                    .val(profile.id || profile.name)
                    .text(`${profile.name || profile.api} (${profile.api})`);
                select.append(option);
            });

            // Select first profile by default
            if (profiles.length > 0) {
                select.val(profiles[0].id || profiles[0].name);
            }
        } catch (error) {
            console.error('[Sidecar AI] Error loading connection profiles:', error);
            select.append('<option value="">Error loading profiles</option>');
        }
    }

    /**
     * Load completion presets for AI Maker
     */
    loadCompletionPresets() {
        const select = $('#ai_maker_preset');
        select.empty();
        select.append('<option value="">Default</option>');

        try {
            // Get presets from SillyTavern context
            const presets = this.context?.presets || [];

            presets.forEach(preset => {
                const option = $('<option></option>')
                    .val(preset.name || preset)
                    .text(preset.name || preset);
                select.append(option);
            });
        } catch (error) {
            console.warn('[Sidecar AI] Could not load presets:', error);
        }
    }

    /**
     * Generate template using AI
     */
    async generateTemplate() {
        const description = $('#ai_maker_description').val().trim();

        if (!description) {
            alert('Please describe the sidecar you want to create.');
            return;
        }

        const connectionId = $('#ai_maker_connection').val();
        if (!connectionId) {
            alert('Please select an API connection.');
            return;
        }

        const generateBtn = $('#ai_maker_generate');
        const originalText = generateBtn.html();
        generateBtn.html('<i class="fa-solid fa-spinner fa-spin"></i> Generating...').prop('disabled', true);

        try {
            // Build prompt for template generation
            const prompt = `You are a Sidecar AI template generator. Sidecar AI analyzes chat conversations and story content - it does NOT ask users questions or request input.

CRITICAL: The "prompt" field must instruct the AI to ANALYZE the conversation/story content, NOT ask the user to describe things.

USER'S DESCRIPTION:
${description}

Generate a complete sidecar configuration following this exact structure (return ONLY valid JSON, no markdown formatting, no explanations):

{
  "name": "[Emoji] [Descriptive Name]",
  "description": "[Brief description of what this sidecar does]",
  "prompt": "[CRITICAL: Instruction for AI to analyze chat/story content - include example output format]",
  "triggerMode": "auto" (default) or "manual",
  "requestMode": "standalone",
  "aiProvider": "openai",
  "aiModel": "gpt-4o-mini",
  "apiKey": "",
  "resultFormat": "collapsible",
  "responseLocation": "outsideChatlog",
  "formatStyle": "html-css",
  "contextSettings": {
    "messagesCount": [appropriate number 1-50],
    "includeCharCard": true/false,
    "includeUserCard": true/false,
    "includeWorldCard": true/false,
    "includeHistory": true,
    "historyDepth": 1
  }
}

PROMPT WRITING RULES:
- ✅ GOOD: "Analyze the conversation and describe what clothing the character is wearing. Format as: '[Character] is wearing [description]'"
- ✅ GOOD: "Review the recent messages and track character emotions. Output: Character feels [emotion] because [reason]"
- ❌ BAD: "Please describe a piece of clothing you own" (asks user, doesn't analyze)
- ❌ BAD: "Tell me about your feelings" (asks user, doesn't analyze)
- The prompt should analyze EXISTING chat content, not request NEW information from users
- Include example output format in the prompt
- Use imperative verbs: "Analyze", "Track", "Identify", "Summarize", "Extract"

EXAMPLE TEMPLATE (for reference):
{
  "name": "🎬 Director's Commentary",
  "description": "Provides meta-analysis like DVD commentary",
  "prompt": "Provide director's commentary on the last message (as if analyzing a film scene):\n\n🎬 **Scene Analysis:**\n[What's happening on a meta level - narrative techniques, character beats, foreshadowing]\n\n**Notable Techniques:**\n- [Technique 1]: [How it's used]\n- [Technique 2]: [How it's used]\n\nKeep it insightful but concise. Focus on craft, not just plot summary.",
  "triggerMode": "auto",
  "requestMode": "standalone",
  "aiProvider": "openai",
  "aiModel": "gpt-4o-mini",
  "apiKey": "",
  "resultFormat": "collapsible",
  "responseLocation": "outsideChatlog",
  "formatStyle": "html-css",
  "contextSettings": {
    "messagesCount": 5,
    "includeCharCard": true,
    "includeUserCard": false,
    "includeWorldCard": false,
    "includeHistory": true,
    "historyDepth": 1
  }
}

OTHER GUIDELINES:
- Choose appropriate emoji for the sidecar name
- Set triggerMode "auto" (default) for continuous tracking/analysis, "manual" for on-demand analysis
- Choose formatStyle: "html-css" for styled output, "markdown" for simple text, "beautify" for creative
- Set messagesCount: 2-5 for immediate context, 10-20 for broader analysis, 20-30 for patterns
- includeCharCard: true if analyzing character behavior/personality
- includeUserCard: true if analyzing user interactions/preferences
- includeWorldCard: true if analyzing setting/world details
- Always set includeHistory: true and historyDepth: 1 minimum

Return ONLY the JSON object, properly formatted.`;

            // Use SillyTavern's ChatCompletionService with selected profile
            if (!this.context || !this.context.ChatCompletionService) {
                throw new Error('ChatCompletionService not available');
            }

            // Get connection profile details
            const profiles = this.context?.extensionSettings?.connectionManager?.profiles || [];
            const profile = profiles.find(p => (p.id || p.name) === connectionId);

            if (!profile) {
                throw new Error('Connection profile not found');
            }

            const provider = profile.api || 'openai';
            // Try to get model from profile, or use provider-specific defaults
            let model = profile.model || profile.defaultModel;
            if (!model && profile.models && Array.isArray(profile.models) && profile.models.length > 0) {
                // Use first available model from profile
                model = profile.models[0].id || profile.models[0].name || profile.models[0];
            }

            // For OpenRouter, validate model against real models list to avoid placeholders
            if (provider?.toLowerCase() === 'openrouter') {
                const realModels = await this.getProviderModels('openrouter');
                if (realModels && realModels.length > 0) {
                    // Check if current model exists in real models list
                    const modelExists = realModels.some(m => {
                        const modelValue = m.value || m.id || m;
                        return modelValue === model || modelValue === String(model);
                    });

                    // If model doesn't exist or looks like a placeholder, use a real one
                    if (!modelExists || !model || model.includes('placeholder') || model.includes('Select')) {
                        // Prefer common cheap models, fallback to first available
                        const preferredModels = ['openai/gpt-4o-mini', 'openai/gpt-3.5-turbo', 'google/gemini-1.5-flash'];
                        let foundModel = null;

                        // Try to find a preferred model
                        for (const preferred of preferredModels) {
                            const found = realModels.find(m => {
                                const val = m.value || m.id || m;
                                return val === preferred || val.includes(preferred.split('/')[1]);
                            });
                            if (found) {
                                foundModel = found.value || found.id || found;
                                break;
                            }
                        }

                        // If no preferred model found, use first real model
                        if (!foundModel && realModels.length > 0) {
                            foundModel = realModels[0].value || realModels[0].id || realModels[0];
                        }

                        if (foundModel) {
                            console.log(`[Sidecar AI] OpenRouter: Replaced placeholder model "${model}" with real model "${foundModel}"`);
                            model = foundModel;
                        }
                    }
                } else {
                    // If we can't get real models, use safe default
                    console.warn('[Sidecar AI] Could not load OpenRouter models, using default');
                    model = 'openai/gpt-4o-mini';
                }
            }

            // Provider-specific defaults (only if model still not set)
            if (!model) {
                const defaultModels = {
                    'openai': 'gpt-4o-mini',
                    'openrouter': 'openai/gpt-4o-mini',
                    'anthropic': 'claude-3-haiku-20240307',
                    'google': 'gemini-1.5-flash',
                    'deepseek': 'deepseek-chat',
                    'cohere': 'command',
                };
                model = defaultModels[provider?.toLowerCase()] || 'gpt-4o-mini';
            }

            // Map provider to chat_completion_source (same logic as ai-client.js)
            const getChatCompletionSource = (provider) => {
                const sourceMap = {
                    'openai': 'openai',
                    'openrouter': 'openrouter',
                    'anthropic': 'anthropic',
                    'google': 'makersuite',
                    'deepseek': 'deepseek',
                    'cohere': 'cohere',
                    'custom': 'custom',
                };
                return sourceMap[provider?.toLowerCase()] || 'openai';
            };

            const chatCompletionSource = getChatCompletionSource(provider);
            const presetName = $('#ai_maker_preset').val() || undefined;

            console.log('[Sidecar AI] Generating template with:', {
                provider,
                model,
                chatCompletionSource,
                presetName,
                connectionId
            });

            // Note: If presetName is provided, SillyTavern may override model/chat_completion_source
            // with values from the preset, which is expected behavior
            const response = await this.context.ChatCompletionService.processRequest({
                stream: false,
                messages: [
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                model: model,
                chat_completion_source: chatCompletionSource,
                max_tokens: 2048,
                temperature: 0.7
            }, {
                presetName: presetName
            }, true);

            // Extract content
            const content = response?.content || response?.choices?.[0]?.message?.content || String(response);

            // Clean up response - remove markdown code fences if present
            let jsonStr = content.trim();
            const codeFenceMatch = jsonStr.match(/^```(?:json)?\s*\n([\s\S]*)\n```\s*$/);
            if (codeFenceMatch) {
                jsonStr = codeFenceMatch[1].trim();
            }

            // Parse JSON
            const generatedConfig = JSON.parse(jsonStr);

            // Store for export/add
            this.generatedTemplate = generatedConfig;

            // Display preview
            $('#ai_maker_preview').text(JSON.stringify(generatedConfig, null, 2));
            $('#ai_maker_result').show();
            $('#ai_maker_export').show();
            $('#ai_maker_add').show();
            $('#ai_maker_test').show();
            $('#ai_maker_publish').show();
            $('#ai_maker_generate').html(originalText).prop('disabled', false);

            console.log('[Sidecar AI] Generated template:', generatedConfig);
        } catch (error) {
            console.error('[Sidecar AI] Template generation error:', error);
            alert('Error generating template: ' + error.message + '\n\nCheck console for details.');
            generateBtn.html(originalText).prop('disabled', false);
        }
    }

    /**
     * Export generated template as JSON file
     */
    exportGeneratedTemplate() {
        if (!this.generatedTemplate) {
            alert('No template generated yet.');
            return;
        }

        try {
            // Wrap in export format
            const exportData = {
                version: '1.0',
                name: `Template: ${this.generatedTemplate.name}`,
                description: this.generatedTemplate.description,
                addons: [this.generatedTemplate]
            };

            const json = JSON.stringify(exportData, null, 2);
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.href = url;
            a.download = `${this.generatedTemplate.name.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-template.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            console.log('[Sidecar AI] Template exported');
        } catch (error) {
            console.error('[Sidecar AI] Export error:', error);
            alert('Error exporting template: ' + error.message);
        }
    }

    /**
     * Add generated template as new sidecar
     */
    addGeneratedTemplate() {
        if (!this.generatedTemplate) {
            alert('No template generated yet.');
            return;
        }

        try {
            // Confirm
            if (!confirm(`Add "${this.generatedTemplate.name}" as a new sidecar?\n\nYou can edit it later to customize settings.`)) {
                return;
            }

            // Create addon from template
            const addon = this.addonManager.createAddon(this.generatedTemplate);

            console.log('[Sidecar AI] Added generated template as sidecar:', addon.name);
            alert(`✓ Sidecar created: ${addon.name}\n\nDon't forget to add your API key!`);

            // Close modal and refresh
            this.closeAIMakerModal();
            this.refreshSettings();

            // Auto-open edit modal for the new addon
            setTimeout(() => {
                this.openModal(addon.id);
            }, 300);
        } catch (error) {
            console.error('[Sidecar AI] Error adding template:', error);
            alert('Error adding template: ' + error.message);
        }
    }

    /**
     * Test generated template with a premade roleplay scenario
     */
    async testTemplate() {
        if (!this.generatedTemplate) {
            alert('No template generated yet.');
            return;
        }

        const testBtn = $('#ai_maker_test');
        const originalText = testBtn.html();
        testBtn.html('<i class="fa-solid fa-spinner fa-spin"></i> Testing...').prop('disabled', true);
        $('#ai_maker_test_result').hide();

        try {
            // Create a mock test scenario
            const testScenario = {
                messages: [
                    {
                        role: 'user',
                        content: 'You walk into a cozy coffee shop on a rainy afternoon. The bell above the door chimes as you enter, and you see a familiar face at a corner table.'
                    },
                    {
                        role: 'assistant',
                        content: '*I look up from my book, a warm smile spreading across my face as I recognize you. I set the book down and gesture to the empty chair across from me.*\n\n"Well, well, look who decided to brave the weather. Come, sit. I was just thinking about you."\n\n*The aroma of freshly brewed coffee fills the air, and soft jazz plays in the background. Raindrops trace patterns on the window beside us.*'
                    },
                    {
                        role: 'user',
                        content: 'I slide into the chair, shaking off my wet coat. "You always know the best spots. What are you reading?"'
                    },
                    {
                        role: 'assistant',
                        content: '*I pick up the book, showing you the cover - a worn copy of "The Night Circus"*\n\n"Just re-reading an old favorite. There\'s something about magical realism that feels perfect for days like this, don\'t you think?"\n\n*I lean forward slightly, my eyes sparkling with curiosity*\n\n"But enough about books. Tell me - what brings you here today? You seem... contemplative."'
                    }
                ],
                character: {
                    name: 'Alex',
                    description: 'A thoughtful, warm-hearted person who loves books, coffee, and deep conversations. They have a gentle sense of humor and are always genuinely interested in others.'
                }
            };

            // Get connection profile
            const connectionId = $('#ai_maker_connection').val();
            const profiles = this.context?.extensionSettings?.connectionManager?.profiles || [];
            const profile = profiles.find(p => (p.id || p.name) === connectionId);

            if (!profile) {
                throw new Error('Connection profile not found');
            }

            const provider = profile.api || 'openai';
            let model = profile.model || profile.defaultModel || this.generatedTemplate.aiModel || 'gpt-4o-mini';
            const presetName = $('#ai_maker_preset').val() || undefined;

            // Map provider to chat_completion_source
            const getChatCompletionSource = (provider) => {
                const sourceMap = {
                    'openai': 'openai',
                    'openrouter': 'openrouter',
                    'anthropic': 'anthropic',
                    'google': 'makersuite',
                    'deepseek': 'deepseek',
                    'cohere': 'cohere',
                    'custom': 'custom',
                };
                return sourceMap[provider?.toLowerCase()] || 'openai';
            };

            const chatCompletionSource = getChatCompletionSource(provider);

            // Build context for the test
            const contextMessages = testScenario.messages.map(msg => ({
                role: msg.role,
                content: msg.content
            }));

            // Build the prompt with context
            const contextText = contextMessages.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n\n');
            const charInfo = testScenario.character ? `\n\nCharacter: ${testScenario.character.name}\n${testScenario.character.description}` : '';
            const fullPrompt = `${this.generatedTemplate.prompt}\n\n--- Context ---\n${contextText}${charInfo}`;

            // Add system message
            const messages = [
                {
                    role: 'system',
                    content: 'You are a task executor. Your ONLY job is to follow the instruction block provided by the user. DO NOT continue stories, generate dialogue, or roleplay. ONLY execute the specific task requested in the instruction block.'
                },
                {
                    role: 'user',
                    content: fullPrompt
                }
            ];

            console.log('[Sidecar AI] Testing template with scenario:', { provider, model, chatCompletionSource });

            // Make the AI request
            const response = await this.context.ChatCompletionService.processRequest({
                stream: false,
                messages: messages,
                model: model,
                chat_completion_source: chatCompletionSource,
                max_tokens: 2048,
                temperature: 0.7
            }, {
                presetName: presetName
            }, true);

            const content = response?.content || response?.choices?.[0]?.message?.content || String(response);

            // Format the result using the template's formatStyle
            const formatted = this.formatTestResult(this.generatedTemplate, content);

            // Display the result
            $('#ai_maker_test_preview').html(formatted);
            $('#ai_maker_test_result').show();

            // Scroll to result
            $('#ai_maker_test_result')[0].scrollIntoView({ behavior: 'smooth', block: 'nearest' });

            testBtn.html(originalText).prop('disabled', false);
            console.log('[Sidecar AI] Template test completed');
        } catch (error) {
            console.error('[Sidecar AI] Template test error:', error);
            alert('Error testing template: ' + error.message + '\n\nCheck console for details.');
            testBtn.html(originalText).prop('disabled', false);
        }
    }

    /**
     * Format test result based on template's formatStyle
     */
    formatTestResult(template, content) {
        // Basic sanitization
        let sanitized = content
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, '')
            .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '');

        if (template.formatStyle === 'html-css') {
            return sanitized;
        } else if (template.formatStyle === 'markdown') {
            // SillyTavern will render markdown
            return sanitized;
        } else {
            return sanitized;
        }
    }

    /**
     * Publish template to GitHub as a PR
     */
    async publishTemplate() {
        if (!this.generatedTemplate) {
            alert('No template generated yet.');
            return;
        }

        const templateName = this.generatedTemplate.name.replace(/[^a-z0-9]/gi, '-').toLowerCase();
        const fileName = `${templateName}.json`;

        // Confirm
        if (!confirm(`Publish "${this.generatedTemplate.name}" to GitHub?\n\nThis will open GitHub to create a Pull Request adding the template to templates/community/${fileName}`)) {
            return;
        }

        const publishBtn = $('#ai_maker_publish');
        const originalText = publishBtn.html();
        publishBtn.html('<i class="fa-solid fa-spinner fa-spin"></i> Publishing...').prop('disabled', true);

        try {
            // Wrap in export format
            const exportData = {
                version: '1.0',
                name: `Template: ${this.generatedTemplate.name}`,
                description: this.generatedTemplate.description,
                addons: [this.generatedTemplate]
            };

            const json = JSON.stringify(exportData, null, 2);

            // Copy to clipboard
            await navigator.clipboard.writeText(json).catch(() => {
                // Fallback if clipboard API fails
                const textarea = document.createElement('textarea');
                textarea.value = json;
                textarea.style.position = 'fixed';
                textarea.style.opacity = '0';
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand('copy');
                document.body.removeChild(textarea);
            });

            const repo = 'skirianov/sidecar-ai';
            const filePath = `templates/community/${fileName}`;
            const commitMessage = encodeURIComponent(`Add template: ${this.generatedTemplate.name}`);
            const prTitle = encodeURIComponent(`Add template: ${this.generatedTemplate.name}`);
            const prBody = encodeURIComponent(`## Template: ${this.generatedTemplate.name}\n\n${this.generatedTemplate.description}\n\n### Generated by AI Template Maker\n\nThis template was generated using the AI Template Maker feature.`);

            // Open GitHub's web editor with file pre-filled
            // Note: GitHub's web editor URL format
            const githubUrl = `https://github.com/${repo}/new/main?filename=${filePath}&value=${encodeURIComponent(json)}&message=${commitMessage}`;

            // Open in new tab
            window.open(githubUrl, '_blank');

            // Show instructions
            setTimeout(() => {
                alert(`✅ Template JSON copied to clipboard!\n\n📋 GitHub web editor opened in new tab.\n\n📝 Instructions:\n1. Review the file content in GitHub\n2. Click "Commit new file"\n3. Click "Create pull request"\n4. Fill in PR title: "${this.generatedTemplate.name}"\n5. Add description if needed\n6. Submit PR\n\n💡 Tip: The JSON is already in your clipboard if you need to paste it elsewhere.`);
            }, 500);

            publishBtn.html(originalText).prop('disabled', false);
        } catch (error) {
            console.error('[Sidecar AI] Publish error:', error);
            alert('Error preparing template for GitHub: ' + error.message + '\n\nYou can export the template and create a PR manually.');
            publishBtn.html(originalText).prop('disabled', false);
        }
    }
}
