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
        // Reliability: if multiple ST events fire rapidly, don't drop them.
        // We coalesce to "latest event wins" and run it after current processing ends.
        this._pendingMessageEvent = null;
        // Performance: Debounce save operations
        this.saveChatTimeout = null;
        // Prevent double-processing the same message id
        this.lastProcessedMessageId = null;
        this.lastProcessedSwipeId = null;
        // Regeneration can reuse the same message index + swipe_id (often 0).
        // Track a per-variant fingerprint to avoid skipping regenerated content.
        this.lastProcessedVariantFingerprint = null;
        this.queuedTriggers = new Set(); // Set of addon IDs queued to run
        // Performance: Store fallback observer for cleanup
        this.fallbackObserver = null;
    }

    /**
     * Resolve SillyTavern event payloads to a chat index + message object.
     * In SillyTavern, MESSAGE_SENT / MESSAGE_RECEIVED / MESSAGE_SWIPED payload is the chat index (mesid).
     */
    resolveMessageRefFromEvent(data) {
        const chatLog = this.contextBuilder.getChatLog();
        const ref = { chatIndex: null, message: null };

        // Canonical: numeric chat index
        if (typeof data === 'number' && Number.isInteger(data)) {
            ref.chatIndex = data;
            ref.message = Array.isArray(chatLog) ? (chatLog[data] || null) : null;
            return ref;
        }

        // Some emitters may pass the DOM element, or an object containing it.
        const maybeElement = data?.message && data.message.nodeType === 1 ? data.message : (data?.nodeType === 1 ? data : null);
        if (maybeElement) {
            const mesidAttr = maybeElement.getAttribute?.('mesid');
            const idx = mesidAttr !== null && mesidAttr !== undefined && mesidAttr !== '' && !Number.isNaN(Number(mesidAttr))
                ? Number(mesidAttr)
                : null;
            if (idx !== null && Number.isInteger(idx)) {
                ref.chatIndex = idx;
                ref.message = Array.isArray(chatLog) ? (chatLog[idx] || null) : null;
                return ref;
            }
            // If we can't map it, still return the element as message for user/ai detection.
            ref.message = maybeElement;
            return ref;
        }

        // Fallback: try to use provided message object
        if (data?.message && typeof data.message === 'object') {
            ref.message = data.message;
            if (Array.isArray(chatLog)) {
                const idx = chatLog.indexOf(data.message);
                if (idx >= 0) ref.chatIndex = idx;
            }
            return ref;
        }

        // Unknown payload; let caller fall back.
        return ref;
    }

    /**
     * Register event listeners
     */
    registerListeners() {
        try {
            const eventSource = this.context?.eventSource;
            const event_types = this.context?.event_types || this.context?.eventTypes;

            if (eventSource && event_types) {
                // Listen for new messages - try multiple event types.
                // IMPORTANT: We only PROCESS sidecars when an AI response is complete.
                // Do NOT use swipe events to trigger processing; swipe can happen before the new message is finalized.
                const messageEvents = [
                    event_types.MESSAGE_RECEIVED,
                    event_types.MESSAGE_SENT,
                    event_types.CHAT_MESSAGE_RECEIVED,
                    event_types.CHAT_MESSAGE_SENT,
                    'MESSAGE_RECEIVED',
                    'MESSAGE_SENT',
                ].filter(Boolean); // Remove undefined values

                messageEvents.forEach(eventType => {
                    if (eventType) {
                        eventSource.on(eventType, (data) => {
                            try {
                                // For MESSAGE_SENT, wait a bit to ensure message is in chat array
                                if (eventType === event_types.MESSAGE_SENT || eventType === 'MESSAGE_SENT') {
                                    setTimeout(() => {
                                        this.handleMessageReceived(data);
                                    }, 150);
                                } else {
                                    this.handleMessageReceived(data);
                                }
                            } catch (error) {
                                console.error(`[Sidecar AI] Error in ${eventType} handler:`, error);
                            }
                        });
                    }
                });

                // Swipe events: ONLY update UI for the active variant; do NOT trigger new sidecar processing.
                const swipeEvents = [
                    event_types.MESSAGE_SWIPED,
                    event_types.CHAT_MESSAGE_SWIPED,
                    'MESSAGE_SWIPED',
                    'message_swiped',
                ].filter(Boolean);

                swipeEvents.forEach(eventType => {
                    if (!eventType) return;
                    eventSource.on(eventType, (data) => {
                        try {
                            // data is expected to be mesid/chat index
                            const idx = (typeof data === 'number' && Number.isInteger(data))
                                ? data
                                : (typeof data === 'string' && data.trim() !== '' && !Number.isNaN(Number(data)) ? Number(data) : null);
                            if (idx === null) return;
                            // IMPORTANT: SillyTavern may emit message_swiped after the swipe animation completes,
                            // including after a newly generated swipe variant is rendered. We must not "hide all"
                            // here or we can make freshly injected cards disappear ("puff").
                            //
                            // Use the variant-change handler: it clears only this message's container and restores
                            // stored sidecars for the currently active swipe_id (no AI calls).
                            this.resultFormatter?.handleSwipeVariantChange?.(idx, this.addonManager);
                        } catch (e) {
                            // Best-effort UI restoration
                        }
                    });
                });

                // Reliability fallback: some ST builds/extensions may not emit message_* events consistently.
                // GENERATION_ENDED is emitted after the AI response is finalized.
                // GENERATION_STARTED: clear sidecar UI for the message being generated so old cards don't linger.
                // IMPORTANT: Do NOT hide containers globally (or even per-message via display:none) here —
                // hidden containers can remain hidden and make historical sidecars "disappear".
                const generationStartedEvent = event_types.GENERATION_STARTED || 'generation_started';
                if (generationStartedEvent) {
                    eventSource.on(generationStartedEvent, () => {
                        try {
                            const chatLog = this.contextBuilder.getChatLog();
                            if (!Array.isArray(chatLog) || chatLog.length === 0) return;
                            const idx = chatLog.length - 1;
                            const messageElement = this.resultFormatter?.findMessageElement?.(idx) || null;
                            const sidecarContainer = messageElement?.querySelector?.('.sidecar-container') || null;
                            if (sidecarContainer) {
                                // Remove stale cards/loading UI from the previous variant while generation runs.
                                // Keep the container visible so we can show loading states immediately.
                                sidecarContainer.innerHTML = '';
                                sidecarContainer.style.display = '';
                            }
                        } catch (e) {
                            // Best-effort UI cleanup
                        }
                    });
                }

                const generationEndedEvent = event_types.GENERATION_ENDED || 'generation_ended';
                if (generationEndedEvent) {
                    eventSource.on(generationEndedEvent, () => {
                        try {
                            const chatLog = this.contextBuilder.getChatLog();
                            if (Array.isArray(chatLog) && chatLog.length > 0) {
                                // Run against latest message index (mesid)
                                // Delay slightly so ST has time to finalize swipe_info / DOM render
                                setTimeout(() => {
                                    this.handleMessageReceived(chatLog.length - 1);
                                }, 150);
                            }
                        } catch (e) {
                            console.error(`[Sidecar AI] Error in ${generationEndedEvent} fallback:`, e);
                        }
                    });
                }

                console.log('[Sidecar AI] Event listeners registered for', messageEvents.length, 'event type(s)');

                // Disconnect fallback observer if primary event system is now available
                if (this.fallbackObserver) {
                    this.disconnectFallbackObserver();
                }
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
        // Only create if we don't already have one
        if (this.fallbackObserver) {
            return;
        }

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

            // Store observer reference for cleanup
            this.fallbackObserver = observer;

            // Initialize message count
            const messages = chatContainer.querySelectorAll('.mes, .message');
            lastMessageCount = messages.length;

            console.log('[Sidecar AI] Fallback listeners (MutationObserver) setup, initial message count:', lastMessageCount);
        } else {
            console.warn('[Sidecar AI] Chat container not found for fallback listeners');
        }
    }

    /**
     * Disconnect fallback observer to prevent memory leaks
     */
    disconnectFallbackObserver() {
        if (this.fallbackObserver) {
            this.fallbackObserver.disconnect();
            this.fallbackObserver = null;
            console.log('[Sidecar AI] Fallback MutationObserver disconnected');
        }
    }

    /**
     * Cleanup all resources (observers, timeouts, etc.)
     */
    cleanup() {
        // Disconnect fallback observer
        this.disconnectFallbackObserver();

        // Clear save timeout
        if (this.saveChatTimeout) {
            clearTimeout(this.saveChatTimeout);
            this.saveChatTimeout = null;
        }

        // Clear queued triggers
        this.queuedTriggers.clear();

        console.log('[Sidecar AI] EventHandler cleanup complete');
    }

    /**
     * Handle message received event
     */
    async handleMessageReceived(data) {
        if (this.isProcessing) {
            // Reliability: don't drop the event; coalesce and run after current finishes.
            this._pendingMessageEvent = data;
            console.log('[Sidecar AI] Already processing, queued latest event');
            return;
        }

        try {
            this.isProcessing = true;
            console.log('[Sidecar AI] Message received event fired', data);

            const chatLog = this.contextBuilder.getChatLog();
            const { chatIndex, message: resolvedMessage } = this.resolveMessageRefFromEvent(data);

            // Get current message (prefer SillyTavern chat index resolution)
            let message = resolvedMessage || data?.message;

            // If message still not found, get the absolute latest message from log
            if (!message) {
                message = this.getLastMessageFromLog();
            }

            // Fallback to AI-specific search if still nothing (unlikely but safe)
            if (!message) {
                message = this.getLatestMessage();
            }

            if (!message) {
                console.log('[Sidecar AI] No message found, skipping');
                return;
            }

            // Check if message is from user
            const isUserMessage = this.isUserMessage(message);
            // (Intentionally low-noise) Message type is determined by ST properties/classes.

            if (isUserMessage) {
                // USER MESSAGE: Check for triggers
                // Performance: Single-pass categorization (reuse logic if we already categorized)
                const enabledAddons = this.addonManager.getEnabledAddons();
                const triggerAddons = enabledAddons.filter(addon => addon.triggerMode === 'trigger');

                console.log(`[Sidecar AI] Found ${triggerAddons.length} trigger mode sidecar(s)`);

                if (triggerAddons.length > 0) {
                    const messageText = this.getUserMessageText(message);
                    let queuedCount = 0;
                    triggerAddons.forEach(addon => {
                        if (this.checkTriggerMatch(messageText, addon.triggerConfig)) {
                            this.queuedTriggers.add(addon.id);
                            queuedCount++;
                        }
                    });

                    if (queuedCount > 0) {
                        console.log(`[Sidecar AI] Queued ${queuedCount} sidecar(s) for next AI response`);
                    }
                }
                return; // Done with user message
            }

            // AI MESSAGE: Process auto add-ons AND queued triggers
            console.log('[Sidecar AI] Processing add-ons for AI message');

            // Performance: Single-pass categorization instead of multiple filters
            const enabledAddons = this.addonManager.getEnabledAddons();
            const categorized = {
                auto: [],
                trigger: [],
                manual: []
            };

            // Single pass to categorize all enabled addons
            enabledAddons.forEach(addon => {
                const mode = addon.triggerMode || 'auto';
                if (categorized[mode]) {
                    categorized[mode].push(addon);
                } else {
                    categorized.auto.push(addon); // Default fallback
                }
            });

            // FALLBACK: Check if previous message was a user message and process triggers
            // This handles cases where MESSAGE_SENT event wasn't caught
            if (chatLog && chatLog.length >= 2) {
                const previousMessage = chatLog[chatLog.length - 2]; // Second-to-last message
                if (previousMessage && this.isUserMessage(previousMessage)) {
                    console.log('[Sidecar AI] Fallback: Detected user message before AI response, checking triggers');

                    if (categorized.trigger.length > 0) {
                        const messageText = this.getUserMessageText(previousMessage);
                        console.log('[Sidecar AI] Fallback: Checking triggers for user message:', messageText.substring(0, 50) + '...');

                        categorized.trigger.forEach(addon => {
                            console.log(`[Sidecar AI] Fallback: Checking addon ${addon.name} triggers:`, addon.triggerConfig);
                            if (this.checkTriggerMatch(messageText, addon.triggerConfig)) {
                                console.log(`[Sidecar AI] Fallback: Trigger matched for addon: ${addon.name}`);
                                this.queuedTriggers.add(addon.id);
                            } else {
                                console.log(`[Sidecar AI] Fallback: No match for addon: ${addon.name}`);
                            }
                        });
                    }
                }
            }

            // 1. Get auto-triggered add-ons (already categorized)
            const autoAddons = categorized.auto;

            // 2. Get queued trigger add-ons
            const queuedAddons = [];
            const queuedIdsToClear = [];
            if (this.queuedTriggers.size > 0) {
                console.log(`[Sidecar AI] Found ${this.queuedTriggers.size} queued trigger(s)`);
                // Use a Set for O(1) lookup when checking enabled addons
                const enabledAddonIds = new Set(enabledAddons.map(a => a.id));
                this.queuedTriggers.forEach(id => {
                    if (enabledAddonIds.has(id)) {
                        const addon = this.addonManager.getAddon(id);
                        if (addon && addon.enabled) {
                            queuedAddons.push(addon);
                            queuedIdsToClear.push(id);
                        }
                    }
                });
                // Reliability: do NOT clear the queue yet.
                // If we fail before we actually process add-ons (or we skip due to dedupe),
                // we want triggers to still fire on the next AI message.
            }

            // Combine lists
            const allAddonsToRun = [...autoAddons, ...queuedAddons];

            // Remove duplicates using Set (more efficient than Array.from + find)
            const seenIds = new Set();
            const uniqueAddons = allAddonsToRun.filter(addon => {
                if (seenIds.has(addon.id)) {
                    return false;
                }
                seenIds.add(addon.id);
                return true;
            });

            console.log(`[Sidecar AI] Running ${uniqueAddons.length} sidecar(s) (${autoAddons.length} auto, ${queuedAddons.length} triggered)`);

            if (uniqueAddons.length === 0) {
                console.log('[Sidecar AI] No sidecars to run');
                return;
            }

            // Wait a bit to ensure AI message is fully rendered in DOM
            await new Promise(resolve => setTimeout(resolve, 300));

            // Canonical message id for Sidecar pipeline MUST be SillyTavern chat index (mesid).
            // This is what MESSAGE_* events use, what DOM nodes use (`mesid` attr), and what swipe events pass.
            // Never treat 0 as falsy; it is a valid message id.
            let aiMessageId = (chatIndex !== null && chatIndex !== undefined) ? chatIndex : null;
            if (aiMessageId === null) {
                // Try to map by reference into chat log (best-effort; may be -1 if different object instance)
                // Prefer resolved message (event payload) for mapping, not the stale aiMessage reference.
                const refMsg = resolvedMessage && typeof resolvedMessage === 'object' ? resolvedMessage : message;
                if (Array.isArray(chatLog) && refMsg && typeof refMsg === 'object') {
                    const idx = chatLog.indexOf(refMsg);
                    if (idx >= 0) aiMessageId = idx;
                }
            }
            if (aiMessageId === null) {
                // Last resort: map from DOM attribute of the latest AI message element
                const el = this.resultFormatter.findMessageElement?.(chatLog?.length - 1) || this.resultFormatter.findAIMessageElement?.();
                const mesidAttr = el?.getAttribute?.('mesid');
                if (mesidAttr !== null && mesidAttr !== undefined && mesidAttr !== '' && !Number.isNaN(Number(mesidAttr))) {
                    aiMessageId = Number(mesidAttr);
                }
            }

            // IMPORTANT: Always re-read the canonical message object from chatLog by mesid.
            // This avoids 50/50 races where the event gives us a stale object reference (old swipe_id)
            // while the actual chatLog entry already has a new swipe variant.
            let canonicalAiMessage = null;
            if (aiMessageId !== null && Array.isArray(chatLog) && aiMessageId >= 0 && aiMessageId < chatLog.length) {
                canonicalAiMessage = chatLog[aiMessageId] || null;
            }
            if (!canonicalAiMessage) {
                // Fallback to latest AI message (should be rare; but better than skipping).
                canonicalAiMessage = this.getLatestMessage();
            }
            if (!canonicalAiMessage) {
                console.warn('[Sidecar AI] Could not resolve canonical AI message after delay, skipping');
                return;
            }

            // Never run sidecars on the very first message (index 0).
            // This avoids firing on initial greeting / chat load behaviors.
            if (aiMessageId === 0) {
                console.log('[Sidecar AI] Skipping sidecar processing for first message (index 0)');
                return;
            }

            const aiSwipeId = canonicalAiMessage.swipe_id ?? 0;
            // Fingerprint: prefer gen_finished (regenerate updates this), then send_date, then a fallback.
            // This helps ensure regeneration triggers even if messageId+swipeId stays the same.
            const variantFingerprint = [
                aiMessageId,
                aiSwipeId,
                canonicalAiMessage.gen_finished ?? canonicalAiMessage.send_date ?? canonicalAiMessage?.extra?.gen_id ?? ''
            ].join(':');

            if (aiMessageId !== null &&
                aiMessageId === this.lastProcessedMessageId &&
                aiSwipeId === this.lastProcessedSwipeId &&
                variantFingerprint === this.lastProcessedVariantFingerprint) {
                console.log(`[Sidecar AI] Message ${aiMessageId} (swipe ${aiSwipeId}) already processed, skipping`);
                return;
            }

            // Process add-ons with the confirmed AI message.
            // IMPORTANT: downstream should treat messageId as the chat index (mesid).
            await this.processAddons(uniqueAddons, canonicalAiMessage, aiMessageId);

            // Now that processing completed successfully, clear any queued trigger ids we consumed.
            if (queuedIdsToClear.length > 0) {
                queuedIdsToClear.forEach(id => this.queuedTriggers.delete(id));
            }

            // Record the processed message id and swipe id
            if (aiMessageId !== null) {
                this.lastProcessedMessageId = aiMessageId;
            }
            this.lastProcessedSwipeId = aiSwipeId;
            this.lastProcessedVariantFingerprint = variantFingerprint;
        } catch (error) {
            console.error('[Sidecar AI] Error handling message:', error);
        } finally {
            this.isProcessing = false;
            // If an event came in while we were processing, run it now (async, to unwind stack).
            if (this._pendingMessageEvent !== null) {
                const pending = this._pendingMessageEvent;
                this._pendingMessageEvent = null;
                setTimeout(() => {
                    this.handleMessageReceived(pending);
                }, 0);
            }
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
     * Clean regex pattern by removing invalid inline flags
     * JavaScript doesn't support inline flags like (?i), (?m), (?s)
     * These are handled via RegExp constructor flags instead
     */
    cleanRegexPattern(pattern) {
        // Remove common invalid inline flags: (?i), (?m), (?s), (?x), (?u)
        // Also handle negated flags: (?-i), (?-m), etc.
        return pattern
            .replace(/\(\?[imsux-]+\)/gi, '') // Remove inline flags
            .trim();
    }

    /**
     * Check if message matches trigger config
     */
    checkTriggerMatch(text, config) {
        if (!text || !config || !config.triggers || config.triggers.length === 0) {
            return false;
        }

        const type = config.triggerType || 'keyword';

        if (type === 'regex') {
            for (const pattern of config.triggers) {
                try {
                    // Clean pattern to remove invalid inline flags
                    const cleanedPattern = this.cleanRegexPattern(pattern);
                    const regex = new RegExp(cleanedPattern, 'i'); // Case-insensitive by default
                    if (regex.test(text)) {
                        return true;
                    }
                } catch (e) {
                    console.error(`[Sidecar AI] Invalid regex pattern: ${pattern}`, e);
                    console.error(`[Sidecar AI] Hint: JavaScript regex doesn't support inline flags like (?i). Use the pattern without flags - case-insensitive matching is automatic.`);
                }
            }
        } else {
            // Keyword match (case-insensitive substring)
            const lowerText = text.toLowerCase();
            for (const keyword of config.triggers) {
                if (lowerText.includes(keyword.toLowerCase())) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Extract text from user message
     */
    getUserMessageText(message) {
        if (!message) return '';

        // Handle string
        if (typeof message === 'string') return message;

        // Handle jQuery object
        if (message.jquery || (window.jQuery && message instanceof window.jQuery)) {
            const $msg = message;
            // Try to find message content in .mes_text
            const content = $msg.find('.mes_text').text();
            if (content) return content;
            return $msg.text();
        }

        // Handle DOM element
        if (message.nodeType === 1) { // Element
            const $msg = $(message);
            // Try to find message content
            // SillyTavern usually puts content in .mes_text
            const content = $msg.find('.mes_text').text();
            if (content) return content;
            return $msg.text();
        }

        // Handle message object
        if (typeof message === 'object') {
            return message.mes || message.content || message.text || '';
        }

        return '';
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

            const chatLog = this.contextBuilder.getChatLog();
            const message = this.getLatestMessage();
            const messageId = Array.isArray(chatLog) ? chatLog.indexOf(message) : null;
            await this.processAddons(addonsToProcess, message, messageId >= 0 ? messageId : null);
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

            // In SillyTavern, messageId is expected to be the chat index (mesid).
            // Resolve deterministically; avoid retrying against a random latest message.
            const chatLog = this.contextBuilder.getChatLog();
            let message = null;

            const numericId = (typeof messageId === 'number')
                ? messageId
                : (typeof messageId === 'string' && messageId.trim() !== '' && !Number.isNaN(Number(messageId)) ? Number(messageId) : null);

            if (numericId !== null && Array.isArray(chatLog) && numericId >= 0 && numericId < chatLog.length) {
                message = chatLog[numericId] || null;
            } else {
                message = this.resultFormatter.findMessageObject(messageId);
            }

            if (!message) {
                console.error(`[Sidecar AI] No message found for retry (messageId: ${messageId})`);
                return;
            }

            // Re-process
            await this.processStandaloneAddon(addon, message, numericId);

        } catch (error) {
            console.error('[Sidecar AI] Error retrying add-on:', error);
        } finally {
            this.isProcessing = false;
        }
    }

    /**
     * Process add-ons
     */
    async processAddons(addons, message, messageId = null) {
        if (!addons || addons.length === 0) {
            return;
        }

        // Performance: Start request cycle to cache context lookups
        this.contextBuilder.startRequestCycle();

        try {
            // Group add-ons by request mode
            const grouped = this.addonManager.getGroupedAddons(addons);

            // Process all groups and standalone addons in parallel
            const promises = [
                // Process batch groups
                ...grouped.batch.map(batchGroup => this.processBatchGroup(batchGroup, message, messageId)),
                // Process standalone add-ons
                ...grouped.standalone.map(addon => this.processStandaloneAddon(addon, message, messageId))
            ];

            await Promise.all(promises);
        } finally {
            // Performance: Clear request cycle cache after processing completes
            this.contextBuilder.clearRequestCycle();
        }
    }

    /**
     * Process a batch group
     */
    async processBatchGroup(addons, message, messageId = null) {
        try {
            console.log(`[Sidecar AI] Processing batch group: ${addons.length} add-on(s)`);

            const canonicalMessageId = messageId !== null && messageId !== undefined ? messageId : this.resultFormatter.getMessageId(message);

            // Show loading indicators for all add-ons
            addons.forEach(addon => {
                this.resultFormatter.showLoadingIndicator(canonicalMessageId, addon);
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
            const responses = await this.aiClient.sendBatchToAI(addons, prompts, canonicalMessageId);

            // Process each response
            for (let i = 0; i < addons.length; i++) {
                const addon = addons[i];
                const response = responses[i] || '';

                // Hide loading indicator
                this.resultFormatter.hideLoadingIndicator(canonicalMessageId, addon);

                if (response) {
                    await this.injectResult(addon, response, message, canonicalMessageId);
                }
            }
        } catch (error) {
            console.error('[Sidecar AI] Error processing batch group:', error);
            const canonicalMessageId = messageId !== null && messageId !== undefined ? messageId : this.resultFormatter.getMessageId(message);

            addons.forEach(addon => {
                this.resultFormatter.hideLoadingIndicator(canonicalMessageId, addon);
                this.resultFormatter.showErrorIndicator(canonicalMessageId, addon, error);
            });
        }
    }

    /**
     * Process standalone add-on
     */
    async processStandaloneAddon(addon, message, messageId = null) {
        try {
            console.log(`[Sidecar AI] Processing standalone add-on: ${addon.name}`);

            // Show loading indicator BEFORE processing
            const canonicalMessageId = messageId !== null && messageId !== undefined ? messageId : this.resultFormatter.getMessageId(message);
            this.resultFormatter.showLoadingIndicator(canonicalMessageId, addon);

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
            const response = await this.aiClient.sendToAI(addon, prompt, 0, canonicalMessageId);

            // Hide loading and inject result
            this.resultFormatter.hideLoadingIndicator(canonicalMessageId, addon);

            if (response) {
                await this.injectResult(addon, response, message, canonicalMessageId);
            }
        } catch (error) {
            console.error(`[Sidecar AI] Error processing add-on ${addon.name}:`, error);
            const canonicalMessageId = messageId !== null && messageId !== undefined ? messageId : this.resultFormatter.getMessageId(message);
            this.resultFormatter.hideLoadingIndicator(canonicalMessageId, addon);
            this.resultFormatter.showErrorIndicator(canonicalMessageId, addon, error);
        }
    }

    /**
     * Inject result based on response location setting
     */
    async injectResult(addon, response, message, messageId = null) {
        console.log(`[Sidecar AI] Injecting result for ${addon.name}, location: ${addon.responseLocation}`);
        const canonicalMessageId = messageId !== null && messageId !== undefined ? messageId : this.resultFormatter.getMessageId(message);

        if (addon.responseLocation === 'chatHistory') {
            console.log(`[Sidecar AI] Injecting into chat history for message: ${canonicalMessageId}`);
            const formatted = this.resultFormatter.formatResult(addon, response, message, false);
            this.resultFormatter.injectIntoChatHistory(canonicalMessageId, addon, formatted, message);
        } else {
            // For outsideChatlog, inject inside chat after the message (with dropdown UI)
            // Don't wrap in extra structure - we already have details element
            console.log(`[Sidecar AI] Injecting into dropdown inside chat for: ${addon.name}`);
            const formatted = this.resultFormatter.formatResult(addon, response, message, true);
            const success = this.resultFormatter.injectIntoDropdown(addon, formatted, canonicalMessageId);
            if (!success) {
                console.error(`[Sidecar AI] Failed to inject result into dropdown for: ${addon.name}`);
            }
        }

        // Save metadata for history retrieval (and persistence)
        this.resultFormatter.saveResultToMetadata(message, addon, response);

        // Inline projection (optional): keep message.mes in sync for main AI context visibility.
        // This is idempotent; if no inline-enabled sidecars exist it will strip/avoid inline region.
        this.resultFormatter.applyInlineSidecarResultsToMessage(message);

        // Trigger debounced save to ensure metadata persists
        this.debouncedSaveChat();
    }

    /**
     * Get the absolute latest message from chat log (User or AI)
     */
    getLastMessageFromLog() {
        const chatLog = this.contextBuilder.getChatLog();
        if (chatLog && chatLog.length > 0) {
            return chatLog[chatLog.length - 1];
        }
        return null;
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
