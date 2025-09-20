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

        // Check if we need to look for a namespaced type by scanning the entire line
        const line = document.lineAt(position.line);
        const lineText = line.text;
        const wordStart = wordRange.start.character;
        const wordEnd = wordRange.end.character;
        
        let searchTypeName = word;
        let targetNamespace = '';
        let isNamespaceClick = false;

        // Robust detection: find occurrences of namespace.type and see which part user clicked
        const nsRegex = /([a-zA-Z_][a-zA-Z0-9_]*)\.([a-zA-Z_][a-zA-Z0-9_]*)/g;
        let match: RegExpExecArray | null;
        let matchedNamespaced = false;
        while ((match = nsRegex.exec(lineText)) !== null) {
            const ns = match[1];
            const type = match[2];
            const nsStart = match.index;
            const nsEnd = nsStart + ns.length;
            const dotPos = nsEnd; // '.' position
            const typeStart = dotPos + 1;
            const typeEnd = typeStart + type.length;

            if (position.character >= nsStart && position.character < nsEnd) {
                // Clicked on namespace part
                targetNamespace = ns;
                isNamespaceClick = true;
                matchedNamespaced = true;
                break;
            } else if (position.character >= typeStart && position.character < typeEnd) {
                // Clicked on type part
                targetNamespace = ns;
                searchTypeName = type;
                matchedNamespaced = true;
                break;
            }
        }

        // If user clicked on namespace part, try to find the include statement
        if (matchedNamespaced && isNamespaceClick) {
            const includeLocation = await this.findIncludeForNamespace(document, targetNamespace);
            if (includeLocation) {
                return includeLocation;
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
        
        // 检查是否在 include 语句中
        const includeMatch = text.match(/^(\s*)include\s+["']([^"']+)["']/);
        if (includeMatch) {
            const leadingWhitespace = includeMatch[1];
            const includePath = includeMatch[2];
            
            // 找到整个include语句的位置（包含引号）
            const includeStart = text.indexOf('include');
            const quoteStart = text.indexOf('"') !== -1 ? text.indexOf('"') : text.indexOf("'");
            const quoteEnd = text.lastIndexOf('"') !== -1 ? text.lastIndexOf('"') : text.lastIndexOf("'");
            
            // 检查光标是否在include关键字到引号结束的范围内
            if (position.character >= includeStart && position.character <= quoteEnd) {
                // 如果光标在include关键字上，只选中include
                if (position.character >= includeStart && position.character < includeStart + 7) {
                    return new vscode.Range(
                        position.line, includeStart,
                        position.line, includeStart + 7
                    );
                }
                // 如果光标在引号内或引号上，返回整个带引号的路径
                else if (position.character >= quoteStart && position.character <= quoteEnd) {
                    return new vscode.Range(
                        position.line, quoteStart,
                        position.line, quoteEnd + 1
                    );
                }
            }
        }
        
        // 对于其他情况，使用默认的单词检测
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
        const quoteStart = fullLineText.indexOf('"') !== -1 ? fullLineText.indexOf('"') : fullLineText.indexOf("'");
        const quoteEnd = fullLineText.lastIndexOf('"') !== -1 ? fullLineText.lastIndexOf('"') : fullLineText.lastIndexOf("'");
        
        // Check if cursor is within the quoted path (including quotes)
        if (position.character >= quoteStart && position.character <= quoteEnd) {
            // Resolve the complete path as a single unit (like JavaScript module imports)
            const resolvedPath = await this.resolveModulePath(includePath, documentDir);
            
            if (resolvedPath) {
                try {
                    const uri = vscode.Uri.file(resolvedPath);
                    // Check if file exists by trying to get its stats
                    await vscode.workspace.fs.stat(uri);
                    return new vscode.Location(uri, new vscode.Position(0, 0));
                } catch (error) {
                    // File doesn't exist, return undefined
                    return undefined;
                }
            }
        }
        
        return undefined;
    }

    /**
     * Find the include statement for a given namespace
     */
    private async findIncludeForNamespace(
        document: vscode.TextDocument,
        namespace: string
    ): Promise<vscode.Location | undefined> {
        const text = document.getText();
        const lines = text.split('\n');
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            const includeMatch = line.match(/^include\s+["']([^"']+)["']/);
            
            if (includeMatch) {
                const includePath = includeMatch[1];
                const fileName = path.basename(includePath, '.thrift');
                
                // Check if the filename matches the namespace
                if (fileName === namespace) {
                    // Return location of the include statement
                    return new vscode.Location(
                        document.uri,
                        new vscode.Position(i, 0)
                    );
                }
            }
        }
        
        return undefined;
    }

    /**
     * Resolve module path like JavaScript/TypeScript imports
     * Treats the entire path as a single clickable unit
     */
    private async resolveModulePath(includePath: string, documentDir: string): Promise<string | undefined> {
        let candidates: string[] = [];
        
        // Absolute path
        if (path.isAbsolute(includePath)) {
            candidates.push(path.normalize(includePath));
        } else if (includePath.startsWith('./') || includePath.startsWith('../')) {
            // Relative to current document
            candidates.push(path.resolve(documentDir, includePath));
        } else {
            // Simple filename or relative without ./
            candidates.push(path.resolve(documentDir, includePath));
        }
        
        // Fallbacks: try workspace root (parent of current dir) and common sibling folders
        const workspaceDir = path.resolve(documentDir, '..');
        const baseName = path.basename(includePath);
        candidates.push(path.resolve(workspaceDir, includePath));
        candidates.push(path.resolve(workspaceDir, 'test-files', baseName));
        
        // Return the first existing candidate using vscode.workspace.fs.stat
        for (const p of candidates) {
            const normalized = path.normalize(p);
            try {
                const uri = vscode.Uri.file(normalized);
                await vscode.workspace.fs.stat(uri);
                return normalized;
            } catch {
                // ignore and continue
            }
        }
        
        // If nothing exists, return the most direct resolution (first candidate) for consistency
        return candidates.length > 0 ? path.normalize(candidates[0]) : undefined;
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