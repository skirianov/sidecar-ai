/**
 * Result Formatter
 * Formats and injects AI responses based on add-on settings
 */

export class ResultFormatter {
    constructor(context) {
        this.context = context;
    }

    /**
     * Format result based on add-on settings
     */
    formatResult(addon, aiResponse, originalMessage = null) {
        let formatted = aiResponse;

        // Apply result format
        switch (addon.resultFormat) {
            case 'append':
                formatted = this.formatAppend(aiResponse);
                break;

            case 'separate':
                formatted = this.formatSeparate(aiResponse, addon);
                break;

            case 'collapsible':
            default:
                formatted = this.formatCollapsible(aiResponse, addon);
                break;
        }

        return formatted;
    }

    /**
     * Format as inline append
     */
    formatAppend(response) {
        return `\n\n${response}`;
    }

    /**
     * Format as separate block
     */
    formatSeparate(response, addon) {
        return `\n\n--- ${addon.name} ---\n${response}\n---\n`;
    }

    /**
     * Format as collapsible details block
     */
    formatCollapsible(response, addon) {
        return `\n\n<details>\n<summary><strong>${addon.name}</strong></summary>\n<div>\n${response}\n</div>\n</details>`;
    }

    /**
     * Inject result into chat history as HTML comment
     */
    injectIntoChatHistory(messageId, addon, formattedResult) {
        try {
            // Find the message element
            const messageElement = this.findMessageElement(messageId);
            if (!messageElement) {
                console.warn(`[Add-Ons Extension] Message element not found: ${messageId}`);
                return false;
            }

            // Find message content area
            const contentArea = messageElement.querySelector('.mes_text') ||
                messageElement.querySelector('.message') ||
                messageElement;

            // Create HTML comment
            const comment = `<!-- addon-result:${addon.id} -->${formattedResult}<!-- /addon-result:${addon.id} -->`;

            // Append to message content
            if (contentArea.innerHTML) {
                contentArea.innerHTML += comment;
            } else if (contentArea.textContent !== undefined) {
                contentArea.textContent += formattedResult;
            }

            console.log(`[Add-Ons Extension] Injected result into chat history for: ${addon.name}`);
            return true;
        } catch (error) {
            console.error(`[Add-Ons Extension] Error injecting into chat history:`, error);
            return false;
        }
    }

    /**
     * Show loading indicator for an add-on (inside chat, after message)
     */
    showLoadingIndicator(messageId, addon) {
        try {
            const messageElement = this.findMessageElement(messageId);
            if (!messageElement) {
                console.warn(`[Sidecar AI] Message element not found for loading indicator: ${messageId}`);
                return;
            }

            // Get or create Sidecar container for this message
            let sidecarContainer = messageElement.querySelector(`.sidecar-container-${messageId}`);
            if (!sidecarContainer) {
                sidecarContainer = document.createElement('div');
                sidecarContainer.className = `sidecar-container sidecar-container-${messageId}`;
                sidecarContainer.style.cssText = 'margin-top: 10px; padding: 10px; background: var(--SmartThemeBodyColor, #1e1e1e) !important; border: 1px solid var(--SmartThemeBorderColor, #555) !important; border-radius: 5px !important;';
                
                // Insert after message content
                const messageContent = messageElement.querySelector('.mes_text') || 
                                      messageElement.querySelector('.message') ||
                                      messageElement;
                if (messageContent.nextSibling) {
                    messageContent.parentElement.insertBefore(sidecarContainer, messageContent.nextSibling);
                } else {
                    messageElement.appendChild(sidecarContainer);
                }
            }

            // Create or update loading indicator for this addon
            let loadingDiv = sidecarContainer.querySelector(`.sidecar-loading-${addon.id}`);
            if (!loadingDiv) {
                loadingDiv = document.createElement('div');
                loadingDiv.className = `sidecar-loading sidecar-loading-${addon.id}`;
                loadingDiv.style.cssText = 'padding: 8px; display: flex; align-items: center; gap: 8px; color: var(--SmartThemeBodyColor, rgba(255, 255, 255, 0.7)) !important;';
                loadingDiv.innerHTML = `
                    <i class="fa-solid fa-spinner fa-spin"></i>
                    <span>Processing ${addon.name}...</span>
                `;
                sidecarContainer.appendChild(loadingDiv);
            }

            console.log(`[Sidecar AI] Showing loading indicator for ${addon.name}`);
        } catch (error) {
            console.error(`[Sidecar AI] Error showing loading indicator:`, error);
        }
    }

    /**
     * Hide loading indicator for an add-on
     */
    hideLoadingIndicator(messageId, addon) {
        try {
            const messageElement = this.findMessageElement(messageId);
            if (!messageElement) return;

            const sidecarContainer = messageElement.querySelector(`.sidecar-container-${messageId}`);
            if (sidecarContainer) {
                const loadingDiv = sidecarContainer.querySelector(`.sidecar-loading-${addon.id}`);
                if (loadingDiv) {
                    loadingDiv.remove();
                }
            }
        } catch (error) {
            console.error(`[Sidecar AI] Error hiding loading indicator:`, error);
        }
    }

