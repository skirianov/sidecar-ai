/**
 * Context Builder
 * Gathers chat context (messages, cards) and formats prompts
 */

export class ContextBuilder {
    constructor(context) {
        this.context = context;
    }

    /**
     * Build context for an add-on
     */
    buildContext(addon, chatLog, charData, userData, worldData) {
        const settings = addon.contextSettings || {};

        // Gather last N messages
        const lastMessages = this.getLastMessages(chatLog, settings.messagesCount || 10);

        // Gather add-on history if enabled
        let addonHistory = '';
        if (settings.includeHistory) {
            addonHistory = this.getAddonHistory(chatLog, addon.id, settings.historyDepth || 5);
        }

        // Build context object
        const context = {
            lastMessages: this.formatMessages(lastMessages),
            addonHistory: addonHistory,
            charCard: settings.includeCharCard ? this.formatCharCard(charData) : '',
            userCard: settings.includeUserCard ? this.formatUserCard(userData) : '',
            worldCard: settings.includeWorldCard ? this.formatWorldCard(worldData) : '',
            currentMessage: this.getCurrentMessage(chatLog)
        };

        return context;
    }

    /**
     * Build prompt with automatic context inclusion
     * Context sections are automatically included based on checkboxes
     * User's prompt is just the instruction, no variables needed
     */
    buildPrompt(addon, context) {
        const settings = addon.contextSettings || {};
        const userPrompt = addon.prompt || '';
        const parts = [];

        // CRITICAL: OOC instruction at the very beginning
        parts.push('[OOC: CRITICAL INSTRUCTION - READ THIS FIRST]');
        parts.push('You are a task executor. Your ONLY job is to follow the instruction block below.');
        parts.push('DO NOT continue the story or roleplay.');
        parts.push('DO NOT generate character dialogue or narrative continuation.');
        parts.push('IGNORE the chat history for story purposes - it is provided ONLY for context reference.');
        parts.push('ONLY execute what the instruction block explicitly asks you to do.');
        parts.push('If the instruction asks you to add something to the response, add ONLY that - do not write new story content.');
        parts.push('Any styling you will apply will be in the context of the chat - NEVER apply any styling that will affect global styles.');
        parts.push('');
        parts.push('OUTPUT FORMATTING:');

        // Add format-specific instructions based on addon.formatStyle
        const formatStyle = addon.formatStyle || 'markdown';

        if (formatStyle === 'html-css') {
            parts.push('FORMAT AS HTML + CSS:');
            parts.push('- Output valid HTML with inline CSS styles.');
            parts.push('- Use safe, theme-compatible styles that inherit from the chat theme.');
            parts.push('- Use CSS variables like var(--SmartThemeEmColor) and var(--SmartThemeBorderColor) for colors.');
            parts.push('- For comment sections: Use divs with class="sidecar-comment", style with rgba() backgrounds and theme colors.');
            parts.push('- For structured content: Use divs with class="sidecar-content-card" for cards.');
            parts.push('- ALWAYS use "color: inherit !important" and "font-family: inherit !important" to respect theme.');
            parts.push('- NEVER use fixed colors or styles that override the theme.');
            parts.push('- Example structure: <div class="sidecar-comment-section"><div class="sidecar-comment">...</div></div>');
            parts.push('');
        } else if (formatStyle === 'xml') {
            parts.push('FORMAT AS XML:');
            parts.push('- Output well-formed XML with proper structure.');
            parts.push('- Use meaningful tag names that describe the content.');
            parts.push('- Include attributes where appropriate.');
            parts.push('- Indent nested elements properly.');
            parts.push('- Example: <response><item id="1">Content</item></response>');
            parts.push('');
        } else if (formatStyle === 'beautify') {
            parts.push('FORMAT WITH DECORATIVE STYLING:');
            parts.push('- Use creative formatting with visual elements.');
            parts.push('- Apply decorative styles like cards, quotes, lists with custom bullets.');
            parts.push('- Use emojis and symbols sparingly for visual interest.');
            parts.push('- Structure content with clear visual hierarchy.');
            parts.push('- Make it visually appealing while maintaining readability.');
            parts.push('');
        } else {
            // Default Markdown
            parts.push('- ALWAYS use clean, standard Markdown formatting unless explicitly requested otherwise.');
            parts.push('- Use ## or ### for headings (NOT # which renders too large).');
            parts.push('- Use **bold** and *italic* for emphasis.');
            parts.push('- Use - or * for unordered lists, with proper spacing (blank line before/after lists).');
            parts.push('- Use blank lines between paragraphs for readability.');
            parts.push('- Keep paragraphs short and well-spaced.');
            parts.push('- NEVER mix Markdown and HTML - choose one format consistently.');
            parts.push('');
        }
        parts.push('=== END OOC INSTRUCTION ===');
        parts.push('');

        // Always include chat history (controlled by messagesCount)
        // But make it clear this is for REFERENCE ONLY, not continuation
        if (context.lastMessages && context.lastMessages !== 'No previous messages.') {
            parts.push('=== Chat History (REFERENCE ONLY - DO NOT CONTINUE) ===');
            parts.push(context.lastMessages);
            parts.push('');
        }

        // Include add-on history if available
        if (context.addonHistory) {
            parts.push('=== Previous Output History (This Add-on) ===');
            parts.push(context.addonHistory);
            parts.push('');
        }

        // Include character card if enabled
        if (settings.includeCharCard && context.charCard) {
            parts.push('=== Character Card (REFERENCE ONLY) ===');
            parts.push(context.charCard);
            parts.push('');
        }

        // Include user card if enabled
        if (settings.includeUserCard && context.userCard) {
            parts.push('=== User Card (REFERENCE ONLY) ===');
            parts.push(context.userCard);
            parts.push('');
        }

        // Include world card if enabled
        if (settings.includeWorldCard && context.worldCard) {
            parts.push('=== World Card (REFERENCE ONLY) ===');
            parts.push(context.worldCard);
            parts.push('');
        }

        // User's instruction (the actual prompt) - THIS IS WHAT TO FOLLOW
        if (userPrompt.trim()) {
            parts.push('');
            parts.push('═══════════════════════════════════════════════════════════');
            parts.push('=== INSTRUCTION BLOCK - FOLLOW THIS STRICTLY ===');
            parts.push('═══════════════════════════════════════════════════════════');
            parts.push(userPrompt);
            parts.push('═══════════════════════════════════════════════════════════');
            parts.push('');
            parts.push('[OOC: Remember - ONLY execute the instruction above. Do NOT continue the story.]');
        }

        return parts.join('\n').trim();
    }

