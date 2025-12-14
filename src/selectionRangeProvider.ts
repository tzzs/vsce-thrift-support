import * as vscode from 'vscode';

export class ThriftSelectionRangeProvider implements vscode.SelectionRangeProvider {
    public provideSelectionRanges(
        document: vscode.TextDocument,
        positions: vscode.Position[],
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.SelectionRange[]> {
        const ranges: vscode.SelectionRange[] = [];

        for (const position of positions) {
            if (token.isCancellationRequested) {
                break;
            }

            const selectionRanges = this.getSelectionRangesForPosition(document, position);
            if (selectionRanges.length > 0) {
                ranges.push(...selectionRanges);
            }
        }

        return ranges;
    }

    private getSelectionRangesForPosition(document: vscode.TextDocument, position: vscode.Position): vscode.SelectionRange[] {
        const ranges: vscode.SelectionRange[] = [];
        const text = document.getText();
        const lines = text.split('\n');
        const currentLine = lines[position.line];

        // Start with word selection
        const wordRange = document.getWordRangeAtPosition(position);
        if (wordRange) {
            ranges.push(new vscode.SelectionRange(wordRange));
        }

        // Try to expand to larger syntactic units
        this.expandToSyntacticUnits(document, position, ranges);

        // Try to expand to lines
        this.expandToLines(document, position, ranges);

        // Try to expand to blocks
        this.expandToBlocks(document, position, ranges);

        // Try to expand to type definitions
        this.expandToTypeDefinitions(document, position, ranges);

        return ranges;
    }

    private expandToSyntacticUnits(document: vscode.TextDocument, position: vscode.Position, ranges: vscode.SelectionRange[]): void {
        const text = document.getText();
        const lines = text.split('\n');
        const currentLine = lines[position.line];

        // Type references
        const typeRefMatch = currentLine.match(/([A-Za-z_][A-Za-z0-9_]*(?:\s*<[^>]+>)?)/g);
        if (typeRefMatch) {
            for (const typeRef of typeRefMatch) {
                const index = currentLine.indexOf(typeRef);
                if (index >= 0 && position.character >= index && position.character <= index + typeRef.length) {
                    const range = new vscode.Range(position.line, index, position.line, index + typeRef.length);
                    this.addRangeIfLarger(ranges, range);
                }
            }
        }

        // Field definitions
        const fieldMatch = currentLine.match(/^(\s*)(\d+)\s*:\s*(?:required|optional)?\s*([^\s,]+(?:\s*<[^>]+>\s*)?)\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?:=\s*([^,;]+))?\s*[,;]?/);
        if (fieldMatch) {
            const fullField = fieldMatch[0];
            const index = currentLine.indexOf(fullField);
            if (index >= 0 && position.character >= index && position.character <= index + fullField.length) {
                const range = new vscode.Range(position.line, index, position.line, index + fullField.length);
                this.addRangeIfLarger(ranges, range);
            }
        }

        // Method definitions
        const methodMatch = currentLine.match(/^(\s*)(oneway\s+)?([A-Za-z_][A-Za-z0-9_]*(?:\s*<[^>]+>\s*)?)\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/);
        if (methodMatch) {
            // Find the end of the method signature
            const openParenIndex = currentLine.indexOf('(');
            let closeParenIndex = -1;
            let parenDepth = 0;

            for (let i = openParenIndex; i < currentLine.length; i++) {
                if (currentLine[i] === '(') {parenDepth++;}
                else if (currentLine[i] === ')') {
                    parenDepth--;
                    if (parenDepth === 0) {
                        closeParenIndex = i;
                        break;
                    }
                }
            }

            if (closeParenIndex > 0) {
                const methodSignature = currentLine.substring(methodMatch.index!, closeParenIndex + 1);
                const range = new vscode.Range(position.line, methodMatch.index!, position.line, closeParenIndex + 1);
                this.addRangeIfLarger(ranges, range);
            }
        }

        // Namespace definitions
        const namespaceMatch = currentLine.match(/^namespace\s+([A-Za-z_][A-Za-z0-9_]*)\s+([A-Za-z_][A-Za-z0-9_]*)/);
        if (namespaceMatch) {
            const range = new vscode.Range(position.line, 0, position.line, currentLine.length);
            this.addRangeIfLarger(ranges, range);
        }

        // Include statements
        const includeMatch = currentLine.match(/^include\s+["']([^"']+)["']/);
        if (includeMatch) {
            const range = new vscode.Range(position.line, 0, position.line, currentLine.length);
            this.addRangeIfLarger(ranges, range);
        }
    }

