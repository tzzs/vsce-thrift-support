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

        console.log(`[DEBUG] Total lines: ${lines.length}`);
        for (let i = 0; i < lines.length; i++) {
            if (token.isCancellationRequested) {
                console.log(`[DEBUG] Cancellation requested, breaking at line ${i}`);
                break;
            }

            const line = lines[i];
            let trimmed = line.trim();

            console.log(`[DEBUG] Processing line ${i}: '${line}' -> trimmed='${trimmed}'`);
            
            // Handle block comments - check if we're in a block comment
            if (inBlockComment) {
                console.log(`[DEBUG] Line ${i} is in block comment: '${trimmed}'`);
                if (line.includes('*/')) {
                    console.log(`[DEBUG] Line ${i} ends block comment, creating range [${blockCommentStart}, ${i}]`);
                    ranges.push(new vscode.FoldingRange(blockCommentStart, i));
                    inBlockComment = false;
                    blockCommentStart = -1;
                    
                    // After a block comment ends, check next few lines for struct definitions
                    for (let checkLine = i + 1; checkLine < Math.min(i + 10, lines.length); checkLine++) {
                        const nextLine = lines[checkLine].trim();
                        
                        // Skip empty lines and single-line comments
                        if (!nextLine || nextLine.startsWith('//')) {
                            console.log(`[DEBUG] Skipping check line ${checkLine}: '${lines[checkLine]}'`);
                            continue;
                        }
                        
                        // If we find a struct definition, create a folding range
                        if (nextLine.startsWith('struct')) {
                            console.log(`[DEBUG] Found struct at line ${checkLine}: '${nextLine}', looking for matching bracket`);
                            const structEnd = this.findMatchingBracket(lines, checkLine, '{', '}');
                            if (structEnd > checkLine) {
                                console.log(`[DEBUG] Found matching bracket at line ${structEnd}, creating range [${checkLine}, ${structEnd}]`);
                                ranges.push(new vscode.FoldingRange(checkLine, structEnd));
                            } else {
                                console.log(`[DEBUG] No matching bracket found for struct at line ${checkLine}`);
                            }
                            break; // Only check for the first struct after comment
                        } else {
                            console.log(`[DEBUG] Line ${checkLine} is not struct: '${nextLine}', stopping check`);
                            // If we encounter something that's not a struct, stop checking
                            break;
                        }
                    }
                }
                continue; // Continue to next line if in block comment
            }

            // Handle start of block comment
            if (trimmed.startsWith('/*')) {
                console.log(`[DEBUG] Line ${i} starts block comment: '${trimmed}'`);
                inBlockComment = true;
                blockCommentStart = i;
                
                // Check if this same line also ends the block comment
                if (trimmed.includes('*/') && !trimmed.startsWith('*/')) {
                    console.log(`[DEBUG] Line ${i} also ends block comment, creating range [${blockCommentStart}, ${i}]`);
                    ranges.push(new vscode.FoldingRange(blockCommentStart, i));
                    inBlockComment = false;
                    blockCommentStart = -1;
                }
                continue;
            }

            // Skip empty lines
            if (!trimmed) {
                console.log(`[DEBUG] Line ${i} is empty, skipping`);
                continue;
            }

            // Skip single-line comments
            if (trimmed.startsWith('//')) {
                console.log(`[DEBUG] Line ${i} is single-line comment, skipping: '${trimmed}'`);
                continue;
            }

            // Add detailed debug logging
            console.log(`[DEBUG] Line ${i}: trimmed='${trimmed}', hasStruct=${trimmed.includes('struct')}, hasBrace=${trimmed.includes('{')}`);


            // Handle braces and parentheses for code blocks
            for (let j = 0; j < line.length; j++) {
                const char = line[j];
                const nextChar = j + 1 < line.length ? line[j + 1] : '';

                if (char === '{') {
                    // Try to identify what kind of block this is
                    const blockType = this.identifyBlockType(lines, i, j);
                    // Add debug logging for struct blocks
                    if (blockType === 'type') {
                        const blockNameMatch = lines[i].substring(0, j).match(/(struct|union|exception|enum|senum|service)\s+(\w+)/);
                        const blockName = blockNameMatch ? blockNameMatch[2] : 'unknown';
                        console.log(`[DEBUG] Found opening brace for ${blockType} block: ${blockName} at line ${i}`);
                    }
                    braceStack.push({ line: i, char: j, type: blockType });
                } else if (char === '}') {
                    const openBrace = braceStack.pop();
                    if (openBrace) {
                        // Add debug logging for struct blocks
                        if (openBrace.type === 'type') {
                            console.log(`[DEBUG] Found closing brace for ${openBrace.type} block at line ${i}, creating folding range from ${openBrace.line} to ${i - 1}`);
                        }
                        // For struct blocks, don't include the closing brace line in the range
                        const endLine = i - 1;
                        ranges.push(new vscode.FoldingRange(openBrace.line, endLine));
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
            } // End of for loop

            // Handle multi-line lists/arrays in const definitions
            // Check if line has '[' but the matching ']' is not on the same line
            if (trimmed.includes('[')) {
                console.log(`[DEBUG] Line ${i} has '[': '${trimmed}'`);
                const listEnd = this.findMatchingBracket(lines, i, '[', ']');
                console.log(`[DEBUG] findMatchingBracket returned: ${listEnd}`);
                if (listEnd > i) {
                    console.log(`[DEBUG] Creating folding range [${i}, ${listEnd}] for list`);
                    ranges.push(new vscode.FoldingRange(i, listEnd));
                }
            }

            // Handle multi-line maps/objects in const definitions - check if opening brace exists but closing brace doesn't
            const hasOpeningBrace = trimmed.includes('{');
            const hasClosingBrace = trimmed.includes('}');
            const isTypeDefinition = this.isTypeBlock(lines, i);
            
            if (hasOpeningBrace && !hasClosingBrace && !isTypeDefinition) {
                console.log(`[DEBUG] Line ${i} has '{' but not '}' and is not type definition: '${trimmed}'`);
                const mapEnd = this.findMatchingBracket(lines, i, '{', '}');
                console.log(`[DEBUG] findMatchingBracket for '{' returned: ${mapEnd}`);
                if (mapEnd > i) {
                    console.log(`[DEBUG] Creating folding range [${i}, ${mapEnd}] for map`);
                    ranges.push(new vscode.FoldingRange(i, mapEnd));
                }
            }
        }

        return ranges;
    }

    private identifyBlockType(lines: string[], lineIndex: number, charIndex: number): string {
        const line = lines[lineIndex];
        const beforeBrace = line.substring(0, charIndex);
        
        // Add detailed debug logging
        console.log(`[DEBUG] identifyBlockType - lineIndex: ${lineIndex}, charIndex: ${charIndex}, beforeBrace: '${beforeBrace.trim()}'`);

        // Check for specific Thrift constructs with more flexible whitespace handling
        if (beforeBrace.match(/(struct|union|exception|enum|senum|service)\s+\w+(?:\s*|\s+.*)$/i)) {
            console.log(`[DEBUG] Matched type block at line ${lineIndex}`);
            return 'type';
        }

        if (beforeBrace.match(/(function|method)\s+\w+\s*$/i)) {
            return 'function';
        }

        if (beforeBrace.match(/throws\s*$/i)) {
            return 'throws';
        }

        // Check previous lines for type definitions if current line doesn't match
        for (let i = Math.max(0, lineIndex - 3); i < lineIndex; i++) {
            const prevLine = lines[i].trim();
            const prevTypeMatch = prevLine.match(/^(struct|union|exception|enum|senum|service)\s+\w+/i);
            if (prevTypeMatch) {
                console.log(`[DEBUG] Found type definition in previous line ${i}: ${prevTypeMatch[1]}, treating as type block`);
                return 'type';
            }
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