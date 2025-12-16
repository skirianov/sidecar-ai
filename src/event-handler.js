/**
 * Event Handler
 * Processes add-ons on message events and manual triggers
 */

export class EventHandler {
    constructor(context, addonManager, contextBuilder, aiClient, resultFormatter) {
        this.context = context;
        this.addonManager = addonManager;
        this.contextBuilder = contextBuilder;
        this.aiClient = aiClient;
        this.resultFormatter = resultFormatter;
        this.isProcessing = false;
    }

    /**
     * Register event listeners
     */
    registerListeners() {
        try {
            const { eventSource, event_types } = this.context;

            if (eventSource && event_types) {
                // Listen for new messages
                if (event_types.MESSAGE_RECEIVED) {
                    eventSource.on(event_types.MESSAGE_RECEIVED, (data) => {
                        try {
                            this.handleMessageReceived(data);
                        } catch (error) {
                            console.error('[Add-Ons Extension] Error in MESSAGE_RECEIVED handler:', error);
                        }
                    });
                }

                // Alternative event names
                if (event_types.MESSAGE_SENT) {
                    eventSource.on(event_types.MESSAGE_SENT, (data) => {
                        try {
                            this.handleMessageReceived(data);
                        } catch (error) {
                            console.error('[Add-Ons Extension] Error in MESSAGE_SENT handler:', error);
                        }
                    });
                }

                console.log('[Add-Ons Extension] Event listeners registered');
            } else {
                console.warn('[Add-Ons Extension] Event system not available, using fallback');
                this.setupFallbackListeners();
            }
        } catch (error) {
            console.error('[Add-Ons Extension] Error registering listeners:', error);
            console.error('[Add-Ons Extension] Error details:', error.message, error);
            this.setupFallbackListeners();
        }
    }

