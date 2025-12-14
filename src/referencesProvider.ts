import * as vscode from 'vscode';
import * as path from 'path';
import { ThriftParser } from './ast/parser';
import * as nodes from './ast/nodes';

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
        // Use AST to determine symbol type
        const parser = new ThriftParser(document);
        const ast = parser.parse();
        
        // Find the node containing the position
        const node = this.findNodeAtPosition(ast, position);
        if (!node) {
            return null;
        }

        // Check if the symbol is a definition
        if (node.name === symbolName) {
            switch (node.type) {
                case nodes.ThriftNodeType.Struct:
                case nodes.ThriftNodeType.Union:
                case nodes.ThriftNodeType.Exception:
                case nodes.ThriftNodeType.Enum:
                case nodes.ThriftNodeType.Service:
                case nodes.ThriftNodeType.Typedef:
                case nodes.ThriftNodeType.Const:
                    return 'type';
                case nodes.ThriftNodeType.Field:
                    return 'field';
                case nodes.ThriftNodeType.Function:
                    return 'method';
                case nodes.ThriftNodeType.EnumMember:
                    return 'enumValue';
                default:
                    return null;
            }
        }

        return null;
    }

    private findNodeAtPosition(doc: nodes.ThriftDocument, position: vscode.Position): nodes.ThriftNode | undefined {
        // Find the deepest node that contains the position
        function findDeepestNode(nodesArray: nodes.ThriftNode[]): nodes.ThriftNode | undefined {
            for (const node of nodesArray) {
                if (node.range.contains(position)) {
                    // Check children first
                    if (node.children) {
                        const childResult = findDeepestNode(node.children);
                        if (childResult) {
                            return childResult;
                        }
                    }
                    return node;
                }
            }
            return undefined;
        }
        
        return findDeepestNode(doc.body);
    }

    private async findReferencesInDocument(document: vscode.TextDocument, symbolName: string, symbolType: string): Promise<vscode.Location[]> {
        const references: vscode.Location[] = [];
        const parser = new ThriftParser(document);
        const ast = parser.parse();
        
        // Traverse the AST to find references
        this.traverseAST(ast, (node) => {
            if (node.name === symbolName) {
                // Create a location for this reference
                const location = new vscode.Location(document.uri, node.range);
                references.push(location);
            }
            
            // For field types, we need special handling
            if (node.type === nodes.ThriftNodeType.Field) {
                const field = node as nodes.Field;
                if (field.fieldType === symbolName) {
                    // We'd need to track the position of the fieldType in the original text
                    // This is a simplified approach - in practice, we'd need more detailed position info
                    const location = new vscode.Location(document.uri, field.range);
                    references.push(location);
                }
            }
        });

        return references;
    }

    private traverseAST(node: nodes.ThriftNode, callback: (node: nodes.ThriftNode) => void): void {
        callback(node);
        
        if (node.children) {
            node.children.forEach(child => this.traverseAST(child, callback));
        }
        
        // Handle specific node types with nested structures
        if (node.type === nodes.ThriftNodeType.Struct || 
            node.type === nodes.ThriftNodeType.Union || 
            node.type === nodes.ThriftNodeType.Exception) {
            const struct = node as nodes.Struct;
            struct.fields.forEach(field => this.traverseAST(field, callback));
        } else if (node.type === nodes.ThriftNodeType.Enum) {
            const enumNode = node as nodes.Enum;
            enumNode.members.forEach(member => this.traverseAST(member, callback));
        } else if (node.type === nodes.ThriftNodeType.Service) {
            const service = node as nodes.Service;
            service.functions.forEach(func => this.traverseAST(func, callback));
        } else if (node.type === nodes.ThriftNodeType.Function) {
            const func = node as nodes.ThriftFunction;
            func.arguments.forEach(arg => this.traverseAST(arg, callback));
            func.throws.forEach(throwNode => this.traverseAST(throwNode, callback));
        }
    }
}

export function registerReferencesProvider(context: vscode.ExtensionContext) {
    const provider = new ThriftReferencesProvider();
    const disposable = vscode.languages.registerReferenceProvider('thrift', provider);
    context.subscriptions.push(disposable);
}