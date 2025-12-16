/**
 * SillyTavern Sidecar AI Add-Ons Extension
 * Allows users to define custom add-on prompts that execute using cheaper AI models
 */

// Import getContext using static import (as per SillyTavern docs)
// For third-party extensions, use the global SillyTavern object instead
// import { getContext } from "../../extensions.js"; // This may not work for dynamic imports

// Use dynamic imports only for our own modules
let AddonManager, ContextBuilder, AIClient, ResultFormatter, EventHandler, SettingsUI;

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

function getExtensionDirectory() {
    // Get the directory of the extension
    let index_path = new URL(import.meta.url).pathname;
    return index_path.substring(0, index_path.lastIndexOf('/'));  // remove the /index.js from the path
}

async function loadSettingsHTML() {
    // Fetch the settings.html file and append it to the settings div
    console.log('[Sidecar AI] Loading settings.html...');

    try {
        const module_dir = getExtensionDirectory();
        const path = `${module_dir}/settings.html`;

        // Use fetch instead of $.get for better compatibility
        const response = await fetch(path);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const html = await response.text();
        const settingsContainer = document.getElementById('extensions_settings2');

        if (settingsContainer) {
            settingsContainer.insertAdjacentHTML('beforeend', html);
            console.log('[Sidecar AI] Loaded settings.html successfully');
            return true;
        } else {
            console.warn('[Sidecar AI] #extensions_settings2 container not found, will retry...');
            // Retry after a delay
            setTimeout(async () => {
                const retryContainer = document.getElementById('extensions_settings2');
                if (retryContainer) {
                    retryContainer.insertAdjacentHTML('beforeend', html);
                    console.log('[Sidecar AI] Loaded settings.html on retry');
                    // Initialize UI after retry load if it exists
                    if (window.addOnsExtensionSettings) {
                        window.addOnsExtensionSettings.init();
                    }
                } else {
                    console.error('[Sidecar AI] Failed to find #extensions_settings2 container');
                }
            }, 1000);
            return false;
        }
    } catch (error) {
        console.error('[Sidecar AI] Error loading settings.html:', error);
        return false;
    }
}

async function loadModules() {
    try {
        const [
            addonManagerModule,
            contextBuilderModule,
            aiClientModule,
            resultFormatterModule,
            eventHandlerModule,
            settingsUIModule
        ] = await Promise.all([
            import("./src/addon-manager.js"),
            import("./src/context-builder.js"),
            import("./src/ai-client.js"),
            import("./src/result-formatter.js"),
            import("./src/event-handler.js"),
            import("./src/settings-ui.js")
        ]);

        AddonManager = addonManagerModule.AddonManager;
        ContextBuilder = contextBuilderModule.ContextBuilder;
        AIClient = aiClientModule.AIClient;
        ResultFormatter = resultFormatterModule.ResultFormatter;
        EventHandler = eventHandlerModule.EventHandler;
        SettingsUI = settingsUIModule.SettingsUI;

        return true;
    } catch (error) {
        console.error('[Sidecar AI] Failed to load modules:', error);
        return false;
    }
}

