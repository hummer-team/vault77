import {createOpenAI, OpenAIProvider} from '@ai-sdk/openai';
import {LanguageModel} from 'ai';

/**
 * Defines the supported LLM providers.
 */
export type LLMProvider = 'dashscope' | 'openai' | 'doubao' | 'gemini' | 'groq';

export interface LLMConfig {
    provider: LLMProvider;
    apiKey: string;
    baseURL: string;
    modelName: string;
}

type CustomFetch = typeof fetch & ((url: string, options?: RequestInit) => Promise<Response>);


/**
 * A custom fetch implementation to intercept and modify requests.
 * Specifically targets Dashscope's incorrect URL pathing.
 * @param url The original request URL.
 * @param options The original fetch options.
 * @returns A fetch Response promise.
 */
const customFetch: CustomFetch = Object.assign(async (url: string, options: RequestInit = {}) => {
    // remove /responses
    const correctedUrl = url.replace(/\/responses$/, '');
    console.log('[LLMClient] intercepted url ', url, 'fixed url:', correctedUrl);

    const mergedHeaders = new Headers(options.headers);
    //mergedHeaders.set('Authorization', `Bearer ${config.apiKey}`);
    mergedHeaders.set('Content-Type', 'application/json');
    mergedHeaders.set('Accept', 'application/json');

    const response = await fetch(correctedUrl, {
        ...options,
        headers: mergedHeaders,
    });

    if (!response.ok) {
        // --- CRITICAL CHANGE: Clone the response before reading the body ---
        const errorBody = await response.clone().text(); // Use clone() to avoid "body already read" error
        console.error(`LLM request fail [${response.status}]：`, errorBody);
    }
    return response;
});

/**
 * A client responsible for configuring and providing a language model instance
 * based on the specified provider.
 */
export class LLMClient {
    public readonly model: LanguageModel;

    constructor(config: LLMConfig) {
        console.log(`[LLMClient] Creating model for provider: ${config.provider}`);

        let provider: OpenAIProvider;

        switch (config.provider) {
            case 'dashscope':
                // For Dashscope, we use createOpenAI with our custom fetch to fix the URL.
                provider = createOpenAI({
                    apiKey: config.apiKey,
                    baseURL: config.baseURL,
                    fetch: customFetch,
                });
                break;

            case 'openai':
            case 'groq': // Groq is also OpenAI-compatible
                // For standard OpenAI-compatible APIs, we don't need any special handling.
                provider = createOpenAI({
                    apiKey: config.apiKey,
                    baseURL: config.baseURL,
                });
                break;

            // Future providers can be added here
            case 'doubao':
            case 'gemini':
                // These would require their own specific provider (e.g., createGoogle())
                // or a custom fetch implementation if they are OpenAI-compatible.
                throw new Error(`Provider "${config.provider}" is not yet implemented.`);

            default:
                throw new Error(`Unsupported LLM provider: ${config.provider}`);
        }

        // Uniformly create the model instance from the selected provider
        this.model = provider(config.modelName);
        console.log(`[LLMClient] Model "${config.modelName}" created successfully.`);
    }
}
