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
            // Always use direct API testing when API key is explicitly provided
            // This ensures we test with the exact credentials the user entered
            if (apiKey) {
                console.log(`[Sidecar AI] Testing connection directly: ${provider} (${model})`);
                return await this.testConnectionDirect(provider, model, apiKey, apiUrl);
            }

            // If no API key provided, try using ChatCompletionService with ST's configured key
            const chatCompletionSource = this.getChatCompletionSource(provider);
            if (this.context && this.context.ChatCompletionService) {
                console.log(`[Sidecar AI] Testing connection via ChatCompletionService: ${provider} (${model})`);

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
                return { success: true, message: 'Connection successful' };
            }

            throw new Error('No API key provided and ChatCompletionService not available');
        } catch (error) {
            console.error('[Sidecar AI] Connection test failed:', error);
            const errorMessage = error.message || String(error);
            return {
                success: false,
                message: errorMessage.includes('401') || errorMessage.includes('Unauthorized')
                    ? 'Invalid API key'
                    : errorMessage.includes('404') || errorMessage.includes('Not Found')
                        ? 'Invalid model or endpoint'
                        : errorMessage.includes('429')
                            ? 'Rate limit exceeded'
                            : errorMessage.includes('403') || errorMessage.includes('Forbidden')
                                ? 'API key does not have permission'
                                : `Connection failed: ${errorMessage}`
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

        // Verify we got a valid response
        const content = this.extractContent(data, provider);
        if (!content && !data.choices && !data.content) {
            throw new Error('Invalid response format');
        }

        return { success: true, message: 'Connection successful' };
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
