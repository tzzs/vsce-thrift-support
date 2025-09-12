import * as vscode from 'vscode';
import * as path from 'path';

export class ThriftDefinitionProvider implements vscode.DefinitionProvider {
    
    async provideDefinition(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): Promise<vscode.Definition | undefined> {
        const wordRange = document.getWordRangeAtPosition(position);
        if (!wordRange) {
            return undefined;
        }

        const word = document.getText(wordRange);
        
        // Skip primitive types
        if (this.isPrimitiveType(word)) {
            return undefined;
        }

        // Search for type definition in current document
        const currentDocDefinition = await this.findDefinitionInDocument(document, word);
        if (currentDocDefinition) {
            return currentDocDefinition;
        }

        // Search in included files
        const includedFiles = await this.getIncludedFiles(document);
        for (const includedFile of includedFiles) {
            try {
                const includedDocument = await vscode.workspace.openTextDocument(includedFile);
                const definition = await this.findDefinitionInDocument(includedDocument, word);
                if (definition) {
                    return definition;
                }
            } catch (error) {
                // File might not exist or be accessible
                continue;
            }
        }

        // Search in all thrift files in workspace
        const workspaceDefinition = await this.findDefinitionInWorkspace(word);
        if (workspaceDefinition) {
            return workspaceDefinition;
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