    private expandToLines(document: vscode.TextDocument, position: vscode.Position, ranges: vscode.SelectionRange[]): void {
        const text = document.getText();
        const lines = text.split('\n');

        // Current line
        const currentLineLength = lines[position.line].length;
        const currentLineRange = new vscode.Range(position.line, 0, position.line, currentLineLength);
        this.addRangeIfLarger(ranges, currentLineRange);

        // Try to expand to logical line groups
        const logicalRange = this.findLogicalLineRange(lines, position.line);
        if (logicalRange) {
            const range = new vscode.Range(logicalRange.start, 0, logicalRange.end, lines[logicalRange.end].length);
            this.addRangeIfLarger(ranges, range);
        }
    }

    private expandToBlocks(document: vscode.TextDocument, position: vscode.Position, ranges: vscode.SelectionRange[]): void {
        const text = document.getText();
        const lines = text.split('\n');

        // Find the smallest block containing the position
        const blockRange = this.findContainingBlock(lines, position.line);
        if (blockRange) {
            const range = new vscode.Range(blockRange.start, 0, blockRange.end, lines[blockRange.end].length);
            this.addRangeIfLarger(ranges, range);
        }
    }

    private expandToTypeDefinitions(document: vscode.TextDocument, position: vscode.Position, ranges: vscode.SelectionRange[]): void {
        const text = document.getText();
        const lines = text.split('\n');

        // Find the containing type definition
        const typeDef = this.findContainingTypeDefinition(lines, position.line);
        if (typeDef) {
            const range = new vscode.Range(typeDef.start, 0, typeDef.end, lines[typeDef.end].length);
            this.addRangeIfLarger(ranges, range);
        }
    }

    private addRangeIfLarger(ranges: vscode.SelectionRange[], newRange: vscode.Range): void {
        // Check if this range is larger than the last one
        if (ranges.length === 0 || this.isRangeLarger(newRange, ranges[ranges.length - 1].range)) {
            // Create a linked list of selection ranges
            const newSelectionRange = new vscode.SelectionRange(newRange);
            if (ranges.length > 0) {
                newSelectionRange.parent = ranges[ranges.length - 1];
            }
            ranges.push(newSelectionRange);
        }
    }

    private isRangeLarger(range1: vscode.Range, range2: vscode.Range): boolean {
        const lines1 = range1.end.line - range1.start.line;
        const lines2 = range2.end.line - range2.start.line;

        if (lines1 > lines2) {return true;}
        if (lines1 < lines2) {return false;}

        // Same number of lines, compare columns
        const cols1 = range1.end.character - range1.start.character;
        const cols2 = range2.end.character - range2.start.character;

        return cols1 > cols2;
    }

    private findLogicalLineRange(lines: string[], lineIndex: number): { start: number; end: number } | null {
        // Find a logical group of lines (e.g., related statements)
        let start = lineIndex;
        let end = lineIndex;

        // Expand backwards
        while (start > 0) {
            const prevLine = lines[start - 1].trim();
            if (!prevLine || prevLine.startsWith('//') || prevLine.startsWith('#')) {
                break;
            }

            // Check if this is a continuation of the current logical group
            if (this.isContinuationLine(prevLine, lines[start].trim())) {
                start--;
            } else {
                break;
            }
        }

        // Expand forwards
        while (end < lines.length - 1) {
            const nextLine = lines[end + 1].trim();
            if (!nextLine || nextLine.startsWith('//') || nextLine.startsWith('#')) {
                break;
            }

            // Check if this is a continuation of the current logical group
            if (this.isContinuationLine(lines[end].trim(), nextLine)) {
                end++;
            } else {
                break;
            }
        }

        if (start !== lineIndex || end !== lineIndex) {
            return { start, end };
        }

        return null;
    }

