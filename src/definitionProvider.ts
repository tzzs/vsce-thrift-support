import * as vscode from 'vscode';
import * as path from 'path';

export class ThriftDefinitionProvider implements vscode.DefinitionProvider {
    
    async provideDefinition(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): Promise<vscode.Definition | undefined> {
        // Check if cursor is on an include statement first
        const includeDefinition = await this.checkIncludeStatement(document, position);
        if (includeDefinition) {
            return includeDefinition;
        }

        // For non-include statements, get the word at cursor position
        const wordRange = this.getWordRangeAtPosition(document, position);
        if (!wordRange) {
            return undefined;
        }

        const word = document.getText(wordRange);
        
        // Skip primitive types
        if (this.isPrimitiveType(word)) {
            return undefined;
        }

        // Check if we need to look for a namespaced type
        // Look at the full line to see if this word is part of a namespaced reference
        const line = document.lineAt(position.line);
        const lineText = line.text;
        const wordStart = wordRange.start.character;
        const wordEnd = wordRange.end.character;
        
        let searchTypeName = word;
        let targetNamespace = '';
        
        // Check if there's a dot before or after the current word to form a namespace
        if (wordStart > 0 && lineText[wordStart - 1] === '.') {
            // Current word is the type part (e.g., "SharedStruct" in "shared.SharedStruct")
            const beforeDot = lineText.substring(0, wordStart - 1);
            const namespaceMatch = beforeDot.match(/([a-zA-Z_][a-zA-Z0-9_]*)$/);
            if (namespaceMatch) {
                targetNamespace = namespaceMatch[1];
                searchTypeName = word;
            }
        } else if (wordEnd < lineText.length && lineText[wordEnd] === '.') {
            // Current word is the namespace part (e.g., "shared" in "shared.SharedStruct")
            const afterDot = lineText.substring(wordEnd + 1);
            const typeMatch = afterDot.match(/^([a-zA-Z_][a-zA-Z0-9_]*)/);
            if (typeMatch) {
                targetNamespace = word;
                searchTypeName = typeMatch[1];
            }
        }

        // Search for type definition in current document
        const currentDocDefinition = await this.findDefinitionInDocument(document, searchTypeName);
        if (currentDocDefinition) {
            return currentDocDefinition;
        }

        // Search in included files
        const includedFiles = await this.getIncludedFiles(document);
        for (const includedFile of includedFiles) {
            try {
                const includedDocument = await vscode.workspace.openTextDocument(includedFile);
                
                // If we have a namespace, check if this file matches the namespace
                if (targetNamespace) {
                    const fileName = path.basename(includedFile.fsPath, '.thrift');
                    if (fileName !== targetNamespace) {
                        continue; // Skip files that don't match the namespace
                    }
                }
                
                const definition = await this.findDefinitionInDocument(includedDocument, searchTypeName);
                if (definition) {
                    return definition;
                }
            } catch (error) {
                // File might not exist or be accessible
                continue;
            }
        }

        // Search in all thrift files in workspace
        const workspaceDefinition = await this.findDefinitionInWorkspace(searchTypeName);
        if (workspaceDefinition) {
            return workspaceDefinition;
        }

        return undefined;
    }

    private getWordRangeAtPosition(document: vscode.TextDocument, position: vscode.Position): vscode.Range | undefined {
        const line = document.lineAt(position.line);
        const text = line.text;
        
        // Check if we're in an include statement - if so, treat the entire filename as one word
        const includeMatch = text.match(/^include\s+["']([^"']+)["']/);
        if (includeMatch) {
            const includePath = includeMatch[1];
            const quoteStart = text.indexOf('"') !== -1 ? text.indexOf('"') : text.indexOf("'");
            const filenameStart = quoteStart + 1;
            const filenameEnd = filenameStart + includePath.length;
            
            if (position.character >= filenameStart && position.character <= filenameEnd) {
                return new vscode.Range(
                    position.line, filenameStart,
                    position.line, filenameEnd
                );
            }
        }
        
        // For other cases, use default word detection to allow individual part selection
        // This allows users to click on 'shared' or 'SharedStruct' separately in 'shared.SharedStruct'
        return document.getWordRangeAtPosition(position);
    }

