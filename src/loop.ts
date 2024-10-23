
import { ComputerTool } from './tools/computer';
import { BashTool } from './tools/bash';
import { EditTool } from './tools/editor';
import { ToolCollection } from './tools/base';
import { ToolResult } from './tools/base';
import {Beta} from "@anthropic-ai/sdk/resources";
import BetaMessageParam = Beta.BetaMessageParam;
import BetaContentBlock = Beta.BetaContentBlock;
import BetaMessage = Beta.BetaMessage;
import Anthropic from "@anthropic-ai/sdk";
import BetaContentBlockParam = Beta.BetaContentBlockParam;
import BetaToolResultBlockParam = Beta.BetaToolResultBlockParam;
import BetaToolUseBlock = Beta.BetaToolUseBlock;
import BetaTextBlockParam = Beta.BetaTextBlockParam;
import BetaImageBlockParam = Beta.BetaImageBlockParam;

const BETA_FLAG = 'computer-use-2024-10-22';

export enum APIProvider {
    ANTHROPIC = 'anthropic',
    BEDROCK = 'bedrock',
    VERTEX = 'vertex'
}

// Default model mapping
export const PROVIDER_TO_DEFAULT_MODEL_NAME: Record<APIProvider, string> = {
    [APIProvider.ANTHROPIC]: 'claude-3-5-sonnet-20241022',
    [APIProvider.BEDROCK]: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
    [APIProvider.VERTEX]: 'claude-3-5-sonnet-v2@20241022'
};

// System prompt with dynamic date and platform info
const getSystemPrompt = () => `<SYSTEM_CAPABILITY>
* You are utilising an ${process.platform} virtual machine using ${process.arch} architecture with internet access.
* You can feel free to install applications with your bash tool. Use curl instead of wget.
* To open firefox, please just click on the firefox icon.  Note, firefox-esr is what is installed on your system.
* Using bash tool you can start GUI applications, but you need to set export DISPLAY=:1 and use a subshell. For example "(DISPLAY=:1 xterm &)". GUI apps run with bash tool will appear within your desktop environment, but they may take some time to appear. Take a screenshot to confirm it did.
* When using your bash tool with commands that are expected to output very large quantities of text, redirect into a tmp file and use str_replace_editor or \`grep -n -B <lines before> -A <lines after> <query> <filename>\` to confirm output.
* When viewing a page it can be helpful to zoom out so that you can see everything on the page.  Either that, or make sure you scroll down to see everything before deciding something isn't available.
* When using your computer function calls, they take a while to run and send back to you.  Where possible/feasible, try to chain multiple of these calls all into one function calls request.
* The current date is ${new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
})}.
</SYSTEM_CAPABILITY>

<IMPORTANT>
* When using Firefox, if a startup wizard appears, IGNORE IT.  Do not even click "skip this step".  Instead, click on the address bar where it says "Search or enter address", and enter the appropriate search term or URL there.
* If the item you are looking at is a pdf, if after taking a single screenshot of the pdf it seems that you want to read the entire document instead of trying to continue to read the pdf from your screenshots + navigation, determine the URL, use curl to download the pdf, install and use pdftotext to convert it to a text file, and then read that text file directly with your StrReplaceEditTool.
</IMPORTANT>`;

interface SamplingLoopOptions {
    model: string;
    provider: APIProvider;
    systemPromptSuffix: string;
    messages: BetaMessageParam[];
    outputCallback: (block: BetaContentBlock) => void;
    toolOutputCallback: (result: ToolResult, toolId: string) => void;
    apiResponseCallback: (response: BetaMessage) => void;
    apiKey: string;
    onlyNMostRecentImages?: number;
    maxTokens?: number;
}

export class SamplingLoop {
    private toolCollection: ToolCollection;
    private client: Anthropic;

    constructor(apiKey: string) {
        this.toolCollection = new ToolCollection([
            new ComputerTool(),
            new BashTool(),
            new EditTool()
        ]);

        this.client = new Anthropic({
            apiKey,
            baseURL: process.env.ANTHROPIC_BASE_URL
        });
    }