// Initialize extension
(async function () {
    'use strict';

    console.log('[Sidecar AI] Loading modules...');

    const modulesLoaded = await loadModules();
    if (!modulesLoaded) {
        console.error('[Sidecar AI] Module loading failed, extension disabled');
        return;
    }

    console.log('[Sidecar AI] Modules loaded, getting context...');

    // Get getContext function
    let getContext = getGetContext();
    if (!getContext) {
        console.error('[Sidecar AI] getContext function not available. Trying to wait...');
        // Wait a bit for SillyTavern to initialize
        await new Promise(resolve => setTimeout(resolve, 1000));
        const getContextRetry = getGetContext();
        if (!getContextRetry) {
            console.error('[Sidecar AI] getContext still not available after wait. Extension disabled.');
            return;
        }
        getContext = getContextRetry;
    }

    try {
        // Get SillyTavern context
        const context = getContext();

        if (!context) {
            console.error('[Sidecar AI] Failed to get context - getContext() returned null/undefined');
            return;
        }

        console.log('[Sidecar AI] Context obtained, initializing components...');

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
        const settingsUI = new SettingsUI(context, addonManager, aiClient);

        // Load saved add-ons
        await addonManager.loadAddons();

        // Register event listeners
        eventHandler.registerListeners();

        // Load settings.html
        await loadSettingsHTML();

        // Initialize Settings UI
        window.addOnsExtensionSettings = settingsUI;
        settingsUI.init();

        // Initialize dropdown UI for outsideChatlog results
        initializeDropdownUI();

        // Add "Run Sidecar" to Extensions menu
        addSidecarToExtensionsMenu(eventHandler);

        // Export for manual triggering
        window.addOnsExtension = {
            triggerAddons: (addonIds = null) => {
                return eventHandler.triggerAddons(addonIds);
            },
            getAddonManager: () => addonManager,
            getEventHandler: () => eventHandler,
            getSettingsUI: () => settingsUI
        };

        console.log('[Sidecar AI] Initialization complete');
    } catch (error) {
        console.error('[Sidecar AI] Initialization error:', error);
        console.error('[Sidecar AI] Error name:', error?.name);
        console.error('[Sidecar AI] Error message:', error?.message || String(error));
        console.error('[Sidecar AI] Error type:', typeof error);
        if (error?.stack) {
            console.error('[Sidecar AI] Error stack:', error.stack);
        }
        // Don't re-throw - SillyTavern extensions should handle errors gracefully
    }

    function initializeDropdownUI() {
        // Wait for DOM to be ready
        setTimeout(() => {
            // Create dropdown container below chat area
            const chatContainer = document.querySelector('#chat_container') || document.querySelector('.chat_container');
            if (!chatContainer) {
                console.warn('[Sidecar AI] Chat container not found, dropdown UI may not work');
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

            console.log('[Sidecar AI] Dropdown UI initialized');
        }, 500);
    }

    function addSidecarToExtensionsMenu(eventHandler) {
        // Wait for Extensions menu to be ready
        setTimeout(() => {
            const extensionsMenu = document.querySelector('#extensionsMenu');

            if (!extensionsMenu) {
                console.warn('[Sidecar AI] Extensions menu not found, retrying...');
                setTimeout(() => addSidecarToExtensionsMenu(eventHandler), 1000);
                return;
            }

            // Check if menu item already exists
            if (document.getElementById('sidecar_wand_container')) {
                return;
            }

            // Create container for our menu item
            const sidecarContainer = document.createElement('div');
            sidecarContainer.id = 'sidecar_wand_container';
            sidecarContainer.className = 'extension_container';

            // Create menu item matching SillyTavern's format
            const menuItem = document.createElement('div');
            menuItem.className = 'list-group-item flex-container flexGap5';
            menuItem.style.cursor = 'pointer';
            menuItem.title = 'Run manual sidecar prompts';

            menuItem.innerHTML = `
                <div class="extensionsMenuExtensionButton fa-solid fa-bolt"></div>
                Run Sidecar
            `;

            menuItem.addEventListener('click', async () => {
                // Disable during processing
                const originalHTML = menuItem.innerHTML;
                menuItem.style.opacity = '0.5';
                menuItem.style.pointerEvents = 'none';
                menuItem.innerHTML = `
                    <div class="extensionsMenuExtensionButton fa-solid fa-spinner fa-spin"></div>
                    Processing...
                `;

                try {
                    await eventHandler.triggerAddons();
                    menuItem.innerHTML = `
                        <div class="extensionsMenuExtensionButton fa-solid fa-check"></div>
                        Done!
                    `;
                    setTimeout(() => {
                        menuItem.innerHTML = originalHTML;
                        menuItem.style.opacity = '1';
                        menuItem.style.pointerEvents = 'auto';
                    }, 2000);
                } catch (error) {
                    console.error('[Sidecar AI] Error triggering add-ons:', error);
                    menuItem.innerHTML = `
                        <div class="extensionsMenuExtensionButton fa-solid fa-exclamation-triangle"></div>
                        Error
                    `;
                    setTimeout(() => {
                        menuItem.innerHTML = originalHTML;
                        menuItem.style.opacity = '1';
                        menuItem.style.pointerEvents = 'auto';
                    }, 2000);
                }
            });

            sidecarContainer.appendChild(menuItem);

            // Append to extensions menu (add near the end, before translate)
            const translateContainer = document.querySelector('#translate_wand_container');
            if (translateContainer && translateContainer.parentNode) {
                translateContainer.parentNode.insertBefore(sidecarContainer, translateContainer);
            } else {
                extensionsMenu.appendChild(sidecarContainer);
            }

            console.log('[Sidecar AI] Added "Run Sidecar" to Extensions menu');
        }, 1500);
    }

})();
