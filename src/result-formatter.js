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

        // Performance: Pre-compile regex patterns for sanitization
        this._initSanitizationPatterns();

        // Performance: Cache for color parsing results
        this._colorBrightnessCache = new Map(); // Key: color string, Value: brightness value

        // Performance: DOM query caches
        this._messageElementCache = new Map(); // Key: messageId (number or string), Value: HTMLElement (weak reference via WeakMap)
        this._sidecarContainerCache = new Map(); // Key: messageId, Value: HTMLElement
        this._chatContainerCache = null; // Single element cache
        this._elementWeakMap = new WeakMap(); // Store messageId -> element mapping for cleanup detection
        this._cacheInvalidationObserver = null; // MutationObserver for cache invalidation
        this._setupCacheInvalidation();

        // Performance: Cleanup throttling
        this._lastCleanupTime = 0;
        this._cleanupThrottleMs = 5000; // Only run cleanup max once per 5 seconds

        // Performance: Restoration debouncing and processing flag
        this._restoreBlocksTimeout = null;
        this._isRestoringBlocks = false;
    }

    /**
     * Setup MutationObserver for cache invalidation
     */
    _setupCacheInvalidation() {
        if (typeof window === 'undefined' || typeof MutationObserver === 'undefined') {
            return;
        }

        try {
            // Observe chat container for mutations
            const chatContainer = document.querySelector('#chat_container') ||
                document.querySelector('.chat_container') ||
                document.querySelector('#chat');

            if (chatContainer) {
                // Debounce invalidation to avoid excessive cache clearing
                let invalidationTimeout = null;
                const observer = new MutationObserver(() => {
                    if (invalidationTimeout) {
                        clearTimeout(invalidationTimeout);
                    }
                    invalidationTimeout = setTimeout(() => {
                        this._invalidateCache();
                    }, 100); // Debounce 100ms
                });

                observer.observe(chatContainer, {
                    childList: true,
                    subtree: true,
                    attributes: true,
                    attributeFilter: ['mesid', 'data-message-id', 'style', 'class']
                });

                this._cacheInvalidationObserver = observer;
                this._chatContainerCache = chatContainer;
            }
        } catch (e) {
            console.warn('[Sidecar AI] Failed to setup cache invalidation observer:', e);
        }
    }

    /**
     * Invalidate DOM cache (called on mutations or explicitly)
     */
    _invalidateCache() {
        // Verify cached elements are still in DOM and clean up invalid entries
        const messageIdsToRemove = [];
        this._messageElementCache.forEach((element, messageId) => {
            if (!element || !document.contains(element)) {
                messageIdsToRemove.push(messageId);
            }
        });
        messageIdsToRemove.forEach(id => this._messageElementCache.delete(id));

        // Clean sidecar container cache
        const containerIdsToRemove = [];
        this._sidecarContainerCache.forEach((element, messageId) => {
            if (!element || !document.contains(element)) {
                containerIdsToRemove.push(messageId);
            }
        });
        containerIdsToRemove.forEach(id => this._sidecarContainerCache.delete(id));

        // Clear chat container cache if invalid
        if (this._chatContainerCache && !document.contains(this._chatContainerCache)) {
            this._chatContainerCache = null;
        }

        // Clear legacy cache
        if (this.cachedAIMessageElement && !document.contains(this.cachedAIMessageElement)) {
            this.cachedAIMessageElement = null;
        }

        // Update message count for legacy cache
        const messageElements = document.querySelectorAll('.mes, .message');
        this.lastMessageCount = messageElements.length;
        this.cacheInvalidationTime = Date.now();
    }

    /**
     * Initialize pre-compiled regex patterns for sanitization (called once)
     */
    _initSanitizationPatterns() {
        // Code fence patterns
        this._codeFenceFull = /^```(?:html|css|xml|markdown)?\s*\n([\s\S]*)\n```\s*$/;
        this._codeFenceStart = /^```(?:html|css|xml|markdown)?\s*/g;
        this._codeFenceEnd = /\s*```$/g;

        // Style-related patterns (can be combined)
        this._positionFixed = /position\s*:\s*(fixed|absolute)/gi;
        this._zIndex = /z-index\s*:\s*[^;]+;?/gi;
        this._viewportUnits = /\b\d+v[wh]\b/gi;

        // Tag removal patterns (grouped by type)
        this._dangerousTagsPaired = /<(iframe|embed|object|script|style)[^>]*>.*?<\/\1>/gis;
        this._dangerousTagsSelfClosing = /<(iframe|embed|object|script)[^>]*\/>/gi;

        // Link tags (specific pattern)
        this._stylesheetLink = /<link[^>]*rel\s*=\s*["']stylesheet["'][^>]*>/gi;

        // Event handler patterns
        this._eventHandlerQuoted = /\son\w+\s*=\s*["'][^"']*["']/gi;
        this._eventHandlerUnquoted = /\son\w+\s*=\s*[^>\s]+/gi;

        // JavaScript protocol patterns
        this._javascriptProtocolQuoted = /href\s*=\s*["']javascript:/gi;
        this._javascriptProtocolUnquoted = /href\s*=\s*javascript:/gi;
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

        // Step 1: Remove markdown code fences (handled separately due to multiline nature)
        const codeFenceMatch = sanitized.match(this._codeFenceFull);
        if (codeFenceMatch) {
            sanitized = codeFenceMatch[1].trim();
        }
        // Also handle single-line code fence wrapping (less common)
        sanitized = sanitized.replace(this._codeFenceStart, '');
        sanitized = sanitized.replace(this._codeFenceEnd, '');

        // Step 2: Prefer DOM-based sanitization if DOMPurify is available (SillyTavern ships it).
        // This is much safer than regex-only sanitization and handles most dangerous content.
        let domPurifyUsed = false;
        try {
            const purifier = (typeof window !== 'undefined')
                ? (window.DOMPurify || window?.SillyTavern?.DOMPurify)
                : null;

            if (purifier && typeof purifier.sanitize === 'function') {
                const beforeLength = sanitized.length;
                sanitized = purifier.sanitize(sanitized, {
                    // Keep inline styles, but forbid any global/style/script capability.
                    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'link', 'meta', 'base'],
                    FORBID_ATTR: [/^on/i],
                    ALLOW_DATA_ATTR: true,
                });
                // If DOMPurify removed content, it likely handled dangerous tags already
                domPurifyUsed = sanitized.length < beforeLength || sanitized !== response;
            }
        } catch (e) {
            // If DOMPurify fails for any reason, fall back to the regex-based hardening below.
        }

        // Step 3: Remove dangerous tags (grouped operations - DOMPurify should handle most, but we harden)
        // Only run if DOMPurify didn't remove significant content (heuristic check)
        if (!domPurifyUsed || sanitized.includes('<script') || sanitized.includes('<iframe')) {
            // Dangerous paired tags (iframe, embed, object, script, style)
            sanitized = sanitized.replace(this._dangerousTagsPaired, '');
            // Self-closing dangerous tags
            sanitized = sanitized.replace(this._dangerousTagsSelfClosing, '');
            // Stylesheet links
            sanitized = sanitized.replace(this._stylesheetLink, '');
        }

        // Step 4: Remove event handlers (DOMPurify handles most, but we harden for edge cases)
        sanitized = sanitized.replace(this._eventHandlerQuoted, '');
        sanitized = sanitized.replace(this._eventHandlerUnquoted, '');

        // Step 5: Remove dangerous CSS properties (inline styles need regex handling)
        sanitized = sanitized.replace(this._positionFixed, 'position: relative');
        sanitized = sanitized.replace(this._zIndex, '');
        sanitized = sanitized.replace(this._viewportUnits, '100%');

        // Step 6: Remove javascript: protocol in links
        sanitized = sanitized.replace(this._javascriptProtocolQuoted, 'href="#');
        sanitized = sanitized.replace(this._javascriptProtocolUnquoted, 'href=#');

        // Step 7: Fix WCAG contrast issues in HTML+CSS content
        sanitized = this.fixWCAGContrast(sanitized);

        return sanitized;
    }

    /**
     * Get brightness from hex color (cached)
     */
    _getBrightnessFromHex(hex) {
        if (!hex) return 0;

        // Check cache first
        if (this._colorBrightnessCache.has(hex)) {
            return this._colorBrightnessCache.get(hex);
        }

        // Remove # if present
        let hexClean = hex.replace('#', '');
        // Convert 3-digit to 6-digit
        if (hexClean.length === 3) {
            hexClean = hexClean.split('').map(c => c + c).join('');
        }
        const r = parseInt(hexClean.substring(0, 2), 16);
        const g = parseInt(hexClean.substring(2, 4), 16);
        const b = parseInt(hexClean.substring(4, 6), 16);
        const brightness = (r + g + b) / 3;

        // Cache result
        this._colorBrightnessCache.set(hex, brightness);
        return brightness;
    }

    /**
     * Fix WCAG contrast issues by replacing low-contrast color combinations
     * Optimized: extracts style attributes first, batch processes, caches color parsing
     */
    fixWCAGContrast(html) {
        if (!html || typeof html !== 'string') {
            return html;
        }

        // Step 1: Extract all style attributes in a single pass
        const styleAttrPattern = /style\s*=\s*["']([^"']*)["']/gi;
        const styleMatches = [];
        let match;
        let lastIndex = 0;

        // Reset regex lastIndex
        styleAttrPattern.lastIndex = 0;

        while ((match = styleAttrPattern.exec(html)) !== null) {
            styleMatches.push({
                fullMatch: match[0],
                styles: match[1],
                index: match.index,
                endIndex: match.index + match[0].length
            });
        }

        // If no style attributes found, return early
        if (styleMatches.length === 0) {
            return html;
        }

        // Step 2: Process all style attributes
        const processedStyles = [];
        const bgPattern = /background(?:-color)?\s*:\s*([^;]+)/i;
        const colorPattern = /color\s*:\s*([^;]+)/i;
        const rgbPattern = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i;
        const hexPattern = /#([a-fA-F0-9]{3}|[a-fA-F0-9]{6})/;

        for (const styleMatch of styleMatches) {
            let newStyles = styleMatch.styles;
            let modified = false;

            // Extract background and text color
            const bgMatch = styleMatch.styles.match(bgPattern);
            const colorMatch = styleMatch.styles.match(colorPattern);
            const bgColor = bgMatch ? bgMatch[1].trim() : null;
            const textColor = colorMatch ? colorMatch[1].trim() : null;

            if (!bgColor && !textColor) {
                processedStyles.push(styleMatch.fullMatch);
                continue;
            }

            // Check background lightness (cached parsing)
            let hasLightBg = false;
            let hasDarkBg = false;

            if (bgColor) {
                const normalized = bgColor.toLowerCase().trim();
                // Quick keyword checks
                if (normalized === 'white' || normalized === '#fff' || normalized === '#ffffff' ||
                    normalized === '#f5f5f5' || normalized === '#f0f0f0' || normalized === '#e8e8e8' ||
                    normalized === '#e3f2fd' || normalized === '#fff3cd') {
                    hasLightBg = true;
                } else {
                    // Check RGB
                    const rgbMatch = bgColor.match(rgbPattern);
                    if (rgbMatch) {
                        const brightness = (parseInt(rgbMatch[1]) + parseInt(rgbMatch[2]) + parseInt(rgbMatch[3])) / 3;
                        hasLightBg = brightness > 200;
                        hasDarkBg = brightness < 85;
                    } else {
                        // Check hex
                        const hexMatch = bgColor.match(hexPattern);
                        if (hexMatch) {
                            const brightness = this._getBrightnessFromHex(hexMatch[0]);
                            hasLightBg = brightness > 200;
                            hasDarkBg = brightness < 85;
                        }
                    }
                }
            }

            // Check text color and fix contrast issues
            if (textColor) {
                const normalized = textColor.toLowerCase().trim();
                let textBrightness = null;
                let isWhite = false;

                // Quick keyword checks
                if (normalized === 'white' || normalized === '#fff' || normalized === '#ffffff') {
                    isWhite = true;
                    textBrightness = 255;
                } else if (normalized === 'black' || normalized === '#000' || normalized === '#000000') {
                    textBrightness = 0;
                } else if (/rgba?\(\s*255\s*,\s*255\s*,\s*255/i.test(textColor)) {
                    isWhite = true;
                    textBrightness = 255;
                } else {
                    // Parse hex or RGB
                    const hexMatch = textColor.match(hexPattern);
                    if (hexMatch) {
                        textBrightness = this._getBrightnessFromHex(hexMatch[0]);
                    } else {
                        const rgbMatch = textColor.match(rgbPattern);
                        if (rgbMatch) {
                            textBrightness = (parseInt(rgbMatch[1]) + parseInt(rgbMatch[2]) + parseInt(rgbMatch[3])) / 3;
                        }
                    }
                }

                // Fix contrast issues
                if (hasLightBg) {
                    if (isWhite || (textBrightness !== null && textBrightness > 200)) {
                        newStyles = newStyles.replace(/color\s*:\s*[^;]+/gi, 'color: #111111');
                        modified = true;
                    }
                } else if (hasDarkBg && textBrightness !== null && textBrightness < 85) {
                    newStyles = newStyles.replace(/color\s*:\s*[^;]+/gi, 'color: #ffffff');
                    modified = true;
                }
            }

            // Store processed style attribute
            if (modified) {
                const quote = styleMatch.fullMatch.includes('"') ? '"' : "'";
                processedStyles.push(`style=${quote}${newStyles}${quote}`);
            } else {
                processedStyles.push(styleMatch.fullMatch);
            }
        }

        // Step 3: Rebuild HTML string with processed styles
        if (styleMatches.length > 0) {
            let result = '';
            let lastEnd = 0;

            for (let i = 0; i < styleMatches.length; i++) {
                const styleMatch = styleMatches[i];
                // Add text before this match
                result += html.substring(lastEnd, styleMatch.index);
                // Add processed style
                result += processedStyles[i];
                lastEnd = styleMatch.endIndex;
            }
            // Add remaining text
            result += html.substring(lastEnd);
            return result;
        }

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
            // Prefer attaching to the specific message referenced by SillyTavern (chat index / mesid)
            const messageElement = this.findMessageElement(messageId) || this.findAIMessageElement();

            if (!messageElement) {
                console.warn(`[Sidecar AI] AI message element not found for loading indicator. Waiting...`);
                // Retry after a short delay in case the AI message is still rendering
                setTimeout(() => {
                    const retryElement = this.findMessageElement(messageId) || this.findAIMessageElement();
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

            // If the addon section exists for this message, show loading *inside* the section
            // to avoid leaving an empty container during regeneration.
            const existingSection = messageElement.querySelector?.(`.addon_section-${addon.id}`) || null;
            if (existingSection) {
                this.setAddonSectionLoading(existingSection, addon);
                return;
            }

            this.attachLoadingToElement(messageElement, addon);
        } catch (error) {
            console.error(`[Sidecar AI] Error showing loading indicator:`, error);
        }
    }

    /**
     * Put a loading placeholder into an existing addon section content area.
     * This prevents a blank container during regen.
     */
    setAddonSectionLoading(addonSection, addon) {
        try {
            if (!addonSection) return;
            const content = addonSection.querySelector?.('.addon_result_content') || null;
            if (!content) return;
            addonSection.open = true;
            content.innerHTML = `
                <div class="addon_result_loading">
                    <i class="fa-solid fa-spinner fa-spin"></i>
                    <span>Processing ${addon?.name || 'Sidecar'}...</span>
                </div>
            `;
        } catch (e) {
            // No-op: loading UI is best-effort
        }
    }

    /**
     * Attach loading indicator to a specific message element
     */
    attachLoadingToElement(messageElement, addon) {
        // Get message ID from the element
        const elementId = messageElement.getAttribute('mesid') || messageElement.id || messageElement.getAttribute('data-message-id') || `msg_${Date.now()}`;

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
     * Get or cache chat container
     */
    _getChatContainer() {
        if (this._chatContainerCache && document.contains(this._chatContainerCache)) {
            return this._chatContainerCache;
        }

        const container = document.querySelector('#chat_container') ||
            document.querySelector('.chat_container') ||
            document.querySelector('#chat');

        if (container) {
            this._chatContainerCache = container;
        }

        return container;
    }

    /**
     * Find the latest AI message element in the DOM
     * Performance: Uses caching to avoid repeated DOM queries
     */
    findAIMessageElement() {
        // Get current message count (use cached chat container if available)
        const chatContainer = this._getChatContainer();
        const messageElements = chatContainer
            ? chatContainer.querySelectorAll('.mes, .message')
            : document.querySelectorAll('.mes, .message');
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
            const messageElement = this.findMessageElement(messageId) || this.findAIMessageElement();
            const sidecarContainer = messageElement?.querySelector?.('.sidecar-container') || null;
            const loadingDiv = sidecarContainer?.querySelector?.(`.sidecar-loading-${addon.id}`) ||
                messageElement?.querySelector?.(`.sidecar-loading-${addon.id}`) ||
                null;

            if (loadingDiv) {
                console.log(`[Sidecar AI] Removing loading indicator for ${addon.name}`);
                loadingDiv.remove();
            }

            // Also remove any in-section loading placeholder
            const section = messageElement?.querySelector?.(`.addon_section-${addon.id}`) || null;
            const inlineLoading = section?.querySelector?.('.addon_result_loading') || null;
            if (inlineLoading) {
                inlineLoading.remove();
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
            // Prefer attaching to the specific message referenced by SillyTavern (chat index / mesid)
            const messageElement = this.findMessageElement(messageId) || this.findAIMessageElement();
            if (!messageElement) {
                console.warn(`[Sidecar AI] AI message element not found for error indicator`);
                return;
            }

            // Verify it's actually an AI message
            if (!this.isAIMessageElement(messageElement)) {
                console.warn(`[Sidecar AI] Found element is not an AI message for error indicator`);
                return;
            }

            // messageId is expected to be the SillyTavern chat index (mesid)
            const elementId = messageElement.getAttribute('mesid') || messageId;

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
                // Best-effort fallback: use latest AI message element's mesid or last chat index.
                const aiEl = this.findAIMessageElement();
                const mesidAttr = aiEl?.getAttribute?.('mesid');
                if (mesidAttr !== null && mesidAttr !== undefined && mesidAttr !== '' && !Number.isNaN(Number(mesidAttr))) {
                    messageId = Number(mesidAttr);
                } else {
                    const chatLog = this.context.chat || this.context.chatLog || this.context.currentChat || [];
                    messageId = Array.isArray(chatLog) && chatLog.length > 0 ? (chatLog.length - 1) : null;
                }
            }

            // Resolve swipe id for uniqueness (per-message variant)
            const messageObjForIds = this.findMessageObject(messageId);
            const swipeIdForIds = messageObjForIds?.swipe_id ?? 0;

            // Use provided element or find it
            const messageElement = existingElement || this.findMessageElement(messageId);

            if (!messageElement) {
                console.warn(`[Sidecar AI] Message element not found for dropdown injection (ID: ${messageId})`);
                return false;
            }

            // Performance: Check cache for sidecar container
            let sidecarContainer = this._sidecarContainerCache.get(messageId);
            if (sidecarContainer && document.contains(sidecarContainer)) {
                // Container exists and is valid
                if (sidecarContainer.style.display === 'none') {
                    sidecarContainer.style.display = '';
                }
                this.markContainerAsRestored(sidecarContainer);
            } else {
                // Cache miss or invalid - query DOM
                sidecarContainer = messageElement.querySelector(`.sidecar-container-${messageId}`) ||
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

                    // Cache the new container
                    this._sidecarContainerCache.set(messageId, sidecarContainer);
                } else {
                    // Cache the found container
                    this._sidecarContainerCache.set(messageId, sidecarContainer);
                    if (sidecarContainer.style.display === 'none') {
                        sidecarContainer.style.display = '';
                    }
                }

                // Mark as recently restored to protect from cleanup
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

                // Regenerate button
                const regenBtn = document.createElement('button');
                regenBtn.innerHTML = '<i class="fa-solid fa-redo"></i>';
                regenBtn.className = 'menu_button';
                regenBtn.title = 'Regenerate Result';

                regenBtn.onclick = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (confirm('Are you sure you want to regenerate this result?')) {
                        if (window.addOnsExtension && window.addOnsExtension.retryAddon) {
                            // Show loading inside this section to avoid empty container UX.
                            this.setAddonSectionLoading(addonSection, addon);
                            window.addOnsExtension.retryAddon(addon.id, messageId);
                        }
                    }
                };
                actionsDiv.appendChild(regenBtn);

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
                    // Scope to this addon section to avoid cross-message collisions.
                    const contentText = addonSection.querySelector('.addon_result_content')?.innerText || '';
                    navigator.clipboard.writeText(contentText).then(() => {
                        copyBtn.innerHTML = '<i class="fa-solid fa-check"></i>';
                        setTimeout(() => copyBtn.innerHTML = '<i class="fa-solid fa-copy"></i>', 1000);
                    });
                };

                actionsDiv.appendChild(editBtn);
                actionsDiv.appendChild(copyBtn);
                summary.appendChild(actionsDiv);

                const content = document.createElement('div');
                content.className = 'addon_result_content';
                content.id = `addon-content-${messageId}-${swipeIdForIds}-${addon.id}`;

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

        // Find the specific addon section and its content container (message-scoped).
        const addonSection = messageElement.querySelector(`.addon_section-${addon.id}`);
        const contentDiv = addonSection?.querySelector?.('.addon_result_content') || null;
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
        if (messageId === null || messageId === undefined) return null;

        const chatLog = this.context.chat || this.context.chatLog || this.context.currentChat || [];
        if (!Array.isArray(chatLog)) return null;

        // SillyTavern event payloads use chat index (mesid), so treat numeric ids as indices first.
        const numericId = (typeof messageId === 'number')
            ? messageId
            : (typeof messageId === 'string' && messageId.trim() !== '' && !Number.isNaN(Number(messageId)) ? Number(messageId) : null);

        if (numericId !== null && Number.isInteger(numericId) && numericId >= 0 && numericId < chatLog.length) {
            return chatLog[numericId] || null;
        }

        // Fallback: Try find by UID/ID/mesId with loose equality to handle string/number differences
        return chatLog.find(msg =>
            (msg?.uid == messageId) ||
            (msg?.id == messageId) ||
            (msg?.mesId == messageId)
        ) || null;
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
                formatStyle: addon.formatStyle || 'html-css',
                inlineMode: addon.inlineMode || 'off'
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

            // Also delete from current swipe variant if present
            const swipeId = message.swipe_id ?? 0;
            if (Array.isArray(message.swipe_info) && message.swipe_info[swipeId]?.extra?.sidecarResults?.[addonId]) {
                delete message.swipe_info[swipeId].extra.sidecarResults[addonId];
            }

            // Update DOM if possible
            const messageId = this.getMessageId(message);
            const messageElement = this.findMessageElement(messageId);
            if (messageElement) {
                const section = messageElement.querySelector(`.addon_section-${addonId}`);
                if (section) {
                    section.remove();
                }
            }

            // Re-apply inline projection (may remove inline region if this addon was inline).
            this.applyInlineSidecarResultsToMessage(message);

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
                inlineMode: addon?.inlineMode || 'off',
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

        // Keep inline projection (main AI visibility) in sync after edits.
        this.applyInlineSidecarResultsToMessage(message);

        return true;
    }

    /**
     * Inline mode: project stored sidecarResults into message.mes so the main AI can see it,
     * while keeping UI clean via message.extra.display_text.
     *
     * Source of truth remains metadata in swipe_info[swipeId].extra.sidecarResults.
     */
    applyInlineSidecarResultsToMessage(message) {
        if (!message || typeof message !== 'object') return false;

        try {
            const messageId = this.getMessageId(message);
            const swipeId = message.swipe_id ?? 0;

            // Ensure swipe_info structure exists
            if (!Array.isArray(message.swipe_info)) {
                message.swipe_info = [];
            }
            if (!message.swipe_info[swipeId]) {
                message.swipe_info[swipeId] = {
                    send_date: message.send_date,
                    gen_started: message.gen_started,
                    gen_finished: message.gen_finished,
                    extra: {},
                };
            }
            if (!message.swipe_info[swipeId].extra) {
                message.swipe_info[swipeId].extra = {};
            }

            const extra = message.swipe_info[swipeId].extra;
            const sidecarResults = extra.sidecarResults || message.extra?.sidecarResults || {};

            // If an addon is configured for inline mode but the stored result doesn't include inlineMode
            // (or the addon changed), keep metadata aligned with addon config so inline projection works.
            // This is best-effort and only updates the in-memory message object; persistence is handled elsewhere.
            if (sidecarResults && typeof sidecarResults === 'object') {
                for (const [addonId, stored] of Object.entries(sidecarResults)) {
                    if (!stored || typeof stored !== 'object') continue;
                    // If saved result doesn't have inlineMode, fall back to the currently configured addon inlineMode.
                    if (stored.inlineMode === undefined || stored.inlineMode === null || stored.inlineMode === '') {
                        try {
                            const currentAddon = (window?.addOnsExtension?.addonManager?.getAddon)
                                ? window.addOnsExtension.addonManager.getAddon(addonId)
                                : null;
                            if (currentAddon?.inlineMode) {
                                stored.inlineMode = currentAddon.inlineMode;
                            }
                        } catch {
                            // Ignore: best-effort only
                        }
                    }
                }
            }

            // Helpers
            const startMarker = '<!-- sidecar-inline:start -->';
            const endMarker = '<!-- sidecar-inline:end -->';
            const stripInlineRegion = (text) => {
                if (typeof text !== 'string') return '';
                const re = new RegExp(`${startMarker}[\\s\\S]*?${endMarker}\\s*`, 'g');
                return text.replace(re, '').trimEnd();
            };

            // Establish base message (without inline region) once per swipe.
            if (typeof extra.sidecar_inline_base !== 'string' || extra.sidecar_inline_base.length === 0) {
                const candidate = (Array.isArray(message.swipes) && typeof message.swipes[swipeId] === 'string')
                    ? message.swipes[swipeId]
                    : (typeof message.mes === 'string' ? message.mes : '');
                extra.sidecar_inline_base = stripInlineRegion(candidate);
            }

            const base = String(extra.sidecar_inline_base || '');

            // Collect inline-enabled results for this swipe variant.
            const inlineEntries = Object.entries(sidecarResults || {})
                .map(([id, stored]) => ({ id, stored }))
                .filter(({ stored }) => {
                    if (!stored || typeof stored !== 'object') return false;
                    if (typeof stored.result !== 'string' || stored.result.length === 0) return false;
                    // Back-compat: older stored results might not have inlineMode saved.
                    // Treat missing inlineMode as "off" (do not inline).
                    const mode = stored.inlineMode ?? 'off';
                    return mode !== 'off';
                });

            // Build inline region (bounded and replaceable).
            let inlineRegion = '';
            if (inlineEntries.length > 0) {
                // Cap to prevent runaway context growth.
                const MAX_TOTAL = 20000;
                const MAX_PER = 8000;
                let used = 0;

                const parts = [];
                for (const { id, stored } of inlineEntries) {
                    if (used >= MAX_TOTAL) break;
                    const name = stored.addonName || id;
                    let body = stored.result;
                    if (body.length > MAX_PER) body = body.slice(0, MAX_PER) + '\n\n[Truncated]';
                    const block = `\n[Sidecar:${name}]\n${body}\n[/Sidecar:${name}]\n`;
                    used += block.length;
                    parts.push(block);
                }

                inlineRegion = `\n\n${startMarker}\n${parts.join('\n')}\n${endMarker}`;
            }

            const newMes = (base + inlineRegion).trimEnd();
            message.mes = newMes;
            if (Array.isArray(message.swipes) && swipeId >= 0) {
                message.swipes[swipeId] = newMes;
            }

            // IMPORTANT:
            // SillyTavern's renderer prefers `message.extra.display_text` when present.
            // Setting it hides the inline region visually (and can confuse users into thinking
            // inline injection "didn't work"). We keep inline projection visible by default.
            // If we want a "UI clean" mode later, we can reintroduce display_text behind a setting.

            if (typeof this.context?.updateMessageBlock === 'function' && typeof messageId === 'number') {
                this.context.updateMessageBlock(messageId, message, { rerenderMessage: true });
            }

            return true;
        } catch (e) {
            console.warn('[Sidecar AI] Failed to apply inline sidecar projection:', e);
            return false;
        }
    }

    /**
     * Find message element by ID or other identifier
     * Specifically finds AI messages (not user messages)
     */
    findMessageElement(messageId) {
        // Check cache first
        const cacheKey = (typeof messageId === 'number' || (typeof messageId === 'string' && !Number.isNaN(Number(messageId))))
            ? Number(messageId)
            : messageId;

        const cachedElement = this._messageElementCache.get(cacheKey);
        if (cachedElement && document.contains(cachedElement) && this.isAIMessageElement(cachedElement)) {
            return cachedElement;
        }

        // Cache miss - perform lookup
        // SillyTavern message DOM blocks are `.mes[mesid="<chatIndex>"]`
        // and event payloads give us the chat index. Prefer this lookup.
        const numericId = (typeof messageId === 'number')
            ? messageId
            : (typeof messageId === 'string' && messageId.trim() !== '' && !Number.isNaN(Number(messageId)) ? Number(messageId) : null);

        let element = null;

        if (numericId !== null) {
            element = document.querySelector(`#chat .mes[mesid="${numericId}"]`) ||
                document.querySelector(`.mes[mesid="${numericId}"]`);
            if (element && this.isAIMessageElement(element)) {
                // Cache result
                this._messageElementCache.set(cacheKey, element);
                return element;
            }
        }

        // Try direct ID lookup
        element = document.getElementById(messageId);
        if (element && this.isAIMessageElement(element)) {
            this._messageElementCache.set(cacheKey, element);
            return element;
        }

        // Try data attribute
        element = document.querySelector(`[data-message-id="${messageId}"]`);
        if (element && this.isAIMessageElement(element)) {
            this._messageElementCache.set(cacheKey, element);
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
                        element = messageElements[i];
                        this._messageElementCache.set(cacheKey, element);
                        return element;
                    }
                }
            }
        }

        // Fallback: get last AI message element (not user message)
        const messageElements = document.querySelectorAll('.mes, .message');
        for (let i = messageElements.length - 1; i >= 0; i--) {
            if (this.isAIMessageElement(messageElements[i])) {
                element = messageElements[i];
                // Only cache if we have a valid messageId
                if (cacheKey !== undefined && cacheKey !== null) {
                    this._messageElementCache.set(cacheKey, element);
                }
                return element;
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
        if (message === null || message === undefined) return null;

        // If already a chat index, keep it.
        if (typeof message === 'number') {
            return message;
        }

        // Prefer SillyTavern chat index, which is stable for a loaded chat.
        const chatLog = this.context.chat || this.context.chatLog || this.context.currentChat || [];
        if (Array.isArray(chatLog)) {
            const idx = chatLog.indexOf(message);
            if (idx >= 0) {
                return idx;
            }
        }

        // Fallbacks for compatibility with other sources.
        return message.uid || message.id || message.mesId || null;
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
     * Performance: Uses cache and throttling to avoid expensive DOM scans
     */
    cleanupHiddenSidecarCards() {
        try {
            // Throttle cleanup - only run max once per 5 seconds
            const now = Date.now();
            if (now - this._lastCleanupTime < this._cleanupThrottleMs) {
                return 0;
            }
            this._lastCleanupTime = now;

            let cleanedCount = 0;

            // Performance: Use cached containers first, only scan DOM if cache size doesn't match
            const cachedContainers = Array.from(this._sidecarContainerCache.values()).filter(c => c && document.contains(c));
            const domContainers = document.querySelectorAll('.sidecar-container');

            // If cache matches DOM count, only check cached containers (much faster)
            if (cachedContainers.length === domContainers.length) {
                // Check only cached containers
                const containersToCheck = cachedContainers;
                containersToCheck.forEach(container => {
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
                        // Remove from cache
                        const messageIdToRemove = Array.from(this._sidecarContainerCache.entries())
                            .find(([id, elem]) => elem === container)?.[0];
                        if (messageIdToRemove !== undefined) {
                            this._sidecarContainerCache.delete(messageIdToRemove);
                        }
                    }
                });
            } else {
                // Cache mismatch - need to scan DOM and sync cache
                const containerSet = new Set(domContainers);

                domContainers.forEach(container => {
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
                        containerSet.delete(container);
                        // Remove from cache
                        const messageIdToRemove = Array.from(this._sidecarContainerCache.entries())
                            .find(([id, elem]) => elem === container)?.[0];
                        if (messageIdToRemove !== undefined) {
                            this._sidecarContainerCache.delete(messageIdToRemove);
                        }
                    }
                });

                // Clean cache of containers no longer in DOM
                this._sidecarContainerCache.forEach((container, messageId) => {
                    if (!containerSet.has(container) || !document.contains(container)) {
                        this._sidecarContainerCache.delete(messageId);
                    }
                });
            }

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
     * Check if a container has been marked as restored
     * @param {HTMLElement} container - The container to check
     * @returns {boolean} True if the container is marked as restored
     */
    isContainerRestored(container) {
        // Clean up invalid containers from the map periodically
        if (this._restoredContainers && this._restoredContainers.size > 0) {
            const now = Date.now();
            const toRemove = [];
            this._restoredContainers.forEach((timestamp, containerElement) => {
                // Remove containers that are no longer in DOM or are too old (5 minutes)
                if (!containerElement || !document.contains(containerElement) || (now - timestamp) > 300000) {
                    toRemove.push(containerElement);
                }
            });
            toRemove.forEach(container => this._restoredContainers.delete(container));
        }

        return this._restoredContainers && this._restoredContainers.has(container);
    }

    /**
     * Hide all sidecar cards
     * Used when swiping to a new message or when generation starts
     */
    hideAllSidecarCards(excludeMessageId = null) {
        try {
            const allContainers = document.querySelectorAll('.sidecar-container');
            let hiddenCount = 0;
            allContainers.forEach(container => {
                // Skip containers that have excludeMessageId if provided
                if (excludeMessageId !== null) {
                    const messageElement = container.closest('.mes, .message');
                    if (messageElement) {
                        const mesid = messageElement.getAttribute('mesid');
                        if (mesid && (mesid === excludeMessageId.toString() || parseInt(mesid) === excludeMessageId)) {
                            console.log(`[Sidecar AI] Skipping hide for active message ${excludeMessageId}`);
                            return;
                        }
                    }
                }

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

            // Validate inputs
            if (typeof messageIndex !== 'number' || messageIndex < 0) {
                console.warn(`[Sidecar AI] Invalid message index for swipe variant change: ${messageIndex}`);
                return;
            }

            if (!addonManager || typeof addonManager.getAllAddons !== 'function') {
                console.warn('[Sidecar AI] Invalid addon manager provided to handleSwipeVariantChange');
                return;
            }


            // Get the message from chat log
            const chatLog = this.context.chat || this.context.chatLog || this.context.currentChat || [];
            if (!Array.isArray(chatLog) || messageIndex >= chatLog.length) {
                console.warn(`[Sidecar AI] Message index ${messageIndex} out of bounds for chat log length ${chatLog.length}`);
                return;
            }

            const message = chatLog[messageIndex];
            if (!message) {
                console.warn(`[Sidecar AI] No message found at index ${messageIndex}`);
                return;
            }

            const messageId = this.getMessageId(message);
            const swipeId = message.swipe_id ?? 0;

            console.log(`[Sidecar AI] Message ${messageIndex} (ID: ${messageId}) is now on swipe variant ${swipeId}`);

            // Check if this swipe variant has stored results
            const hasStoredResults = message.swipe_info?.[swipeId]?.extra?.sidecarResults;
            const hasResults = hasStoredResults && Object.keys(hasStoredResults).length > 0;

            if (hasResults) {
                // Only hide other containers if we actually have results to show for this variant
                // This prevents unnecessary hide/show cycles when there are no stored sidecars
                console.log(`[Sidecar AI] Found ${Object.keys(hasStoredResults).length} stored result(s) for variant ${swipeId}, hiding other containers`);
                this.hideAllSidecarCards(messageId);
            } else {
                console.log(`[Sidecar AI] No stored results for variant ${swipeId}, skipping global hide`);
            }

            if (!hasResults) {
                // No stored results, nothing to do
                return;
            }

            // Find the message element (try multiple methods for robustness)
            const messageElement = this.findMessageElement(messageId) || this.findMessageElementByIndex(messageIndex);
            if (!messageElement) {
                console.log(`[Sidecar AI] Message element not found for ID ${messageId} or index ${messageIndex}, DOM may not be ready yet`);
                return;
            }

            // Find or create the sidecar container
            let sidecarContainer = messageElement.querySelector('.sidecar-container');
            if (!sidecarContainer) {
                // Create container if it doesn't exist
                sidecarContainer = document.createElement('div');
                sidecarContainer.className = `sidecar-container sidecar-container-${messageId}`;
                // Insert at the end of the message element
                messageElement.appendChild(sidecarContainer);
                console.log(`[Sidecar AI] Created new sidecar container for message ${messageId}`);
            }

            // CLEAR the container contents completely
            // This removes any sidecars from the previous variant
            sidecarContainer.innerHTML = '';
            sidecarContainer.style.display = ''; // Ensure it's visible
            this.markContainerAsRestored(sidecarContainer);

            console.log(`[Sidecar AI] Cleared sidecar container for message ${messageId}, variant ${swipeId}`);

            // Render the stored sidecars for this variant
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

            // Ensure inline projection + display_text are consistent after restoration.
            // This keeps the UI clean even if message.mes contains an inline region.
            this.applyInlineSidecarResultsToMessage(message);
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

            // Find the message element (try multiple methods for robustness)
            const messageElement = this.findMessageElement(targetMessageId) || this.findMessageElementByIndex(typeof messageId === 'number' ? messageId : null);
            if (!messageElement) {
                console.log(`[Sidecar AI] Message element not found for ID ${targetMessageId}, skipping show operation`);
                return 0;
            }

            // Find all sidecar containers for this message
            const containers = messageElement.querySelectorAll('.sidecar-container');
            let shownCount = 0;
            containers.forEach(container => {
                // Only show if it's actually hidden and has content (prevent showing empty containers)
                if (container.style.display === 'none' && container.innerHTML.trim()) {
                    container.style.display = '';
                    shownCount++;
                    // Mark as restored to protect from cleanup
                    this.markContainerAsRestored(container);
                    console.log(`[Sidecar AI] Showed sidecar container for message ${targetMessageId}`);
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
     * Restore all blocks from saved metadata when chat loads
     * Performance: Debounced and protected by processing flag
     * Scans chat log and restores UI blocks for all saved results
     * Only restores blocks for currently visible messages
     */
    async restoreBlocksFromMetadata(addonManager) {
        // Performance: Debounce rapid calls
        return new Promise((resolve) => {
            if (this._restoreBlocksTimeout) {
                clearTimeout(this._restoreBlocksTimeout);
            }

            this._restoreBlocksTimeout = setTimeout(async () => {
                // Performance: Prevent concurrent executions
                if (this._isRestoringBlocks) {
                    console.log('[Sidecar AI] Restoration already in progress, skipping...');
                    resolve(0);
                    return;
                }

                try {
                    this._isRestoringBlocks = true;
                    console.log('[Sidecar AI] Restoring blocks from metadata...');

                    // Don't cleanup before restoration - let restoration complete first
                    // Cleanup will happen after a delay via periodic cleanup

                    const chatLog = this.context.chat || this.context.chatLog || this.context.currentChat || [];
                    if (!Array.isArray(chatLog) || chatLog.length === 0) {
                        console.log('[Sidecar AI] No chat log found, skipping restoration');
                        resolve(0);
                        return;
                    }

                    const allAddons = addonManager.getAllAddons();
                    let restoredCount = 0;

                    // Wait a bit for DOM to be ready
                    await new Promise(resolveDelay => setTimeout(resolveDelay, 300));

                    // Performance: Batch DOM queries - collect all message elements first
                    const messageElementsMap = new Map();

                    // Pre-fetch all message elements we'll need (batch query)
                    for (let i = 0; i < chatLog.length; i++) {
                        const message = chatLog[i];
                        if (!message || !message.mes || message.is_user) {
                            continue; // Skip user messages and empty messages
                        }
                        const messageId = this.getMessageId(message);
                        const messageElement = this.findMessageElement(messageId) || this.findMessageElementByIndex(i);
                        if (messageElement && document.contains(messageElement)) {
                            messageElementsMap.set(i, { message, messageId, messageElement });
                        }
                    }

                    // Iterate through cached message elements (avoid repeated DOM queries)
                    for (const [i, { message, messageId, messageElement }] of messageElementsMap.entries()) {

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
                    resolve(restoredCount);
                } catch (error) {
                    console.error('[Sidecar AI] Error restoring blocks from metadata:', error);
                    resolve(0);
                } finally {
                    this._isRestoringBlocks = false;
                }
            }, 150); // Debounce 150ms
        });
    }

    /**
     * Show sidecar cards for the currently active message (last message in chat)
     * Used after initial restoration to ensure cards are visible
     */
    showSidecarCardsForActiveMessage() {
        try {
            const chatLog = this.context.chat || this.context.chatLog || this.context.currentChat || [];
            if (!Array.isArray(chatLog) || chatLog.length === 0) {
                console.log('[Sidecar AI] No chat log available');
                return 0;
            }

            // Find the last AI message (most recent)
            let lastMessageIndex = -1;
            for (let i = chatLog.length - 1; i >= 0; i--) {
                const message = chatLog[i];
                if (message && message.mes && message.mes.trim() && !message.is_user) {
                    lastMessageIndex = i;
                    break;
                }
            }

            if (lastMessageIndex < 0) {
                console.log('[Sidecar AI] No AI messages found in chat log');
                return 0;
            }

            const lastMessage = chatLog[lastMessageIndex];
            if (!lastMessage) {
                console.warn('[Sidecar AI] Last AI message is null/undefined');
                return 0;
            }

            console.log(`[Sidecar AI] Showing sidecar cards for active message (index ${lastMessageIndex})`);
            return this.showSidecarCardsForMessage(lastMessageIndex);
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
