import { ComputerUseClient, APIProvider } from '../index';
import { ToolResult } from '../tools/base';
import {Beta} from "@anthropic-ai/sdk/resources";
import BetaContentBlock = Beta.BetaContentBlock;
import {Logger} from "./logger";

async function runTest() {
    // Validate API key
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
        throw new Error('ANTHROPIC_API_KEY environment variable is not set');
    }

    // Initialize the client with explicit configuration
    const client = new ComputerUseClient({
        apiKey,
        provider: APIProvider.ANTHROPIC,
        maxTokens: 1024,
        callbacks: {
            onOutput: (block: BetaContentBlock) => {
                if ('text' in block) {
                    Logger.log('Assistant', block.text);
                } else if (block.type === 'tool_use') {
                    Logger.log('Tool Use', {
                        name: block.name,
                        input: block.input
                    });
                }
            },
            onToolOutput: (result: ToolResult, toolId: string) => {
                Logger.log('Tool Result', {
                    toolId,
                    output: result.output,
                    error: result.error,
                    hasImage: !!result.base64Image
                });
            },
            onApiResponse: (response:  any) => {
                Logger.log('API Response', {
                    status: response.status,
                    headers: response.headers,
                    type: response.type
                });
            }
        }
    });

    try {
        // Test case 1: Basic system interaction
        Logger.log('Test', 'Find and open Arc browser...');
        await client.sendMessage(
            "Can you help me open Arc browser in my mac? Please: \n" +
            "1. Mouse mouse to all way to bottom center to display a Dock\n" +
            "2. Move mouse left and light while hovering over the Dock\n" +
            "3. Hover left and right until you find the icon displaying \"Arc\"" +
            "4. Take a screenshot\n" +
            "5. Click on the Arc Icon"
        );

        // // Add delay between tests
        // await new Promise(resolve => setTimeout(resolve, 2000));

    } catch (error) {
        Logger.error('Test', error);
        process.exit(1);
    }
}

// Run tests if called directly
if (require.main === module) {
    runTest().catch(error => {
        Logger.error('Fatal', error);
        process.exit(1);
    });
}