import * as vscode from 'vscode';
import * as path from 'path';

export class ThriftReferencesProvider implements vscode.ReferenceProvider {
    public async provideReferences(
        document: vscode.TextDocument,
        position: vscode.Position,
        context: vscode.ReferenceContext,
        token: vscode.CancellationToken
    ): Promise<vscode.Location[]> {
        console.log('provideReferences called');
        const references: vscode.Location[] = [];
        const wordRange = document.getWordRangeAtPosition(position);
        if (!wordRange) {
            console.log('No word range found');
            return references;
        }

        const symbolName = document.getText(wordRange);
        console.log(`Looking for references to symbol: ${symbolName}`);
        const symbolType = await this.getSymbolType(document, position, symbolName);

        if (!symbolType) {
            console.log(`No symbol type found for: ${symbolName}`);
            return references;
        }

        console.log(`Found symbol type: ${symbolType}`);

        // Search in current document
        const currentDocRefs = await this.findReferencesInDocument(document, symbolName, symbolType);
        references.push(...currentDocRefs);

        // Search in all Thrift files in workspace
        const thriftFiles = await vscode.workspace.findFiles('**/*.thrift', '**/node_modules/**');

        for (const file of thriftFiles) {
            if (token.isCancellationRequested) {
                break;
            }

            if (file.fsPath === document.uri.fsPath) {
                continue; // Skip current document, already processed
            }

            try {
                const doc = await vscode.workspace.openTextDocument(file);
                const refs = await this.findReferencesInDocument(doc, symbolName, symbolType);
                references.push(...refs);
            } catch (error) {
                console.error(`Error searching references in ${file.fsPath}:`, error);
            }
        }

        return references;
    }

    private async getSymbolType(document: vscode.TextDocument, position: vscode.Position, symbolName: string): Promise<string | null> {
        const text = document.getText();
        const lines = text.split('\n');
        const lineNumber = position.line;

        // Check if we're in a type definition context
        const line = lines[lineNumber];
        const trimmed = line.trim();

        // Check if symbol is a type definition
        const typeDefMatch = trimmed.match(new RegExp(`^(struct|union|exception|enum|senum|service|typedef|const)\\s+${symbolName}\\b`));
        if (typeDefMatch) {
            return 'type';
        }

        // Debug: Check if this is a type definition with different pattern
        const typeDefMatch2 = trimmed.match(/^(struct|union|exception|enum|senum|service|typedef|const)\\s+\\w+/);
        if (typeDefMatch2) {
            console.log(`Found type definition: "${trimmed}" with type ${typeDefMatch2[1]}`);
            console.log(`Looking for symbol: ${symbolName}`);
        }

        // Check if symbol is a field name in current context
        const fieldMatch = line.match(/^(\s*)(\d+)\s*:\s*(?:required|optional)?\s*([^\s,]+(?:\s*<[^>]+>\s*)?)\s+([A-Za-z_][A-Za-z0-9_]*)/);
        if (fieldMatch && fieldMatch[4] === symbolName) {
            return 'field';
        }

        // Check if symbol is an enum value
        const enumValueMatch = trimmed.match(new RegExp(`^\\s*${symbolName}\\s*(?:=|,)`, 'i'));
        if (enumValueMatch) {
            // Check if we're inside an enum block
            let inEnum = false;
            for (let i = 0; i < lineNumber; i++) {
                const prevLine = lines[i].trim();
                if (prevLine.match(/^enum\s+\w+/)) {
                    inEnum = true;
                } else if (prevLine === '}' && inEnum) {
                    inEnum = false;
                }
            }
            if (inEnum) {
                return 'enumValue';
            }
        }

        // Check if symbol is a service method
        const methodMatch = line.match(/^(\s*)(oneway\s+)?([A-Za-z_][A-Za-z0-9_]*(?:\s*<[^>]+>\s*)?)\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/);
        if (methodMatch && methodMatch[4] === symbolName) {
            return 'method';
        }

        // Check if symbol is a namespace
        const namespaceMatch = trimmed.match(new RegExp(`^namespace\\s+\\w+\\s+${symbolName}\\b`));
        if (namespaceMatch) {
            return 'namespace';
        }

        // Check if symbol is an include
        const includeMatch = trimmed.match(new RegExp(`^include\\s+["']${symbolName}["']`));
        if (includeMatch) {
            return 'include';
        }

        return null;
    }

