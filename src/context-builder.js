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
        parts.push('EXECUTE THE INSTRUCTION BLOCK 1:1. Do not add extra features, extra content, or “helpful” extras.');
        parts.push('If the instruction asks for A, output A. If it does not ask for B, do NOT output B.');
        parts.push('NEVER continue the story. NEVER “roleplay”. NEVER add narrative.');
        parts.push('SECURITY/INJECTION RULES (NON‑NEGOTIABLE): No <style> blocks, no external CSS, no <script>, no event handlers (onclick=...), no iframes/embeds/objects. Inline styles ONLY.');
        parts.push('OUTPUT RULE: Output ONLY the final content. No prefaces, no explanations, no markdown code fences.');
        parts.push('');
        parts.push('OUTPUT FORMATTING:');

        // Add format-specific instructions based on addon.formatStyle
        const formatStyle = addon.formatStyle || 'html-css';

        if (formatStyle === 'html-css') {
            parts.push('FORMAT: HTML SNIPPET (INLINE STYLES ONLY)');
            parts.push('- Output valid HTML. Inline styles only. No global CSS.');
            parts.push('- Prefer a single root <div> wrapper (one top-level element).');
            parts.push('- Do NOT assume any host app/theme variables exist.');
            parts.push('');
            parts.push('THEME-SAFE COLOR RULES (DEFAULT BEHAVIOR):');
            parts.push('- Unless the instruction explicitly asks for specific colors, DO NOT set `color` or `background-color` at all. Let the host theme handle it.');
            parts.push('- NEVER “invent” light gray text (e.g. #555/#777/#999) for secondary labels. Use smaller font-size / spacing / font-weight instead, while keeping inherited color.');
            parts.push('- If you must create a surface/card WITHOUT user-specified colors, use neutral translucency that works on both light/dark themes:');
            parts.push('  - background-color: rgba(127,127,127,0.10)');
            parts.push('  - border: 1px solid rgba(127,127,127,0.25)');
            parts.push('  - and keep text color inherited (do not set it).');
            parts.push('');
            parts.push('WHEN THE USER SPECIFIES COLORS:');
            parts.push('- If the instruction specifies exact colors (e.g. “pink background with lime text”), follow EXACTLY. Do not “correct” it.');
            parts.push('- If the instruction specifies a background but not text color, choose a readable text color (black/white) unless the instruction forbids you from choosing.');
            parts.push('');
            parts.push('ACCESSIBILITY (ONLY WHEN REQUESTED):');
            parts.push('- If (and only if) the instruction requests WCAG/accessibility/contrast, ensure text/background contrast >= 4.5:1.');
            parts.push('- Do not claim “WCAG compliant” unless you actually followed that requirement.');
            parts.push('');
            parts.push('OUTPUT SELF-CHECK (SILENT):');
            parts.push('- No markdown fences. No commentary.');
            parts.push('- No global CSS (<style>). No scripts. No event handlers.');
            parts.push('- If you set a background-color for an element, ensure its text remains readable (either inherit correctly or set an appropriate text color if needed).');
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
            parts.push('THEME-SAFE COLOR RULES (DEFAULT BEHAVIOR):');
            parts.push('- Unless the instruction explicitly asks for colors, do NOT set `color` or `background-color`. Use layout/spacing/typography to look “app-like”.');
            parts.push('- If you add decorative containers without user-specified colors, use neutral translucency only (works in light/dark): background-color: rgba(127,127,127,0.10) with border: 1px solid rgba(127,127,127,0.25).');
            parts.push('- Do NOT use light gray text to imply “muted”. Keep color inherited.');
            parts.push('');
            parts.push('WHEN THE USER SPECIFIES COLORS:');
            parts.push('- Follow EXACTLY. Do not “fix”, do not reinterpret, do not add your own palette.');
            parts.push('- If the user asks for WCAG/accessibility, then you must ensure contrast >= 4.5:1 (otherwise do not claim it).');
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
            parts.push('- Example good contrast: Dark blue (#1e3a8a) background with white (#ffffff) text = PASS.');
            parts.push('- Example bad contrast: Light gray (#e0e0e0) background with light gray (#aaa) text = FAIL.');
            parts.push('- Example good contrast: Dark blue (#1e3a8a) background with white (#ffffff) text = PASS.');
            parts.push('- Example bad contrast: Light gray (#e0e0e0) background with light gray (#aaa) text = FAIL.');
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

            // Try current swipe variant first, then fall back to message.extra
            const swipeId = msg?.swipe_id ?? 0;
            const sidecarResults = msg?.swipe_info?.[swipeId]?.extra?.sidecarResults || msg?.extra?.sidecarResults;

            if (sidecarResults?.[addonId]) {
                const stored = sidecarResults[addonId];
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