    /**
     * Build combined prompt for batch requests
     */
    buildBatchPrompt(addons, contexts) {
        const prompts = addons.map((addon, index) => {
            const context = contexts[index];
            const prompt = this.buildPrompt(addon, context);
            return `=== ${addon.name} ===\n${prompt}`;
        });

        return prompts.join('\n\n---\n\n');
    }

    /**
     * Get add-on history from chat log metadata
     * Includes error recovery for corrupted or invalid data
     */
    getAddonHistory(chatLog, addonId, count) {
        if (!chatLog || !Array.isArray(chatLog) || !addonId) {
            return '';
        }

        const history = [];
        const pattern = new RegExp(`<!-- sidecar-storage:${addonId}:(.+?) -->`);

        // Iterate backwards through chat log to find most recent history first
        for (let i = chatLog.length - 1; i >= 0 && history.length < count; i--) {
            const msg = chatLog[i];
            if (msg && msg.mes) {
                const match = msg.mes.match(pattern);
                if (match && match[1]) {
                    try {
                        // Decode base64 content
                        // Handle unicode strings correctly
                        const decoded = decodeURIComponent(escape(atob(match[1])));

                        // Verify decoded content is valid (not empty, reasonable length)
                        if (decoded && decoded.length > 0 && decoded.length < 100000) {
                            history.unshift(decoded); // Add to front to maintain chronological order
                        } else {
                            console.warn(`[Sidecar AI] Skipped invalid history item (length: ${decoded?.length || 0})`);
                        }
                    } catch (e) {
                        console.warn('[Sidecar AI] Failed to decode history item:', e);
                        console.warn('[Sidecar AI] History item details:', {
                            addonId,
                            messageIndex: i,
                            matchLength: match[1]?.length,
                            error: e.message
                        });
                        // Continue to next item instead of failing completely
                    }
                }
            }
        }

        if (history.length === 0) {
            return '';
        }

        return history.map((item, index) => `--- Result ${index + 1} ---\n${item}`).join('\n\n');
    }

