/**
 * AI Client
 * Handles communication with AI providers
 * Uses SillyTavern's ChatCompletionService for all API requests
 */

export class AIClient {
    constructor(context) {
        this.context = context;
        // Retry configuration
        this.retryConfig = {
            maxRetries: 3,
            initialDelay: 1000, // 1 second
            maxDelay: 10000, // 10 seconds
            backoffMultiplier: 2
        };

        // Cache for Connection Manager module (optional)
        this._connectionManagerModule = null;

        // Performance: Track active request controllers for cancellation
        this.activeRequests = new Map(); // Key: `${addonId}:${messageId}`, Value: AbortController
    }

    /**
     * Map provider names to SillyTavern's chat_completion_source values
     */
    getChatCompletionSource(provider) {
        const sourceMap = {
            'openai': 'openai',
            'openrouter': 'openrouter',
            'anthropic': 'anthropic',
            'google': 'makersuite', // Google uses MAKERSUITE, not 'google'
            'deepseek': 'deepseek',
            'cohere': 'cohere',
            'custom': 'custom',
            // Add more mappings as needed
        };
        return sourceMap[provider] || 'openai';
    }

    /**
     * Best-effort access to SillyTavern's ConnectionManagerRequestService for per-profile requests.
     * This allows sidecars to use a different configured connection/preset than the main AI.
     */
    async getConnectionManagerRequestService() {
        // 1) If already cached, return it
        if (this._connectionManagerModule?.ConnectionManagerRequestService) {
            return this._connectionManagerModule.ConnectionManagerRequestService;
        }

        // 2) If available globally (unlikely, but cheap to check)
        if (typeof window !== 'undefined' && window.ConnectionManagerRequestService) {
            return window.ConnectionManagerRequestService;
        }

        // 3) Dynamic import from SillyTavern public scripts
        try {
            // SillyTavern serves public/scripts as /scripts/...
            this._connectionManagerModule = await import('/scripts/extensions/shared.js');
            return this._connectionManagerModule?.ConnectionManagerRequestService || null;
        } catch (e) {
            return null;
        }
    }

    /**
     * Send single add-on request to AI using SillyTavern's ChatCompletionService
     * Includes automatic retry with exponential backoff
     * @param {Object} addon - Addon configuration
     * @param {string|Array} prompt - Prompt to send
     * @param {number} retryCount - Current retry attempt (internal)
     * @param {string|number} messageId - Optional message ID for request cancellation
     */
    async sendToAI(addon, prompt, retryCount = 0, messageId = null) {
        // Performance: Cancel previous request for same addon+message if exists
        if (messageId !== null && retryCount === 0) {
            const requestKey = `${addon.id}:${messageId}`;
            const previousController = this.activeRequests.get(requestKey);
            if (previousController) {
                previousController.abort();
                this.activeRequests.delete(requestKey);
                console.log(`[Sidecar AI] Cancelled previous request for ${addon.name} (message ${messageId})`);
            }
        }

        // Create abort controller for this request
        const abortController = new AbortController();
        if (messageId !== null && retryCount === 0) {
            const requestKey = `${addon.id}:${messageId}`;
            this.activeRequests.set(requestKey, abortController);
        }

        try {
            // If user selected a Connection Manager profile, route the request through it.
            // This enables a different connection/preset than the main AI and avoids CORS.
            if (addon?.connectionProfileId) {
                const cm = await this.getConnectionManagerRequestService();
                if (cm && typeof cm.sendRequest === 'function') {
                    if (retryCount === 0) {
                        console.log(`[Sidecar AI] Using Connection Manager profile ${addon.connectionProfileId} for ${addon.name}`);
                    }

                    // For ConnectionManagerRequestService, prompt can be a string or a messages array.
                    // If our prompt is a string, pass it directly; if it's an array, pass messages.
                    const promptArg = Array.isArray(prompt) ? prompt : String(prompt || '');

                    const overridePayload = {};
                    // Allow OpenRouter provider routing (only meaningful if the selected profile maps to OpenRouter source)
                    if (Array.isArray(addon.serviceProvider) && addon.serviceProvider.length > 0) {
                        overridePayload.provider = addon.serviceProvider;
                    }

                    const response = await cm.sendRequest(
                        addon.connectionProfileId,
                        promptArg,
                        4096,
                        { stream: false, extractData: true, includePreset: true },
                        overridePayload
                    );

                    return response?.content || response?.choices?.[0]?.message?.content || String(response);
                } else {
                    console.warn('[Sidecar AI] Connection Manager not available; falling back to ChatCompletionService');
                }
            }

            const provider = addon.aiProvider || 'openai';
            const model = addon.aiModel || 'gpt-3.5-turbo';
            const apiUrl = addon.apiUrl; // Custom endpoint support
            const chatCompletionSource = this.getChatCompletionSource(provider);

            // Use SillyTavern's ChatCompletionService - it handles everything!
            if (this.context && this.context.ChatCompletionService) {
                if (retryCount === 0) {
                    console.log(`[Sidecar AI] Using SillyTavern ChatCompletionService for ${provider} (${model})`);
                } else {
                    console.log(`[Sidecar AI] Retry attempt ${retryCount}/${this.retryConfig.maxRetries} for ${addon.name}`);
                }

                // Build messages array with system instruction
                // NOTE: Prompt should already have {{user}} and {{char}} placeholders substituted by ContextBuilder
                // {{user}} = name1 (user's name), {{char}} = name2 (character's name)
                let messages;
                if (Array.isArray(prompt)) {
                    messages = prompt;
                } else {
                    // Minimal system message to reduce drift without forcing a specific output format.
                    messages = [
                        {
                            role: 'system',
                            content: [
                                'You are a task executor.',
                                'Follow the user instruction exactly. Do not add extra content. Do not roleplay.',
                                'Output ONLY the final requested content (no preface, no explanation, no code fences).',
                            ].join('\n')
                        },
                        {
                            role: 'user',
                            content: prompt // Prompt already has {{user}} and {{char}} substituted
                        }
                    ];
                }

                const requestOptions = {
                    stream: false,
                    messages: messages,
                    model: model,
                    chat_completion_source: chatCompletionSource,
                    max_tokens: 4096,
                    temperature: 0.7,
                    custom_url: apiUrl || undefined, // Use custom URL if provided
                };

                // Add OpenRouter service providers if specified
                if (provider === 'openrouter' && addon.serviceProvider && Array.isArray(addon.serviceProvider) && addon.serviceProvider.length > 0) {
                    requestOptions.provider = addon.serviceProvider;
                }

                const response = await this.context.ChatCompletionService.processRequest(requestOptions, {
                    presetName: undefined, // Don't use presets for sidecar requests
                }, true); // extractData = true

                // Extract content from response
                if (response && typeof response === 'object' && 'content' in response) {
                    return response.content;
                }

                // Fallback extraction
                return response?.choices?.[0]?.message?.content || response?.content || String(response);
            }

            // Fallback: if ChatCompletionService not available, use direct API
            console.warn('[Sidecar AI] ChatCompletionService not available, using fallback');
            return await this.sendDirectAPIFallback(addon, prompt, provider, model, apiUrl, abortController.signal);
        } catch (error) {
            // Check if request was aborted
            if (error.name === 'AbortError' || abortController.signal.aborted) {
                console.log(`[Sidecar AI] Request aborted for ${addon.name}`);
                throw error;
            }

            // Check if we should retry
            if (this.shouldRetry(error, retryCount)) {
                const delay = this.calculateRetryDelay(retryCount);
                console.log(`[Sidecar AI] Retrying ${addon.name} after ${delay}ms (attempt ${retryCount + 1}/${this.retryConfig.maxRetries})`);

                await this.sleep(delay);
                return await this.sendToAI(addon, prompt, retryCount + 1, messageId);
            }

            // Store retry count in error for UI display
            error.retryCount = retryCount;
            error.addonName = addon.name;
            console.error(`[Sidecar AI] Error sending to AI (${addon.name}) after ${retryCount} retries:`, error);
            throw error;
        } finally {
            // Clean up abort controller
            if (messageId !== null && retryCount === 0) {
                const requestKey = `${addon.id}:${messageId}`;
                this.activeRequests.delete(requestKey);
            }
        }
    }

