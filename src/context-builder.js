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

        // Build context object
        const context = {
            lastMessages: this.formatMessages(lastMessages),
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

        // Always include chat history (controlled by messagesCount)
        if (context.lastMessages && context.lastMessages !== 'No previous messages.') {
            parts.push('=== Chat History ===');
            parts.push(context.lastMessages);
            parts.push(''); // Empty line for spacing
        }

        // Include character card if enabled
        if (settings.includeCharCard && context.charCard) {
            parts.push('=== Character Card ===');
            parts.push(context.charCard);
            parts.push(''); // Empty line for spacing
        }

        // Include user card if enabled
        if (settings.includeUserCard && context.userCard) {
            parts.push('=== User Card ===');
            parts.push(context.userCard);
            parts.push(''); // Empty line for spacing
        }

        // Include world card if enabled
        if (settings.includeWorldCard && context.worldCard) {
            parts.push('=== World Card ===');
            parts.push(context.worldCard);
            parts.push(''); // Empty line for spacing
        }

        // Add user's prompt at the end
        if (userPrompt.trim()) {
            parts.push('=== Instruction ===');
            parts.push(userPrompt);
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
     * Format character card
     */
    formatCharCard(charData) {
        if (!charData) {
            return '';
        }

        const parts = [];

        if (charData.name) {
            parts.push(`Name: ${charData.name}`);
        }

        if (charData.description) {
            parts.push(`Description: ${charData.description}`);
        }

        if (charData.personality) {
            parts.push(`Personality: ${charData.personality}`);
        }

        if (charData.scenario) {
            parts.push(`Scenario: ${charData.scenario}`);
        }

        if (charData.first_mes) {
            parts.push(`First Message: ${charData.first_mes}`);
        }

        if (charData.mes_example) {
            parts.push(`Message Example: ${charData.mes_example}`);
        }

        // Include system prompt if available
        if (charData.system) {
            parts.push(`System: ${charData.system}`);
        }

        return parts.join('\n') || 'No character card data available.';
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