    /**
     * Setup fallback listeners (polling or DOM observation)
     */
    setupFallbackListeners() {
        // Use MutationObserver to watch for new messages
        const chatContainer = document.querySelector('#chat_container') ||
            document.querySelector('.chat_container') ||
            document.querySelector('#chat');

        if (chatContainer) {
            const observer = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    mutation.addedNodes.forEach((node) => {
                        if (node.nodeType === 1 &&
                            (node.classList.contains('mes') ||
                                node.classList.contains('message') ||
                                node.querySelector('.mes, .message'))) {
                            // New message detected
                            setTimeout(() => {
                                this.handleMessageReceived({ message: node });
                            }, 100);
                        }
                    });
                });
            });

            observer.observe(chatContainer, {
                childList: true,
                subtree: true
            });

            console.log('[Add-Ons Extension] Fallback listeners (MutationObserver) setup');
        }
    }

    /**
     * Handle message received event
     */
    async handleMessageReceived(data) {
        if (this.isProcessing) {
            return;
        }

        try {
            this.isProcessing = true;

            // Get auto-triggered add-ons
            const autoAddons = this.addonManager.getEnabledAddons()
                .filter(addon => addon.triggerMode === 'auto');

            if (autoAddons.length === 0) {
                return;
            }

            // Get current message
            const message = data.message || this.getLatestMessage();
            if (!message) {
                return;
            }

            // Process add-ons
            await this.processAddons(autoAddons, message);
        } catch (error) {
            console.error('[Add-Ons Extension] Error handling message:', error);
        } finally {
            this.isProcessing = false;
        }
    }

    /**
     * Trigger add-ons manually
     */
    async triggerAddons(addonIds = null) {
        if (this.isProcessing) {
            console.warn('[Add-Ons Extension] Already processing, skipping trigger');
            return;
        }

        try {
            this.isProcessing = true;

            // Get add-ons to process
            let addonsToProcess;
            if (addonIds && Array.isArray(addonIds)) {
                addonsToProcess = addonIds
                    .map(id => this.addonManager.getAddon(id))
                    .filter(addon => addon && addon.enabled);
            } else {
                addonsToProcess = this.addonManager.getEnabledAddons()
                    .filter(addon => addon.triggerMode === 'manual');
            }

            if (addonsToProcess.length === 0) {
                console.log('[Add-Ons Extension] No add-ons to trigger');
                return;
            }

            const message = this.getLatestMessage();
            await this.processAddons(addonsToProcess, message);
        } catch (error) {
            console.error('[Add-Ons Extension] Error triggering add-ons:', error);
            throw error;
        } finally {
            this.isProcessing = false;
        }
    }

    /**
     * Process add-ons
     */
    async processAddons(addons, message) {
        if (!addons || addons.length === 0) {
            return;
        }

        // Group add-ons by request mode
        const grouped = this.addonManager.getGroupedAddons(addons);

        // Process batch groups
        for (const batchGroup of grouped.batch) {
            await this.processBatchGroup(batchGroup, message);
        }

        // Process standalone add-ons
        for (const addon of grouped.standalone) {
            await this.processStandaloneAddon(addon, message);
        }
    }

    /**
     * Process a batch group
     */
    async processBatchGroup(addons, message) {
        try {
            console.log(`[Add-Ons Extension] Processing batch group: ${addons.length} add-on(s)`);

            // Build contexts for all add-ons
            const contexts = addons.map(addon => {
                const chatLog = this.contextBuilder.getChatLog();
                const charData = this.contextBuilder.getCharData();
                const userData = this.contextBuilder.getUserData();
                const worldData = this.contextBuilder.getWorldData();

                return this.contextBuilder.buildContext(
                    addon,
                    chatLog,
                    charData,
                    userData,
                    worldData
                );
            });

            // Build prompts
            const prompts = addons.map((addon, index) => {
                return this.contextBuilder.buildPrompt(addon, contexts[index]);
            });

            // Send batch request
            const responses = await this.aiClient.sendBatchToAI(addons, prompts);

            // Process each response
            for (let i = 0; i < addons.length; i++) {
                const addon = addons[i];
                const response = responses[i] || '';

                if (response) {
                    await this.injectResult(addon, response, message);
                }
            }
        } catch (error) {
            console.error('[Add-Ons Extension] Error processing batch group:', error);
        }
    }

    /**
     * Process standalone add-on
     */
    async processStandaloneAddon(addon, message) {
        try {
            console.log(`[Add-Ons Extension] Processing standalone add-on: ${addon.name}`);

            // Build context
            const chatLog = this.contextBuilder.getChatLog();
            const charData = this.contextBuilder.getCharData();
            const userData = this.contextBuilder.getUserData();
            const worldData = this.contextBuilder.getWorldData();

            const context = this.contextBuilder.buildContext(
                addon,
                chatLog,
                charData,
                userData,
                worldData
            );

            // Build prompt
            const prompt = this.contextBuilder.buildPrompt(addon, context);

            // Send to AI
            const response = await this.aiClient.sendToAI(addon, prompt);

            // Inject result
            if (response) {
                await this.injectResult(addon, response, message);
            }
        } catch (error) {
            console.error(`[Add-Ons Extension] Error processing add-on ${addon.name}:`, error);
        }
    }

    /**
     * Inject result based on response location setting
     */
    async injectResult(addon, response, message) {
        const formatted = this.resultFormatter.formatResult(addon, response, message);
        const messageId = this.resultFormatter.getMessageId(message);

        if (addon.responseLocation === 'chatHistory') {
            this.resultFormatter.injectIntoChatHistory(messageId, addon, formatted);
        } else {
            this.resultFormatter.injectIntoDropdown(addon, formatted);
        }
    }

    /**
     * Get latest message from chat
     */
    getLatestMessage() {
        const chatLog = this.contextBuilder.getChatLog();
        if (chatLog && chatLog.length > 0) {
            return chatLog[chatLog.length - 1];
        }
        return null;
    }
}
