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

                const response = await this.context.ChatCompletionService.processRequest({
                    stream: false,
                    messages: messages,
                    model: model,
                    chat_completion_source: chatCompletionSource,
                    max_tokens: 4096,
                    temperature: 0.7,
                    custom_url: apiUrl || undefined, // Use custom URL if provided
                    // SillyTavern will automatically handle:
                    // - API keys from connection profiles
                    // - Reverse proxy settings
                    // - Provider-specific headers
                    // - All the complex stuff!
                }, {
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
            const apiKey = addons[0].apiKey || this.getProviderApiKey(provider);

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
        const apiKey = addon.apiKey || this.getProviderApiKey(provider);
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
    async testConnection(provider, model, apiKey, apiUrl = null) {
        try {
            const chatCompletionSource = this.getChatCompletionSource(provider);

            // List of providers that block browser requests (CORS)
            const corsBlockingProviders = ['deepseek', 'anthropic', 'google', 'cohere'];
            const isCorsBlocking = corsBlockingProviders.includes(provider.toLowerCase());

            // Try ChatCompletionService first (avoids CORS issues, uses server-side requests)
            // This is especially important for providers like Deepseek that block browser requests
            if (this.context && this.context.ChatCompletionService) {
                console.log(`[Sidecar AI] Testing connection via ChatCompletionService: ${provider} (${model})`);

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
     * Get API key for provider from SillyTavern settings
     * Uses same approach as SillyTavern's API connection system
     */
    getProviderApiKey(provider) {
        // Method 1: Check connection profiles (ST's primary method)
        if (this.context && this.context.connection_profiles) {
            const profiles = Object.values(this.context.connection_profiles || {});
            for (const profile of profiles) {
                if (profile && profile.api_provider === provider) {
                    if (profile.api_key) {
                        return profile.api_key;
                    }
                }
            }
        }

        // Method 2: Check API settings directly
        if (this.context && this.context.api_settings) {
            const providerSettings = this.context.api_settings[provider];
            if (providerSettings && providerSettings.api_key) {
                return providerSettings.api_key;
            }
        }

        // Method 3: Check settings.api_keys
        if (this.context && this.context.settings && this.context.settings.api_keys) {
            return this.context.settings.api_keys[provider];
        }

        // Method 4: Try global ST storage
        if (typeof window !== 'undefined') {
            if (window.SillyTavern && window.SillyTavern.api_keys) {
                return window.SillyTavern.api_keys[provider];
            }
            if (window.api_keys) {
                return window.api_keys[provider];
            }
        }

        return null;
    }
}