    private async findReferencesInDocument(document: vscode.TextDocument, symbolName: string, symbolType: string): Promise<vscode.Location[]> {
        const references: vscode.Location[] = [];
        const text = document.getText();
        const lines = text.split('\n');

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            // Find all occurrences of the symbol name in this line
            let index = 0;
            while ((index = line.indexOf(symbolName, index)) !== -1) {
                const startPos = new vscode.Position(i, index);
                const endPos = new vscode.Position(i, index + symbolName.length);
                const range = new vscode.Range(startPos, endPos);

                // Check if this is a valid reference (not inside a string or comment)
                if (this.isValidReference(line, index, symbolName, symbolType)) {
                    references.push(new vscode.Location(document.uri, range));
                }

                index += symbolName.length;
            }
        }

        return references;
    }

    private isValidReference(line: string, index: number, symbolName: string, symbolType: string): boolean {
        // Check if we're inside a string
        const beforeMatch = line.substring(0, index);
        const singleQuotes = (beforeMatch.match(/'/g) || []).length;
        const doubleQuotes = (beforeMatch.match(/"/g) || []).length;

        if (singleQuotes % 2 === 1 || doubleQuotes % 2 === 1) {
            return false; // Inside a string
        }

        // Check if we're inside a comment
        const lineStart = line.substring(0, index);
        if (lineStart.includes('//') || lineStart.includes('/*')) {
            return false;
        }

        // Check if this is a word boundary (not part of a larger identifier)
        const beforeChar = index > 0 ? line[index - 1] : '';
        const afterChar = index + symbolName.length < line.length ? line[index + symbolName.length] : '';

        const isWordChar = (char: string) => /[A-Za-z0-9_]/.test(char);

        if ((beforeChar && isWordChar(beforeChar)) || (afterChar && isWordChar(afterChar))) {
            return false; // Part of a larger word
        }

        // Additional validation based on symbol type
        switch (symbolType) {
            case 'field':
                // For fields, we should be in a type context
                return this.isInTypeContext(line, index);
            case 'type':
                // For types, we should be in a type reference context
                return this.isInTypeReferenceContext(line, index);
            default:
                return true;
        }
    }

    private isInTypeContext(line: string, index: number): boolean {
        // Check if this appears to be a type reference
        const beforeText = line.substring(0, index);
        const afterText = line.substring(index);

        // Common patterns for type references
        return /:\s*$/.test(beforeText) || // After colon (field type)
               /^\s+/.test(afterText) ||    // Before whitespace
               /throws\s*\(\s*\d+\s*:\s*$/.test(beforeText); // In throws clause
    }

    private isInTypeReferenceContext(line: string, index: number): boolean {
        const beforeText = line.substring(0, index);
        const afterText = line.substring(index);

        // Common patterns for type references
        return /:\s*$/.test(beforeText) || // After colon
               /extends\s+$/.test(beforeText) || // After extends
               /throws\s*\(\s*\d+\s*:\s*$/.test(beforeText) || // In throws clause
               /^\s*[A-Za-z_][A-Za-z0-9_]*\s*$/.test(afterText); // Followed by identifier (field name)
    }
}

export function registerReferencesProvider(context: vscode.ExtensionContext) {
    const provider = new ThriftReferencesProvider();
    const disposable = vscode.languages.registerReferenceProvider('thrift', provider);
    context.subscriptions.push(disposable);
}