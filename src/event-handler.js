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
        // Performance: Debounce save operations
        this.saveChatTimeout = null;
        // Prevent double-processing the same message id
        this.lastProcessedMessageId = null;
        this.lastProcessedSwipeId = null;
    }

    /**
     * Register event listeners
     */
    registerListeners() {
        try {
            const { eventSource, event_types } = this.context;

            if (eventSource && event_types) {
                console.log('[Sidecar AI] Available event types:', Object.keys(event_types));

                // Listen for new messages - try multiple event types
                const messageEvents = [
                    event_types.MESSAGE_RECEIVED,
                    event_types.MESSAGE_SENT,
                    event_types.CHAT_MESSAGE_RECEIVED,
                    event_types.CHAT_MESSAGE_SENT,
                    'MESSAGE_RECEIVED',
                    'MESSAGE_SENT'
                ].filter(Boolean); // Remove undefined values

                messageEvents.forEach(eventType => {
                    if (eventType) {
                        console.log(`[Sidecar AI] Registering listener for: ${eventType}`);
                        eventSource.on(eventType, (data) => {
                            try {
                                console.log(`[Sidecar AI] Event fired: ${eventType}`, data);
                                this.handleMessageReceived(data);
                            } catch (error) {
                                console.error(`[Sidecar AI] Error in ${eventType} handler:`, error);
                            }
                        });
                    }
                });

                console.log('[Sidecar AI] Event listeners registered for', messageEvents.length, 'event type(s)');
            } else {
                console.warn('[Sidecar AI] Event system not available, using fallback');
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
        console.log('[Sidecar AI] Setting up fallback listeners using MutationObserver');

        // Use MutationObserver to watch for new messages
        const chatContainer = document.querySelector('#chat_container') ||
            document.querySelector('.chat_container') ||
            document.querySelector('#chat');

        if (chatContainer) {
            let lastMessageCount = 0;

            const observer = new MutationObserver((mutations) => {
                // Get current message count
                const messages = chatContainer.querySelectorAll('.mes, .message');
                const currentCount = messages.length;

                // Only process if new message was added
                if (currentCount > lastMessageCount) {
                    lastMessageCount = currentCount;

                    // Get the latest message
                    const latestMessage = messages[messages.length - 1];
                    if (latestMessage) {
                        console.log('[Sidecar AI] New message detected via MutationObserver');
                        setTimeout(() => {
                            this.handleMessageReceived({ message: latestMessage });
                        }, 500); // Delay to ensure message is fully rendered
                    }
                }
            });

            observer.observe(chatContainer, {
                childList: true,
                subtree: true
            });

            // Initialize message count
            const messages = chatContainer.querySelectorAll('.mes, .message');
            lastMessageCount = messages.length;

            console.log('[Sidecar AI] Fallback listeners (MutationObserver) setup, initial message count:', lastMessageCount);
        } else {
            console.warn('[Sidecar AI] Chat container not found for fallback listeners');
        }
    }

    /**
     * Handle message received event
     */
    async handleMessageReceived(data) {
        if (this.isProcessing) {
            console.log('[Sidecar AI] Already processing, skipping...');
            return;
        }

        try {
            this.isProcessing = true;
            console.log('[Sidecar AI] Message received event fired', data);

            // Get auto-triggered add-ons
            const autoAddons = this.addonManager.getEnabledAddons()
                .filter(addon => addon.triggerMode === 'auto');

            console.log(`[Sidecar AI] Found ${autoAddons.length} auto-triggered add-on(s)`);

            if (autoAddons.length === 0) {
                console.log('[Sidecar AI] No auto-triggered add-ons found');
                return;
            }

            // Get current message
            const message = data?.message || this.getLatestMessage();
            if (!message) {
                console.log('[Sidecar AI] No message found, skipping');
                return;
            }

            // Check if message is from AI (not user)
            // Only trigger on AI responses, not user messages
            const isUserMessage = this.isUserMessage(message);
            if (isUserMessage) {
                console.log('[Sidecar AI] Message is from user, skipping auto-trigger');
                return;
            }

            console.log('[Sidecar AI] Processing auto-triggered add-ons for AI message');

            // Wait a bit to ensure AI message is fully rendered in DOM
            // This prevents loading indicators from attaching to wrong message
            await new Promise(resolve => setTimeout(resolve, 300));

            // Re-get the latest AI message to ensure we have the correct one
            const aiMessage = this.getLatestMessage();
            if (!aiMessage) {
                console.warn('[Sidecar AI] Could not find AI message after delay, skipping');
                return;
            }

            // Avoid processing the same message twice (unless swipe variant changed)
            const aiMessageId = this.resultFormatter.getMessageId(aiMessage);
            const aiSwipeId = aiMessage.swipe_id ?? 0;

            if (aiMessageId &&
                aiMessageId === this.lastProcessedMessageId &&
                aiSwipeId === this.lastProcessedSwipeId) {
                console.log(`[Sidecar AI] Message ${aiMessageId} (swipe ${aiSwipeId}) already processed, skipping`);
                return;
            }

            // Process add-ons with the confirmed AI message
            await this.processAddons(autoAddons, aiMessage);

            // Record the processed message id and swipe id
            this.lastProcessedMessageId = aiMessageId || this.lastProcessedMessageId;
            this.lastProcessedSwipeId = aiSwipeId;
        } catch (error) {
            console.error('[Sidecar AI] Error handling message:', error);
        } finally {
            this.isProcessing = false;
        }
    }

    /**
     * Check if message is from user (not AI)
     */
    isUserMessage(message) {
        // Check various ways to identify user messages
        if (typeof message === 'object') {
            // Check if it's a DOM element
            if (message.nodeType === 1) {
                const $msg = $(message);
                // SillyTavern uses 'user' class or 'mes_user' for user messages
                if ($msg.hasClass('user') || $msg.hasClass('mes_user') || $msg.find('.mes_user').length > 0) {
                    return true;
                }
                // Check if it has 'assistant' or 'mes_assistant' for AI messages
                if ($msg.hasClass('assistant') || $msg.hasClass('mes_assistant') || $msg.find('.mes_assistant').length > 0) {
                    return false;
                }
            }

            // Check message object properties
            if (message.is_user !== undefined) {
                return message.is_user === true;
            }
            if (message.role === 'user') {
                return true;
            }
            if (message.role === 'assistant' || message.name === 'assistant') {
                return false;
            }
        }

        // Default: assume it's an AI message if we can't determine
        // (better to trigger than miss)
        return false;
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
     * Retry a failed add-on execution
     */
    async retryAddon(addonId, messageId) {
        if (this.isProcessing) {
            console.warn('[Add-Ons Extension] Already processing, skipping retry');
            return;
        }

        try {
            this.isProcessing = true;
            console.log(`[Sidecar AI] Retrying add-on ${addonId} for message ${messageId}`);

            const addon = this.addonManager.getAddon(addonId);
            if (!addon) {
                console.error(`[Sidecar AI] Add-on ${addonId} not found`);
                return;
            }

            // Find message object
            let message = this.resultFormatter.findMessageObject(messageId);

            // If not found by ID (e.g. if messageId is a DOM ID), try to find the message element and map back
            if (!message) {
                // Fallback: use the latest AI message if we can't find specific one
                // This is risky but better than failing if ID mapping fails
                message = this.getLatestMessage();
                console.warn(`[Sidecar AI] Could not find message object for ${messageId}, using latest message`);
            }

            if (!message) {
                console.error(`[Sidecar AI] No message found for retry`);
                return;
            }

            // Re-process
            await this.processStandaloneAddon(addon, message);

        } catch (error) {
            console.error('[Sidecar AI] Error retrying add-on:', error);
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

        // Process all groups and standalone addons in parallel
        const promises = [
            // Process batch groups
            ...grouped.batch.map(batchGroup => this.processBatchGroup(batchGroup, message)),
            // Process standalone add-ons
            ...grouped.standalone.map(addon => this.processStandaloneAddon(addon, message))
        ];

        await Promise.all(promises);
    }

    /**
     * Process a batch group
     */
    async processBatchGroup(addons, message) {
        try {
            console.log(`[Sidecar AI] Processing batch group: ${addons.length} add-on(s)`);

            const messageId = this.resultFormatter.getMessageId(message);

            // Show loading indicators for all add-ons
            addons.forEach(addon => {
                this.resultFormatter.showLoadingIndicator(messageId, addon);
            });

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

                // Hide loading indicator
                this.resultFormatter.hideLoadingIndicator(messageId, addon);

                if (response) {
                    await this.injectResult(addon, response, message);
                }
            }
        } catch (error) {
            console.error('[Sidecar AI] Error processing batch group:', error);
            const messageId = this.resultFormatter.getMessageId(message);

            // Create retry callback for batch
            const retryCallback = async () => {
                await this.processBatchGroup(addons, message);
            };

            addons.forEach(addon => {
                this.resultFormatter.hideLoadingIndicator(messageId, addon);
                this.resultFormatter.showErrorIndicator(messageId, addon, error, retryCallback);
            });
        }
    }

    /**
     * Process standalone add-on
     */
    async processStandaloneAddon(addon, message) {
        try {
            console.log(`[Sidecar AI] Processing standalone add-on: ${addon.name}`);

            // Show loading indicator BEFORE processing
            const messageId = this.resultFormatter.getMessageId(message);
            this.resultFormatter.showLoadingIndicator(messageId, addon);

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

            // Hide loading and inject result
            this.resultFormatter.hideLoadingIndicator(messageId, addon);

            if (response) {
                await this.injectResult(addon, response, message);
            }
        } catch (error) {
            console.error(`[Sidecar AI] Error processing add-on ${addon.name}:`, error);
            const messageId = this.resultFormatter.getMessageId(message);
            this.resultFormatter.hideLoadingIndicator(messageId, addon);

            // Create retry callback
            const retryCallback = async () => {
                // Re-process the add-on
                await this.processStandaloneAddon(addon, message);
            };

            this.resultFormatter.showErrorIndicator(messageId, addon, error, retryCallback);
        }
    }

    /**
     * Inject result based on response location setting
     */
    async injectResult(addon, response, message) {
        console.log(`[Sidecar AI] Injecting result for ${addon.name}, location: ${addon.responseLocation}`);
        const messageId = this.resultFormatter.getMessageId(message);

        if (addon.responseLocation === 'chatHistory') {
            console.log(`[Sidecar AI] Injecting into chat history for message: ${messageId}`);
            const formatted = this.resultFormatter.formatResult(addon, response, message, false);
            this.resultFormatter.injectIntoChatHistory(messageId, addon, formatted, message);
        } else {
            // For outsideChatlog, inject inside chat after the message (with dropdown UI)
            // Don't wrap in extra structure - we already have details element
            console.log(`[Sidecar AI] Injecting into dropdown inside chat for: ${addon.name}`);
            const formatted = this.resultFormatter.formatResult(addon, response, message, true);
            const success = this.resultFormatter.injectIntoDropdown(addon, formatted, messageId);
            if (!success) {
                console.error(`[Sidecar AI] Failed to inject result into dropdown for: ${addon.name}`);
            }
        }

        // Save metadata for history retrieval (and persistence)
        this.resultFormatter.saveResultToMetadata(message, addon, response);

        // Trigger debounced save to ensure metadata persists
        this.debouncedSaveChat();
    }

    /**
     * Get latest message from chat (specifically AI message)
     */
    getLatestMessage() {
        const chatLog = this.contextBuilder.getChatLog();
        if (chatLog && chatLog.length > 0) {
            // Find the most recent AI message (not user message)
            for (let i = chatLog.length - 1; i >= 0; i--) {
                const msg = chatLog[i];
                if (msg && !msg.is_user) {
                    return msg;
                }
            }
        }
        return null;
    }

    /**
     * Debounced save chat function to prevent excessive save calls
     * Waits 500ms after last call before actually saving
     * Includes error recovery and retry logic
     */
    debouncedSaveChat() {
        if (this.saveChatTimeout) {
            clearTimeout(this.saveChatTimeout);
        }

        this.saveChatTimeout = setTimeout(() => {
            let saveSuccessful = false;

            // Primary: Try saveChat
            if (this.context.saveChat) {
                try {
                    this.context.saveChat();
                    console.log('[Sidecar AI] Chat saved (debounced)');
                    saveSuccessful = true;
                } catch (error) {
                    console.error('[Sidecar AI] Error saving chat:', error);
                    // Continue to fallback
                }
            }

            // Fallback 1: Try saveSettingsDebounced
            if (!saveSuccessful && this.context.saveSettingsDebounced) {
                try {
                    this.context.saveSettingsDebounced();
                    console.log('[Sidecar AI] Settings saved as fallback for chat persistence');
                    saveSuccessful = true;
                } catch (error) {
                    console.error('[Sidecar AI] Error saving settings as fallback:', error);
                }
            }

            // Fallback 2: Try direct saveSettings if available
            if (!saveSuccessful && this.context.saveSettings) {
                try {
                    this.context.saveSettings();
                    console.log('[Sidecar AI] Settings saved directly as last resort');
                    saveSuccessful = true;
                } catch (error) {
                    console.error('[Sidecar AI] Error saving settings directly:', error);
                }
            }

            // Log warning if all save methods failed
            if (!saveSuccessful) {
                console.warn('[Sidecar AI] All save methods failed - metadata may not persist');
                console.warn('[Sidecar AI] Available context methods:', {
                    hasSaveChat: !!this.context.saveChat,
                    hasSaveSettingsDebounced: !!this.context.saveSettingsDebounced,
                    hasSaveSettings: !!this.context.saveSettings
                });
            }

            this.saveChatTimeout = null;
        }, 500);
    }
}
