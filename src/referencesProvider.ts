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
        const wordRange = document.getWordRangeAtPosition(position);
        console.log('wordRange:', wordRange);
        if (!wordRange) {
            console.log('No word range found');
            return [];
        }

        const symbolName = document.getText(wordRange);
        console.log('symbolName:', JSON.stringify(symbolName));
        console.log('symbolName length:', symbolName.length);
        const symbolType = await this.getSymbolType(document, position, symbolName);
        console.log('symbolType:', symbolType);

        if (!symbolType) {
            console.log(`No symbol type found for: ${JSON.stringify(symbolName)}`);
            return [];
        }

        console.log(`Found symbol type: ${symbolType}`);

        // Search in current document
        const currentDocRefs = await this.findReferencesInDocument(document, symbolName, symbolType, context);
        console.log('currentDocRefs count:', currentDocRefs.length);

        return currentDocRefs;
    }

    private async getSymbolType(document: vscode.TextDocument, position: vscode.Position, symbolName: string): Promise<string | null> {
        const text = document.getText();
        const lines = text.split('\n');
        const lineNumber = position.line;
        console.log('getSymbolType called with symbolName:', JSON.stringify(symbolName), 'at line:', lineNumber);

        // Check if we're in a type definition context
        const line = lines[lineNumber];
        const trimmed = line.trim();
        console.log('line:', JSON.stringify(line));
        console.log('trimmed:', JSON.stringify(trimmed));

        // Check if symbol is a type definition
        const typeDefMatch = trimmed.match(new RegExp(`^(struct|union|exception|enum|senum|service|typedef|const)\\s+${symbolName}\\b`));
        if (typeDefMatch) {
            console.log('Found type definition:', typeDefMatch[1]);
            return 'type';
        }

        // Debug: Check if this is a type definition with different pattern
        const typeDefMatch2 = trimmed.match(/^(struct|union|exception|enum|senum|service|typedef|const)\s+\w+/);
        if (typeDefMatch2) {
            console.log(`Found type definition: "${trimmed}" with type ${typeDefMatch2[1]}`);
            console.log(`Looking for symbol: ${symbolName}`);
        }

        // Check if symbol is a field name in current context
        const fieldMatch = line.match(/^(\s*)(\d+)\s*:\s*(?:required|optional)?\s*([^\s,]+(?:\s*<[^>]+>\s*)?)\s+([A-Za-z_][A-Za-z0-9_]*)/);
        if (fieldMatch && fieldMatch[4] === symbolName) {
            console.log('Found field definition:', fieldMatch[4]);
            return 'field';
        }

        // Check if symbol is an enum value
        const enumValueMatch = trimmed.match(new RegExp(`^\\s*${symbolName}\\s*(?:=|,)`, 'i'));
        if (enumValueMatch) {
            console.log('Found enum value match');
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
                console.log('Found enum value in enum block');
                return 'enumValue';
            }
        }

        // Check if symbol is a service method
        const methodMatch = line.match(/^(\s*)(oneway\s+)?([A-Za-z_][A-Za-z0-9_]*(?:\s*<[^>]+>\s*)?)\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/);
        if (methodMatch && methodMatch[4] === symbolName) {
            console.log('Found method definition:', methodMatch[4]);
            return 'method';
        }

        // Check if symbol is a namespace
        const namespaceMatch = trimmed.match(new RegExp(`^namespace\\s+\\w+\\s+${symbolName}\\b`));
        if (namespaceMatch) {
            console.log('Found namespace definition');
            return 'namespace';
        }

        // Check if symbol is an include
        const includeMatch = trimmed.match(new RegExp(`^include\\s+["']${symbolName}["']`));
        if (includeMatch) {
            console.log('Found include definition');
            return 'include';
        }

        return null;
    }

    private async findReferencesInDocument(document: vscode.TextDocument, symbolName: string, symbolType: string, context: vscode.ReferenceContext): Promise<vscode.Location[]> {
        const references: vscode.Location[] = [];
        const text = document.getText();
        const lines = text.split('\n');

        // For types, we need to find all references to this type
        if (symbolType === 'type') {
            console.log(`Searching for references to type: ${symbolName}`);
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                // Skip comments and strings
                if (this.isInComment(line) || this.isInString(line)) {
                    continue;
                }

                // Find all occurrences of the symbol name in this line
                const regex = new RegExp(`\\b${symbolName}\\b`, 'g');
                let match;
                console.log(`Checking line ${i}: ${JSON.stringify(line)}`);
                while ((match = regex.exec(line)) !== null) {
                    console.log(`Found potential match at index ${match.index}: ${JSON.stringify(match[0])}`);
                    // Check if this is a valid reference
                    if (this.isValidReference(line, match.index, symbolName, symbolType, context)) {
                        console.log(`Valid reference found at line ${i}, index ${match.index}`);
                        // Create a proper range for the reference
                        const range = new vscode.Range(i, match.index, i, match.index + symbolName.length);
                        references.push(new vscode.Location(document.uri, range));
                    } else {
                        console.log(`Invalid reference at line ${i}, index ${match.index}`);
                    }
                }
            }
        }

        return references;
    }

    private isValidReference(line: string, index: number, symbolName: string, symbolType: string, context: vscode.ReferenceContext): boolean {
        // Skip if in comment
        if (this.isInComment(line)) {
            return false;
        }

        // Skip if in string
        if (this.isInString(line)) {
            return false;
        }

        // For types, check if this is a type usage (not definition)
        if (symbolType === 'type') {
            // Skip if this is a type definition (unless includeDeclaration is true)
            const typeDefMatch = line.trim().match(new RegExp(`^(struct|union|exception|enum|senum|service|typedef|const)\\s+${symbolName}\\b`));
            if (typeDefMatch) {
                // Include definition only if context.includeDeclaration is true
                return context.includeDeclaration === true;
            }

            // Check if we're in a field context (type usage)
            const fieldMatch = line.match(/^(\s*)(\d+)\s*:\s*(?:required|optional)?\s*([^\s,]+(?:\s*<[^>]+>\s*)?)\s+([A-Za-z_][A-Za-z0-9_]*)/);
            if (fieldMatch && fieldMatch[3] === symbolName) {
                return true;
            }

            // Check if we're in a service method context (return type or parameter type)
            const methodMatch = line.match(/^(\s*)(oneway\s+)?([A-Za-z_][A-Za-z0-9_]*(?:\s*<[^>]+>\s*)?)\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/);
            if (methodMatch && methodMatch[3] === symbolName) {
                return true;
            }

            // Check if we're in a const declaration context
            const constMatch = line.match(/^(\s*)const\s+([A-Za-z_][A-Za-z0-9_]*(?:\s*<[^>]+>\s*)?)\s+([A-Za-z_][A-Za-z0-9_]*)\s*=/);
            if (constMatch && constMatch[2] === symbolName) {
                return true;
            }

            // Check if we're in a typedef context
            const typedefMatch = line.match(/^(\s*)typedef\s+([A-Za-z_][A-Za-z0-9_]*(?:\s*<[^>]+>\s*)?)\s+([A-Za-z_][A-Za-z0-9_]*)\s*;/);
            if (typedefMatch && typedefMatch[2] === symbolName) {
                return true;
            }
        }

        return true;
    }

    private isInComment(line: string): boolean {
        return line.includes('#') || line.includes('//');
    }

    private isInString(line: string): boolean {
        return line.includes('"') || line.includes("'");
    }
}

export function registerReferencesProvider(context: vscode.ExtensionContext) {
    const provider = new ThriftReferencesProvider();
    const disposable = vscode.languages.registerReferenceProvider('thrift', provider);
    context.subscriptions.push(disposable);
}