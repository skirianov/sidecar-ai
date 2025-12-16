export class SettingsUI {
    constructor(context, addonManager) {
        this.context = context;
        this.addonManager = addonManager;
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
        // Handle drawer toggle - use instant toggle instead of animation for better performance
        $('#sidecar_ai_settings .inline-drawer-toggle').off('click').on('click', function () {
            const content = $(this).next('.inline-drawer-content');
            const icon = $(this).find('.inline-drawer-icon');
            const isVisible = content.is(':visible');
            content.toggle(!isVisible);
            icon.toggleClass('down', !isVisible);
        });
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
        $(document).off('click', '#sidecar_create_button').on('click', '#sidecar_create_button', function () {
            self.openModal();
        });

        // Modal close
        $(document).off('click', '#add_ons_modal_close, #add_ons_form_cancel').on('click', '#add_ons_modal_close, #add_ons_form_cancel', function () {
            self.closeModal();
        });

        // Edit button
        $(document).off('click', '[data-action="edit"]').on('click', '[data-action="edit"]', function () {
            const addonId = $(this).data('addon-id');
            self.openModal(addonId);
        });

        // Delete button
        $(document).off('click', '[data-action="delete"]').on('click', '[data-action="delete"]', function () {
            const addonId = $(this).data('addon-id');
            if (confirm('Are you sure you want to delete this Sidecar?')) {
                self.deleteAddon(addonId);
            }
        });

        // Enable toggle
        $(document).off('change', '.add_ons_enable_toggle').on('change', '.add_ons_enable_toggle', function () {
            const addonId = $(this).data('addon-id');
            const enabled = $(this).is(':checked');
            self.toggleAddon(addonId, enabled);
        });

        // Save form
        $(document).off('click', '#add_ons_form_save').on('click', '#add_ons_form_save', function () {
            self.saveAddon();
        });

        // Response location hint
        $(document).off('change', '#add_ons_form_response_location').on('change', '#add_ons_form_response_location', function () {
            const location = $(this).val();
            const hint = $('#add_ons_response_location_hint');
            if (location === 'chatHistory') {
                hint.text('Results hidden in HTML comment at end of message, accessible to main AI');
            } else {
                hint.text('Results appear in expandable dropdown below chat area');
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
        }

        modal.show();
    }

    closeModal() {
        $('#add_ons_modal').hide();
        $('#add_ons_form')[0].reset();
    }

    populateForm(addon) {
        $('#add_ons_form_id').val(addon.id);
        $('#add_ons_form_name').val(addon.name);
        $('#add_ons_form_description').val(addon.description);
        $('#add_ons_form_prompt').val(addon.prompt);
        $('#add_ons_form_trigger_mode').val(addon.triggerMode);
        $('#add_ons_form_request_mode').val(addon.requestMode);
        $('#add_ons_form_ai_provider').val(addon.aiProvider);
        $('#add_ons_form_ai_model').val(addon.aiModel);
        $('#add_ons_form_api_key').val(addon.apiKey || '');
        $('#add_ons_form_result_format').val(addon.resultFormat);
        $('#add_ons_form_response_location').val(addon.responseLocation);

        const ctx = addon.contextSettings || {};
        $('#add_ons_form_messages_count').val(ctx.messagesCount || 10);
        $('#add_ons_form_include_char_card').prop('checked', ctx.includeCharCard !== false);
        $('#add_ons_form_include_user_card').prop('checked', ctx.includeUserCard !== false);
        $('#add_ons_form_include_world_card').prop('checked', ctx.includeWorldCard !== false);
    }

    saveAddon() {
        const form = $('#add_ons_form')[0];
        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }

        const formData = {
            id: $('#add_ons_form_id').val(),
            name: $('#add_ons_form_name').val(),
            description: $('#add_ons_form_description').val(),
            prompt: $('#add_ons_form_prompt').val(),
            triggerMode: $('#add_ons_form_trigger_mode').val(),
            requestMode: $('#add_ons_form_request_mode').val(),
            aiProvider: $('#add_ons_form_ai_provider').val(),
            aiModel: $('#add_ons_form_ai_model').val(),
            apiKey: $('#add_ons_form_api_key').val(),
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

        try {
            if (formData.id) {
                this.addonManager.updateAddon(formData.id, formData);
            } else {
                this.addonManager.createAddon(formData);
            }

            this.closeModal();
            this.refreshSettings();
        } catch (error) {
            console.error('Error saving Sidecar:', error);
            alert('Error saving Sidecar: ' + error.message);
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