    /**
     * Get last N messages from chat log
     */
    getLastMessages(chatLog, count) {
        if (!chatLog || !Array.isArray(chatLog)) {
            return [];
        }

        // Get last N messages (excluding system messages)
        const messages = chatLog
            .filter(msg => msg && msg.mes && msg.mes.trim())
            .slice(-count);

        return messages;
    }

    /**
     * Format messages for prompt
     */
    formatMessages(messages) {
        if (!messages || messages.length === 0) {
            return 'No previous messages.';
        }

        return messages.map((msg, index) => {
            const name = msg.name || 'Unknown';
            const text = msg.mes || '';
            const role = msg.is_user ? 'User' : 'Character';
            return `[${role}] ${name}: ${text}`;
        }).join('\n');
    }

    /**
     * Get current message (most recent AI response)
     */
    getCurrentMessage(chatLog) {
        if (!chatLog || !Array.isArray(chatLog)) {
            return '';
        }

        // Find most recent non-user message
        for (let i = chatLog.length - 1; i >= 0; i--) {
            const msg = chatLog[i];
            if (msg && !msg.is_user && msg.mes) {
                return msg.mes;
            }
        }

        return '';
    }

    /**
     * Format character card using SillyTavern's actual field structure
     * Matches the context_story_string template format
     */
    formatCharCard(charData) {
        if (!charData) {
            return '';
        }

        const parts = [];

        // Follow SillyTavern's context_story_string template order
        if (charData.anchorBefore) {
            parts.push(charData.anchorBefore);
        }

        if (charData.system) {
            parts.push(charData.system);
        }

        if (charData.wiBefore) {
            parts.push(charData.wiBefore);
        }

        if (charData.description) {
            parts.push(charData.description);
        }

        if (charData.personality) {
            const charName = charData.name || 'Character';
            parts.push(`${charName}'s personality: ${charData.personality}`);
        }

        if (charData.scenario) {
            parts.push(`Scenario: ${charData.scenario}`);
        }

        if (charData.wiAfter) {
            parts.push(charData.wiAfter);
        }

        if (charData.persona) {
            parts.push(charData.persona);
        }

        if (charData.anchorAfter) {
            parts.push(charData.anchorAfter);
        }

        // Fallback: Include name if available (not in template but useful)
        if (charData.name && !parts.length) {
            parts.push(`Name: ${charData.name}`);
        }

        return parts.join('\n\n') || 'No character card data available.';
    }

    /**
     * Format user card
     */
    formatUserCard(userData) {
        if (!userData) {
            return '';
        }

        const parts = [];

        if (userData.name) {
            parts.push(`Name: ${userData.name}`);
        }

        if (userData.description) {
            parts.push(`Description: ${userData.description}`);
        }

        if (userData.avatar) {
            parts.push(`Avatar: ${userData.avatar}`);
        }

        return parts.join('\n') || 'No user card data available.';
    }

    /**
     * Format world card
     */
    formatWorldCard(worldData) {
        if (!worldData) {
            return '';
        }

        const parts = [];

        if (worldData.name) {
            parts.push(`World Name: ${worldData.name}`);
        }

        if (worldData.description) {
            parts.push(`Description: ${worldData.description}`);
        }

        if (worldData.entries) {
            parts.push(`Entries: ${JSON.stringify(worldData.entries, null, 2)}`);
        }

        return parts.join('\n') || 'No world card data available.';
    }

    /**
     * Get chat log from context
     */
    getChatLog() {
        if (this.context.chat) {
            return this.context.chat;
        }

        // Try alternative paths
        if (this.context.chatLog) {
            return this.context.chatLog;
        }

        if (this.context.currentChat) {
            return this.context.currentChat;
        }

        return [];
    }

    /**
     * Get character data from context
     */
    getCharData() {
        if (this.context.characters && this.context.characters[this.context.characterId]) {
            return this.context.characters[this.context.characterId];
        }

        if (this.context.character) {
            return this.context.character;
        }

        if (this.context.currentCharacter) {
            return this.context.currentCharacter;
        }

        return null;
    }

    /**
     * Get user data from context
     */
    getUserData() {
        if (this.context.user) {
            return this.context.user;
        }

        if (this.context.userData) {
            return this.context.userData;
        }

        return null;
    }

    /**
     * Get world data from context
     */
    getWorldData() {
        if (this.context.world) {
            return this.context.world;
        }

        if (this.context.worldData) {
            return this.context.worldData;
        }

        if (this.context.worldInfo) {
            return this.context.worldInfo;
        }

        return null;
    }
}
