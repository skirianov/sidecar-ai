/**
 * Result Formatter
 * Formats and injects AI responses based on add-on settings
 */

export class ResultFormatter {
    constructor(context) {
        this.context = context;
        // Performance: Cache DOM queries
        this.cachedAIMessageElement = null;
        this.lastMessageCount = 0;
        this.cacheInvalidationTime = 0;
    }

    /**
     * Format result based on add-on settings
     * @param {Object} addon - The add-on configuration
     * @param {string} aiResponse - The raw AI response
     * @param {Object} originalMessage - Original message object
     * @param {boolean} forDropdown - Whether this is for dropdown injection (no extra wrapping needed)
     */
    formatResult(addon, aiResponse, originalMessage = null, forDropdown = false) {
        let formatted = aiResponse;

        // If injecting into dropdown, we already have the structure, so don't wrap
        if (forDropdown) {
            // Clean up any existing wrapper tags that might conflict
            formatted = this.cleanResponseForDropdown(aiResponse);
            // Convert Markdown to HTML if needed
            formatted = this.markdownToHtml(formatted);
            return formatted;
        }

        // Apply result format for chat history injection
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
     * Clean response for dropdown injection - remove conflicting wrapper tags
     */
    cleanResponseForDropdown(response) {
        if (!response || typeof response !== 'string') {
            return response;
        }

        // Remove outer <details> tags if present (we already have our own)
        let cleaned = response.trim();

        // Match <details>...</details> at the start/end
        const detailsMatch = cleaned.match(/^<details[^>]*>(.*?)<\/details>$/is);
        if (detailsMatch) {
            cleaned = detailsMatch[1].trim();
        }

        // Also handle cases where there might be nested details - extract inner content
        // But preserve the structure if it's intentional (like the user's example)
        return cleaned;
    }

    /**
     * Convert Markdown to HTML (simplified and more robust)
     */
    markdownToHtml(markdown) {
        if (!markdown || typeof markdown !== 'string') {
            return markdown;
        }

        // If it already contains HTML tags, assume it's already HTML and return as-is
        if (markdown.match(/<[a-z][\s\S]*>/i)) {
            return markdown;
        }

        let html = markdown;

        // Code blocks first (protect from other conversions)
        html = html.replace(/```([\s\S]*?)```/g, (match, code) => {
            return `<pre><code>${code.trim()}</code></pre>`;
        });
        html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

        // Headers (process line by line to avoid matching within text)
        html = html.split('\n').map(line => {
            if (line.match(/^#{1,6}\s/)) {
                const level = line.match(/^#+/)[0].length;
                const text = line.replace(/^#+\s*/, '');
                return `<h${level}>${text}</h${level}>`;
            }
            return line;
        }).join('\n');

        // Bold and italic - using non-greedy matching
        html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        html = html.replace(/__(.+?)__/g, '<strong>$1</strong>');
        html = html.replace(/(?<!\*)\*([^*\n]+?)\*(?!\*)/g, '<em>$1</em>');
        html = html.replace(/(?<!_)_([^_\n]+?)_(?!_)/g, '<em>$1</em>');

        // Links
        html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

        // Horizontal rules
        html = html.replace(/^[-*]{3,}$/gm, '<hr>');

        // Lists - improved handling
        const lines = html.split('\n');
        let inList = false;
        let result = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const listMatch = line.match(/^[-*]\s+(.+)$/);
            const orderedMatch = line.match(/^\d+\.\s+(.+)$/);

            if (listMatch) {
                if (!inList) {
                    result.push('<ul>');
                    inList = 'ul';
                }
                result.push(`<li>${listMatch[1]}</li>`);
            } else if (orderedMatch) {
                if (!inList) {
                    result.push('<ol>');
                    inList = 'ol';
                } else if (inList === 'ul') {
                    result.push('</ul>');
                    result.push('<ol>');
                    inList = 'ol';
                }
                result.push(`<li>${orderedMatch[1]}</li>`);
            } else {
                if (inList) {
                    result.push(inList === 'ul' ? '</ul>' : '</ol>');
                    inList = false;
                }
                result.push(line);
            }
        }

        if (inList) {
            result.push(inList === 'ul' ? '</ul>' : '</ol>');
        }

        html = result.join('\n');

        // Normalize whitespace - remove excessive blank lines
        html = html.replace(/\n{3,}/g, '\n\n');

        // Convert paragraphs - wrap consecutive non-block lines in <p> tags
        // Split by double newlines to identify paragraphs
        const paragraphs = html.split(/\n\n+/);
        html = paragraphs.map(para => {
            const trimmed = para.trim();
            if (!trimmed) return '';

            // If it's already a block element, return as-is
            if (trimmed.match(/^<(h\d|ul|ol|pre|blockquote|hr|div)/i)) {
                return trimmed;
            }

            // Otherwise wrap in <p> tag
            // Convert single newlines within paragraph to <br>
            const withBreaks = trimmed.replace(/\n(?!$)/g, '<br>');
            return `<p>${withBreaks}</p>`;
        }).filter(p => p).join('\n\n');

        return html;
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
    injectIntoChatHistory(messageId, addon, formattedResult, message = null) {
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

            // Check if result already exists
            const existingResult = contentArea.querySelector(`.addon-result-chathistory-${addon.id}`);
            if (existingResult) {
                // Update existing result
                existingResult.querySelector('.addon-result-content-text').innerHTML = formattedResult;
                return true;
            }

            // Create result wrapper
            const resultWrapper = document.createElement('div');
            resultWrapper.className = `addon-result-chathistory addon-result-chathistory-${addon.id}`;
            resultWrapper.style.cssText = 'margin-top: 10px; padding: 8px; background: rgba(128, 128, 128, 0.1) !important; background-color: rgba(128, 128, 128, 0.1) !important; border: 1px solid rgba(128, 128, 128, 0.3) !important; border-radius: 3px !important; position: relative;';

            const resultContent = document.createElement('div');
            resultContent.className = 'addon-result-content-text';
            resultContent.innerHTML = formattedResult;
            resultWrapper.appendChild(resultContent);

            // Add edit button
            const editButton = document.createElement('button');
            editButton.className = 'addon-result-edit-button';
            editButton.style.cssText = 'position: absolute; top: 5px; right: 5px; padding: 4px 8px; background: rgba(128, 128, 128, 0.2) !important; background-color: rgba(128, 128, 128, 0.2) !important; border: 1px solid rgba(128, 128, 128, 0.4) !important; border-radius: 3px !important; color: rgba(255, 255, 255, 0.7) !important; cursor: pointer; font-size: 0.8em; display: none;';
            editButton.innerHTML = '<i class="fa-solid fa-edit"></i>';
            editButton.title = 'Edit result';
            resultWrapper.appendChild(editButton);

            // Show edit button on hover
            resultWrapper.addEventListener('mouseenter', () => {
                editButton.style.display = 'block';
            });
            resultWrapper.addEventListener('mouseleave', () => {
                if (!resultWrapper.classList.contains('editing')) {
                    editButton.style.display = 'none';
                }
            });

            // Edit functionality
            editButton.addEventListener('click', (e) => {
                e.stopPropagation();
                this.enableEditMode(resultWrapper, addon, messageId, formattedResult, message);
            });

            // Append to message content
            if (contentArea.innerHTML) {
                contentArea.appendChild(resultWrapper);
            } else {
                contentArea.appendChild(resultWrapper);
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
     * CRITICAL: Only attaches to AI messages, not user messages
     */
    showLoadingIndicator(messageId, addon) {
        try {
            // Always find the latest AI message element, not just any message
            const messageElement = this.findAIMessageElement();

            if (!messageElement) {
                console.warn(`[Sidecar AI] AI message element not found for loading indicator. Waiting...`);
                // Retry after a short delay in case the AI message is still rendering
                setTimeout(() => {
                    const retryElement = this.findAIMessageElement();
                    if (retryElement) {
                        this.attachLoadingToElement(retryElement, addon);
                    } else {
                        console.error(`[Sidecar AI] Failed to find AI message element after retry`);
                    }
                }, 500);
                return;
            }

            // Verify it's actually an AI message
            if (!this.isAIMessageElement(messageElement)) {
                console.warn(`[Sidecar AI] Found element is not an AI message, searching for latest AI message...`);
                const aiElement = this.findAIMessageElement();
                if (aiElement) {
                    this.attachLoadingToElement(aiElement, addon);
                }
                return;
            }

            this.attachLoadingToElement(messageElement, addon);
        } catch (error) {
            console.error(`[Sidecar AI] Error showing loading indicator:`, error);
        }
    }

    /**
     * Attach loading indicator to a specific message element
     */
    attachLoadingToElement(messageElement, addon) {
        // Get message ID from the element
        const elementId = messageElement.id || messageElement.getAttribute('data-message-id') || `msg_${Date.now()}`;

        // Get or create Sidecar container for this message
        let sidecarContainer = messageElement.querySelector(`.sidecar-container`);
        if (!sidecarContainer) {
            sidecarContainer = document.createElement('div');
            sidecarContainer.className = `sidecar-container sidecar-container-${elementId}`;
            sidecarContainer.style.cssText = 'margin-top: 10px; padding: 10px; background: #1e1e1e !important; background-color: #1e1e1e !important; border: 1px solid var(--SmartThemeBorderColor, #555) !important; border-radius: 5px !important; color: #eee !important;';

            // Insert after message content (inside the AI message container)
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
            loadingDiv.style.cssText = 'padding: 8px; display: flex; align-items: center; gap: 8px; color: rgba(255, 255, 255, 0.7) !important; background: transparent !important; background-color: transparent !important;';
            loadingDiv.innerHTML = `
                <i class="fa-solid fa-spinner fa-spin"></i>
                <span>Processing ${addon.name}...</span>
            `;
            sidecarContainer.appendChild(loadingDiv);
        }

        console.log(`[Sidecar AI] Showing loading indicator for ${addon.name} on AI message`);
    }

    /**
     * Find the latest AI message element in the DOM
     * Performance: Uses caching to avoid repeated DOM queries
     */
    findAIMessageElement() {
        // Get current message count
        const messageElements = document.querySelectorAll('.mes, .message');
        const currentCount = messageElements.length;

        // Return cached element if message count unchanged and cache is recent (< 2 seconds)
        const now = Date.now();
        if (this.cachedAIMessageElement &&
            currentCount === this.lastMessageCount &&
            (now - this.cacheInvalidationTime) < 2000) {
            // Verify cached element is still in DOM
            if (document.contains(this.cachedAIMessageElement)) {
                return this.cachedAIMessageElement;
            }
        }

        // Update cache
        this.lastMessageCount = currentCount;
        this.cacheInvalidationTime = now;

        // Search backwards to find the latest AI message
        for (let i = messageElements.length - 1; i >= 0; i--) {
            const element = messageElements[i];
            if (this.isAIMessageElement(element)) {
                this.cachedAIMessageElement = element;
                return element;
            }
        }

        this.cachedAIMessageElement = null;
        return null;
    }

    /**
     * Invalidate the cached AI message element
     * Call this when a new message is added
     */
    invalidateCache() {
        this.cachedAIMessageElement = null;
        this.lastMessageCount = 0;
        this.cacheInvalidationTime = Date.now();
    }

    /**
     * Hide loading indicator for an add-on
     */
    hideLoadingIndicator(messageId, addon) {
        try {
            // Find loading indicator by addon ID (more reliable than messageId)
            const loadingDiv = document.querySelector(`.sidecar-loading-${addon.id}`);
            if (loadingDiv) {
                console.log(`[Sidecar AI] Removing loading indicator for ${addon.name}`);
                loadingDiv.remove();
            } else {
                // Fallback: try to find in the latest AI message
                const messageElement = this.findAIMessageElement();
                if (messageElement) {
                    const sidecarContainer = messageElement.querySelector(`.sidecar-container`);
                    if (sidecarContainer) {
                        const loadingDiv = sidecarContainer.querySelector(`.sidecar-loading-${addon.id}`);
                        if (loadingDiv) {
                            console.log(`[Sidecar AI] Removing loading indicator for ${addon.name} from AI message`);
                            loadingDiv.remove();
                        }
                    }
                }
            }
        } catch (error) {
            console.error(`[Sidecar AI] Error hiding loading indicator:`, error);
        }
    }

    /**
     * Show error indicator
     * CRITICAL: Only attaches to AI messages, not user messages
     */
    showErrorIndicator(messageId, addon, error, retryCallback = null) {
        try {
            // Always find the latest AI message element
            const messageElement = this.findAIMessageElement();
            if (!messageElement) {
                console.warn(`[Sidecar AI] AI message element not found for error indicator`);
                return;
            }

            // Verify it's actually an AI message
            if (!this.isAIMessageElement(messageElement)) {
                console.warn(`[Sidecar AI] Found element is not an AI message for error indicator`);
                return;
            }

            const elementId = messageElement.id || messageElement.getAttribute('data-message-id') || `msg_${Date.now()}`;

            let sidecarContainer = messageElement.querySelector(`.sidecar-container`);
            if (!sidecarContainer) {
                sidecarContainer = document.createElement('div');
                sidecarContainer.className = `sidecar-container sidecar-container-${elementId}`;
                sidecarContainer.style.cssText = 'margin-top: 10px; padding: 10px; background: #1e1e1e !important; background-color: #1e1e1e !important; border: 1px solid var(--SmartThemeBorderColor, #555) !important; border-radius: 5px !important; color: #eee !important;';

                const messageContent = messageElement.querySelector('.mes_text') || messageElement;
                if (messageContent.nextSibling) {
                    messageContent.parentElement.insertBefore(sidecarContainer, messageContent.nextSibling);
                } else {
                    messageElement.appendChild(sidecarContainer);
                }
            }

            // Remove existing error indicator if present
            const existingError = sidecarContainer.querySelector(`.sidecar-error-${addon.id}`);
            if (existingError) {
                existingError.remove();
            }

            const retryCount = error.retryCount || 0;
            const errorMessage = error.message || String(error);
            const retryInfo = retryCount > 0 ? ` (after ${retryCount} retries)` : '';

            const errorDiv = document.createElement('div');
            errorDiv.className = `sidecar-error sidecar-error-${addon.id}`;
            errorDiv.style.cssText = 'padding: 8px; color: #ff6b6b !important; background: rgba(255, 107, 107, 0.1) !important; background-color: rgba(255, 107, 107, 0.1) !important; border: 1px solid rgba(255, 107, 107, 0.3) !important; border-radius: 3px !important; display: flex; align-items: center; justify-content: space-between; gap: 10px;';

            const errorContent = document.createElement('div');
            errorContent.style.cssText = 'flex: 1;';
            errorContent.innerHTML = `<i class="fa-solid fa-exclamation-triangle"></i> Error processing ${addon.name}${retryInfo}: ${errorMessage}`;

            errorDiv.appendChild(errorContent);

            // Add retry button if callback provided
            if (retryCallback) {
                const retryButton = document.createElement('button');
                retryButton.className = 'sidecar-retry-button';
                retryButton.style.cssText = 'padding: 4px 12px; background: rgba(255, 107, 107, 0.2) !important; background-color: rgba(255, 107, 107, 0.2) !important; border: 1px solid rgba(255, 107, 107, 0.5) !important; border-radius: 3px !important; color: #ff6b6b !important; cursor: pointer; font-size: 0.85em; white-space: nowrap;';
                retryButton.innerHTML = '<i class="fa-solid fa-redo"></i> Retry';
                retryButton.title = 'Retry this request';

                retryButton.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    retryButton.disabled = true;
                    retryButton.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Retrying...';

                    try {
                        await retryCallback();
                        // If successful, the error will be replaced by the result
                        errorDiv.remove();
                    } catch (retryError) {
                        // Update error with new retry count
                        const newRetryCount = retryError.retryCount || retryCount + 1;
                        errorContent.innerHTML = `<i class="fa-solid fa-exclamation-triangle"></i> Error processing ${addon.name} (after ${newRetryCount} retries): ${retryError.message || retryError}`;
                        retryButton.disabled = false;
                        retryButton.innerHTML = '<i class="fa-solid fa-redo"></i> Retry';
                    }
                });

                errorDiv.appendChild(retryButton);
            }

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
                sidecarContainer.style.cssText = 'margin-top: 10px; padding: 10px; background: #1e1e1e !important; background-color: #1e1e1e !important; border: 1px solid var(--SmartThemeBorderColor, #555) !important; border-radius: 5px !important; color: #eee !important;';

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
                summary.style.cssText = 'cursor: pointer; padding: 8px; background: var(--SmartThemeBlurTintColor, rgba(128, 128, 128, 0.2)) !important; background-color: var(--SmartThemeBlurTintColor, rgba(128, 128, 128, 0.2)) !important; border-radius: 3px; color: #eee !important;';

                const content = document.createElement('div');
                content.className = 'addon-result-content';
                content.id = `addon-content-${addon.id}`;
                content.style.cssText = 'padding: 10px; margin-top: 8px; background: #1e1e1e !important; background-color: #1e1e1e !important; color: #eee !important; max-height: 500px; overflow-y: auto; overflow-x: hidden; word-wrap: break-word; word-break: break-word; overflow-wrap: break-word;';

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
                resultDiv.style.cssText = 'background: transparent !important; background-color: transparent !important; color: #eee !important; position: relative;';

                // Create result content wrapper
                const resultContent = document.createElement('div');
                resultContent.className = 'addon-result-content-text';
                resultContent.innerHTML = formattedResult;
                resultDiv.appendChild(resultContent);

                // Add edit button
                const editButton = document.createElement('button');
                editButton.className = 'addon-result-edit-button';
                editButton.style.cssText = 'position: absolute; top: 5px; right: 5px; padding: 4px 8px; background: rgba(128, 128, 128, 0.2) !important; background-color: rgba(128, 128, 128, 0.2) !important; border: 1px solid rgba(128, 128, 128, 0.4) !important; border-radius: 3px !important; color: rgba(255, 255, 255, 0.7) !important; cursor: pointer; font-size: 0.8em; display: none;';
                editButton.innerHTML = '<i class="fa-solid fa-edit"></i>';
                editButton.title = 'Edit result';
                resultDiv.appendChild(editButton);

                // Show edit button on hover
                resultDiv.addEventListener('mouseenter', () => {
                    editButton.style.display = 'block';
                });
                resultDiv.addEventListener('mouseleave', () => {
                    if (!resultDiv.classList.contains('editing')) {
                        editButton.style.display = 'none';
                    }
                });

                // Edit functionality
                editButton.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.enableEditMode(resultDiv, addon, messageId, formattedResult, message);
                });

                const timestamp = document.createElement('div');
                timestamp.className = 'addon-result-timestamp';
                timestamp.textContent = `Generated at ${new Date().toLocaleTimeString()}`;
                timestamp.style.cssText = 'font-size: 0.8em; color: rgba(255, 255, 255, 0.5) !important; background: transparent !important; background-color: transparent !important; margin-top: 8px; font-style: italic;';

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
     * Enable edit mode for a result
     */
    enableEditMode(resultElement, addon, messageId, currentContent, message) {
        if (resultElement.classList.contains('editing')) {
            return; // Already in edit mode
        }

        resultElement.classList.add('editing');
        const contentText = resultElement.querySelector('.addon-result-content-text');
        const originalContent = contentText.innerHTML;

        // Create editable textarea
        const textarea = document.createElement('textarea');
        textarea.className = 'addon-result-edit-textarea';
        textarea.style.cssText = 'width: 100%; min-height: 150px; padding: 8px; background: #2e2e2e !important; background-color: #2e2e2e !important; border: 2px solid var(--SmartThemeEmColor, #9fc) !important; border-radius: 3px !important; color: #eee !important; font-family: inherit; font-size: 0.9em; resize: vertical;';
        textarea.value = this.htmlToText(originalContent); // Convert HTML to plain text for editing

        // Replace content with textarea
        contentText.style.display = 'none';
        resultElement.insertBefore(textarea, contentText);

        // Create button container
        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'addon-result-edit-buttons';
        buttonContainer.style.cssText = 'display: flex; gap: 8px; margin-top: 8px; justify-content: flex-end;';

        // Save button
        const saveButton = document.createElement('button');
        saveButton.className = 'addon-result-save-button';
        saveButton.style.cssText = 'padding: 6px 12px; background: rgba(76, 209, 55, 0.2) !important; background-color: rgba(76, 209, 55, 0.2) !important; border: 1px solid #4cd137 !important; border-radius: 3px !important; color: #4cd137 !important; cursor: pointer; font-size: 0.85em;';
        saveButton.innerHTML = '<i class="fa-solid fa-check"></i> Save';
        saveButton.addEventListener('click', async () => {
            const editedContent = textarea.value.trim();
            if (editedContent !== this.htmlToText(originalContent)) {
                // Convert back to HTML (simple conversion)
                const htmlContent = this.textToHtml(editedContent);

                // Update display
                contentText.innerHTML = htmlContent;
                contentText.style.display = 'block';
                textarea.remove();
                buttonContainer.remove();
                resultElement.classList.remove('editing');

                // Update metadata
                this.updateResultMetadata(message, addon, editedContent, true);

                // Show edited badge
                this.showEditedBadge(resultElement);
            } else {
                // No changes, just cancel
                contentText.style.display = 'block';
                textarea.remove();
                buttonContainer.remove();
                resultElement.classList.remove('editing');
            }
        });

        // Cancel button
        const cancelButton = document.createElement('button');
        cancelButton.className = 'addon-result-cancel-button';
        cancelButton.style.cssText = 'padding: 6px 12px; background: rgba(128, 128, 128, 0.2) !important; background-color: rgba(128, 128, 128, 0.2) !important; border: 1px solid rgba(128, 128, 128, 0.4) !important; border-radius: 3px !important; color: rgba(255, 255, 255, 0.7) !important; cursor: pointer; font-size: 0.85em;';
        cancelButton.innerHTML = '<i class="fa-solid fa-times"></i> Cancel';
        cancelButton.addEventListener('click', () => {
            contentText.style.display = 'block';
            textarea.remove();
            buttonContainer.remove();
            resultElement.classList.remove('editing');
        });

        buttonContainer.appendChild(saveButton);
        buttonContainer.appendChild(cancelButton);
        resultElement.appendChild(buttonContainer);

        // Focus textarea
        textarea.focus();
    }

    /**
     * Convert HTML to plain text for editing
     */
    htmlToText(html) {
        const div = document.createElement('div');
        div.innerHTML = html;
        return div.textContent || div.innerText || '';
    }

    /**
     * Convert plain text to HTML (simple conversion)
     */
    textToHtml(text) {
        // Simple conversion: preserve line breaks and basic formatting
        return text
            .replace(/\n/g, '<br>')
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.+?)\*/g, '<em>$1</em>');
    }

    /**
     * Show edited badge on result
     */
    showEditedBadge(resultElement) {
        // Check if badge already exists
        if (resultElement.querySelector('.addon-result-edited-badge')) {
            return;
        }

        const badge = document.createElement('span');
        badge.className = 'addon-result-edited-badge';
        badge.style.cssText = 'position: absolute; top: 5px; left: 5px; padding: 2px 6px; background: rgba(255, 193, 7, 0.2) !important; background-color: rgba(255, 193, 7, 0.2) !important; border: 1px solid rgba(255, 193, 7, 0.5) !important; border-radius: 3px !important; color: #ffc107 !important; font-size: 0.75em; font-weight: 600;';
        badge.textContent = 'EDITED';
        badge.title = `Edited at ${new Date().toLocaleTimeString()}`;
        resultElement.appendChild(badge);
    }

    /**
     * Update result metadata after editing
     */
    updateResultMetadata(message, addon, editedContent, isEdited) {
        if (!message || !addon) {
            return;
        }

        try {
            // Update the storage tag with edited content
            const encoded = btoa(unescape(encodeURIComponent(editedContent)));
            const storageTag = `<!-- sidecar-storage:${addon.id}:${encoded}:edited:${Date.now()} -->`;

            // Update message.mes
            if (message.mes) {
                // Remove old storage tag
                const pattern = new RegExp(`<!-- sidecar-storage:${addon.id}:[^>]+ -->`, 'g');
                message.mes = message.mes.replace(pattern, storageTag);

                // If no storage tag was found, add it
                if (!message.mes.includes(`sidecar-storage:${addon.id}:`)) {
                    message.mes += '\n' + storageTag;
                }
            } else {
                message.mes = storageTag;
            }

            console.log(`[Sidecar AI] Updated metadata for edited result: ${addon.name}`);
        } catch (error) {
            console.error(`[Sidecar AI] Error updating result metadata:`, error);
        }
    }

    /**
     * Save result to message metadata (hidden comment) for history retrieval
     * This ensures state persistence regardless of display mode
     * Includes error recovery and verification
     */
    saveResultToMetadata(message, addon, result) {
        if (!message || !addon || !result) {
            console.warn('[Sidecar AI] Cannot save metadata: missing required parameters');
            return false;
        }

        try {
            // Encode result to Base64 to avoid HTML comment syntax conflicts
            // Use utf-8 safe encoding
            const encoded = btoa(unescape(encodeURIComponent(result)));

            // Verify encoding worked correctly
            try {
                const testDecode = decodeURIComponent(escape(atob(encoded)));
                if (testDecode !== result) {
                    console.warn('[Sidecar AI] Encoding verification failed, but continuing...');
                }
            } catch (verifyError) {
                console.error('[Sidecar AI] Encoding verification error:', verifyError);
                // Continue anyway - might still work
            }

            const storageTag = `<!-- sidecar-storage:${addon.id}:${encoded} -->`;

            // Ensure message.mes exists
            if (!message.mes) {
                message.mes = '';
            }

            // Append to message content if not already present (avoid duplicates)
            // We append to the 'mes' property which acts as the source of truth
            if (!message.mes.includes(`sidecar-storage:${addon.id}:`)) {
                message.mes += '\n' + storageTag;
                console.log(`[Sidecar AI] Saved result metadata for ${addon.name} (${result.length} chars)`);
                return true;
            } else {
                // Update existing storage tag
                const pattern = new RegExp(`<!-- sidecar-storage:${addon.id}:[^>]+ -->`, 'g');
                message.mes = message.mes.replace(pattern, storageTag);
                console.log(`[Sidecar AI] Updated result metadata for ${addon.name}`);
                return true;
            }
        } catch (error) {
            console.error(`[Sidecar AI] Error saving result metadata:`, error);
            console.error(`[Sidecar AI] Error details:`, {
                addonId: addon?.id,
                addonName: addon?.name,
                resultLength: result?.length,
                messageId: message?.uid || message?.id,
                errorMessage: error.message
            });

            // Try fallback: save to a simpler format
            try {
                if (message.mes) {
                    const fallbackTag = `<!-- sidecar-fallback:${addon.id}:${Date.now()} -->`;
                    message.mes += '\n' + fallbackTag;
                    console.warn(`[Sidecar AI] Saved fallback metadata tag for ${addon.name}`);
                }
            } catch (fallbackError) {
                console.error(`[Sidecar AI] Fallback save also failed:`, fallbackError);
            }

            return false;
        }
    }

    /**
     * Find message element by ID or other identifier
     * Specifically finds AI messages (not user messages)
     */
    findMessageElement(messageId) {
        // Try direct ID lookup
        let element = document.getElementById(messageId);
        if (element) {
            // Verify it's an AI message
            if (this.isAIMessageElement(element)) {
                return element;
            }
        }

        // Try data attribute
        element = document.querySelector(`[data-message-id="${messageId}"]`);
        if (element && this.isAIMessageElement(element)) {
            return element;
        }

        // Try finding by message index in chat
        if (this.context.chat && Array.isArray(this.context.chat)) {
            const messageIndex = this.context.chat.findIndex(msg =>
                (msg.uid === messageId || msg.id === messageId) && !msg.is_user
            );

            if (messageIndex !== -1) {
                // Try to find corresponding DOM element - specifically AI messages
                const messageElements = document.querySelectorAll('.mes, .message');
                for (let i = messageElements.length - 1; i >= 0; i--) {
                    if (this.isAIMessageElement(messageElements[i])) {
                        return messageElements[i];
                    }
                }
            }
        }

        // Fallback: get last AI message element (not user message)
        const messageElements = document.querySelectorAll('.mes, .message');
        for (let i = messageElements.length - 1; i >= 0; i--) {
            if (this.isAIMessageElement(messageElements[i])) {
                return messageElements[i];
            }
        }

        return null;
    }

    /**
     * Check if a DOM element is an AI message (not user message)
     */
    isAIMessageElement(element) {
        if (!element) return false;

        // Check for AI message classes (vanilla JS)
        if (element.classList.contains('assistant') ||
            element.classList.contains('mes_assistant') ||
            element.querySelector('.mes_assistant')) {
            return true;
        }

        // Check if it's NOT a user message
        if (element.classList.contains('user') ||
            element.classList.contains('mes_user') ||
            element.querySelector('.mes_user')) {
            return false;
        }

        // Check data attributes
        const isUser = element.getAttribute('data-is-user');
        if (isUser === 'true') {
            return false;
        }
        if (isUser === 'false') {
            return true;
        }

        // Check for role attribute
        const role = element.getAttribute('data-role');
        if (role === 'user' || role === 'assistant') {
            return role === 'assistant';
        }

        // Default: if we can't determine, assume it's AI (better to attach than miss)
        // But prefer elements that don't have user indicators
        return true;
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

    /**
     * Restore all blocks from saved metadata when chat loads
     * Scans chat log and restores UI blocks for all saved results
     */
    async restoreBlocksFromMetadata(addonManager) {
        try {
            console.log('[Sidecar AI] Restoring blocks from metadata...');

            const chatLog = this.context.chat || this.context.chatLog || this.context.currentChat || [];
            if (!Array.isArray(chatLog) || chatLog.length === 0) {
                console.log('[Sidecar AI] No chat log found, skipping restoration');
                return 0;
            }

            const allAddons = addonManager.getAllAddons();
            let restoredCount = 0;

            // Wait a bit for DOM to be ready
            await new Promise(resolve => setTimeout(resolve, 300));

            // Iterate through all messages in chat log (only AI messages)
            for (let i = 0; i < chatLog.length; i++) {
                const message = chatLog[i];
                if (!message || !message.mes || message.is_user) {
                    continue; // Skip user messages and empty messages
                }

                const messageId = this.getMessageId(message);

                // Check each add-on for saved results in this message
                for (const addon of allAddons) {
                    if (!addon.enabled) {
                        continue; // Skip disabled add-ons
                    }

                    // Look for storage tag for this add-on
                    const pattern = new RegExp(`<!-- sidecar-storage:${addon.id}:(.+?) -->`);
                    const match = message.mes.match(pattern);

                    if (match && match[1]) {
                        try {
                            // Decode the stored result
                            const decoded = decodeURIComponent(escape(atob(match[1])));

                            if (decoded && decoded.length > 0 && decoded.length < 100000) {
                                // Restore the block based on response location
                                if (addon.responseLocation === 'chatHistory') {
                                    // For chatHistory, check if result is already in the message content
                                    // The result might be embedded directly or as a comment
                                    const messageElement = this.findMessageElement(messageId) || this.findMessageElementByIndex(i);
                                    if (messageElement) {
                                        const contentArea = messageElement.querySelector('.mes_text') ||
                                            messageElement.querySelector('.message') ||
                                            messageElement;

                                        if (contentArea) {
                                            // Check if result is already displayed
                                            const resultTag = `<!-- addon-result:${addon.id} -->`;
                                            const hasResult = contentArea.innerHTML &&
                                                (contentArea.innerHTML.includes(resultTag) ||
                                                    contentArea.innerHTML.includes(decoded.substring(0, 50)));

                                            if (!hasResult) {
                                                // Restore the formatted result
                                                const formatted = this.formatResult(addon, decoded, message, false);
                                                this.injectIntoChatHistory(messageId, addon, formatted);
                                                restoredCount++;
                                                console.log(`[Sidecar AI] Restored chatHistory block for ${addon.name} in message ${messageId}`);
                                            }
                                        }
                                    }
                                } else {
                                    // For outsideChatlog, restore dropdown UI
                                    const messageElement = this.findMessageElement(messageId) || this.findMessageElementByIndex(i);
                                    if (messageElement) {
                                        // Check if block already exists
                                        const existingBlock = messageElement.querySelector(`.addon-section-${addon.id}`);
                                        if (!existingBlock) {
                                            // Restore the dropdown block
                                            const formatted = this.formatResult(addon, decoded, message, true);
                                            const success = this.injectIntoDropdown(addon, formatted, messageId);
                                            if (success) {
                                                restoredCount++;
                                                console.log(`[Sidecar AI] Restored dropdown block for ${addon.name} in message ${messageId}`);
                                            }
                                        }
                                    }
                                }
                            }
                        } catch (error) {
                            console.warn(`[Sidecar AI] Failed to restore block for ${addon.name} in message ${messageId}:`, error);
                        }
                    }
                }
            }

            console.log(`[Sidecar AI] Restored ${restoredCount} block(s) from metadata`);
            return restoredCount;
        } catch (error) {
            console.error('[Sidecar AI] Error restoring blocks from metadata:', error);
            return 0;
        }
    }

    /**
     * Get all results for a specific add-on from chat log
     * Returns array of result objects with metadata
     */
    getAllResultsForAddon(addonId) {
        const chatLog = this.context.chat || this.context.chatLog || this.context.currentChat || [];
        if (!Array.isArray(chatLog) || chatLog.length === 0) {
            return [];
        }

        const results = [];
        const pattern = new RegExp(`<!-- sidecar-storage:${addonId}:(.+?)(?::edited:(\\d+))? -->`);

        chatLog.forEach((message, index) => {
            if (!message || !message.mes || message.is_user) {
                return;
            }

            const match = message.mes.match(pattern);
            if (match && match[1]) {
                try {
                    const decoded = decodeURIComponent(escape(atob(match[1])));
                    const messageId = this.getMessageId(message);
                    const isEdited = match[2] !== undefined;
                    const editedAt = isEdited ? parseInt(match[2]) : null;

                    if (decoded && decoded.length > 0) {
                        results.push({
                            messageId: messageId,
                            messageIndex: index,
                            addonId: addonId,
                            content: decoded,
                            timestamp: message.send_date || message.timestamp || Date.now(),
                            edited: isEdited,
                            editedAt: editedAt,
                            messagePreview: (message.mes || '').substring(0, 100).replace(/<!--.*?-->/g, '').trim()
                        });
                    }
                } catch (error) {
                    console.warn(`[Sidecar AI] Failed to decode result for message ${index}:`, error);
                }
            }
        });

        // Sort by timestamp (newest first)
        results.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        return results;
    }

    /**
     * Get all results for all add-ons (for history viewer)
     */
    getAllResults() {
        // This would need access to addonManager, so we'll implement it differently
        // For now, return empty - will be called from settings UI with addonManager
        return [];
    }

    /**
     * Delete a specific result from metadata
     */
    deleteResultFromMetadata(message, addonId) {
        if (!message || !message.mes) {
            return false;
        }

        try {
            const pattern = new RegExp(`<!-- sidecar-storage:${addonId}:[^>]+ -->`, 'g');
            const beforeLength = message.mes.length;
            message.mes = message.mes.replace(pattern, '');

            if (message.mes.length < beforeLength) {
                console.log(`[Sidecar AI] Deleted result metadata for addon ${addonId}`);
                return true;
            }
            return false;
        } catch (error) {
            console.error(`[Sidecar AI] Error deleting result metadata:`, error);
            return false;
        }
    }

    /**
     * Find message element by index in chat log
     * Matches AI messages in DOM to AI messages in chat log by position
     */
    findMessageElementByIndex(chatLogIndex) {
        const chatLog = this.context.chat || this.context.chatLog || this.context.currentChat || [];
        if (chatLogIndex < 0 || chatLogIndex >= chatLog.length) {
            return null;
        }

        // Count AI messages up to this index
        let aiMessageCount = 0;
        for (let i = 0; i <= chatLogIndex; i++) {
            const msg = chatLog[i];
            if (msg && !msg.is_user && msg.mes) {
                if (i === chatLogIndex) {
                    // This is the message we're looking for
                    // Now find the corresponding DOM element
                    const messageElements = document.querySelectorAll('.mes, .message');
                    let currentAiIndex = 0;
                    for (let j = 0; j < messageElements.length; j++) {
                        if (this.isAIMessageElement(messageElements[j])) {
                            if (currentAiIndex === aiMessageCount) {
                                return messageElements[j];
                            }
                            currentAiIndex++;
                        }
                    }
                    break;
                }
                aiMessageCount++;
            }
        }

        return null;
    }
}
