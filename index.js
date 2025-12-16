/**
 * SillyTavern Sidecar AI Add-Ons Extension
 * Allows users to define custom add-on prompts that execute using cheaper AI models
 */

// Import getContext using static import (as per SillyTavern docs)
// For third-party extensions, use the global SillyTavern object instead
// import { getContext } from "../../extensions.js"; // This may not work for dynamic imports

// Use dynamic imports only for our own modules
let AddonManager, ContextBuilder, AIClient, ResultFormatter, EventHandler;

// Get getContext function - use global SillyTavern object (more reliable for third-party extensions)
function getGetContext() {
    // Try global SillyTavern object first (recommended for third-party extensions)
    if (typeof SillyTavern !== 'undefined' && typeof SillyTavern.getContext === 'function') {
        return SillyTavern.getContext;
    }

    // Fallback: try window.getContext
    if (typeof window !== 'undefined' && typeof window.getContext === 'function') {
        return window.getContext;
    }

    // Last resort: try global getContext
    if (typeof getContext === 'function') {
        return getContext;
    }

    return null;
}

async function loadModules() {
    try {
        const [
            addonManagerModule,
            contextBuilderModule,
            aiClientModule,
            resultFormatterModule,
            eventHandlerModule
        ] = await Promise.all([
            import("./src/addon-manager.js"),
            import("./src/context-builder.js"),
            import("./src/ai-client.js"),
            import("./src/result-formatter.js"),
            import("./src/event-handler.js")
        ]);

        AddonManager = addonManagerModule.AddonManager;
        ContextBuilder = contextBuilderModule.ContextBuilder;
        AIClient = aiClientModule.AIClient;
        ResultFormatter = resultFormatterModule.ResultFormatter;
        EventHandler = eventHandlerModule.EventHandler;

        return true;
    } catch (error) {
        console.error('[Add-Ons Extension] Failed to load modules:', error);
        return false;
    }
}

// Initialize extension
(async function () {
    'use strict';

    console.log('[Add-Ons Extension] Loading modules...');

    const modulesLoaded = await loadModules();
    if (!modulesLoaded) {
        console.error('[Add-Ons Extension] Module loading failed, extension disabled');
        return;
    }

    console.log('[Add-Ons Extension] Modules loaded, getting context...');

    // Get getContext function
    const getContext = getGetContext();
    if (!getContext) {
        console.error('[Add-Ons Extension] getContext function not available. Trying to wait...');
        // Wait a bit for SillyTavern to initialize
        await new Promise(resolve => setTimeout(resolve, 1000));
        const getContextRetry = getGetContext();
        if (!getContextRetry) {
            console.error('[Add-Ons Extension] getContext still not available after wait. Extension disabled.');
            return;
        }
        getContext = getContextRetry;
    }

    try {
        // Get SillyTavern context
        const context = getContext();

        if (!context) {
            console.error('[Add-Ons Extension] Failed to get context - getContext() returned null/undefined');
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
        // SillyTavern loads settings.html as regular HTML (not Handlebars template)
        // The settings.html file will be injected directly into the DOM
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
        console.error('[Add-Ons Extension] Error type:', typeof error);
        if (error?.stack) {
            console.error('[Add-Ons Extension] Error stack:', error.stack);
        }
        // Don't re-throw - SillyTavern extensions should handle errors gracefully
    }

    function initializeSettingsUI(context) {
        if (!context.extensionSettings) {
            context.extensionSettings = {};
        }

        // Ensure extension settings structure exists
        if (!context.extensionSettings.addOnsExtension) {
            context.extensionSettings.addOnsExtension = {
                addons: []
            };
        }

        // SillyTavern loads settings.html as regular HTML (not Handlebars template)
        // Check if the settings container exists (it will be injected when extension settings panel is opened)
        const settingsContainer = document.getElementById('add_ons_extension_settings');
        if (settingsContainer) {
            console.log('[Add-Ons Extension] Settings UI container found');

            // Ensure settings UI handler is initialized
            if (window.addOnsExtensionSettings) {
                // Re-render the list in case it wasn't ready before
                setTimeout(() => {
                    window.addOnsExtensionSettings.renderAddonsList();
                }, 100);
            }
        } else {
            console.log('[Add-Ons Extension] Settings UI container not found yet - SillyTavern will load settings.html when extension settings panel is opened');
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