    /**
     * Determine if an error should be retried
     */
    shouldRetry(error, retryCount) {
        // Don't retry if we've exceeded max retries
        if (retryCount >= this.retryConfig.maxRetries) {
            return false;
        }

        // Don't retry on 4xx errors (except 429 rate limit)
        if (error.status || error.statusCode) {
            const status = error.status || error.statusCode;
            if (status >= 400 && status < 500 && status !== 429) {
                return false; // Client errors (except rate limit)
            }
        }

        // Retry on network errors, timeouts, rate limits, and 5xx errors
        const errorMessage = (error.message || '').toLowerCase();
        const isNetworkError = errorMessage.includes('network') ||
            errorMessage.includes('fetch') ||
            errorMessage.includes('timeout') ||
            errorMessage.includes('connection');
        const isRateLimit = error.status === 429 || error.statusCode === 429 || errorMessage.includes('rate limit');
        const isServerError = (error.status >= 500 && error.status < 600) ||
            (error.statusCode >= 500 && error.statusCode < 600);

        return isNetworkError || isRateLimit || isServerError;
    }

    /**
     * Calculate retry delay using exponential backoff
     */
    calculateRetryDelay(retryCount) {
        const delay = Math.min(
            this.retryConfig.initialDelay * Math.pow(this.retryConfig.backoffMultiplier, retryCount),
            this.retryConfig.maxDelay
        );
        return delay;
    }

    /**
     * Sleep utility for retry delays
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Send batch request to AI
     * @param {Array} addons - Array of addon configurations
     * @param {Array} prompts - Array of prompts (one per addon)
     * @param {string|number} messageId - Optional message ID for request cancellation
     */
    async sendBatchToAI(addons, prompts, messageId = null) {
        if (addons.length === 0) {
            return [];
        }

        // Performance: Cancel previous batch requests for same message if exists
        if (messageId !== null) {
            // Cancel individual requests for each addon in batch
            addons.forEach(addon => {
                const requestKey = `${addon.id}:${messageId}`;
                const previousController = this.activeRequests.get(requestKey);
                if (previousController) {
                    previousController.abort();
                    this.activeRequests.delete(requestKey);
                }
            });
        }

        // Create abort controller for batch request
        const batchAbortController = new AbortController();
        if (messageId !== null) {
            // Store batch controller (use special key)
            const batchKey = `batch:${messageId}`;
            this.activeRequests.set(batchKey, batchAbortController);
        }

        try {
            // If using Connection Manager profile, all add-ons must share the same profile.
            const profileId = addons[0].connectionProfileId || '';
            if (profileId) {
                const allSameProfile = addons.every(a => (a.connectionProfileId || '') === profileId);
                if (!allSameProfile) {
                    throw new Error('Batch add-ons must have the same Connection Profile');
                }

                const cm = await this.getConnectionManagerRequestService();
                if (!cm || typeof cm.sendRequest !== 'function') {
                    throw new Error('Connection Manager is not available');
                }

                const combinedPrompt = prompts.join('\n\n---\n\n');
                const response = await cm.sendRequest(
                    profileId,
                    combinedPrompt,
                    4096,
                    { stream: false, extractData: true, includePreset: true },
                    {}
                );

                const content = response?.content || response?.choices?.[0]?.message?.content || String(response);
                return this.splitBatchResponse(content, addons.length);
            }

            // All add-ons in batch must have same provider/model
            const provider = addons[0].aiProvider;
            const model = addons[0].aiModel;

            const allSame = addons.every(addon =>
                addon.aiProvider === provider && addon.aiModel === model
            );

            if (!allSame) {
                throw new Error('Batch add-ons must have the same provider and model');
            }

            try {
                const apiKey = addons[0].apiKey || await this.getProviderApiKey(provider);

                if (!apiKey) {
                    throw new Error(`No API key found for provider: ${provider}`);
                }

                // Combine prompts
                const combinedPrompt = prompts.join('\n\n---\n\n');

                // Use SillyTavern's ChatCompletionService for batch
                if (this.context && this.context.ChatCompletionService) {
                    const chatCompletionSource = this.getChatCompletionSource(provider);
                    const messages = Array.isArray(combinedPrompt)
                        ? combinedPrompt
                        : [{ role: 'user', content: combinedPrompt }];

                    const response = await this.context.ChatCompletionService.processRequest({
                        stream: false,
                        messages: messages,
                        model: model,
                        chat_completion_source: chatCompletionSource,
                        max_tokens: 4096,
                        temperature: 0.7,
                        custom_url: addons[0].apiUrl || undefined,
                    }, {
                        presetName: undefined,
                    }, true);

                    const content = response?.content || response?.choices?.[0]?.message?.content || String(response);
                    return this.splitBatchResponse(content, addons.length);
                }

                // Fallback
                const response = await this.sendDirectAPIFallback(
                    addons[0],
                    combinedPrompt,
                    provider,
                    model,
                    addons[0].apiUrl,
                    batchAbortController.signal
                );

                return this.splitBatchResponse(response, addons.length);
            } catch (error) {
                // Check if request was aborted
                if (error.name === 'AbortError' || batchAbortController.signal.aborted) {
                    console.log(`[Sidecar AI] Batch request aborted for message ${messageId}`);
                    throw error;
                }
                console.error('[Add-Ons Extension] Error sending batch to AI:', error);
                throw error;
            }
        } catch (error) {
            // Handle errors from outer try block (Connection Manager path or other errors)
            console.error('[Add-Ons Extension] Error in sendBatchToAI:', error);
            throw error;
        } finally {
            // Clean up batch controller (always run, regardless of success or error)
            if (messageId !== null) {
                const batchKey = `batch:${messageId}`;
                this.activeRequests.delete(batchKey);
            }
        }
    }

