/**
 * AI Client
 * Handles communication with AI providers
 * Uses SillyTavern's ChatCompletionService for all API requests
 */

export class AIClient {
    constructor(context) {
        this.context = context;
    }

    /**
     * Map provider names to SillyTavern's chat_completion_source values
     */
    getChatCompletionSource(provider) {
        const sourceMap = {
            'openai': 'openai',
            'openrouter': 'openrouter',
            'anthropic': 'anthropic',
            'google': 'google',
            'deepseek': 'deepseek',
            'cohere': 'cohere',
            'custom': 'custom',
            // Add more mappings as needed
        };
        return sourceMap[provider] || 'openai';
    }

    /**
     * Send single add-on request to AI using SillyTavern's ChatCompletionService
     */
    async sendToAI(addon, prompt) {
        try {
            const provider = addon.aiProvider || 'openai';
            const model = addon.aiModel || 'gpt-3.5-turbo';
            const apiUrl = addon.apiUrl; // Custom endpoint support
            const chatCompletionSource = this.getChatCompletionSource(provider);

            // Use SillyTavern's ChatCompletionService - it handles everything!
            if (this.context && this.context.ChatCompletionService) {
                console.log(`[Sidecar AI] Using SillyTavern ChatCompletionService for ${provider} (${model})`);

                const messages = Array.isArray(prompt)
                    ? prompt
                    : [{ role: 'user', content: prompt }];

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
            return await this.sendDirectAPIFallback(addon, prompt, provider, model, apiUrl);
        } catch (error) {
            console.error(`[Sidecar AI] Error sending to AI (${addon.name}):`, error);
            throw error;
        }
    }

    /**
     * Send batch request to AI
     */
    async sendBatchToAI(addons, prompts) {
        if (addons.length === 0) {
            return [];
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
                addons[0].apiUrl
            );

            return this.splitBatchResponse(response, addons.length);
        } catch (error) {
            console.error('[Add-Ons Extension] Error sending batch to AI:', error);
            throw error;
        }
    }

    /**
     * Fallback: Send direct API request (only used if ChatCompletionService unavailable)
     */
    async sendDirectAPIFallback(addon, prompt, provider, model, apiUrl = null) {
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

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(requestBody)
        });

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

                    const response = await this.context.ChatCompletionService.processRequest(
                        requestOptions,
                        { presetName: undefined },
                        true
                    );

                    // If we got a response (even empty), connection works
                    console.log('[Sidecar AI] ChatCompletionService test successful');
                    return { success: true, message: 'Connection successful' };
                } catch (chatServiceError) {
                    console.warn('[Sidecar AI] ChatCompletionService test failed:', chatServiceError);

                    // For CORS-blocking providers, don't fall back to direct API
                    if (isCorsBlocking) {
                        const errorMsg = chatServiceError.message || String(chatServiceError);
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
     * Get secret_state from window (if available)
     * secret_state only contains metadata, not actual API keys
     */
    getSecretState() {
        if (typeof window !== 'undefined') {
            return window.secret_state || (window.SillyTavern && window.SillyTavern.secret_state) || null;
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
     * This is faster and doesn't require API access
     * @returns {boolean} True if API key exists, false otherwise
     */
    hasProviderApiKey(provider) {
        if (!provider) {
            return false;
        }

        // Method 1: Check Connection Manager profiles
        if (this.context && this.context.extensionSettings && this.context.extensionSettings.connectionManager) {
            const profiles = this.context.extensionSettings.connectionManager.profiles || [];
            const providerLower = provider.toLowerCase();

            for (const profile of profiles) {
                if (profile && profile.api?.toLowerCase() === providerLower && profile['secret-id']) {
                    console.log(`[Sidecar AI] Found connection profile with secret-id for ${provider}`);
                    return true;
                }
            }
        }

        // Method 2: Check secret_state metadata
        const secretState = this.getSecretState();
        if (secretState) {
            const secretKey = this.getSecretKeyForProvider(provider);
            if (secretKey && secretState[secretKey]) {
                const secrets = secretState[secretKey];
                if (Array.isArray(secrets) && secrets.length > 0) {
                    console.log(`[Sidecar AI] Found secret_state entry for ${provider}`);
                    return true;
                }
            }
        }

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
        const secretState = this.getSecretState();
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
}
