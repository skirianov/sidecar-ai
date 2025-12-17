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
        // Avoid duplicating settings if already injected
        if (document.getElementById('sidecar_ai_settings')) {
            console.log('[Sidecar AI] settings.html already injected, skipping reload');
            return true;
        }

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
                    // Avoid double-inject on retry
                    if (document.getElementById('sidecar_ai_settings')) {
                        console.log('[Sidecar AI] settings.html already present on retry, skipping insert');
                        return;
                    }
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

        // Add "Run Sidecar" to Extensions menu
        addSidecarToExtensionsMenu(eventHandler);

        // Restore blocks from saved metadata after DOM is ready
        restoreBlocksOnLoad(context, resultFormatter, addonManager);

        // Export for manual triggering
        window.addOnsExtension = {
            triggerAddons: (addonIds = null) => {
                return eventHandler.triggerAddons(addonIds);
            },
            retryAddon: (addonId, messageId) => {
                return eventHandler.retryAddon(addonId, messageId);
            },
            getAddonManager: () => addonManager,
            getEventHandler: () => eventHandler,
            getSettingsUI: () => settingsUI,
            cleanup: () => {
                // Cleanup all resources
                if (eventHandler && typeof eventHandler.cleanup === 'function') {
                    eventHandler.cleanup();
                }
                if (aiClient && typeof aiClient.cleanup === 'function') {
                    aiClient.cleanup();
                }
                console.log('[Sidecar AI] Extension cleanup complete');
            }
        };

        // Register cleanup on extension unload/disable
        if (typeof window !== 'undefined') {
            window.addEventListener('beforeunload', () => {
                if (window.addOnsExtension && typeof window.addOnsExtension.cleanup === 'function') {
                    window.addOnsExtension.cleanup();
                }
            });
        }

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

    // Note: Legacy standalone dropdown container removed.
    // Sidecar cards are injected per-message via ResultFormatter into `.sidecar-container`.

    /**
     * Restore blocks from saved metadata when chat loads
     */
    function restoreBlocksOnLoad(context, resultFormatter, addonManager) {
        // Wait for DOM to be ready and chat to be loaded
        const restoreBlocks = async () => {
            try {
                // Wait a bit for chat to render
                await new Promise(resolve => setTimeout(resolve, 1000));

                // Restore blocks from metadata
                await resultFormatter.restoreBlocksFromMetadata(addonManager);
            } catch (error) {
                console.error('[Sidecar AI] Error restoring blocks on load:', error);
            }
        };

        // Restore immediately after initialization
        setTimeout(async () => {
            await restoreBlocks();
            // After restoration, show cards for the active message
            // This ensures cards are visible even if GENERATION_STARTED fired and hid them
            setTimeout(() => {
                resultFormatter.showSidecarCardsForActiveMessage();
            }, 200);
        }, 500);

        // Also listen for chat load events if available
        if (context.eventSource && context.event_types) {
            const chatLoadEvents = [
                context.event_types.CHAT_CHANGED,
            ].filter(Boolean);

            chatLoadEvents.forEach(eventType => {
                if (eventType) {
                    context.eventSource.on(eventType, async () => {
                        console.log(`[Sidecar AI] Chat load event detected: ${eventType}`);
                        // Restore blocks for loaded chat
                        // Note: We don't call cleanupHiddenSidecarCards() here anymore
                        // because swipe navigation is handled by MESSAGE_SWIPED events
                        setTimeout(async () => {
                            await resultFormatter.restoreBlocksFromMetadata(addonManager);
                            // After restoration, show cards for the active message
                            setTimeout(() => {
                                resultFormatter.showSidecarCardsForActiveMessage();
                            }, 200);
                        }, 500);
                    });
                }
            });

            // Listen for message swipe events
            // MESSAGE_SWIPED fires when switching between response variants (swipe_id) of the same message
            // Each message can have multiple response variants, and sidecars are stored per variant
            const swipeEvent = context.event_types.MESSAGE_SWIPED || 'MESSAGE_SWIPED';
            if (swipeEvent) {
                context.eventSource.on(swipeEvent, async (messageIndex) => {
                    console.log(`[Sidecar AI] Message swipe event detected: ${swipeEvent}`, messageIndex);
                    if (typeof messageIndex === 'number') {
                        // Handle swipe: hide current sidecars, then restore for the new variant
                        await resultFormatter.handleSwipeVariantChange(messageIndex, addonManager);
                    } else {
                        console.warn('[Sidecar AI] MESSAGE_SWIPED event did not provide message index');
                    }
                });
                console.log(`[Sidecar AI] Registered listener for ${swipeEvent}`);
            }

            // Note: We no longer hide cards on GENERATION_STARTED
            // Cards are only hidden on swipe (MESSAGE_SWIPED) or when message is regenerated
            // This ensures cards stay visible unless explicitly swiped away
        }

        // Note: Periodic cleanup, scroll cleanup, touch cleanup, and mutation observer cleanup
        // have been removed since we now use event-based handling:
        // - MESSAGE_SWIPED event handles swipe navigation
        // - GENERATION_STARTED event handles new AI response requests

        // Fallback: Use MutationObserver to detect when chat messages are rendered
        const chatContainer = document.querySelector('#chat_container') ||
            document.querySelector('.chat_container') ||
            document.querySelector('#chat');

        if (chatContainer) {
            let hasRestored = false;
            const observer = new MutationObserver(() => {
                // Only restore once when messages first appear
                if (!hasRestored && chatContainer.querySelectorAll('.mes, .message').length > 0) {
                    hasRestored = true;
                    setTimeout(async () => {
                        // Restore blocks for initial chat load
                        // Note: We don't call cleanupHiddenSidecarCards() here anymore
                        // because swipe navigation is handled by MESSAGE_SWIPED events
                        await resultFormatter.restoreBlocksFromMetadata(addonManager);
                        // After restoration, show cards for the active message
                        setTimeout(() => {
                            resultFormatter.showSidecarCardsForActiveMessage();
                        }, 200);
                    }, 1000);
                    // Stop observing after first restoration
                    observer.disconnect();
                }
            });

            observer.observe(chatContainer, {
                childList: true,
                subtree: true
            });

            // Also check immediately in case messages are already loaded
            if (chatContainer.querySelectorAll('.mes, .message').length > 0) {
                setTimeout(async () => {
                    if (!hasRestored) {
                        hasRestored = true;
                        // Restore blocks for already-loaded messages
                        // Note: We don't call cleanupHiddenSidecarCards() here anymore
                        // because swipe navigation is handled by MESSAGE_SWIPED events
                        await resultFormatter.restoreBlocksFromMetadata(addonManager);
                        // After restoration, show cards for the active message
                        setTimeout(() => {
                            resultFormatter.showSidecarCardsForActiveMessage();
                        }, 200);
                    }
                }, 1500);
            }
        }
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
            menuItem.style.cursor = 'default';
            menuItem.title = 'Run manual sidecar prompts';

            // Create inner structure
            menuItem.innerHTML = `
                <div class="extensionsMenuExtensionButton fa-solid fa-bolt"></div>
                <div style="flex-grow: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 0.9em;">Run Sidecar</div>
                <select id="sidecar_manual_select" class="text_pole" style="width: 100px; max-width: 100px; margin-right: 5px; padding: 2px; height: 26px; font-size: 0.85em;" title="Select Sidecar to run">
                    <option value="all">All Manual</option>
                </select>
                <div id="sidecar_run_btn" class="menu_button" style="padding: 0; height: 26px; width: 26px; min-width: 26px; display: flex; align-items: center; justify-content: center; border-radius: 3px;" title="Run Selected">
                    <i class="fa-solid fa-play" style="font-size: 0.8em;"></i>
                </div>
            `;

            const select = menuItem.querySelector('#sidecar_manual_select');
            const runBtn = menuItem.querySelector('#sidecar_run_btn');

            // Performance: Debounce dropdown updates
            let lastAddonUpdate = 0;
            let updateTimeout = null;

            const updateSelectOptions = () => {
                const now = Date.now();
                // Debounce: only update if 100ms have passed since last update
                if (now - lastAddonUpdate < 100) {
                    if (updateTimeout) clearTimeout(updateTimeout);
                    updateTimeout = setTimeout(updateSelectOptions, 100);
                    return;
                }

                lastAddonUpdate = now;

                const manualAddons = eventHandler.addonManager.getEnabledAddons()
                    .filter(addon => addon.triggerMode === 'manual');

                const currentValue = select.value;
                select.innerHTML = '<option value="all">All Manual</option>';

                manualAddons.forEach(addon => {
                    const option = document.createElement('option');
                    option.value = addon.id;
                    option.textContent = addon.name;
                    select.appendChild(option);
                });

                // Restore selection if still valid
                if (manualAddons.find(a => a.id === currentValue) || currentValue === 'all') {
                    select.value = currentValue;
                }
            };

            // Update options on interaction (debounced)
            select.addEventListener('mousedown', updateSelectOptions);
            // Also update initially
            updateSelectOptions();

            // Prevent clicks on controls from bubbling up if container had listeners (it doesn't anymore, but good practice)
            select.addEventListener('click', (e) => e.stopPropagation());

            // Run button handler
            runBtn.addEventListener('click', async (e) => {
                e.stopPropagation();

                // Disable during processing
                const originalHTML = runBtn.innerHTML;
                runBtn.style.opacity = '0.5';
                runBtn.style.pointerEvents = 'none';
                runBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

                try {
                    const selectedId = select.value;
                    const addonIds = selectedId === 'all' ? null : [selectedId];

                    await eventHandler.triggerAddons(addonIds);

                    runBtn.innerHTML = '<i class="fa-solid fa-check"></i>';
                    setTimeout(() => {
                        runBtn.innerHTML = originalHTML;
                        runBtn.style.opacity = '1';
                        runBtn.style.pointerEvents = 'auto';
                    }, 2000);
                } catch (error) {
                    console.error('[Sidecar AI] Error triggering add-ons:', error);
                    runBtn.innerHTML = '<i class="fa-solid fa-exclamation-triangle"></i>';
                    setTimeout(() => {
                        runBtn.innerHTML = originalHTML;
                        runBtn.style.opacity = '1';
                        runBtn.style.pointerEvents = 'auto';
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
