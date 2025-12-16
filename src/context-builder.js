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
        parts.push('Any styling you will apply will be in the context of the chat - NEVER apply any styling that will affect global styles. No CSS blocks - ONLY inline styles. This is NON negotiable CRITICAL INSTRUCTION.');
        parts.push('');
        parts.push('OUTPUT FORMATTING:');

        // Add format-specific instructions based on addon.formatStyle
        const formatStyle = addon.formatStyle || 'html-css';

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
            parts.push('⚠️ CRITICAL COLOR & ACCESSIBILITY REQUIREMENTS (WCAG AA MANDATORY):');
            parts.push('- MANDATORY: All text colors MUST have minimum 4.5:1 contrast ratio with their background (WCAG AA standard).');
            parts.push('- NEVER use light gray (#aaa, #bbb, #ccc, #ddd, #eee) on light backgrounds - this FAILS WCAG.');
            parts.push('- NEVER use dark gray (#444, #555, #666, #777) on dark backgrounds - this FAILS WCAG.');
            parts.push('- FOR LIGHT BACKGROUNDS: Use DARK text colors: #000000, #1a1a1a, #2d2d2d, #333333 (contrast > 12:1).');
            parts.push('- FOR DARK BACKGROUNDS: Use LIGHT text colors: #ffffff, #f0f0f0, #e8e8e8, #dddddd (contrast > 12:1).');
            parts.push('- FOR COLORED BACKGROUNDS: If background is light (e.g., #f5f5f5, #e8e8e8), use DARK text (#000, #1a1a1a).');
            parts.push('- FOR COLORED BACKGROUNDS: If background is dark (e.g., #2d2d2d, #1a1a1a), use LIGHT text (#fff, #f0f0f0).');
            parts.push('- NEVER use rgba() with low opacity for text - always use solid colors with proper contrast.');
            parts.push('- If you use colored backgrounds (purple, yellow, etc.), ensure text is either pure white (#ffffff) or pure black (#000000) for maximum contrast.');
            parts.push('- TEST: Light gray text on pastel backgrounds = FAIL. Dark gray text on dark backgrounds = FAIL.');
            parts.push('- REMEMBER: Better to use high-contrast colors than fail accessibility standards.');
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
            parts.push('COLOR & ACCESSIBILITY REQUIREMENTS:');
            parts.push('- CRITICAL: All colors MUST meet WCAG AA contrast ratio standards (minimum 4.5:1 for normal text, 3:1 for large text).');
            parts.push('- Choose visually pleasing, harmonious color palettes (complementary or analogous colors).');
            parts.push('- Ensure high contrast between text and backgrounds for readability.');
            parts.push('- Light text on dark backgrounds: Use #ffffff, #f0f0f0, #e8e8e8 (contrast > 12:1).');
            parts.push('- Dark text on light backgrounds: Use #000000, #1a1a1a, #2d2d2d (contrast > 12:1).');
            parts.push('- Avoid low-contrast combinations (light gray on white, dark gray on black).');
            parts.push('');
            parts.push('STYLE CONSISTENCY RULES:');
            if (context.addonHistory) {
                parts.push('- IMPORTANT: Review the "Previous Output History" section below to see your past styling choices.');
                parts.push('- MAINTAIN THE SAME VISUAL STYLE as your previous outputs.');
                parts.push('- Use the same color schemes, formatting patterns, and decorative elements.');
                parts.push('- Keep your aesthetic consistent across all responses.');
            } else {
                parts.push('- Choose a distinctive visual style and remember it for future responses.');
                parts.push('- Be consistent with your formatting choices (colors, borders, spacing, etc.).');
            }
            parts.push('');
            parts.push('AVATAR/IMAGE RULES:');
            parts.push('- NEVER use placeholder image URLs (placeholder.com, via.placeholder, picsum, etc.).');
            parts.push('- For avatars: Use emoji avatars (e.g., 🎭, 👤, 🤖) OR initials in colored circles.');
            parts.push('- Initials example: <div style="width:40px;height:40px;border-radius:50%;background:#5e72e4;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:bold;">AB</div>');
            parts.push('- Choose background colors that have high contrast with white text (dark, saturated colors work best).');
            parts.push('');
        } else if (formatStyle === 'markdown') {
            parts.push('FORMAT AS MARKDOWN:');
            parts.push('- Use clean, standard Markdown formatting.');
            parts.push('- Use ## or ### for headings.');
            parts.push('- Use **bold** and *italic* for emphasis.');
            parts.push('- Use - or * for unordered lists.');
            parts.push('- Use 1. 2. 3. for ordered lists.');
            parts.push('- Keep formatting simple and readable.');
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
     * Reads from message.extra.sidecarResults
     */
    getAddonHistory(chatLog, addonId, count) {
        if (!chatLog || !Array.isArray(chatLog) || !addonId) {
            return '';
        }

        const history = [];

        // Iterate backwards through chat log to find most recent history first
        for (let i = chatLog.length - 1; i >= 0 && history.length < count; i--) {
            const msg = chatLog[i];

            // First, try modern storage (message.extra)
            if (msg?.extra?.sidecarResults?.[addonId]) {
                const stored = msg.extra.sidecarResults[addonId];
                if (stored.result && stored.result.length > 0 && stored.result.length < 100000) {
                    history.unshift(stored.result);
                    continue;
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
