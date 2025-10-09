import * as vscode from 'vscode';

export class ThriftFoldingRangeProvider implements vscode.FoldingRangeProvider {
    public provideFoldingRanges(
        document: vscode.TextDocument,
        context: vscode.FoldingContext,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.FoldingRange[]> {
        const ranges: vscode.FoldingRange[] = [];
        const text = document.getText();
        const lines = text.split('\n');

        const braceStack: { line: number; char: number; type: string; name?: string }[] = [];
        const commentStack: { line: number; type: 'single' | 'block' }[] = [];
        let inBlockComment = false;
        let blockCommentStart = -1;

        for (let i = 0; i < lines.length; i++) {
            if (token.isCancellationRequested) {
                break;
            }

            const line = lines[i];
            const trimmed = line.trim();

            // Skip empty lines
            if (!trimmed) {
                continue;
            }

            // Handle block comments
            if (inBlockComment) {
                if (trimmed.includes('*/')) {
                    ranges.push(new vscode.FoldingRange(blockCommentStart, i));
                    inBlockComment = false;
                    blockCommentStart = -1;
                }
                continue;
            }

            if (trimmed.startsWith('/*')) {
                inBlockComment = true;
                blockCommentStart = i;
                continue;
            }

            // Skip single-line comments
            if (trimmed.startsWith('//') || trimmed.startsWith('#')) {
                continue;
            }

            // Handle braces and parentheses for code blocks
            for (let j = 0; j < line.length; j++) {
                const char = line[j];
                const nextChar = j + 1 < line.length ? line[j + 1] : '';

                if (char === '{') {
                    // Try to identify what kind of block this is
                    const blockType = this.identifyBlockType(lines, i, j);
                    braceStack.push({ line: i, char: j, type: blockType });
                } else if (char === '}') {
                    const openBrace = braceStack.pop();
                    if (openBrace) {
                        ranges.push(new vscode.FoldingRange(openBrace.line, i));
                    }
                }

                // Handle parentheses for function parameters (optional folding)
                if (char === '(' && this.isFunctionContext(lines, i, j)) {
                    // Find matching closing parenthesis
                    const closeParenLine = this.findMatchingParen(lines, i, j);
                    if (closeParenLine > i) {
                        ranges.push(new vscode.FoldingRange(i, closeParenLine));
                    }
                }
            }

            // Handle multi-line lists/arrays in const definitions
            if (trimmed.includes('[') && !trimmed.includes(']')) {
                const listEnd = this.findMatchingBracket(lines, i, '[', ']');
                if (listEnd > i) {
                    ranges.push(new vscode.FoldingRange(i, listEnd));
                }
            }

            // Handle multi-line maps/objects in const definitions
            if (trimmed.includes('{') && !trimmed.includes('}') && !this.isTypeBlock(lines, i)) {
                const mapEnd = this.findMatchingBracket(lines, i, '{', '}');
                if (mapEnd > i) {
                    ranges.push(new vscode.FoldingRange(i, mapEnd));
                }
            }
        }

        return ranges;
    }

    private identifyBlockType(lines: string[], lineIndex: number, charIndex: number): string {
        const line = lines[lineIndex];
        const beforeBrace = line.substring(0, charIndex);

        // Check for specific Thrift constructs
        if (beforeBrace.match(/(struct|union|exception|enum|senum|service)\s+\w+\s*$/)) {
            return 'type';
        }

        if (beforeBrace.match(/(function|method)\s+\w+\s*$/)) {
            return 'function';
        }

        if (beforeBrace.match(/throws\s*$/)) {
            return 'throws';
        }

        return 'block';
    }

    private isFunctionContext(lines: string[], lineIndex: number, charIndex: number): boolean {
        const line = lines[lineIndex];
        const beforeParen = line.substring(0, charIndex);

        // Check if this looks like a function/method parameter list
        return /\w+\s+\w+\s*$/.test(beforeParen) || // return_type methodName
               /throws\s*$/.test(beforeParen) ||    // throws(
               /\w+\s*$/.test(beforeParen);         // methodName
    }

    private findMatchingParen(lines: string[], startLine: number, startChar: number): number {
        let parenDepth = 0;
        let inString = false;
        let inComment = false;

        for (let i = startLine; i < lines.length; i++) {
            const line = lines[i];
            const startIndex = i === startLine ? startChar : 0;

            for (let j = startIndex; j < line.length; j++) {
                const char = line[j];
                const nextChar = j + 1 < line.length ? line[j + 1] : '';

                // Handle comments
                if (!inString && char === '/' && nextChar === '/') {
                    break; // Rest of line is comment
                }

                if (!inString && char === '/' && nextChar === '*') {
                    inComment = true;
                    j++;
                    continue;
                }

                if (inComment && char === '*' && nextChar === '/') {
                    inComment = false;
                    j++;
                    continue;
                }

                if (inComment) {
                    continue;
                }

                // Handle strings
                if (char === '"' && !inString) {
                    inString = true;
                } else if (char === '"' && inString) {
                    inString = false;
                }

                if (inString) {
                    continue;
                }

                // Count parentheses
                if (char === '(') {
                    parenDepth++;
                } else if (char === ')') {
                    parenDepth--;
                    if (parenDepth === 0) {
                        return i;
                    }
                }
            }
        }

        return -1;
    }

    private findMatchingBracket(lines: string[], startLine: number, openBracket: string, closeBracket: string): number {
        let bracketDepth = 0;
        let inString = false;
        let inComment = false;

        for (let i = startLine; i < lines.length; i++) {
            const line = lines[i];

            for (let j = 0; j < line.length; j++) {
                const char = line[j];
                const nextChar = j + 1 < line.length ? line[j + 1] : '';

                // Handle comments
                if (!inString && char === '/' && nextChar === '/') {
                    break; // Rest of line is comment
                }

                if (!inString && char === '/' && nextChar === '*') {
                    inComment = true;
                    j++;
                    continue;
                }

                if (inComment && char === '*' && nextChar === '/') {
                    inComment = false;
                    j++;
                    continue;
                }

                if (inComment) {
                    continue;
                }

                // Handle strings
                if (char === '"' && !inString) {
                    inString = true;
                } else if (char === '"' && inString) {
                    inString = false;
                }

                if (inString) {
                    continue;
                }

                // Count brackets
                if (char === openBracket) {
                    bracketDepth++;
                } else if (char === closeBracket) {
                    bracketDepth--;
                    if (bracketDepth === 0) {
                        return i;
                    }
                }
            }
        }

        return -1;
    }

    private isTypeBlock(lines: string[], lineIndex: number): boolean {
        // Check if this line is part of a type definition block
        const line = lines[lineIndex].trim();

        // Check current line
        if (line.match(/^(struct|union|exception|enum|senum|service)\s+\w+/)) {
            return true;
        }

        // Check previous lines for context
        for (let i = Math.max(0, lineIndex - 5); i < lineIndex; i++) {
            const prevLine = lines[i].trim();
            if (prevLine.match(/^(struct|union|exception|enum|senum|service)\s+\w+/)) {
                return true;
            }
        }

        return false;
    }
}

export function registerFoldingRangeProvider(context: vscode.ExtensionContext) {
    const provider = new ThriftFoldingRangeProvider();
    const disposable = vscode.languages.registerFoldingRangeProvider('thrift', provider);
    context.subscriptions.push(disposable);
}