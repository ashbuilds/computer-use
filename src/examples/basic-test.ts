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
        Logger.log('Test', 'Running basic system interaction test...');
        await client.sendMessage(
            "Can you help me check the current system? Please: \n" +
            "1. Show current directory\n" +
            "2. Take a screenshot\n" +
            "3. Describe what you see"
        );

        // Add delay between tests
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Test case 2: Computer interaction
        Logger.log('Test', 'Running computer interaction test...');
        await client.sendMessage(
            "Can you help me with some mouse and keyboard operations? Please:\n" +
            "1. Move mouse to coordinates (100, 100)\n" +
            "2. Take a screenshot\n" +
            "3. Find and click codeeditor\n" +
            "4. Type 'Hello World' using the keyboard"
        );

        // Add delay between tests
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Test case 3: File operations
        Logger.log('Test', 'Running file operations test...');
        await client.sendMessage(
            "Let's work with files. Please:\n" +
            "1. Create a file named 'test.txt' with some content\n" +
            "2. Read the content of the file\n" +
            "3. Make some modifications to it"
        );

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