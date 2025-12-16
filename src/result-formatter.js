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
        // CRITICAL: Sanitize AI response before any processing
        let sanitized = this.sanitizeContent(aiResponse);
        let formatted = sanitized;

        // If injecting into dropdown, we already have the structure, so don't wrap
        if (forDropdown) {
            // Clean up any existing wrapper tags that might conflict
            formatted = this.cleanResponseForDropdown(sanitized);
            return formatted;
        }

        // Apply result format for chat history injection
        switch (addon.resultFormat) {
            case 'append':
                formatted = this.formatAppend(sanitized);
                break;

            case 'separate':
                formatted = this.formatSeparate(sanitized, addon);
                break;

            case 'collapsible':
            default:
                formatted = this.formatCollapsible(sanitized, addon);
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
     * Sanitize AI-generated content to prevent container escape
     * 
     * SillyTavern handles Markdown/HTML/XML/CSS natively, but we need to
     * sanitize dangerous patterns that could break out of our isolated containers.
     * 
     * Security measures:
     * - Strip position: fixed/absolute (prevents escaping container bounds)
     * - Remove z-index (prevents stacking context issues)
     * - Block iframe/embed/object (prevents external content injection)
     * - Remove script tags (prevents JS execution)
     * - Strip style blocks (prevents global CSS injection)
     * - Remove event handlers (prevents inline JS)
     * - Neutralize javascript: protocols
     */
    sanitizeContent(response) {
        if (typeof response !== 'string') {
            return response;
        }

        let sanitized = response.trim();

        // Remove markdown code fences that wrap the entire response
        // Matches: ```html\n<content>\n``` or ```\n<content>\n```
        const codeFenceMatch = sanitized.match(/^```(?:html|css|xml|markdown)?\s*\n([\s\S]*)\n```\s*$/);
        if (codeFenceMatch) {
            sanitized = codeFenceMatch[1].trim();
        }

        // Also handle single-line code fence wrapping (less common)
        sanitized = sanitized.replace(/^```(?:html|css|xml|markdown)?\s*/g, '');
        sanitized = sanitized.replace(/\s*```$/g, '');

        // Remove dangerous position styles that could escape container
        sanitized = sanitized.replace(/position\s*:\s*(fixed|absolute)/gi, 'position: relative');

        // Remove z-index that could create stacking issues
        sanitized = sanitized.replace(/z-index\s*:\s*[^;]+;?/gi, '');

        // Remove viewport units that could cause overflow
        sanitized = sanitized.replace(/\b\d+v[wh]\b/gi, '100%');

        // Block iframe/embed/object tags
        sanitized = sanitized.replace(/<(iframe|embed|object)[^>]*>.*?<\/\1>/gis, '');
        sanitized = sanitized.replace(/<(iframe|embed|object)[^>]*\/>/gi, '');

        // Remove script tags (should never happen but just in case)
        sanitized = sanitized.replace(/<script[^>]*>.*?<\/script>/gis, '');
        sanitized = sanitized.replace(/<script[^>]*\/>/gi, '');

        // Remove style tags that could affect global styles
        // Keep inline styles but remove style blocks
        sanitized = sanitized.replace(/<style[^>]*>.*?<\/style>/gis, '');

        // Remove link tags that could load external stylesheets
        sanitized = sanitized.replace(/<link[^>]*rel\s*=\s*["']stylesheet["'][^>]*>/gi, '');

        // Remove event handlers
        sanitized = sanitized.replace(/\son\w+\s*=\s*["'][^"']*["']/gi, '');

        // Remove javascript: protocol in links
        sanitized = sanitized.replace(/href\s*=\s*["']javascript:/gi, 'href="#');

        // Fix WCAG contrast issues in HTML+CSS content
        sanitized = this.fixWCAGContrast(sanitized);

        return sanitized;
    }

    /**
     * Fix WCAG contrast issues by replacing low-contrast color combinations
     * Aggressively detects and fixes white-on-white and other bad combinations
     */
    fixWCAGContrast(html) {
        if (!html || typeof html !== 'string') {
            return html;
        }

        let fixed = html;

        // Helper function to get brightness from hex color
        const getBrightness = (hex) => {
            if (!hex) return 0;
            // Remove # if present
            hex = hex.replace('#', '');
            // Convert 3-digit to 6-digit
            if (hex.length === 3) {
                hex = hex.split('').map(c => c + c).join('');
            }
            const r = parseInt(hex.substring(0, 2), 16);
            const g = parseInt(hex.substring(2, 4), 16);
            const b = parseInt(hex.substring(4, 6), 16);
            return (r + g + b) / 3;
        };

        // Helper function to check if color is white/very light
        const isWhiteOrVeryLight = (colorStr) => {
            if (!colorStr) return false;
            const normalized = colorStr.toLowerCase().trim();
            // Check for white keywords
            if (normalized === 'white' || normalized === '#fff' || normalized === '#ffffff') {
                return true;
            }
            // Check for rgb(255,255,255) or rgba(255,255,255,...)
            if (/rgba?\(\s*255\s*,\s*255\s*,\s*255/i.test(colorStr)) {
                return true;
            }
            // Check hex brightness
            const hexMatch = colorStr.match(/#([a-fA-F0-9]{3}|[a-fA-F0-9]{6})/);
            if (hexMatch) {
                const brightness = getBrightness(hexMatch[0]);
                return brightness > 240; // Very light (almost white)
            }
            return false;
        };

        // Helper function to check if color is dark
        const isDark = (colorStr) => {
            if (!colorStr) return false;
            const hexMatch = colorStr.match(/#([a-fA-F0-9]{3}|[a-fA-F0-9]{6})/);
            if (hexMatch) {
                const brightness = getBrightness(hexMatch[0]);
                return brightness < 85;
            }
            // Check for black keywords
            const normalized = colorStr.toLowerCase().trim();
            if (normalized === 'black' || normalized === '#000' || normalized === '#000000') {
                return true;
            }
            return false;
        };

        // Helper function to check if background is light
        const isLightBackground = (bgStr) => {
            if (!bgStr) return false;
            const normalized = bgStr.toLowerCase().trim();
            // Check for white/light keywords
            if (normalized === 'white' || normalized === '#fff' || normalized === '#ffffff' ||
                normalized === '#f5f5f5' || normalized === '#f0f0f0' || normalized === '#e8e8e8' ||
                normalized === '#e3f2fd' || normalized === '#fff3cd') {
                return true;
            }
            // Check for rgb/rgba with high values
            const rgbMatch = bgStr.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
            if (rgbMatch) {
                const r = parseInt(rgbMatch[1]);
                const g = parseInt(rgbMatch[2]);
                const b = parseInt(rgbMatch[3]);
                const brightness = (r + g + b) / 3;
                return brightness > 200; // Light background
            }
            // Check hex brightness
            const hexMatch = bgStr.match(/#([a-fA-F0-9]{3}|[a-fA-F0-9]{6})/);
            if (hexMatch) {
                const brightness = getBrightness(hexMatch[0]);
                return brightness > 200; // Light background
            }
            return false;
        };

        // CRITICAL FIX: Detect and fix white text on white/light backgrounds in style attributes
        fixed = fixed.replace(/style\s*=\s*["']([^"']*)["']/gi, (match, styles) => {
            let newStyles = styles;
            let modified = false;

            // Extract background color
            const bgMatch = styles.match(/background(?:-color)?\s*:\s*([^;]+)/i);
            const bgColor = bgMatch ? bgMatch[1].trim() : null;

            // Extract text color
            const colorMatch = styles.match(/color\s*:\s*([^;]+)/i);
            const textColor = colorMatch ? colorMatch[1].trim() : null;

            // Check if background is light
            const hasLightBg = bgColor ? isLightBackground(bgColor) : false;

            // Check if text is white/light
            const hasWhiteText = textColor ? isWhiteOrVeryLight(textColor) : false;

            // CRITICAL: If white text on light background, FORCE dark text
            if (hasLightBg && hasWhiteText) {
                newStyles = newStyles.replace(/color\s*:\s*[^;]+/gi, 'color: #000000 !important');
                modified = true;
                console.warn('[Sidecar AI] Fixed white-on-white: Changed white text to black on light background');
            }
            // If light background but no color specified, add dark color
            else if (hasLightBg && !textColor) {
                newStyles = newStyles + '; color: #000000 !important';
                modified = true;
            }
            // If light background but light text (not white), force dark
            else if (hasLightBg && textColor) {
                const hexMatch = textColor.match(/#([a-fA-F0-9]{3}|[a-fA-F0-9]{6})/);
                if (hexMatch) {
                    const brightness = getBrightness(hexMatch[0]);
                    if (brightness > 170) {
                        newStyles = newStyles.replace(/color\s*:\s*[^;]+/gi, 'color: #000000 !important');
                        modified = true;
                    }
                }
            }

            // Check if background is dark
            const hasDarkBg = bgColor ? isDark(bgColor) : false;
            // If dark background but dark text, force light
            if (hasDarkBg && textColor) {
                const hexMatch = textColor.match(/#([a-fA-F0-9]{3}|[a-fA-F0-9]{6})/);
                if (hexMatch) {
                    const brightness = getBrightness(hexMatch[0]);
                    if (brightness < 85) {
                        newStyles = newStyles.replace(/color\s*:\s*[^;]+/gi, 'color: #ffffff !important');
                        modified = true;
                    }
                }
            }

            return modified ? match.replace(styles, newStyles) : match;
        });

        // Fix 1: Replace white/light text colors that might be on light backgrounds
        fixed = fixed.replace(/color\s*:\s*(white|#fff|#ffffff|rgb\(\s*255\s*,\s*255\s*,\s*255\s*\))/gi, (match) => {
            // Check context - if we're in a style with light background, this will be caught above
            // But also fix standalone white colors that might be problematic
            return 'color: #000000'; // Default to black, will be overridden if background is dark
        });

        // Fix 2: Replace rgba/rgb with low opacity or light colors
        fixed = fixed.replace(/color\s*:\s*rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)/gi, (match, r, g, b, a) => {
            const brightness = (parseInt(r) + parseInt(g) + parseInt(b)) / 3;
            const opacity = a ? parseFloat(a) : 1.0;

            // If opacity is low or color is light, use solid dark
            if (opacity < 0.6 || brightness > 170) {
                return 'color: #000000';
            } else if (brightness < 85) {
                return 'color: #ffffff';
            }
            return match;
        });

        // Fix 3: Common low-contrast color names and values
        const lowContrastColors = {
            'white': '#000000',
            '#fff': '#000000',
            '#ffffff': '#000000',
            '#aaa': '#000000',
            '#bbb': '#000000',
            '#ccc': '#000000',
            '#ddd': '#000000',
            '#eee': '#000000',
            '#f0f0f0': '#000000',
            '#f5f5f5': '#000000',
            '#e8e8e8': '#000000',
            '#444': '#ffffff',
            '#555': '#ffffff',
            '#666': '#ffffff',
            '#777': '#ffffff',
        };

        for (const [badColor, goodColor] of Object.entries(lowContrastColors)) {
            fixed = fixed.replace(new RegExp(`color\\s*:\\s*${badColor.replace('#', '\\#')}\\b`, 'gi'), `color: ${goodColor}`);
        }

        return fixed;
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

        // Get or create Sidecar container for this message - check for ANY existing container first
        let sidecarContainer = messageElement.querySelector('.sidecar-container');

        if (!sidecarContainer) {
            sidecarContainer = document.createElement('div');
            sidecarContainer.className = `sidecar-container sidecar-container-${elementId}`;

            // Insert after message content (inside the AI message container)
            const messageContent = messageElement.querySelector('.mes_text') ||
                messageElement.querySelector('.message') ||
                messageElement;
            if (messageContent.nextSibling) {
                messageContent.parentElement.insertBefore(sidecarContainer, messageContent.nextSibling);
            } else {
                messageElement.appendChild(sidecarContainer);
            }

            // Mark as recently restored to protect from cleanup
            this.markContainerAsRestored(sidecarContainer);
        } else if (sidecarContainer.style.display === 'none') {
            // If container exists but is hidden (e.g. from previous swipe), show it
            sidecarContainer.style.display = '';
            this.markContainerAsRestored(sidecarContainer);
        }

        // Check if loading indicator already exists for this addon - avoid duplicates
        let loadingDiv = sidecarContainer.querySelector(`.sidecar-loading-${addon.id}`);
        if (!loadingDiv) {
            loadingDiv = document.createElement('div');
            loadingDiv.className = `sidecar-loading sidecar-loading-${addon.id}`;
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
    showErrorIndicator(messageId, addon, error) {
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

            // Get or create container - check for ANY existing container first
            let sidecarContainer = messageElement.querySelector('.sidecar-container');
            if (!sidecarContainer) {
                sidecarContainer = document.createElement('div');
                sidecarContainer.className = `sidecar-container sidecar-container-${elementId}`;

                const messageContent = messageElement.querySelector('.mes_text') || messageElement;
                if (messageContent.nextSibling) {
                    messageContent.parentElement.insertBefore(sidecarContainer, messageContent.nextSibling);
                } else {
                    messageElement.appendChild(sidecarContainer);
                }

                // Mark as recently restored to protect from cleanup
                this.markContainerAsRestored(sidecarContainer);
            }

            // Check if error indicator already exists for this addon - remove old one
            const existingError = sidecarContainer.querySelector(`.sidecar-error-${addon.id}`);
            if (existingError) {
                existingError.remove();
            }

            const errorDiv = document.createElement('div');
            errorDiv.className = `sidecar-error sidecar-error-${addon.id}`;

            const errorMsg = document.createElement('div');
            // Escape error message to prevent HTML injection
            const safeErrorMsg = String(error.message || error)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
            const safeAddonName = String(addon.name)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
            errorMsg.innerHTML = `<i class="fa-solid fa-exclamation-triangle"></i> Error processing ${safeAddonName}: ${safeErrorMsg}`;
            errorDiv.appendChild(errorMsg);

            const retryBtn = document.createElement('button');
            retryBtn.className = 'menu_button';
            retryBtn.innerHTML = '<i class="fa-solid fa-redo"></i> Retry';

            retryBtn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                // Call global retry handler
                if (window.addOnsExtension && window.addOnsExtension.retryAddon) {
                    // Remove error first
                    errorDiv.remove();
                    // Trigger retry
                    window.addOnsExtension.retryAddon(addon.id, elementId);
                }
            };

            errorDiv.appendChild(retryBtn);

            sidecarContainer.appendChild(errorDiv);
        } catch (err) {
            console.error(`[Sidecar AI] Error showing error indicator:`, err);
        }
    }

    /**
     * Inject result into dropdown UI (inside chat, after message)
     */
    injectIntoDropdown(addon, formattedResult, messageId = null, existingElement = null) {
        try {
            // Use provided messageId or get from latest message
            if (!messageId) {
                messageId = this.getMessageId(null);
            }

            // Use provided element or find it
            const messageElement = existingElement || this.findMessageElement(messageId);

            if (!messageElement) {
                console.warn(`[Sidecar AI] Message element not found for dropdown injection (ID: ${messageId})`);
                return false;
            }

            // Get or create Sidecar container for this message - check BOTH class patterns
            let sidecarContainer = messageElement.querySelector(`.sidecar-container-${messageId}`) ||
                messageElement.querySelector('.sidecar-container');

            if (!sidecarContainer) {
                sidecarContainer = document.createElement('div');
                sidecarContainer.className = `sidecar-container sidecar-container-${messageId}`;

                // Insert after message content
                const messageContent = messageElement.querySelector('.mes_text') ||
                    messageElement.querySelector('.message') ||
                    messageElement;
                if (messageContent.nextSibling) {
                    messageContent.parentElement.insertBefore(sidecarContainer, messageContent.nextSibling);
                } else {
                    messageElement.appendChild(sidecarContainer);
                }

                // Mark as recently restored to protect from cleanup
                this.markContainerAsRestored(sidecarContainer);
            } else {
                // Also mark existing containers as restored when updating
                if (sidecarContainer.style.display === 'none') {
                    sidecarContainer.style.display = '';
                }
                this.markContainerAsRestored(sidecarContainer);
            }

            // Check if addon section already exists - if so, just update it
            let addonSection = sidecarContainer.querySelector(`.addon_section-${addon.id}`);

            if (!addonSection) {
                addonSection = document.createElement('details');
                addonSection.className = `addon_result_section addon_section-${addon.id}`;
                addonSection.open = true;

                const summary = document.createElement('summary');
                summary.className = 'addon_result_summary';

                // Add title
                const titleSpan = document.createElement('span');
                titleSpan.textContent = addon.name;
                summary.appendChild(titleSpan);

                // Add actions container to summary
                const actionsDiv = document.createElement('div');
                actionsDiv.className = 'addon_result_actions';

                // Edit button
                const editBtn = document.createElement('button');
                editBtn.innerHTML = '<i class="fa-solid fa-edit"></i>';
                editBtn.className = 'menu_button';
                editBtn.title = 'Edit Result';

                editBtn.onclick = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.toggleEditMode(addon, messageId);
                };

                // Copy button
                const copyBtn = document.createElement('button');
                copyBtn.innerHTML = '<i class="fa-solid fa-copy"></i>';
                copyBtn.className = 'menu_button';
                copyBtn.title = 'Copy Result';

                copyBtn.onclick = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    // Get raw content (not HTML)
                    // We need to retrieve it from metadata or extract text
                    const content = document.getElementById(`addon-content-${addon.id}`).innerText;
                    navigator.clipboard.writeText(content).then(() => {
                        copyBtn.innerHTML = '<i class="fa-solid fa-check"></i>';
                        setTimeout(() => copyBtn.innerHTML = '<i class="fa-solid fa-copy"></i>', 1000);
                    });
                };

                actionsDiv.appendChild(editBtn);
                actionsDiv.appendChild(copyBtn);
                summary.appendChild(actionsDiv);

                const content = document.createElement('div');
                content.className = 'addon_result_content';
                content.id = `addon-content-${addon.id}`;

                addonSection.appendChild(summary);
                addonSection.appendChild(content);
                sidecarContainer.appendChild(addonSection);
            }

            // Update content
            const content = addonSection.querySelector('.addon_result_content');
            if (content) {
                // Clear existing content and add new result
                content.innerHTML = '';

                // Append new result
                const resultDiv = document.createElement('div');
                resultDiv.className = 'addon_result_item';
                resultDiv.innerHTML = formattedResult;

                // Store raw content for editing
                resultDiv.setAttribute('data-raw-content', formattedResult); // Note: this stores formatted HTML, we might want raw markdown

                const timestamp = document.createElement('div');
                timestamp.className = 'addon_result_timestamp';
                timestamp.textContent = `Generated at ${new Date().toLocaleTimeString()}`;

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
     * Toggle edit mode for a result in dropdown
     */
    toggleEditMode(addon, messageId) {
        const messageElement = this.findMessageElement(messageId);
        if (!messageElement) return;

        const contentDiv = messageElement.querySelector(`#addon-content-${addon.id}`);
        if (!contentDiv) return;

        const resultItem = contentDiv.querySelector('.addon_result_item');
        if (!resultItem) return;

        // Retrieve content from metadata
        let currentContent = '';

        // Get message object
        const message = this.findMessageObject(messageId);

        if (message?.extra?.sidecarResults?.[addon.id]) {
            currentContent = message.extra.sidecarResults[addon.id].result;
        } else {
            // Fallback to displayed text if metadata not found
            currentContent = resultItem.innerText;
        }

        // Create edit interface
        const editContainer = document.createElement('div');
        editContainer.className = 'addon-edit-container';
        editContainer.style.display = 'flex';
        editContainer.style.flexDirection = 'column';
        editContainer.style.gap = '8px';

        const textarea = document.createElement('textarea');
        textarea.className = 'text_pole';
        textarea.value = currentContent;
        textarea.style.width = '100%';
        textarea.style.minHeight = '150px';
        textarea.style.resize = 'vertical';

        const controls = document.createElement('div');
        controls.style.display = 'flex';
        controls.style.gap = '10px';
        controls.style.justifyContent = 'flex-end';

        const saveBtn = document.createElement('button');
        saveBtn.className = 'menu_button';
        saveBtn.innerHTML = '<i class="fa-solid fa-save"></i> Save';

        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'menu_button';
        cancelBtn.innerHTML = '<i class="fa-solid fa-times"></i> Cancel';

        controls.appendChild(cancelBtn);
        controls.appendChild(saveBtn);

        editContainer.appendChild(textarea);
        editContainer.appendChild(controls);

        // Swap content
        const originalDisplay = contentDiv.innerHTML;
        contentDiv.innerHTML = '';
        contentDiv.appendChild(editContainer);

        // Handlers
        cancelBtn.onclick = () => {
            contentDiv.innerHTML = originalDisplay;
        };

        saveBtn.onclick = () => {
            const newContent = textarea.value;

            // Show loading
            saveBtn.disabled = true;
            saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';

            // Update metadata
            if (message) {
                this.updateResultInMetadata(message, addon.id, newContent, addon);

                // Save chat
                if (this.context.saveChat) {
                    this.context.saveChat();
                } else if (this.context.saveSettingsDebounced) {
                    this.context.saveSettingsDebounced();
                }
            }

            // Update UI
            // Format the new content
            const formatted = this.formatResult(addon, newContent, message, true);

            // Re-render
            contentDiv.innerHTML = '';
            const newResultItem = document.createElement('div');
            newResultItem.className = 'addon_result_item';
            newResultItem.innerHTML = formatted;

            const timestamp = document.createElement('div');
            timestamp.className = 'addon_result_timestamp';
            timestamp.textContent = `Edited at ${new Date().toLocaleTimeString()}`;

            newResultItem.appendChild(timestamp);
            contentDiv.appendChild(newResultItem);
        };
    }

    /**
     * Find message object from chat log
     */
    findMessageObject(messageId) {
        if (!messageId) return null;

        const chatLog = this.context.chat || this.context.chatLog || this.context.currentChat || [];
        if (!Array.isArray(chatLog)) return null;

        // Try find by UID/ID/mesId with loose equality to handle string/number differences
        let message = chatLog.find(msg =>
            (msg.uid == messageId) ||
            (msg.id == messageId) ||
            (msg.mesId == messageId)
        );

        return message;
    }

    /**
     * Save result to message.extra metadata (SillyTavern's clean metadata field)
     * This keeps results out of message.mes, preventing context pollution
     */
    saveResultToMetadata(message, addon, result) {
        if (!message || !addon || !result) {
            console.warn('[Sidecar AI] Cannot save metadata: missing required parameters');
            return false;
        }

        try {
            // Get current swipe_id to store result per variant
            const swipeId = message.swipe_id ?? 0;

            // Initialize swipe_info if needed (for compatibility with SillyTavern's swipe system)
            if (!Array.isArray(message.swipe_info)) {
                message.swipe_info = [];
            }

            // Initialize swipe_info[swipeId] if needed
            if (!message.swipe_info[swipeId]) {
                message.swipe_info[swipeId] = {
                    send_date: message.send_date,
                    gen_started: message.gen_started,
                    gen_finished: message.gen_finished,
                    extra: {}
                };
            }

            // Initialize extra for this swipe variant
            if (!message.swipe_info[swipeId].extra) {
                message.swipe_info[swipeId].extra = {};
            }

            // Initialize sidecar results storage for this swipe variant
            if (!message.swipe_info[swipeId].extra.sidecarResults) {
                message.swipe_info[swipeId].extra.sidecarResults = {};
            }

            // Store result with timestamp and metadata IN THE CURRENT SWIPE VARIANT
            message.swipe_info[swipeId].extra.sidecarResults[addon.id] = {
                result: result,
                addonName: addon.name,
                timestamp: Date.now(),
                formatStyle: addon.formatStyle || 'html-css'
            };

            // Also update message.extra for backward compatibility and immediate access
            if (!message.extra) {
                message.extra = {};
            }
            if (!message.extra.sidecarResults) {
                message.extra.sidecarResults = {};
            }
            message.extra.sidecarResults[addon.id] = message.swipe_info[swipeId].extra.sidecarResults[addon.id];

            console.log(`[Sidecar AI] Saved result for ${addon.name} in swipe variant ${swipeId} (${result.length} chars)`);
            return true;
        } catch (error) {
            console.error(`[Sidecar AI] Error saving result metadata:`, error);
            console.error(`[Sidecar AI] Error details:`, {
                addonId: addon?.id,
                addonName: addon?.name,
                resultLength: result?.length,
                messageId: message?.uid || message?.id,
                swipeId: message?.swipe_id,
                errorMessage: error.message
            });
            return false;
        }
    }

    /**
     * Get all results for a specific add-on from chat history
     * Reads from message.extra.sidecarResults
     */
    getAllResultsForAddon(addonId) {
        const results = [];
        const chatLog = this.context.chat || this.context.chatLog || this.context.currentChat || [];

        if (!Array.isArray(chatLog)) {
            return results;
        }

        // Iterate through chat log to find saved results
        chatLog.forEach((msg, index) => {
            if (msg?.extra?.sidecarResults?.[addonId]) {
                const stored = msg.extra.sidecarResults[addonId];
                results.push({
                    content: stored.result,
                    timestamp: stored.timestamp || msg.send_date || Date.now(),
                    messageId: this.getMessageId(msg),
                    messageIndex: index,
                    messagePreview: (msg.mes || '').substring(0, 50).replace(/<[^>]+>/g, '') + '...',
                    edited: stored.edited || false,
                    addonId: addonId
                });
            }
        });

        // Sort by timestamp (newest first)
        return results.sort((a, b) => b.timestamp - a.timestamp);
    }

    /**
     * Delete result from metadata (message.extra)
     */
    deleteResultFromMetadata(message, addonId) {
        if (!message || !addonId) {
            return false;
        }

        if (message.extra?.sidecarResults?.[addonId]) {
            delete message.extra.sidecarResults[addonId];
            console.log(`[Sidecar AI] Deleted result from message.extra`);

            // Update DOM if possible
            const messageId = this.getMessageId(message);
            const messageElement = this.findMessageElement(messageId);
            if (messageElement) {
                const section = messageElement.querySelector(`.addon_section-${addonId}`);
                if (section) {
                    section.remove();
                }
            }

            return true;
        }

        return false;
    }

    /**
     * Update result in metadata and content
     */
    updateResultInMetadata(message, addonId, newContent, addon) {
        if (!message || !addonId || !newContent) {
            return false;
        }

        try {
            // Get current swipe_id
            const swipeId = message.swipe_id ?? 0;

            // Initialize swipe_info if needed
            if (!Array.isArray(message.swipe_info)) {
                message.swipe_info = [];
            }
            if (!message.swipe_info[swipeId]) {
                message.swipe_info[swipeId] = {
                    send_date: message.send_date,
                    gen_started: message.gen_started,
                    gen_finished: message.gen_finished,
                    extra: {}
                };
            }
            if (!message.swipe_info[swipeId].extra) {
                message.swipe_info[swipeId].extra = {};
            }
            if (!message.swipe_info[swipeId].extra.sidecarResults) {
                message.swipe_info[swipeId].extra.sidecarResults = {};
            }

            // Update in current swipe variant
            message.swipe_info[swipeId].extra.sidecarResults[addonId] = {
                result: newContent,
                addonName: addon?.name || 'Unknown',
                timestamp: Date.now(),
                formatStyle: addon?.formatStyle || 'html-css',
                edited: true
            };

            // Also update message.extra for backward compatibility
            if (!message.extra) {
                message.extra = {};
            }
            if (!message.extra.sidecarResults) {
                message.extra.sidecarResults = {};
            }
            message.extra.sidecarResults[addonId] = message.swipe_info[swipeId].extra.sidecarResults[addonId];

            console.log(`[Sidecar AI] Updated result for addon ${addonId} in swipe variant ${swipeId}`);
        } catch (e) {
            console.error('[Sidecar AI] Error updating metadata:', e);
            return false;
        }

        // 2. Update visible result (if chatHistory mode)
        // If outsideChatlog, the DOM update is handled by the UI, but we ensure metadata matches
        if (addon && addon.responseLocation === 'chatHistory') {
            const formatted = this.formatResult(addon, newContent, message, false);
            const resultTagStart = `<!-- addon-result:${addonId} -->`;
            const resultTagEnd = `<!-- /addon-result:${addonId} -->`;
            const resultPattern = new RegExp(`${resultTagStart}[\\s\\S]*?${resultTagEnd}`);

            const newResultBlock = `${resultTagStart}${formatted}${resultTagEnd}`;

            if (message.mes.match(resultPattern)) {
                message.mes = message.mes.replace(resultPattern, newResultBlock);
            } else {
                message.mes += newResultBlock;
            }
        }

        return true;
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
     * Check if a message element is currently visible in the viewport
     * Handles various ways SillyTavern might hide/show messages during swipe
     */
    isMessageVisible(messageElement) {
        if (!messageElement) return false;

        // Check if element exists in DOM
        if (!document.contains(messageElement)) return false;

        // Check computed style for visibility
        const style = window.getComputedStyle(messageElement);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
            return false;
        }

        // Check if element is positioned off-screen (common in swipe implementations)
        const rect = messageElement.getBoundingClientRect();
        const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight;

        // If element is completely outside viewport, it's not visible
        if (rect.right < 0 || rect.left > viewportWidth || rect.bottom < 0 || rect.top > viewportHeight) {
            return false;
        }

        // Check if element has very large transform (moved off-screen)
        const transform = style.transform;
        if (transform && transform !== 'none') {
            const matrix = new DOMMatrix(transform);
            // If translated far off-screen (more than viewport width), consider hidden
            if (Math.abs(matrix.e) > viewportWidth * 2 || Math.abs(matrix.f) > viewportHeight * 2) {
                return false;
            }
        }

        // Check if parent containers are visible
        let parent = messageElement.parentElement;
        while (parent && parent !== document.body) {
            const parentStyle = window.getComputedStyle(parent);
            if (parentStyle.display === 'none' || parentStyle.visibility === 'hidden') {
                return false;
            }

            // Check if parent is off-screen too
            const parentRect = parent.getBoundingClientRect();
            if (parentRect.right < -100 || parentRect.left > viewportWidth + 100) {
                return false;
            }

            parent = parent.parentElement;
        }

        // Check for SillyTavern-specific classes that might indicate hidden state
        // Some implementations use classes like 'hidden', 'inactive', 'swiped-away', etc.
        const hiddenClasses = ['hidden', 'inactive', 'swiped-away', 'swipe-hidden', 'off-screen'];
        if (hiddenClasses.some(cls => messageElement.classList.contains(cls))) {
            return false;
        }

        return true;
    }

    /**
     * Get the currently active/visible message ID
     * In swipe mode, this should be the message currently in viewport
     */
    getActiveMessageId() {
        try {
            // Try to find message in viewport center
            const viewportCenter = window.innerHeight / 2;
            const messages = document.querySelectorAll('[id^="mes_"], [data-message-id]');

            let activeMessage = null;
            let minDistance = Infinity;

            messages.forEach(msg => {
                const rect = msg.getBoundingClientRect();
                // Check if message is in viewport
                if (rect.top <= viewportCenter && rect.bottom >= viewportCenter) {
                    const distance = Math.abs(rect.top + rect.height / 2 - viewportCenter);
                    if (distance < minDistance) {
                        minDistance = distance;
                        activeMessage = msg;
                    }
                }
            });

            if (activeMessage) {
                return activeMessage.id || activeMessage.getAttribute('data-message-id');
            }

            // Fallback: find message closest to viewport top
            let closestToTop = null;
            let closestTop = Infinity;
            messages.forEach(msg => {
                const rect = msg.getBoundingClientRect();
                if (rect.top >= 0 && rect.top < closestTop) {
                    closestTop = rect.top;
                    closestToTop = msg;
                }
            });

            if (closestToTop) {
                return closestToTop.id || closestToTop.getAttribute('data-message-id');
            }

            return null;
        } catch (error) {
            console.error('[Sidecar AI] Error getting active message ID:', error);
            return null;
        }
    }

    /**
     * Clean up orphaned sidecar containers (containers without a parent message element)
     * This is a minimal cleanup that only removes truly orphaned containers.
     * We no longer clean up based on visibility since swipe navigation is handled by events.
     */
    cleanupHiddenSidecarCards() {
        try {
            // Find all sidecar containers
            const allContainers = document.querySelectorAll('.sidecar-container');
            let cleanedCount = 0;

            allContainers.forEach(container => {
                // Find the parent message element
                let messageElement = container.closest('[id^="mes_"], [data-message-id]');

                // If not found, try to find by traversing up
                if (!messageElement) {
                    let parent = container.parentElement;
                    while (parent && parent !== document.body) {
                        if (parent.id && parent.id.startsWith('mes_')) {
                            messageElement = parent;
                            break;
                        }
                        if (parent.getAttribute('data-message-id')) {
                            messageElement = parent;
                            break;
                        }
                        parent = parent.parentElement;
                    }
                }

                // Only remove if we can't find the message element (truly orphaned)
                if (!messageElement) {
                    container.remove();
                    cleanedCount++;
                    console.log(`[Sidecar AI] Cleaned up orphaned sidecar container`);
                }
            });

            if (cleanedCount > 0) {
                console.log(`[Sidecar AI] Cleaned up ${cleanedCount} orphaned sidecar container(s)`);
            }

            return cleanedCount;
        } catch (error) {
            console.error('[Sidecar AI] Error cleaning up orphaned sidecar cards:', error);
            return 0;
        }
    }

    /**
     * Mark a container as recently restored (protect from cleanup)
     */
    markContainerAsRestored(container) {
        if (!this._restoredContainers) {
            this._restoredContainers = new Map();
        }
        this._restoredContainers.set(container, Date.now());
    }

    /**
     * Hide all sidecar cards
     * Used when swiping to a new message or when generation starts
     */
    hideAllSidecarCards() {
        try {
            const allContainers = document.querySelectorAll('.sidecar-container');
            let hiddenCount = 0;
            allContainers.forEach(container => {
                // Use display: none instead of remove() so we can restore later
                if (container.style.display !== 'none') {
                    container.style.display = 'none';
                    hiddenCount++;
                }
            });
            if (hiddenCount > 0) {
                console.log(`[Sidecar AI] Hid ${hiddenCount} sidecar container(s)`);
            }
            return hiddenCount;
        } catch (error) {
            console.error('[Sidecar AI] Error hiding all sidecar cards:', error);
            return 0;
        }
    }

    /**
     * Handle swipe variant change: hide current sidecars, restore sidecars for the new variant
     * @param {number} messageIndex - The message index that was swiped
     * @param {Object} addonManager - Addon manager to get enabled addons
     */
    /**
     * Handle swipe variant change: Clear container and render sidecars for the new variant
     * @param {number} messageIndex - The message index that was swiped
     * @param {Object} addonManager - Addon manager to get enabled addons
     */
    async handleSwipeVariantChange(messageIndex, addonManager) {
        try {
            console.log(`[Sidecar AI] Handling swipe variant change for message ${messageIndex}`);

            // Get the message from chat log
            const chatLog = this.context.chat || this.context.chatLog || this.context.currentChat || [];
            if (messageIndex < 0 || messageIndex >= chatLog.length) {
                return;
            }

            const message = chatLog[messageIndex];
            const messageId = this.getMessageId(message);
            const swipeId = message.swipe_id ?? 0;

            console.log(`[Sidecar AI] Message ${messageIndex} is now on swipe variant ${swipeId}`);

            // Find the message element
            const messageElement = this.findMessageElement(messageId) || this.findMessageElementByIndex(messageIndex);
            if (!messageElement) {
                return;
            }

            // Find the sidecar container
            const sidecarContainer = messageElement.querySelector('.sidecar-container');
            if (sidecarContainer) {
                // CLEAR the container contents completely
                // This removes any sidecars from the previous variant
                sidecarContainer.innerHTML = '';
                sidecarContainer.style.display = ''; // Ensure it's visible

                // If this is a new swipe (empty), we leave it empty.
                // If it's an existing swipe with stored results, we render them below.
            }

            // Check if this swipe variant has saved sidecars
            const hasStoredResults = message.swipe_info?.[swipeId]?.extra?.sidecarResults;

            if (hasStoredResults && Object.keys(hasStoredResults).length > 0) {
                console.log(`[Sidecar AI] Found ${Object.keys(hasStoredResults).length} stored sidecar(s) for variant ${swipeId}`);

                // Restore sidecars for this variant
                const allAddons = addonManager.getAllAddons();

                for (const addon of allAddons) {
                    if (!addon.enabled) continue;

                    const stored = hasStoredResults[addon.id];
                    if (!stored) continue;

                    if (addon.responseLocation === 'outsideChatlog') {
                        const formatted = this.formatResult(addon, stored.result, message, true);
                        this.injectIntoDropdown(addon, formatted, messageId, messageElement);
                    }
                }
            }
        } catch (error) {
            console.error('[Sidecar AI] Error handling swipe variant change:', error);
        }
    }

    /**
     * Show sidecar cards for a specific message
     * Used after initial restoration to ensure cards are visible
     * @param {string|number} messageId - The message ID or index to show sidecars for
     */
    showSidecarCardsForMessage(messageId) {
        try {
            // If messageId is a number (index), get the actual message from chat log
            let targetMessageId = messageId;
            if (typeof messageId === 'number') {
                const chatLog = this.context.chat || this.context.chatLog || this.context.currentChat || [];
                if (messageId >= 0 && messageId < chatLog.length) {
                    const message = chatLog[messageId];
                    targetMessageId = this.getMessageId(message);
                } else {
                    console.warn(`[Sidecar AI] Invalid message index: ${messageId}`);
                    return 0;
                }
            }

            // Find the message element
            const messageElement = this.findMessageElement(targetMessageId);
            if (!messageElement) {
                return 0;
            }

            // Find all sidecar containers for this message
            const containers = messageElement.querySelectorAll('.sidecar-container');
            let shownCount = 0;
            containers.forEach(container => {
                if (container.style.display === 'none') {
                    container.style.display = '';
                    shownCount++;
                    // Mark as restored to protect from cleanup
                    this.markContainerAsRestored(container);
                }
            });

            if (shownCount > 0) {
                console.log(`[Sidecar AI] Showed ${shownCount} sidecar container(s) for message ${targetMessageId}`);
            }

            return shownCount;
        } catch (error) {
            console.error('[Sidecar AI] Error showing sidecar cards for message:', error);
            return 0;
        }
    }

    /**
     * Handle message swipe event
     * Hides all sidecar cards, then shows only the cards for the swiped-to message
     * Also restores blocks for that message if they haven't been restored yet
     * @param {number} messageIndex - The index of the message that was swiped to
     * @param {Object} addonManager - Optional addon manager to restore blocks if needed
     */
    async handleMessageSwiped(messageIndex, addonManager = null) {
        try {
            console.log(`[Sidecar AI] Message swiped to index: ${messageIndex}`);

            // First, hide all sidecar cards
            this.hideAllSidecarCards();

            // Get the message from chat log
            const chatLog = this.context.chat || this.context.chatLog || this.context.currentChat || [];
            if (messageIndex < 0 || messageIndex >= chatLog.length) {
                console.warn(`[Sidecar AI] Invalid message index for swipe: ${messageIndex}`);
                return;
            }

            const message = chatLog[messageIndex];
            const messageId = this.getMessageId(message);

            // Wait a bit for DOM to update after swipe
            await new Promise(resolve => setTimeout(resolve, 100));

            // If addonManager is provided, restore blocks for this message if they exist in metadata
            // but haven't been restored yet
            const swipeId = message.swipe_id ?? 0;
            const sidecarResults = message.swipe_info?.[swipeId]?.extra?.sidecarResults || message.extra?.sidecarResults;

            if (addonManager && sidecarResults) {
                const messageElement = this.findMessageElement(messageId) || this.findMessageElementByIndex(messageIndex);
                if (messageElement) {
                    const allAddons = addonManager.getAllAddons();
                    for (const addon of allAddons) {
                        if (!addon.enabled) continue;

                        const stored = sidecarResults[addon.id];
                        if (!stored) continue;

                        // Check if block already exists
                        const existingBlock = messageElement.querySelector(`.addon_section-${addon.id}`);
                        if (!existingBlock && addon.responseLocation === 'outsideChatlog') {
                            // Restore the dropdown block
                            const formatted = this.formatResult(addon, stored.result, message, true);
                            const success = this.injectIntoDropdown(addon, formatted, messageId, messageElement);
                            if (success) {
                                const container = messageElement.querySelector('.sidecar-container');
                                if (container) {
                                    this.markContainerAsRestored(container);
                                }
                                console.log(`[Sidecar AI] Restored sidecar for ${addon.name} on swipe to message ${messageIndex}`);
                            }
                        }
                    }
                }
            }

            // Show sidecar cards for the swiped-to message
            this.showSidecarCardsForMessage(messageIndex);
        } catch (error) {
            console.error('[Sidecar AI] Error handling message swipe:', error);
        }
    }

    /**
     * Restore all blocks from saved metadata when chat loads
     * Scans chat log and restores UI blocks for all saved results
     * Only restores blocks for currently visible messages
     */
    async restoreBlocksFromMetadata(addonManager) {
        try {
            console.log('[Sidecar AI] Restoring blocks from metadata...');

            // Don't cleanup before restoration - let restoration complete first
            // Cleanup will happen after a delay via periodic cleanup

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

                // Find message element
                const messageElement = this.findMessageElement(messageId) || this.findMessageElementByIndex(i);
                if (!messageElement) {
                    continue; // Skip if message element not found
                }

                // On first load, restore all messages (cleanup will handle hiding later)
                // Only skip if message is clearly not in DOM
                if (!document.contains(messageElement)) {
                    continue;
                }

                // Check each add-on for saved results in this message
                // Check current swipe variant first, then fall back to message.extra
                const swipeId = message.swipe_id ?? 0;
                const sidecarResults = message.swipe_info?.[swipeId]?.extra?.sidecarResults || message.extra?.sidecarResults;

                for (const addon of allAddons) {
                    if (!addon.enabled) {
                        continue; // Skip disabled add-ons
                    }

                    // Get result from current swipe variant or message.extra
                    if (!sidecarResults?.[addon.id]) {
                        continue;
                    }

                    const stored = sidecarResults[addon.id];
                    const result = stored.result;

                    if (result && result.length > 0 && result.length < 100000) {
                        try {
                            // Restore the block based on response location
                            if (addon.responseLocation === 'chatHistory') {
                                // For chatHistory, check if result is already in the message content
                                const contentArea = messageElement.querySelector('.mes_text') ||
                                    messageElement.querySelector('.message') ||
                                    messageElement;

                                if (contentArea) {
                                    // Check if result is already displayed
                                    const resultTag = `<!-- addon-result:${addon.id} -->`;
                                    const hasResult = contentArea.innerHTML &&
                                        (contentArea.innerHTML.includes(resultTag) ||
                                            contentArea.innerHTML.includes(result.substring(0, 50)));

                                    if (!hasResult) {
                                        // Restore the formatted result
                                        const formatted = this.formatResult(addon, result, message, false);
                                        this.injectIntoChatHistory(messageId, addon, formatted);
                                        restoredCount++;
                                        console.log(`[Sidecar AI] Restored chatHistory block for ${addon.name} in message ${messageId}`);
                                    }
                                }
                            } else {
                                // For outsideChatlog, restore dropdown UI
                                // Check if block already exists
                                const existingBlock = messageElement.querySelector(`.addon_section-${addon.id}`);
                                if (!existingBlock) {
                                    // Restore the dropdown block
                                    const formatted = this.formatResult(addon, result, message, true);
                                    // Pass the found messageElement to avoid re-lookup failure
                                    const success = this.injectIntoDropdown(addon, formatted, messageId, messageElement);
                                    if (success) {
                                        // Mark the container as restored to protect from immediate cleanup
                                        const container = messageElement.querySelector('.sidecar-container');
                                        if (container) {
                                            this.markContainerAsRestored(container);
                                        }
                                        restoredCount++;
                                        console.log(`[Sidecar AI] Restored dropdown block for ${addon.name} in message ${messageId}`);
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
     * Show sidecar cards for the currently active message (last message in chat)
     * Used after initial restoration to ensure cards are visible
     */
    showSidecarCardsForActiveMessage() {
        try {
            const chatLog = this.context.chat || this.context.chatLog || this.context.currentChat || [];
            if (!Array.isArray(chatLog) || chatLog.length === 0) {
                return 0;
            }

            // Find the last AI message (most recent)
            let lastMessageIndex = -1;
            for (let i = chatLog.length - 1; i >= 0; i--) {
                const message = chatLog[i];
                if (message && message.mes && !message.is_user) {
                    lastMessageIndex = i;
                    break;
                }
            }

            if (lastMessageIndex >= 0) {
                console.log(`[Sidecar AI] Showing sidecar cards for active message (index ${lastMessageIndex})`);
                return this.showSidecarCardsForMessage(lastMessageIndex);
            }

            return 0;
        } catch (error) {
            console.error('[Sidecar AI] Error showing sidecar cards for active message:', error);
            return 0;
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