    /**
     * Fallback: Send direct API request (only used if ChatCompletionService unavailable)
     * @param {AbortSignal} signal - Optional abort signal for request cancellation
     */
    async sendDirectAPIFallback(addon, prompt, provider, model, apiUrl = null, signal = null) {
        let endpoint = apiUrl;

        if (!endpoint) {
            endpoint = this.getProviderEndpoint(provider);
        } else {
            console.log('[Sidecar AI] Using custom API URL:', endpoint);
        }

        // Get API key from addon or fallback to provider key
        const apiKey = addon.apiKey || await this.getProviderApiKey(provider);
        if (!apiKey) {
            throw new Error(`No API key found for provider: ${provider}`);
        }

        const requestBody = this.buildRequestBody(provider, model, prompt);

        const headers = {
            'Content-Type': 'application/json'
        };

        // OpenRouter uses different header format
        if (provider === 'openrouter') {
            headers['Authorization'] = `Bearer ${apiKey}`;
            headers['HTTP-Referer'] = window.location.origin || 'https://github.com/skirianov/sidecar-ai';
            headers['X-Title'] = 'Sidecar AI';
        } else {
            headers['Authorization'] = `Bearer ${apiKey}`;
        }

        const fetchOptions = {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(requestBody)
        };

        // Add abort signal if provided
        if (signal) {
            fetchOptions.signal = signal;
        }

        const response = await fetch(endpoint, fetchOptions);

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API request failed: ${response.status} ${errorText}`);
        }

        const data = await response.json();
        return this.extractContent(data, provider);
    }

    /**
     * Get provider API endpoint
     */
    getProviderEndpoint(provider) {
        const endpoints = {
            'openai': 'https://api.openai.com/v1/chat/completions',
            'openrouter': 'https://openrouter.ai/api/v1/chat/completions',
            'anthropic': 'https://api.anthropic.com/v1/messages',
            'deepseek': 'https://api.deepseek.com/v1/chat/completions',
            'google': 'https://generativelanguage.googleapis.com/v1beta/models',
            'cohere': 'https://api.cohere.ai/v1/generate'
        };

        return endpoints[provider] || endpoints['openai'];
    }

    /**
     * Build request body for provider
     */
    buildRequestBody(provider, model, prompt) {
        const baseBody = {
            model: model,
            messages: [
                {
                    role: 'user',
                    content: prompt
                }
            ]
        };

        // Provider-specific adjustments
        switch (provider) {
            case 'openrouter':
                // OpenRouter uses OpenAI-compatible format
                return {
                    ...baseBody,
                    temperature: 0.7,
                    max_tokens: 4096
                };

            case 'anthropic':
                return {
                    model: model,
                    max_tokens: 4096,
                    messages: [
                        {
                            role: 'user',
                            content: prompt
                        }
                    ]
                };

            case 'google':
                return {
                    contents: [
                        {
                            parts: [
                                {
                                    text: prompt
                                }
                            ]
                        }
                    ]
                };

            case 'cohere':
                return {
                    model: model,
                    prompt: prompt,
                    max_tokens: 4096
                };

            default: // OpenAI, Deepseek, etc.
                return {
                    ...baseBody,
                    temperature: 0.7,
                    max_tokens: 4096
                };
        }
    }

    /**
     * Extract content from API response
     */
    extractContent(data, provider) {
        if (!data) {
            return '';
        }

        switch (provider) {
            case 'anthropic':
                return data.content?.[0]?.text || data.text || '';

            case 'google':
                return data.candidates?.[0]?.content?.parts?.[0]?.text || '';

            case 'cohere':
                return data.generations?.[0]?.text || data.text || '';

            default: // OpenAI, Deepseek, etc.
                return data.choices?.[0]?.message?.content || data.content || '';
        }
    }

    /**
     * Split batch response into individual responses
     */
    splitBatchResponse(response, count) {
        // Simple splitting by separator - may need refinement based on actual responses
        const separator = '\n\n---\n\n';
        const parts = response.split(separator);

        // If splitting didn't work, try to split by add-on markers
        if (parts.length !== count) {
            const markerPattern = /=== .+? ===/g;
            const markers = [...response.matchAll(markerPattern)];

            if (markers.length === count) {
                const results = [];
                for (let i = 0; i < markers.length; i++) {
                    const start = markers[i].index + markers[i][0].length;
                    const end = i < markers.length - 1 ? markers[i + 1].index : response.length;
                    results.push(response.substring(start, end).trim());
                }
                return results;
            }
        }

        // Fallback: return array with single response repeated or split evenly
        if (parts.length === count) {
            return parts;
        }

        // If we can't split properly, return the full response for first add-on
        // and empty strings for others (user can refine splitting logic)
        const results = [response];
        for (let i = 1; i < count; i++) {
            results.push('');
        }
        return results;
    }

    /**
     * Test API connection with provided credentials
     * Sends a minimal test request to validate API key, model, and endpoint
     */
    async testConnection(provider, model, apiKey, apiUrl = null, serviceProvider = [], isUsingSTKey = false) {
        try {
            const chatCompletionSource = this.getChatCompletionSource(provider);

            // List of providers that block browser requests (CORS)
            const corsBlockingProviders = ['deepseek', 'anthropic', 'google', 'cohere'];
            const isCorsBlocking = corsBlockingProviders.includes(provider.toLowerCase());

            // Try ChatCompletionService first (avoids CORS issues, uses server-side requests)
            // This is especially important when using ST's saved key (avoids 403 errors)
            // or for providers like Deepseek that block browser requests
            if (this.context && this.context.ChatCompletionService && (isUsingSTKey || isCorsBlocking)) {
                console.log(`[Sidecar AI] Testing connection via ChatCompletionService: ${provider} (${model})${isUsingSTKey ? ' (using ST saved key)' : ''}`);

                try {
                    const testMessages = [{ role: 'user', content: 'test' }];

                    const requestOptions = {
                        stream: false,
                        messages: testMessages,
                        model: model,
                        chat_completion_source: chatCompletionSource,
                        max_tokens: 10, // Minimal tokens for test
                        temperature: 0.7,
                        custom_url: apiUrl || undefined,
                    };

                    // Add OpenRouter service providers if specified
                    if (provider === 'openrouter' && Array.isArray(serviceProvider) && serviceProvider.length > 0) {
                        requestOptions.provider = serviceProvider;
                    }

                    let response;
                    try {
                        response = await this.context.ChatCompletionService.processRequest(
                            requestOptions,
                            { presetName: undefined },
                            true
                        );
                    } catch (chatServiceError) {
                        // Log the raw error first
                        console.warn('[Sidecar AI] ChatCompletionService test failed:', chatServiceError);
                        console.warn('[Sidecar AI] Error type:', typeof chatServiceError);
                        console.warn('[Sidecar AI] Error keys:', chatServiceError ? Object.keys(chatServiceError) : 'null');
                        console.warn('[Sidecar AI] Full error object:', chatServiceError);

                        // Try to get more details from the error
                        // The error might have a response property or other details
                        if (chatServiceError && typeof chatServiceError === 'object') {
                            // Check if there's a response property (from fetch)
                            if (chatServiceError.response) {
                                console.warn('[Sidecar AI] Error has response property:', chatServiceError.response);
                            }
                            // Check if there's a cause property (from newer Error objects)
                            if (chatServiceError.cause) {
                                console.warn('[Sidecar AI] Error has cause property:', chatServiceError.cause);
                            }
                            // Log all enumerable and non-enumerable properties
                            console.warn('[Sidecar AI] Error object properties:', Object.getOwnPropertyNames(chatServiceError));
                            for (const key in chatServiceError) {
                                console.warn(`[Sidecar AI] Error.${key}:`, chatServiceError[key]);
                            }
                        }

                        // Re-throw to be handled below
                        throw chatServiceError;
                    }

                    // If we got a response (even empty), connection works
                    console.log('[Sidecar AI] ChatCompletionService test successful');
                    return { success: true, message: 'Connection successful' };
                } catch (chatServiceError) {
                    // This catch handles the re-thrown error
                    console.warn('[Sidecar AI] ChatCompletionService error handling:', chatServiceError);

                    // Log all properties to help debug
                    if (chatServiceError && typeof chatServiceError === 'object') {
                        console.warn('[Sidecar AI] Error object properties:', Object.getOwnPropertyNames(chatServiceError));
                        for (const key in chatServiceError) {
                            console.warn(`[Sidecar AI] Error.${key}:`, chatServiceError[key]);
                        }
                    }

                    // ChatCompletionService throws the JSON response directly when there's an error
                    // The error object is the API response, which may have nested error properties
                    let errorMsg = '';
                    if (chatServiceError && typeof chatServiceError === 'object') {
                        // Try to extract error message from various possible structures
                        // Common structures: {error: {...}}, {error: "message"}, {message: "..."}, {error: true, ...}

                        // Check for nested error.message (most common)
                        if (chatServiceError.error && typeof chatServiceError.error === 'object') {
                            errorMsg = chatServiceError.error.message ||
                                chatServiceError.error.error?.message ||
                                chatServiceError.error.error ||
                                JSON.stringify(chatServiceError.error);
                        }
                        // Check for string error
                        else if (chatServiceError.error && typeof chatServiceError.error === 'string') {
                            errorMsg = chatServiceError.error;
                        }
                        // Check for top-level message
                        else if (chatServiceError.message) {
                            errorMsg = chatServiceError.message;
                        }
                        // Check for statusText or status
                        else if (chatServiceError.statusText) {
                            errorMsg = `${chatServiceError.status} ${chatServiceError.statusText}`;
                        }
                        // Try to find any string property that might be an error message
                        else {
                            const stringProps = Object.entries(chatServiceError)
                                .filter(([k, v]) => typeof v === 'string' && v.length > 0 && k !== 'error')
                                .map(([k, v]) => `${k}: ${v}`);
                            if (stringProps.length > 0) {
                                errorMsg = stringProps.join(', ');
                            } else {
                                // Last resort: stringify the whole object (excluding error: true)
                                try {
                                    const errorStr = JSON.stringify(chatServiceError, null, 2);
                                    if (errorStr !== '{}' && errorStr !== '{"error":true}') {
                                        errorMsg = errorStr;
                                    }
                                } catch (e) {
                                    errorMsg = String(chatServiceError);
                                }
                            }
                        }
                    } else {
                        errorMsg = String(chatServiceError);
                    }

                    // If error message is still empty or just "true", provide a helpful default
                    if (!errorMsg || errorMsg === 'true' || errorMsg === '{}' || errorMsg === '{"error":true}') {
                        // The API returned {error: true} which means 400 Bad Request
                        // Common causes: invalid model name, API key doesn't have access, or configuration issue
                        let modelHint = '';
                        if (provider === 'google') {
                            // Common Google/Gemini model names
                            modelHint = `\n\nCommon Google/Gemini model names:\n` +
                                `• gemini-1.5-pro\n` +
                                `• gemini-1.5-flash\n` +
                                `• gemini-2.0-flash-exp\n` +
                                `• gemini-2.0-pro-exp\n` +
                                `• gemini-pro\n` +
                                `\nNote: Model names like "gemini-2.5-pro" or "gemini-3-pro-preview" might not exist.\n` +
                                `Try "gemini-1.5-pro" or "gemini-2.0-pro-exp" instead.\n` +
                                `Check SillyTavern's Google model dropdown for valid model names.`;
                        }