    /**
     * Show error indicator
     */
    showErrorIndicator(messageId, addon, error) {
        try {
            const messageElement = this.findMessageElement(messageId);
            if (!messageElement) return;

            let sidecarContainer = messageElement.querySelector(`.sidecar-container-${messageId}`);
            if (!sidecarContainer) {
                sidecarContainer = document.createElement('div');
                sidecarContainer.className = `sidecar-container sidecar-container-${messageId}`;
                sidecarContainer.style.cssText = 'margin-top: 10px; padding: 10px; background: var(--SmartThemeBodyColor, #1e1e1e) !important; border: 1px solid var(--SmartThemeBorderColor, #555) !important; border-radius: 5px !important;';
                
                const messageContent = messageElement.querySelector('.mes_text') || messageElement;
                if (messageContent.nextSibling) {
                    messageContent.parentElement.insertBefore(sidecarContainer, messageContent.nextSibling);
                } else {
                    messageElement.appendChild(sidecarContainer);
                }
            }

            const errorDiv = document.createElement('div');
            errorDiv.className = `sidecar-error sidecar-error-${addon.id}`;
            errorDiv.style.cssText = 'padding: 8px; color: #ff6b6b !important;';
            errorDiv.innerHTML = `<i class="fa-solid fa-exclamation-triangle"></i> Error processing ${addon.name}: ${error.message || error}`;
            sidecarContainer.appendChild(errorDiv);
        } catch (err) {
            console.error(`[Sidecar AI] Error showing error indicator:`, err);
        }
    }

    /**
     * Inject result into dropdown UI (inside chat, after message)
     */
    injectIntoDropdown(addon, formattedResult, messageId = null) {
        try {
            // Use provided messageId or get from latest message
            if (!messageId) {
                messageId = this.getMessageId(null);
            }
            const messageElement = this.findMessageElement(messageId);
            
            if (!messageElement) {
                console.warn(`[Sidecar AI] Message element not found for dropdown injection`);
                return false;
            }

            // Get or create Sidecar container for this message
            let sidecarContainer = messageElement.querySelector(`.sidecar-container-${messageId}`);
            if (!sidecarContainer) {
                sidecarContainer = document.createElement('div');
                sidecarContainer.className = `sidecar-container sidecar-container-${messageId}`;
                sidecarContainer.style.cssText = 'margin-top: 10px; padding: 10px; background: var(--SmartThemeBodyColor, #1e1e1e) !important; border: 1px solid var(--SmartThemeBorderColor, #555) !important; border-radius: 5px !important;';
                
                // Insert after message content
                const messageContent = messageElement.querySelector('.mes_text') || 
                                      messageElement.querySelector('.message') ||
                                      messageElement;
                if (messageContent.nextSibling) {
                    messageContent.parentElement.insertBefore(sidecarContainer, messageContent.nextSibling);
                } else {
                    messageElement.appendChild(sidecarContainer);
                }
            }

            // Create or update add-on section
            let addonSection = sidecarContainer.querySelector(`.addon-section-${addon.id}`);

            if (!addonSection) {
                addonSection = document.createElement('details');
                addonSection.className = `addon-result-section addon-section-${addon.id}`;
                addonSection.open = true;

                const summary = document.createElement('summary');
                summary.className = 'addon-result-summary';
                summary.textContent = `${addon.name}`;
                summary.style.cssText = 'cursor: pointer; padding: 8px; background: var(--SmartThemeBlurTintColor, rgba(128, 128, 128, 0.2)) !important; border-radius: 3px; color: var(--SmartThemeBodyColor, #eee) !important;';

                const content = document.createElement('div');
                content.className = 'addon-result-content';
                content.id = `addon-content-${addon.id}`;
                content.style.cssText = 'padding: 10px; margin-top: 8px; background: var(--SmartThemeBodyColor, #1e1e1e) !important; color: var(--SmartThemeBodyColor, #eee) !important;';

                addonSection.appendChild(summary);
                addonSection.appendChild(content);
                sidecarContainer.appendChild(addonSection);
            }

            // Update content
            const content = addonSection.querySelector('.addon-result-content');
            if (content) {
                // Clear existing content and add new result
                content.innerHTML = '';

                // Append new result
                const resultDiv = document.createElement('div');
                resultDiv.className = 'addon-result-item';
                resultDiv.style.cssText = 'background: transparent !important; color: var(--SmartThemeBodyColor, #eee) !important;';
                resultDiv.innerHTML = formattedResult;

                const timestamp = document.createElement('div');
                timestamp.className = 'addon-result-timestamp';
                timestamp.textContent = `Generated at ${new Date().toLocaleTimeString()}`;
                timestamp.style.cssText = 'font-size: 0.8em; color: var(--SmartThemeBodyColor, rgba(255, 255, 255, 0.5)) !important; margin-top: 8px; font-style: italic;';

                resultDiv.appendChild(timestamp);
                content.appendChild(resultDiv);

                // Auto-expand
                addonSection.open = true;
            }

            console.log(`[Sidecar AI] Injected result into dropdown for: ${addon.name}`);
            return true;
        } catch (error) {
            console.error(`[Sidecar AI] Error injecting into dropdown:`, error);
            return false;
        }
    }

    /**
     * Find message element by ID or other identifier
     */
    findMessageElement(messageId) {
        // Try direct ID lookup
        let element = document.getElementById(messageId);
        if (element) {
            return element;
        }

        // Try data attribute
        element = document.querySelector(`[data-message-id="${messageId}"]`);
        if (element) {
            return element;
        }

        // Try finding by message index in chat
        if (this.context.chat && Array.isArray(this.context.chat)) {
            const messageIndex = this.context.chat.findIndex(msg =>
                msg.uid === messageId || msg.id === messageId
            );

            if (messageIndex !== -1) {
                // Try to find corresponding DOM element
                const messageElements = document.querySelectorAll('.mes, .message');
                if (messageElements[messageIndex]) {
                    return messageElements[messageIndex];
                }
            }
        }

        // Fallback: get last message element
        const messageElements = document.querySelectorAll('.mes, .message');
        return messageElements[messageElements.length - 1] || null;
    }

    /**
     * Get message ID from message object
     */
    getMessageId(message) {
        if (!message) {
            return null;
        }

        return message.uid ||
            message.id ||
            message.mesId ||
            `msg_${Date.now()}`;
    }
}
