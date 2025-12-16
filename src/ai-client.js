/**
 * AI Client
 * Handles communication with AI providers
 */

export class AIClient {
    constructor(context) {
        this.context = context;
    }

    /**
     * Send single add-on request to AI
     */
    async sendToAI(addon, prompt) {
        try {
            const provider = addon.aiProvider || 'openai';
            const model = addon.aiModel || 'gpt-3.5-turbo';
            const apiKey = addon.apiKey || this.getProviderApiKey(provider);

            if (!apiKey) {
                throw new Error(`No API key found for provider: ${provider}`);
            }

            // Use SillyTavern's API system if available
            if (this.context.api) {
                return await this.sendViaSillyTavernAPI(addon, prompt, provider, model, apiKey);
            }

            // Fallback to direct API calls
            return await this.sendDirectAPI(addon, prompt, provider, model, apiKey);
        } catch (error) {
            console.error(`[Add-Ons Extension] Error sending to AI (${addon.name}):`, error);
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

            // Send batch request
            if (this.context.api) {
                const response = await this.sendViaSillyTavernAPI(
                    addons[0],
                    combinedPrompt,
                    provider,
                    model,
                    apiKey
                );

                // Split response (simple approach - may need refinement)
                return this.splitBatchResponse(response, addons.length);
            }

            // Direct API fallback
            const response = await this.sendDirectAPI(
                addons[0],
                combinedPrompt,
                provider,
                model,
                apiKey
            );

            return this.splitBatchResponse(response, addons.length);
        } catch (error) {
            console.error('[Add-Ons Extension] Error sending batch to AI:', error);
            throw error;
        }
    }

    /**
     * Send via SillyTavern's API system
     */
    async sendViaSillyTavernAPI(addon, prompt, provider, model, apiKey) {
        // Try to use SillyTavern's API wrapper
        if (this.context.api && this.context.api.request) {
            const request = {
                provider: provider,
                model: model,
                messages: [
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                apiKey: apiKey
            };

            const response = await this.context.api.request(request);
            return this.extractContent(response);
        }

        // Fallback to direct API
        return await this.sendDirectAPI(addon, prompt, provider, model, apiKey);
    }

    /**
     * Send direct API request
     */
    async sendDirectAPI(addon, prompt, provider, model, apiKey) {
        const endpoint = this.getProviderEndpoint(provider);

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