    private isContinuationLine(prevLine: string, currentLine: string): boolean {
        // Check if current line is a continuation of prevLine

        // Check for line continuations (trailing commas, incomplete statements)
        if (prevLine.endsWith(',') || prevLine.endsWith('(') || prevLine.endsWith('[') || prevLine.endsWith('{')) {
            return true;
        }

        // Check for related field definitions
        if (prevLine.match(/^\s*\d+\s*:/) && currentLine.match(/^\s*\d+\s*:/)) {
            return true;
        }

        // Check for related enum values
        if (prevLine.match(/^\s*[A-Za-z_][A-Za-z0-9_]*/) && currentLine.match(/^\s*[A-Za-z_][A-Za-z0-9_]*/)) {
            return true;
        }

        return false;
    }

    private findContainingBlock(lines: string[], lineIndex: number): { start: number; end: number } | null {
        let braceDepth = 0;
        let startLine = -1;

        // Find the opening brace
        for (let i = lineIndex; i >= 0; i--) {
            const line = lines[i];

            for (let j = line.length - 1; j >= 0; j--) {
                if (line[j] === '}') {
                    braceDepth++;
                } else if (line[j] === '{') {
                    braceDepth--;
                    if (braceDepth < 0) {
                        startLine = i;
                        break;
                    }
                }
            }

            if (startLine !== -1) {
                break;
            }
        }

        if (startLine === -1) {
            return null;
        }

        // Find the closing brace
        braceDepth = 0;
        let endLine = -1;

        for (let i = startLine; i < lines.length; i++) {
            const line = lines[i];

            for (let j = 0; j < line.length; j++) {
                if (line[j] === '{') {
                    braceDepth++;
                } else if (line[j] === '}') {
                    braceDepth--;
                    if (braceDepth === 0) {
                        endLine = i;
                        break;
                    }
                }
            }

            if (endLine !== -1) {
                break;
            }
        }

        if (endLine !== -1) {
            return { start: startLine, end: endLine };
        }

        return null;
    }

    private findContainingTypeDefinition(lines: string[], lineIndex: number): { start: number; end: number } | null {
        // Find the type definition containing this line
        let typeStart = -1;
        let braceDepth = 0;
        let foundStart = false;

        for (let i = Math.max(0, lineIndex - 20); i <= lineIndex; i++) {
            const line = lines[i].trim();

            if (line.match(/^(struct|union|exception|enum|senum|service)\s+\w+/)) {
                typeStart = i;
                foundStart = true;
            }

            if (foundStart) {
                // Count braces to find the end
                for (let j = 0; j < line.length; j++) {
                    if (line[j] === '{') {
                        braceDepth++;
                    } else if (line[j] === '}') {
                        braceDepth--;
                    }
                }

                if (braceDepth === 0 && line.includes('}')) {
                    if (i >= lineIndex) {
                        return { start: typeStart, end: i };
                    }
                }
            }
        }

        if (typeStart !== -1) {
            // Find the closing brace
            for (let i = typeStart; i < lines.length; i++) {
                const line = lines[i];

                for (let j = 0; j < line.length; j++) {
                    if (line[j] === '{') {
                        braceDepth++;
                    } else if (line[j] === '}') {
                        braceDepth--;
                        if (braceDepth === 0) {
                            return { start: typeStart, end: i };
                        }
                    }
                }
            }
        }

        return null;
    }
}

export function registerSelectionRangeProvider(context: vscode.ExtensionContext) {
    const provider = new ThriftSelectionRangeProvider();
    const disposable = vscode.languages.registerSelectionRangeProvider('thrift', provider);
    context.subscriptions.push(disposable);
}