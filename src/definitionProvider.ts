import * as vscode from 'vscode';
import * as path from 'path';
import { ThriftParser } from './ast/parser';
import * as nodes from './ast/nodes';

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
        // Derive the word from the current line text to be robust in non-IDE test shims
        const line = document.lineAt(position.line);
        const lineText = line.text;
        const word = lineText.substring(wordRange.start.character, wordRange.end.character);
        
        // Skip primitive types
        if (this.isPrimitiveType(word)) {
            return undefined;
        }

        // Check if we need to look for a namespaced type by scanning the entire line
        const wordStart = wordRange.start.character;
        const wordEnd = wordRange.end.character;
        
        let searchTypeName = word;
        let targetNamespace = '';
        let isNamespaceClick = false;

        // Robust detection: find occurrences of namespace.type and see which part user clicked
        const nsRegex = /([a-zA-Z_][a-zA-Z0-9_]*)\.([a-zA-Z_][a-zA-Z0-9_]*)/g;
        let match: RegExpExecArray | null;
        let matchedNamespaced = false;
        let nsStartIdx = -1;
        while ((match = nsRegex.exec(lineText)) !== null) {
            const nsStart = match.index;
            const nsEnd = nsStart + match[0].length;
            if (wordStart >= nsStart && wordEnd <= nsEnd) {
                // Cursor is within namespace.type
                targetNamespace = match[1];
                searchTypeName = match[2];
                isNamespaceClick = word === targetNamespace; // clicked on namespace part
                matchedNamespaced = true;
                nsStartIdx = nsStart;
                break;
            }
        }

        // If clicked exactly on the dot between namespace and type, do not navigate
        if (matchedNamespaced && nsStartIdx >= 0) {
            const dotIndex = nsStartIdx + targetNamespace.length; // position of the dot
            if (position.character === dotIndex) {
                return undefined;
            }
        }

        // If clicked on the namespace itself, try to navigate to the include line for that namespace
        if (matchedNamespaced && isNamespaceClick && targetNamespace) {
            const includeLoc = await this.findIncludeForNamespace(document, targetNamespace);
            if (includeLoc) {return includeLoc;}
            // No include for the namespace: do not fallback; return undefined
            return undefined;
        }

        // Search in current document
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

        // If namespaced type is used but corresponding include is missing, do NOT fallback to workspace
        if (targetNamespace) {
            const includeLoc = await this.findIncludeForNamespace(document, targetNamespace);
            if (!includeLoc) {
                return undefined;
            }
        }

        // Search in all thrift files in workspace, return multiple candidates if any
        const workspaceDefinitions = await this.findDefinitionInWorkspace(searchTypeName);
        if (workspaceDefinitions && workspaceDefinitions.length > 0) {
            return workspaceDefinitions; // VS Code will present multiple results to the user
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
            'bool', 'byte', 'i8', 'i16', 'i32', 'i64', 'double', 'string', 'binary', 'uuid',
            'list', 'set', 'map', 'void'
        ];
        return primitiveTypes.includes(word);
    }

    private async findDefinitionInDocument(
        document: vscode.TextDocument,
        typeName: string
    ): Promise<vscode.Location | undefined> {
        // Use AST to find definition
        const parser = new ThriftParser(document);
        const ast = parser.parse();
        
        let foundLocation: vscode.Location | undefined = undefined;
        
        // Traverse AST to find the definition
        this.traverseAST(ast, (node) => {
            if (node.name === typeName) {
                // Found the definition
                foundLocation = new vscode.Location(document.uri, node.range);
                return false; // Stop traversal
            }
            return true; // Continue traversal
        });
        
        return foundLocation;
    }

    private traverseAST(node: nodes.ThriftNode, callback: (node: nodes.ThriftNode) => boolean): boolean {
        // If callback returns false, stop traversal
        if (!callback(node)) {
            return false;
        }
        
        // Handle specific node types with nested structures
        if (node.type === nodes.ThriftNodeType.Struct || 
            node.type === nodes.ThriftNodeType.Union || 
            node.type === nodes.ThriftNodeType.Exception) {
            const struct = node as nodes.Struct;
            for (const field of struct.fields) {
                if (!this.traverseAST(field, callback)) {
                    return false;
                }
            }
        } else if (node.type === nodes.ThriftNodeType.Enum) {
            const enumNode = node as nodes.Enum;
            for (const member of enumNode.members) {
                if (!this.traverseAST(member, callback)) {
                    return false;
                }
            }
        } else if (node.type === nodes.ThriftNodeType.Service) {
            const service = node as nodes.Service;
            for (const func of service.functions) {
                if (!this.traverseAST(func, callback)) {
                    return false;
                }
            }
        } else if (node.type === nodes.ThriftNodeType.Function) {
            const func = node as nodes.ThriftFunction;
            for (const arg of func.arguments) {
                if (!this.traverseAST(arg, callback)) {
                    return false;
                }
            }
            for (const throwNode of func.throws) {
                if (!this.traverseAST(throwNode, callback)) {
                    return false;
                }
            }
        }
        
        return true;
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

    private async findDefinitionInWorkspace(typeName: string): Promise<vscode.Location[]> {
        const locations: vscode.Location[] = [];
        const files = await vscode.workspace.findFiles('**/*.thrift');
        for (const file of files) {
            try {
                const doc = await vscode.workspace.openTextDocument(file);
                const def = await this.findDefinitionInDocument(doc, typeName);
                if (def) {
                    locations.push(def);
                }
            } catch (error) {
                // ignore file open errors
                continue;
            }
        }
        return locations;
    }
}