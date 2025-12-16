/**
 * SillyTavern Add-Ons Extension
 * Allows users to define custom add-on prompts that execute using cheaper AI models
 */

import { getContext } from "../../extensions.js";
import { AddonManager } from "./src/addon-manager.js";
import { ContextBuilder } from "./src/context-builder.js";
import { AIClient } from "./src/ai-client.js";
import { ResultFormatter } from "./src/result-formatter.js";
import { EventHandler } from "./src/event-handler.js";

(async function () {
    'use strict';

    console.log('[Add-Ons Extension] Initializing...');

    try {
        // Get SillyTavern context
        const context = getContext();

        if (!context) {
            console.error('[Add-Ons Extension] Failed to get context');
            return;
        }

        console.log('[Add-Ons Extension] Context obtained, initializing components...');

        // Initialize components
        const addonManager = new AddonManager(context);
        const contextBuilder = new ContextBuilder(context);
        const aiClient = new AIClient(context);
        const resultFormatter = new ResultFormatter(context);
        const eventHandler = new EventHandler(
            context,
            addonManager,
            contextBuilder,
            aiClient,
            resultFormatter
        );

        // Load saved add-ons
        await addonManager.loadAddons();

        // Register event listeners
        eventHandler.registerListeners();

        // Initialize settings UI
        initializeSettingsUI(context);

        // Initialize dropdown UI for outsideChatlog results
        initializeDropdownUI();

        // Add manual trigger button to chat UI
        addManualTriggerButton(eventHandler);

        // Export for manual triggering
        window.addOnsExtension = {
            triggerAddons: (addonIds = null) => {
                return eventHandler.triggerAddons(addonIds);
            },
            getAddonManager: () => addonManager,
            getEventHandler: () => eventHandler
        };

        console.log('[Add-Ons Extension] Initialization complete');
    } catch (error) {
        console.error('[Add-Ons Extension] Initialization error:', error);
        console.error('[Add-Ons Extension] Error name:', error?.name);
        console.error('[Add-Ons Extension] Error message:', error?.message || String(error));
        if (error?.stack) {
            console.error('[Add-Ons Extension] Error stack:', error.stack);
        }
        // Don't throw - let extension load even if initialization fails partially
    }

    function initializeSettingsUI(context) {
        if (!context.extensionSettings) {
            context.extensionSettings = {};
        }

        // Register settings template
        const settingsTemplate = document.getElementById('add-ons-extension-settings-template');
        if (settingsTemplate) {
            // Settings UI will be rendered by SillyTavern's extension system
            console.log('[Add-Ons Extension] Settings template found');
        }
    }

    function initializeDropdownUI() {
        // Wait for DOM to be ready
        setTimeout(() => {
            // Create dropdown container below chat area
            const chatContainer = document.querySelector('#chat_container') || document.querySelector('.chat_container');
            if (!chatContainer) {
                console.warn('[Add-Ons Extension] Chat container not found, dropdown UI may not work');
                return;
            }

            // Create dropdown container
            const dropdownContainer = document.createElement('div');
            dropdownContainer.id = 'add-ons-dropdown-container';
            dropdownContainer.className = 'add-ons-dropdown-container';

            // Insert after chat container or at end of parent
            const parent = chatContainer.parentElement;
            if (parent) {
                parent.appendChild(dropdownContainer);
            } else {
                document.body.appendChild(dropdownContainer);
            }

            console.log('[Add-Ons Extension] Dropdown UI initialized');
        }, 500);
    }

    function addManualTriggerButton(eventHandler) {
        // Wait for chat UI to be ready
        setTimeout(() => {
            const sendButtonContainer = document.querySelector('#send_form') ||
                document.querySelector('.send_form') ||
                document.querySelector('#send_container');

            if (!sendButtonContainer) {
                console.warn('[Add-Ons Extension] Send button container not found, manual trigger button not added');
                return;
            }

            // Check if button already exists
            if (document.getElementById('add_ons_trigger_button')) {
                return;
            }

            // Create trigger button
            const triggerButton = document.createElement('button');
            triggerButton.id = 'add_ons_trigger_button';
            triggerButton.className = 'add_ons_trigger_button';
            triggerButton.type = 'button';
            triggerButton.innerHTML = '<i class="fa-solid fa-bolt"></i> Run Add-Ons';
            triggerButton.title = 'Trigger manual add-ons';

            triggerButton.addEventListener('click', async () => {
                triggerButton.disabled = true;
                triggerButton.textContent = 'Processing...';

                try {
                    await eventHandler.triggerAddons();
                    triggerButton.textContent = 'Done!';
                    setTimeout(() => {
                        triggerButton.innerHTML = '<i class="fa-solid fa-bolt"></i> Run Add-Ons';
                        triggerButton.disabled = false;
                    }, 2000);
                } catch (error) {
                    console.error('[Add-Ons Extension] Error triggering add-ons:', error);
                    triggerButton.textContent = 'Error';
                    setTimeout(() => {
                        triggerButton.innerHTML = '<i class="fa-solid fa-bolt"></i> Run Add-Ons';
                        triggerButton.disabled = false;
                    }, 2000);
                }
            });

            // Insert before send button or at end of container
            if (sendButtonContainer.querySelector('button[type="submit"]')) {
                sendButtonContainer.insertBefore(triggerButton, sendButtonContainer.querySelector('button[type="submit"]'));
            } else {
                sendButtonContainer.appendChild(triggerButton);
            }

            console.log('[Add-Ons Extension] Manual trigger button added');
        }, 1000);
    }

})();