                        errorMsg = `Bad Request (400) - The API rejected the request.\n\n` +
                            `Common causes:\n` +
                            `• Invalid model name: "${model}"\n` +
                            `• API key doesn't have access to this model\n` +
                            `• Model not available in your region/account\n` +
                            `• Provider configuration issue in SillyTavern` +
                            modelHint +
                            `\n\nTry:\n` +
                            `1. Verify the model name is correct in SillyTavern's API Connection settings\n` +
                            `2. Check if the model is available for your API key\n` +
                            `3. Test the connection directly in SillyTavern's API Connection tab\n` +
                            `4. Check the browser console for more details`;
                    }

                    // If using ST key and ChatCompletionService fails, it's likely a configuration issue
                    // not a CORS issue (since we're using server-side requests)
                    if (isUsingSTKey) {
                        // Better error message for ST key users
                        throw new Error(
                            `Connection test failed: ${errorMsg}\n\n` +
                            `The API key is configured in SillyTavern, but the connection test failed.\n` +
                            `Possible issues:\n` +
                            `- Invalid model name: "${model}"\n` +
                            `- API key doesn't have access to this model\n` +
                            `- Provider configuration issue in SillyTavern\n\n` +
                            `Check SillyTavern's API Connection settings and verify the model name is correct.`
                        );
                    }

                    // For CORS-blocking providers, don't fall back to direct API
                    if (isCorsBlocking) {
                        throw new Error(
                            `ChatCompletionService failed: ${errorMsg}\n\n` +
                            `This provider (${provider}) blocks browser requests.\n\n` +
                            `SOLUTION: Configure ${provider} in SillyTavern's API Connection settings:\n` +
                            `1. Go to Settings → API Connection\n` +
                            `2. Select ${provider} as your provider\n` +
                            `3. Enter your API key there\n` +
                            `4. The extension will automatically use server-side requests\n\n` +
                            `Do NOT enter the API key in the extension form - use ST's API Connection instead.`
                        );
                    }
                    // For non-CORS providers, fall through to direct API test
                }
            } else if (isCorsBlocking) {
                // ChatCompletionService not available and provider blocks CORS
                throw new Error(
                    `ChatCompletionService not available and ${provider} blocks browser requests.\n\n` +
                    `SOLUTION: Configure ${provider} in SillyTavern's API Connection settings.\n` +
                    `The extension requires ChatCompletionService for providers that block CORS.`
                );
            }

            // Fallback: Use direct API testing (only for non-CORS-blocking providers)
            if (apiKey && !isCorsBlocking) {
                console.log(`[Sidecar AI] Testing connection directly: ${provider} (${model})`);
                return await this.testConnectionDirect(provider, model, apiKey, apiUrl);
            }

            if (!apiKey && !this.context?.ChatCompletionService) {
                throw new Error('No API key provided and ChatCompletionService not available');
            }

            throw new Error('Unable to test connection - please configure provider in SillyTavern API Connection settings');
        } catch (error) {
            console.error('[Sidecar AI] Connection test failed:', error);
            console.error('[Sidecar AI] Error details:', {
                name: error.name,
                message: error.message,
                stack: error.stack
            });

            const errorMessage = error.message || String(error);

            // Handle specific error cases
            if (errorMessage.includes('401') || errorMessage.includes('Unauthorized')) {
                return { success: false, message: 'Invalid API key - check your credentials' };
            }
            if (errorMessage.includes('404') || errorMessage.includes('Not Found')) {
                return { success: false, message: 'Invalid model or endpoint - verify model name and API URL' };
            }
            if (errorMessage.includes('429')) {
                return { success: false, message: 'Rate limit exceeded - try again later' };
            }
            if (errorMessage.includes('403') || errorMessage.includes('Forbidden')) {
                return { success: false, message: 'API key does not have permission' };
            }
            if (errorMessage.includes('Network error') || errorMessage.includes('fetch') || errorMessage.includes('Failed to fetch')) {
                return {
                    success: false,
                    message: `CORS/Network error: This provider (${provider}) blocks browser requests.\n\nSolution: Configure this provider in SillyTavern's API Connection settings and use that configured key, or use a reverse proxy.\n\nError: ${errorMessage}`
                };
            }
            if (errorMessage.includes('CORS') || errorMessage.includes('Access-Control')) {
                return {
                    success: false,
                    message: `CORS error: ${provider} API blocks direct browser requests.\n\nSolution: Configure ${provider} in SillyTavern's API Connection settings, then the extension will use server-side requests automatically.`
                };
            }

            // Default error message
            return {
                success: false,
                message: errorMessage || 'Unknown error occurred. Check browser console for details.'
            };
        }
    }

    /**
     * Test connection using direct API call (fallback)
     */
    async testConnectionDirect(provider, model, apiKey, apiUrl = null) {
        if (!apiKey) {
            throw new Error('API key is required');
        }

        let endpoint = apiUrl;
        if (!endpoint) {
            endpoint = this.getProviderEndpoint(provider);
        }

        const requestBody = this.buildRequestBody(provider, model, 'test');

        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        };

        // OpenRouter headers
        if (provider === 'openrouter') {
            headers['HTTP-Referer'] = window.location.origin || 'https://github.com/skirianov/sidecar-ai';
            headers['X-Title'] = 'Sidecar AI';
        }

        try {
            console.log(`[Sidecar AI] Testing connection to: ${endpoint}`);
            console.log(`[Sidecar AI] Request body:`, JSON.stringify(requestBody, null, 2));

            const response = await fetch(endpoint, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(requestBody)
            });

            console.log(`[Sidecar AI] Response status: ${response.status} ${response.statusText}`);

            // Handle status 0 (network/CORS error)
            if (response.status === 0) {
                throw new Error('Network error: Request blocked (likely CORS issue). Deepseek API may require server-side requests or a proxy.');
            }

            if (!response.ok) {
                let errorText = '';
                try {
                    errorText = await response.text();
                    // Try to parse as JSON for better error messages
                    try {
                        const errorJson = JSON.parse(errorText);
                        if (errorJson.error) {
                            errorText = errorJson.error.message || errorJson.error.code || JSON.stringify(errorJson.error);
                        } else {
                            errorText = JSON.stringify(errorJson);
                        }
                    } catch (e) {
                        // Not JSON, use as-is
                    }
                } catch (e) {
                    errorText = `HTTP ${response.status}: ${response.statusText}`;
                }

                const errorMessage = errorText || `HTTP ${response.status}`;
                throw new Error(`API request failed: ${response.status} - ${errorMessage}`);
            }

            let data;
            try {
                data = await response.json();
            } catch (e) {
                throw new Error(`Invalid JSON response: ${e.message}`);
            }

            console.log(`[Sidecar AI] Response data:`, data);

            // Verify we got a valid response
            const content = this.extractContent(data, provider);
            if (!content && !data.choices && !data.content) {
                console.warn('[Sidecar AI] Response structure:', data);
                // For some providers, empty content might be valid for test
                // Check if we at least got a valid response structure
                if (data.id || data.model || data.usage) {
                    return { success: true, message: 'Connection successful (empty response)' };
                }
                throw new Error('Invalid response format - no content or choices found');
            }

            return { success: true, message: 'Connection successful' };
        } catch (error) {
            // Handle network errors (CORS, connection refused, etc.)
            if (error.name === 'TypeError' && error.message.includes('fetch')) {
                console.error('[Sidecar AI] Network error:', error);
                throw new Error(`Network error: ${error.message}. Check if endpoint is correct and CORS is enabled.`);
            }

            // Re-throw other errors as-is
            throw error;
        }
    }

    /**
     * Map provider name to SECRET_KEY constant
     */
    getSecretKeyForProvider(provider) {
        const providerToSecretKey = {
            'openai': 'api_key_openai',
            'openrouter': 'api_key_openrouter',
            'anthropic': 'api_key_claude',
            'claude': 'api_key_claude',
            'google': 'api_key_makersuite',
            'deepseek': 'api_key_deepseek',
            'cohere': 'api_key_cohere',
            'groq': 'api_key_groq',
            'mistralai': 'api_key_mistralai',
            'mistral': 'api_key_mistralai',
            'xai': 'api_key_xai',
            'perplexity': 'api_key_perplexity',
            'ai21': 'api_key_ai21',
            'nanogpt': 'api_key_nanogpt',
            'aimlapi': 'api_key_aimlapi',
            'custom': 'api_key_custom',
        };
        return providerToSecretKey[provider?.toLowerCase()] || null;
    }

    /**
     * Get secret_state from window or fetch from API
     * secret_state only contains metadata, not actual API keys
     * SillyTavern exports secret_state from secrets.js, it might be available globally
     */
    async getSecretState() {
        if (typeof window !== 'undefined') {
            // Try multiple ways to access secret_state
            // Method 1: Direct window access
            if (window.secret_state) {
                return window.secret_state;
            }
            // Method 2: Through SillyTavern global
            if (window.SillyTavern && window.SillyTavern.secret_state) {
                return window.SillyTavern.secret_state;
            }
            // Method 3: Try to fetch from API (like SillyTavern does)
            try {
                const headers = this.getRequestHeaders();
                const response = await fetch('/api/secrets/read', {
                    method: 'POST',
                    headers: headers,
                    credentials: 'same-origin'
                });
                if (response.ok) {
                    const secretState = await response.json();
                    // Cache it for future use
                    if (typeof window !== 'undefined') {
                        window.secret_state = secretState;
                    }
                    return secretState;
                }
            } catch (e) {
                console.warn('[Sidecar AI] Failed to fetch secret_state from API:', e);
            }
        }
        return null;
    }

    /**
     * Get request headers for API calls
     */
    getRequestHeaders() {
        // Try multiple ways to get request headers
        let headers = null;

        // Method 1: Direct global function (most common in SillyTavern)
        if (typeof getRequestHeaders === 'function') {
            try {
                headers = getRequestHeaders();
                console.log('[Sidecar AI] Got headers from global getRequestHeaders');
            } catch (e) {
                console.warn('[Sidecar AI] Error calling global getRequestHeaders:', e);
            }
        }

        // Method 2: Through window object
        if (!headers && typeof window !== 'undefined') {
            if (window.getRequestHeaders && typeof window.getRequestHeaders === 'function') {
                try {
                    headers = window.getRequestHeaders();
                    console.log('[Sidecar AI] Got headers from window.getRequestHeaders');
                } catch (e) {
                    console.warn('[Sidecar AI] Error calling window.getRequestHeaders:', e);
                }
            }
            // Also try through SillyTavern global
            if (!headers && window.SillyTavern && window.SillyTavern.getRequestHeaders && typeof window.SillyTavern.getRequestHeaders === 'function') {
                try {
                    headers = window.SillyTavern.getRequestHeaders();
                    console.log('[Sidecar AI] Got headers from window.SillyTavern.getRequestHeaders');
                } catch (e) {
                    console.warn('[Sidecar AI] Error calling window.SillyTavern.getRequestHeaders:', e);
                }
            }
        }

        // Method 3: Through context
        if (!headers && this.context && this.context.getRequestHeaders && typeof this.context.getRequestHeaders === 'function') {
            try {
                headers = this.context.getRequestHeaders();
                console.log('[Sidecar AI] Got headers from context.getRequestHeaders');
            } catch (e) {
                console.warn('[Sidecar AI] Error calling context.getRequestHeaders:', e);
            }
        }

        // Fallback: Basic headers (won't work for authenticated endpoints)
        if (!headers) {
            console.warn('[Sidecar AI] getRequestHeaders not found, using basic headers (may cause 403)');
            headers = {
                'Content-Type': 'application/json'
            };
        }

        console.log('[Sidecar AI] Request headers:', Object.keys(headers || {}));
        return headers;
    }

    /**
     * Call SillyTavern's /api/secrets/find endpoint to get actual API key value
     * This is equivalent to findSecret() function
     */
    async findSecret(key, id = null) {
        // Method 1: Try to use window.findSecret if available (most reliable)
        if (typeof window !== 'undefined' && window.findSecret && typeof window.findSecret === 'function') {
            try {
                console.log(`[Sidecar AI] Using window.findSecret for ${key}${id ? ` (id: ${id})` : ''}`);
                const result = await window.findSecret(key, id);
                if (result) {
                    console.log('[Sidecar AI] Successfully got secret via window.findSecret');
                    return result;
                }
            } catch (e) {
                console.warn('[Sidecar AI] window.findSecret failed, trying direct API call:', e);
            }
        }

        // Method 2: Direct API call with proper headers
        try {
            const headers = this.getRequestHeaders();

            console.log(`[Sidecar AI] Fetching secret via API: ${key}${id ? ` (id: ${id})` : ''}`);

            const response = await fetch('/api/secrets/find', {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({ key, id }),
                credentials: 'same-origin' // Include cookies for authentication
            });

            if (!response.ok) {
                const errorText = await response.text().catch(() => '');
                console.warn(`[Sidecar AI] API returned ${response.status} for secret ${key}:`, errorText.substring(0, 100));
                return null;
            }

            const data = await response.json();
            return data.value || null;
        } catch (error) {
            console.warn('[Sidecar AI] Failed to fetch secret via API:', error);
            return null;
        }
    }

    /**
     * Check if API key exists for provider (without fetching the actual value)
     * This checks connection profiles AND secret_state (like SillyTavern does)
     * @returns {Promise<boolean>} True if API key exists, false otherwise
     */
    async hasProviderApiKey(provider) {
        if (!provider) {
            return false;
        }

        const providerLower = provider.toLowerCase();
        console.log(`[Sidecar AI] hasProviderApiKey: Checking for ${provider} (${providerLower})`);

        // Method 1: Check Connection Manager profiles
        if (this.context && this.context.extensionSettings && this.context.extensionSettings.connectionManager) {
            const profiles = this.context.extensionSettings.connectionManager.profiles || [];
            console.log(`[Sidecar AI] Checking ${profiles.length} connection manager profiles`);

            for (const profile of profiles) {
                const profileApi = profile?.api?.toLowerCase();
                console.log(`[Sidecar AI] Profile: api=${profileApi}, hasSecretId=${!!profile?.['secret-id']}`);

                if (profile && profileApi === providerLower && profile['secret-id']) {
                    console.log(`[Sidecar AI] Found connection profile with secret-id for ${provider}`);
                    return true;
                }
            }
        }

        // Method 2: Check secret_state metadata (even if not in connection profile)
        // This checks if the API key exists in SillyTavern's secret storage
        // SillyTavern checks secret_state[SECRET_KEYS.PROVIDER] directly - if truthy, key exists
        const secretState = await this.getSecretState();
        const secretKey = this.getSecretKeyForProvider(provider);
        console.log(`[Sidecar AI] Checking secret_state for key: ${secretKey}`);

        if (secretState && secretKey) {
            const secrets = secretState[secretKey];
            console.log(`[Sidecar AI] secret_state[${secretKey}]:`, secrets);

            // SillyTavern checks: if (!secret_state[SECRET_KEYS.DEEPSEEK]) - so if it's truthy, key exists
            if (secrets) {
                // secret_state can be an array of secrets or a truthy value
                if (Array.isArray(secrets)) {
                    if (secrets.length > 0) {
                        console.log(`[Sidecar AI] Found secret_state entry for ${provider} (${secrets.length} secrets)`);
                        return true;
                    }
                } else {
                    // If it's not an array but truthy, the key exists (like SillyTavern checks)
                    console.log(`[Sidecar AI] Found secret_state entry for ${provider} (non-array, truthy)`);
                    return true;
                }
            } else {
                console.log(`[Sidecar AI] secret_state[${secretKey}] is falsy`);
            }
        } else {
            if (!secretState) {
                console.log(`[Sidecar AI] secret_state not available for checking`);
            }
            if (!secretKey) {
                console.log(`[Sidecar AI] No secret key mapping for provider: ${provider}`);
            }
        }

        console.log(`[Sidecar AI] No API key found for ${provider}`);
        return false;
    }

    /**
     * Get API key for provider from SillyTavern settings
     * Uses same approach as SillyTavern's API connection system
     * @returns {Promise<string|null>} API key or null if not found
     */
    async getProviderApiKey(provider) {
        if (!provider) {
            console.log('[Sidecar AI] getProviderApiKey: No provider specified');
            return null;
        }

        console.log(`[Sidecar AI] getProviderApiKey: Looking for API key for provider: ${provider}`);

        // Get secret_state (metadata only, doesn't contain actual keys)
        const secretState = await this.getSecretState();
        console.log('[Sidecar AI] secret_state available:', !!secretState);

        // Method 1: Check Connection Manager profiles (ST's primary method)
        // Connection Manager profiles store secret-id, not the actual key
        if (this.context && this.context.extensionSettings && this.context.extensionSettings.connectionManager) {
            const profiles = this.context.extensionSettings.connectionManager.profiles || [];
            console.log(`[Sidecar AI] Found ${profiles.length} connection manager profiles`);

            for (const profile of profiles) {
                console.log(`[Sidecar AI] Checking profile:`, { api: profile?.api, name: profile?.name, hasSecretId: !!profile?.['secret-id'] });

                // Check if profile matches provider (case-insensitive)
                const profileApi = profile?.api?.toLowerCase();
                const providerLower = provider?.toLowerCase();

                if (profile && profileApi === providerLower && profile['secret-id']) {
                    const secretId = profile['secret-id'];
                    const secretKey = this.getSecretKeyForProvider(provider);

                    console.log(`[Sidecar AI] Found matching profile! secretId: ${secretId}, secretKey: ${secretKey}`);

                    // secret_state doesn't have the actual value, fetch it via API
                    if (secretKey) {
                        console.log(`[Sidecar AI] Method 1: Fetching secret via API: ${secretKey}, id: ${secretId}`);
                        const apiKey = await this.findSecret(secretKey, secretId);
                        if (apiKey) {
                            console.log(`[Sidecar AI] Successfully fetched API key via API (Method 1)`);
                            return apiKey;
                        } else {
                            console.log(`[Sidecar AI] API returned null for ${secretKey} with id ${secretId}`);
                        }
                    } else {
                        console.log(`[Sidecar AI] No secretKey mapped for provider: ${provider}`);
                    }
                }
            }
        }

        // Method 2: Check secret_state for active secrets and fetch via API (fallback if no Connection Manager profile)
        const secretKey = this.getSecretKeyForProvider(provider);
        console.log(`[Sidecar AI] Method 2: secretKey for ${provider}: ${secretKey}`);

        if (secretKey) {
            // Check if secret exists in secret_state (metadata check)
            if (secretState && secretState[secretKey]) {
                const secrets = secretState[secretKey];
                console.log(`[Sidecar AI] Found secrets in secret_state for ${secretKey}:`, Array.isArray(secrets) ? secrets.length : 'not an array');

                if (Array.isArray(secrets) && secrets.length > 0) {
                    // Find active secret ID, or use first one
                    const activeSecret = secrets.find(s => s.active) || secrets[0];
                    const secretId = activeSecret?.id;

                    if (secretId) {
                        console.log(`[Sidecar AI] Method 2: Fetching secret via API with ID: ${secretId}`);
                        const apiKey = await this.findSecret(secretKey, secretId);
                        if (apiKey) {
                            console.log(`[Sidecar AI] Successfully fetched API key via API (Method 2)`);
                            return apiKey;
                        }
                    }
                }
            }

            // Method 3: Try to fetch via API without ID (gets active secret)
            console.log(`[Sidecar AI] Method 3: Attempting API fetch for ${secretKey} (no ID)`);
            const apiKey = await this.findSecret(secretKey);
            if (apiKey) {
                console.log(`[Sidecar AI] Successfully fetched API key via API (Method 3)`);
                return apiKey;
            }
        }

        // Method 4: Legacy fallback - check old connection_profiles structure
        if (this.context && this.context.connection_profiles) {
            const profiles = Object.values(this.context.connection_profiles || {});
            for (const profile of profiles) {
                if (profile && (profile.api_provider === provider || profile.api === provider)) {
                    if (profile.api_key) {
                        return profile.api_key;
                    }
                }
            }
        }

        // Method 5: Check API settings directly
        if (this.context && this.context.api_settings) {
            const providerSettings = this.context.api_settings[provider];
            if (providerSettings && providerSettings.api_key) {
                return providerSettings.api_key;
            }
        }

        // Method 6: Check settings.api_keys
        if (this.context && this.context.settings && this.context.settings.api_keys) {
            return this.context.settings.api_keys[provider];
        }

        // Method 7: Try global ST storage
        if (typeof window !== 'undefined') {
            if (window.SillyTavern && window.SillyTavern.api_keys) {
                const key = window.SillyTavern.api_keys[provider];
                if (key) {
                    console.log(`[Sidecar AI] Found API key in window.SillyTavern.api_keys`);
                    return key;
                }
            }
            if (window.api_keys) {
                const key = window.api_keys[provider];
                if (key) {
                    console.log(`[Sidecar AI] Found API key in window.api_keys`);
                    return key;
                }
            }
        }

        console.log(`[Sidecar AI] No API key found for provider: ${provider}`);
        return null;
    }

    /**
     * Cancel all pending requests
     */
    cancelAllRequests() {
        const count = this.activeRequests.size;
        this.activeRequests.forEach((controller, key) => {
            controller.abort();
        });
        this.activeRequests.clear();
        if (count > 0) {
            console.log(`[Sidecar AI] Cancelled ${count} pending request(s)`);
        }
    }

    /**
     * Cancel requests for a specific message
     */
    cancelRequestsForMessage(messageId) {
        let cancelled = 0;
        const keysToDelete = [];

        this.activeRequests.forEach((controller, key) => {
            if (key.endsWith(`:${messageId}`) || key === `batch:${messageId}`) {
                controller.abort();
                keysToDelete.push(key);
                cancelled++;
            }
        });

        keysToDelete.forEach(key => this.activeRequests.delete(key));
        if (cancelled > 0) {
            console.log(`[Sidecar AI] Cancelled ${cancelled} request(s) for message ${messageId}`);
        }
    }

    /**
     * Cleanup all resources
     */
    cleanup() {
        this.cancelAllRequests();
        console.log('[Sidecar AI] AIClient cleanup complete');
    }
}