    private async checkIncludeStatement(
        document: vscode.TextDocument,
        position: vscode.Position
    ): Promise<vscode.Location | undefined> {
        const line = document.lineAt(position.line);
        const lineText = line.text.trim();
        
        // Check if current line is an include statement
        const includeMatch = lineText.match(/^include\s+["']([^"']+)["']/);
        if (!includeMatch) {
            return undefined;
        }
        
        const includePath = includeMatch[1];
        const documentDir = path.dirname(document.uri.fsPath);
        
        // Find the exact position of the quoted filename in the line
        const fullLineText = line.text;
        const quotePattern = /["']([^"']+)["']/;
        const quoteMatch = fullLineText.match(quotePattern);
        
        if (!quoteMatch) {
            return undefined;
        }
        
        const quoteStart = fullLineText.indexOf(quoteMatch[0]);
        const filenameStart = quoteStart + 1; // Skip the opening quote
        const filenameEnd = filenameStart + includePath.length;
        
        // Check if cursor is within the filename (including dots and extensions)
        if (position.character >= filenameStart && position.character <= filenameEnd) {
            let fullPath: string;
            
            if (path.isAbsolute(includePath)) {
                fullPath = includePath;
            } else {
                fullPath = path.resolve(documentDir, includePath);
            }
            
            try {
                const uri = vscode.Uri.file(fullPath);
                // Check if file exists by trying to get its stats
                await vscode.workspace.fs.stat(uri);
                return new vscode.Location(uri, new vscode.Position(0, 0));
            } catch (error) {
                // File doesn't exist, return undefined
                return undefined;
            }
        }
        
        return undefined;
    }

    private isPrimitiveType(word: string): boolean {
        const primitiveTypes = [
            'bool', 'byte', 'i8', 'i16', 'i32', 'i64', 'double', 'string', 'binary',
            'list', 'set', 'map', 'void'
        ];
        return primitiveTypes.includes(word);
    }

    private async findDefinitionInDocument(
        document: vscode.TextDocument,
        typeName: string
    ): Promise<vscode.Location | undefined> {
        const text = document.getText();
        const lines = text.split('\n');

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            
            // Check for struct, union, exception, enum, service, typedef definitions
            const patterns = [
                new RegExp(`^(struct|union|exception|enum|service)\\s+${typeName}\\b`),
                new RegExp(`^typedef\\s+.+\\s+${typeName}\\b`)
            ];

            for (const pattern of patterns) {
                if (pattern.test(line)) {
                    const position = new vscode.Position(i, line.indexOf(typeName));
                    return new vscode.Location(document.uri, position);
                }
            }
        }

        return undefined;
    }

    private async getIncludedFiles(document: vscode.TextDocument): Promise<vscode.Uri[]> {
        const text = document.getText();
        const lines = text.split('\n');
        const includedFiles: vscode.Uri[] = [];
        const documentDir = path.dirname(document.uri.fsPath);

        for (const line of lines) {
            const trimmedLine = line.trim();
            
            // Match include statements: include "filename.thrift"
            const includeMatch = trimmedLine.match(/^include\s+["']([^"']+)["']/);
            if (includeMatch) {
                const includePath = includeMatch[1];
                let fullPath: string;
                
                if (path.isAbsolute(includePath)) {
                    fullPath = includePath;
                } else {
                    fullPath = path.resolve(documentDir, includePath);
                }
                
                try {
                    const uri = vscode.Uri.file(fullPath);
                    includedFiles.push(uri);
                } catch (error) {
                    // Invalid path, skip
                }
            }
        }

        return includedFiles;
    }

    private async findDefinitionInWorkspace(typeName: string): Promise<vscode.Location | undefined> {
        // Search for .thrift files in workspace
        const thriftFiles = await vscode.workspace.findFiles('**/*.thrift', '**/node_modules/**');
        
        for (const file of thriftFiles) {
            try {
                const document = await vscode.workspace.openTextDocument(file);
                const definition = await this.findDefinitionInDocument(document, typeName);
                if (definition) {
                    return definition;
                }
            } catch (error) {
                // File might not be accessible
                continue;
            }
        }

        return undefined;
    }
}