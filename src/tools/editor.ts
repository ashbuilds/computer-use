import * as path from 'path';
import { promises as fs } from 'fs';

import { BaseAnthropicTool, CLIResult, ToolError, ToolResult } from './base';
import {Beta} from "@anthropic-ai/sdk/resources";
import BetaToolTextEditor20241022 = Beta.BetaToolTextEditor20241022;

type Command = 'view' | 'create' | 'str_replace' | 'insert' | 'undo_edit';
const SNIPPET_LINES = 4;
const MAX_RESPONSE_LENGTH = 16000;
const TRUNCATED_MESSAGE = '<response clipped><NOTE>To save on context only part of this file has been shown to you. You should retry this tool after you have searched inside the file with `grep -n` in order to find the line numbers of what you are looking for.</NOTE>';

export class EditTool extends BaseAnthropicTool {
    private fileHistory: Map<string, string[]> = new Map();

    async execute(params: {
        command: Command;
        path: string;
        file_text?: string;
        view_range?: [number, number];
        old_str?: string;
        new_str?: string;
        insert_line?: number;
    }): Promise<ToolResult> {
        const { command, path: filePath } = params;

        // Validate path
        try {
            await this.validatePath(command, filePath);
        } catch (error) {
            throw new ToolError((error as Error).message);
        }

        switch (command) {
            case 'view':
                return this.view(filePath, params.view_range);
            case 'create':
                if (!params.file_text) {
                    throw new ToolError('Parameter `file_text` is required for command: create');
                }
                await this.writeFile(filePath, params.file_text);
                this.addToHistory(filePath, params.file_text);
                return { output: `File created successfully at: ${filePath}` };
            case 'str_replace':
                if (!params.old_str) {
                    throw new ToolError('Parameter `old_str` is required for command: str_replace');
                }
                return this.strReplace(filePath, params.old_str, params.new_str || '');
            case 'insert':
                if (params.insert_line === undefined) {
                    throw new ToolError('Parameter `insert_line` is required for command: insert');
                }
                if (!params.new_str) {
                    throw new ToolError('Parameter `new_str` is required for command: insert');
                }
                return this.insert(filePath, params.insert_line, params.new_str);
            case 'undo_edit':
                return this.undoEdit(filePath);
            default:
                throw new ToolError(`Unrecognized command: ${command}`);
        }
    }

    toParams(): BetaToolTextEditor20241022 {
        return {
            type: 'text_editor_20241022',
            name: 'str_replace_editor'
        };
    }

