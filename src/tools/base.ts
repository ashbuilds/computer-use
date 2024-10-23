

/**
 * Base result interface for tool execution
 */
export interface ToolResult {
    output?: string | null;
    error?: string | null;
    base64Image?: string | null;
    system?: string | null;
    mediaType?: "image/png" | "image/jpeg" | "image/gif" | "image/webp"
}

/**
 * Result specifically for CLI outputs
 */
export class CLIResult implements ToolResult {
    constructor(
        public output?: string | null,
        public error?: string | null,
        public base64Image?: string | null,
        public system?: string | null
    ) {}
}

/**
 * Result indicating tool failure
 */
export class ToolFailure implements ToolResult {
    constructor(
        public error: string,
        public output?: string | null,
        public base64Image?: string | null,
        public system?: string | null
    ) {}
}

/**
 * Custom error class for tool-related errors
 */
export class ToolError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ToolError';
    }
}

/**
 * Abstract base class for Anthropic-defined tools
 */
export abstract class BaseAnthropicTool {
    /**
     * Executes the tool with given arguments
     */
    abstract execute(params: Record<string, any>): Promise<ToolResult>;

    /**
     * Converts tool to API parameters format
     */
    abstract toParams(): any;

    /**
     * Combines two tool results
     */
    protected combineResults(result1: ToolResult, result2: ToolResult): ToolResult {
        return {
            output: [result1.output, result2.output].filter(Boolean).join(''),
            error: [result1.error, result2.error].filter(Boolean).join(''),
            base64Image: result2.base64Image || result1.base64Image,
            system: [result1.system, result2.system].filter(Boolean).join('')
        };
    }
}

/**
 * Collection of tools that can be used together
 */
export class ToolCollection {
    private toolMap: Map<string, BaseAnthropicTool>;

    constructor(tools: BaseAnthropicTool[]) {
        this.toolMap = new Map();
        tools.forEach(tool => {
            const params = tool.toParams();
            this.toolMap.set(params.name, tool);
        });
    }

    /**
     * Convert all tools to API parameters format
     */
    toParams(): any[] {
        return Array.from(this.toolMap.values()).map(tool => tool.toParams());
    }

    /**
     * Run a specific tool by name with given input
     */
    async run(name: string, toolInput: Record<string, any>): Promise<ToolResult> {
        const tool = this.toolMap.get(name);
        if (!tool) {
            return new ToolFailure(`Tool ${name} is invalid`);
        }

        try {
            return await tool.execute(toolInput);
        } catch (err) {
            if (err instanceof ToolError) {
                return new ToolFailure(err.message);
            }
            return new ToolFailure(`Unknown error: ${err}`);
        }
    }
}