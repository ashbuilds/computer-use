import 'dotenv/config'
import {Beta} from "@anthropic-ai/sdk/resources";

export * from './loop';
export * from './tools/base';
export * from './tools/computer';
export * from './tools/bash';
export * from './tools/editor';

import { SamplingLoop, APIProvider, PROVIDER_TO_DEFAULT_MODEL_NAME } from './loop';
import { ToolResult } from './tools/base';
import BetaContentBlock = Beta.BetaContentBlock;
// import BetaMessage = Beta.BetaMessage;

export interface ComputerUseOptions {
    apiKey: string;
    provider?: APIProvider;
    model?: string;
    systemPromptSuffix?: string;
    maxTokens?: number;
    onlyNMostRecentImages?: number;
    callbacks?: {
        onOutput?: (block: BetaContentBlock) => void;
        onToolOutput?: (result: ToolResult, toolId: string) => void;
        onApiResponse?: (response:  any) => void;
    };
}

export class ComputerUseClient {
    private loop: SamplingLoop;
    private options: Required<Pick<ComputerUseOptions, 'provider' | 'model'>> & ComputerUseOptions;

    constructor(options: ComputerUseOptions) {
        this.options = {
            provider: APIProvider.ANTHROPIC,
            model: options.model || PROVIDER_TO_DEFAULT_MODEL_NAME[options.provider || APIProvider.ANTHROPIC],
            ...options,
        };

        if (!this.options.apiKey) {
            throw new Error('apiKey is required');
        }

        // Initialize the sampling loop
        this.loop = new SamplingLoop(this.options.apiKey);

        console.log('ComputerUseClient initialized with:', {
            provider: this.options.provider,
            model: this.options.model,
            maxTokens: this.options.maxTokens
        });
    }

    async sendMessage(message: string) {
        if (!message.trim()) {
            throw new Error('Message cannot be empty');
        }

        const messages = [{
            role: 'user',
            content: message
        }];

        try {
            return await this.loop.run({
                model: this.options.model,
                provider: this.options.provider,
                systemPromptSuffix: this.options.systemPromptSuffix || '',
                // @ts-ignore
                messages,
                maxTokens: this.options.maxTokens,
                onlyNMostRecentImages: this.options.onlyNMostRecentImages,
                outputCallback: this.options.callbacks?.onOutput || (() => {}),
                toolOutputCallback: this.options.callbacks?.onToolOutput || (() => {}),
                apiResponseCallback: this.options.callbacks?.onApiResponse || (() => {}),
                apiKey: this.options.apiKey
            });
        } catch (error) {
            console.error('Error in sendMessage:', error);
            throw error;
        }
    }
}