    async run(options: SamplingLoopOptions): Promise<BetaMessageParam[]> {
        const {
            model,
            messages,
            systemPromptSuffix,
            outputCallback,
            toolOutputCallback,
            apiResponseCallback,
            onlyNMostRecentImages,
            maxTokens = 4096
        } = options;

        if (onlyNMostRecentImages) {
            this.filterNMostRecentImages(messages, onlyNMostRecentImages);
        }

        const system = `${getSystemPrompt()}${systemPromptSuffix ? ' ' + systemPromptSuffix : ''}`;

        while (true) {
            const response = await this.client.beta.messages.create({
                max_tokens: maxTokens,
                messages,
                model,
                system,
                tools: this.toolCollection.toParams(),
                betas: [BETA_FLAG]
            }, {
                headers: {
                    'anthropic-beta': BETA_FLAG
                }
            });

            apiResponseCallback(response);

            messages.push({
                content: response.content as BetaContentBlockParam[],
                role: 'assistant'
            });

            let toolResultContent: BetaToolResultBlockParam[] = [];

            for (const block of response.content) {
                outputCallback(block);

                if (block.type === 'tool_use') {
                    const toolUseBlock = block as BetaToolUseBlock;
                    const result = await this.toolCollection.run(
                        toolUseBlock.name,
                        toolUseBlock.input as Record<string, any>
                    );

                    const toolResult = this.makeApiToolResult(result, toolUseBlock.id);
                    toolResultContent.push(toolResult);
                    toolOutputCallback(result, toolUseBlock.id);
                }
            }

            if (toolResultContent.length === 0) {
                return messages;
            }

            messages.push({
                role: 'user',
                content: toolResultContent
            });
        }
    }

    private makeApiToolResult(
        result: ToolResult & { mediaType?: "image/png" | "image/jpeg" | "image/gif" | "image/webp" },
        toolUseId: string
    ): BetaToolResultBlockParam {
        const content: Array<BetaTextBlockParam | BetaImageBlockParam> = [];
        let isError = false;

        if (result.error) {
            isError = true;
            content.push({
                type: 'text',
                text: this.maybePrependSystemToolResult(result, result.error)
            });
        } else {
            if (result.output) {
                content.push({
                    type: 'text',
                    text: this.maybePrependSystemToolResult(result, result.output)
                });
            }
            if (result.base64Image) {
                content.push({
                    type: 'image',
                    source: {
                        type: 'base64',
                        media_type: result.mediaType || 'image/png',
                        data: result.base64Image
                    }
                });
            }
        }

        return {
            type: 'tool_result',
            tool_use_id: toolUseId,
            content,
            is_error: isError
        };
    }

    private maybePrependSystemToolResult(result: ToolResult, text: string): string {
        if (result.system) {
            return `<system>${result.system}</system>\n${text}`;
        }
        return text;
    }

    private filterNMostRecentImages(
        messages: BetaMessageParam[],
        imagesToKeep: number,
        minRemovalThreshold: number = 10
    ): void {
        const toolResultBlocks = messages
            .flatMap(message =>
                Array.isArray(message.content) ? message.content : []
            )
            .filter(item =>
                typeof item === 'object' &&
                'type' in item &&
                item.type === 'tool_result'
            ) as BetaToolResultBlockParam[];

        let totalImages = toolResultBlocks.reduce((count, result) => {
            const content = Array.isArray(result.content) ? result.content : [];
            return count + content.filter(item =>
                typeof item === 'object' &&
                'type' in item &&
                item.type === 'image'
            ).length;
        }, 0);

        let imagesToRemove = totalImages - imagesToKeep;
        imagesToRemove -= imagesToRemove % minRemovalThreshold;

        if (imagesToRemove <= 0) return;

        for (const result of toolResultBlocks) {
            if (Array.isArray(result.content)) {
                const newContent = result.content.filter(item => {
                    if ('type' in item && item.type === 'image') {
                        if (imagesToRemove > 0) {
                            imagesToRemove--;
                            return false;
                        }
                    }
                    return true;
                });
                result.content = newContent;
            }
        }
    }
}