    private async validatePath(command: Command, filePath: string): Promise<void> {
        const resolvedPath = path.resolve(filePath);

        // Check if it's an absolute path
        if (!path.isAbsolute(filePath)) {
            const suggestedPath = path.resolve('/', filePath);
            throw new Error(
                `The path ${filePath} is not an absolute path, it should start with '${path.sep}'. Maybe you meant ${suggestedPath}?`
            );
        }

        try {
            const stats = await fs.stat(resolvedPath);

            // Check if path exists (except for create command)
            if (command === 'create' && stats) {
                throw new Error(
                    `File already exists at: ${filePath}. Cannot overwrite files using command 'create'.`
                );
            }

            // Check if the path points to a directory
            if (stats.isDirectory() && command !== 'view') {
                throw new Error(
                    `The path ${filePath} is a directory and only the 'view' command can be used on directories`
                );
            }
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || command !== 'create') {
                throw new Error(`The path ${filePath} does not exist. Please provide a valid path.`);
            }
        }
    }

    private async view(filePath: string, viewRange?: [number, number]): Promise<ToolResult> {
        try {
            const stats = await fs.stat(filePath);

            if (stats.isDirectory()) {
                if (viewRange) {
                    throw new ToolError(
                        'The `view_range` parameter is not allowed when `path` points to a directory.'
                    );
                }

                // List directory contents up to 2 levels deep
                const files = await this.listDirectoryRecursive(filePath, 2);
                const output = `Here's the files and directories up to 2 levels deep in ${filePath}, excluding hidden items:\n${files.join('\n')}\n`;
                return new CLIResult(output);
            }

            let content = await fs.readFile(filePath, 'utf8');
            let initLine = 1;

            if (viewRange) {
                const fileLines = content.split('\n');
                const nLinesFile = fileLines.length;
                const [start, end] = viewRange;

                if (start < 1 || start > nLinesFile) {
                    throw new ToolError(
                        `Invalid 'view_range': ${viewRange}. First element '${start}' should be within the range of lines of the file: [1, ${nLinesFile}]`
                    );
                }

                if (end !== -1) {
                    if (end > nLinesFile) {
                        throw new ToolError(
                            `Invalid 'view_range': ${viewRange}. Second element '${end}' should be smaller than the number of lines in the file: '${nLinesFile}'`
                        );
                    }
                    if (end < start) {
                        throw new ToolError(
                            `Invalid 'view_range': ${viewRange}. Second element '${end}' should be larger or equal than its first '${start}'`
                        );
                    }
                }

                content = fileLines
                    .slice(start - 1, end === -1 ? undefined : end)
                    .join('\n');
                initLine = start;
            }

            return new CLIResult(
                this.makeOutput(content, filePath, initLine)
            );
        } catch (error) {
            throw new ToolError(`Error reading file: ${error}`);
        }
    }

    private async strReplace(filePath: string, oldStr: string, newStr: string): Promise<ToolResult> {
        const content = await this.readFile(filePath);

        // Check for occurrences
        const occurrences = content.split(oldStr).length - 1;
        if (occurrences === 0) {
            throw new ToolError(
                `No replacement was performed, old_str '${oldStr}' did not appear verbatim in ${filePath}.`
            );
        }
        if (occurrences > 1) {
            const lines = content.split('\n')
                .map((line, idx) => line.includes(oldStr) ? idx + 1 : null)
                .filter((line): line is number => line !== null);

            throw new ToolError(
                `No replacement was performed. Multiple occurrences of old_str '${oldStr}' in lines ${lines}. Please ensure it is unique`
            );
        }

        // Perform replacement
        const newContent = content.replace(oldStr, newStr);
        await this.writeFile(filePath, newContent);
        this.addToHistory(filePath, content);

        // Create snippet
        const replacementLine = content.split(oldStr)[0].split('\n').length;
        const startLine = Math.max(0, replacementLine - SNIPPET_LINES);
        const endLine = replacementLine + SNIPPET_LINES + newStr.split('\n').length;
        const snippet = newContent.split('\n').slice(startLine, endLine + 1).join('\n');

        const successMsg = [
            `The file ${filePath} has been edited. `,
            this.makeOutput(snippet, `a snippet of ${filePath}`, startLine + 1),
            'Review the changes and make sure they are as expected. Edit the file again if necessary.'
        ].join('');

        return new CLIResult(successMsg);
    }

    private async insert(filePath: string, insertLine: number, newStr: string): Promise<ToolResult> {
        const content = await this.readFile(filePath);
        const contentLines = content.split('\n');
        const nLinesFile = contentLines.length;

        if (insertLine < 0 || insertLine > nLinesFile) {
            throw new ToolError(
                `Invalid 'insert_line' parameter: ${insertLine}. It should be within the range of lines of the file: [0, ${nLinesFile}]`
            );
        }

        const newStrLines = newStr.split('\n');
        const newContentLines = [
            ...contentLines.slice(0, insertLine),
            ...newStrLines,
            ...contentLines.slice(insertLine)
        ];

        const snippetLines = [
            ...contentLines.slice(Math.max(0, insertLine - SNIPPET_LINES), insertLine),
            ...newStrLines,
            ...contentLines.slice(insertLine, insertLine + SNIPPET_LINES)
        ];

        const newContent = newContentLines.join('\n');
        const snippet = snippetLines.join('\n');

        await this.writeFile(filePath, newContent);
        this.addToHistory(filePath, content);

        const successMsg = [
            `The file ${filePath} has been edited. `,
            this.makeOutput(
                snippet,
                'a snippet of the edited file',
                Math.max(1, insertLine - SNIPPET_LINES + 1)
            ),
            'Review the changes and make sure they are as expected (correct indentation, no duplicate lines, etc). Edit the file again if necessary.'
        ].join('');

        return new CLIResult(successMsg);
    }

    private async undoEdit(filePath: string): Promise<ToolResult> {
        const history = this.fileHistory.get(filePath);
        if (!history || history.length === 0) {
            throw new ToolError(`No edit history found for ${filePath}.`);
        }

        const oldText = history.pop()!;
        await this.writeFile(filePath, oldText);

        return new CLIResult(
            `Last edit to ${filePath} undone successfully. ${this.makeOutput(oldText, filePath)}`
        );
    }

    private async readFile(filePath: string): Promise<string> {
        try {
            return await fs.readFile(filePath, 'utf8');
        } catch (error) {
            throw new ToolError(`Error reading file ${filePath}: ${error}`);
        }
    }

    private async writeFile(filePath: string, content: string): Promise<void> {
        try {
            await fs.writeFile(filePath, content, 'utf8');
        } catch (error) {
            throw new ToolError(`Error writing to file ${filePath}: ${error}`);
        }
    }

    private addToHistory(filePath: string, content: string): void {
        if (!this.fileHistory.has(filePath)) {
            this.fileHistory.set(filePath, []);
        }
        this.fileHistory.get(filePath)!.push(content);
    }

    private makeOutput(
        content: string,
        fileDescriptor: string,
        initLine: number = 1,
        expandTabs: boolean = true
    ): string {
        content = this.maybeTruncate(content);
        if (expandTabs) {
            content = content.replace(/\t/g, '    ');
        }

        const numberedLines = content
            .split('\n')
            .map((line, i) => `${(i + initLine).toString().padStart(6)}\t${line}`)
            .join('\n');

        return `Here's the result of running \`cat -n\` on ${fileDescriptor}:\n${numberedLines}\n`;
    }

    private maybeTruncate(content: string, truncateAfter: number = MAX_RESPONSE_LENGTH): string {
        if (truncateAfter && content.length > truncateAfter) {
            return content.slice(0, truncateAfter) + TRUNCATED_MESSAGE;
        }
        return content;
    }

    private async listDirectoryRecursive(
        dirPath: string,
        maxDepth: number,
        currentDepth: number = 0
    ): Promise<string[]> {
        if (currentDepth >= maxDepth) return [];

        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        const files: string[] = [];

        for (const entry of entries) {
            if (entry.name.startsWith('.')) continue;

            const fullPath = path.join(dirPath, entry.name);
            if (entry.isDirectory()) {
                files.push(fullPath + '/');
                files.push(...await this.listDirectoryRecursive(fullPath, maxDepth, currentDepth + 1));
            } else {
                files.push(fullPath);
            }
        }

        return files.sort();
    }
}