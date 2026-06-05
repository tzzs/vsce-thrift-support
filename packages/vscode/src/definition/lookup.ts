import * as vscode from 'vscode';
import {nodes} from '@tanzz/thrift-core';
import {ThriftParser} from '@tanzz/thrift-core';
import {CacheManager} from '@tanzz/thrift-core';
import {config} from '@tanzz/thrift-core';
import {createLocation} from '../utils/vscode-utils';
import {ErrorHandler} from '@tanzz/thrift-core';

export class DefinitionLookup {
    private readonly decoder = new TextDecoder('utf-8');

    constructor(private readonly cacheManager: CacheManager) {
    }

    public findDefinitionInDocument(
        uri: vscode.Uri,
        text: string,
        typeName: string,
        sourceRange?: vscode.Range
    ): vscode.Location | undefined {
        const cacheKey = sourceRange === undefined ? `document_${uri.toString()}_${typeName}_${hashText(text)}` : undefined;
        if (cacheKey !== undefined) {
            const cached = this.cacheManager.get<vscode.Location[]>('document', cacheKey);
            if (cached && cached.length > 0) {
                return cached[0];
            }
        }

        const parser = new ThriftParser(text);
        const ast = parser.parse();

        let foundLocation: vscode.Location | undefined;
        this.traverseAST(ast, (node) => {
            if (isDefinitionNode(node) && node.name === typeName) {
                const location = createLocation(uri, node.range);
                if (sourceRange !== undefined && rangeContainsNodeName(node, sourceRange)) {
                    foundLocation = location;
                    return false;
                }
                foundLocation ??= location;
            }
            return true;
        });

        const locations = foundLocation ? [foundLocation] : [];
        if (cacheKey !== undefined) {
            this.cacheManager.set('document', cacheKey, locations);
        }
        return foundLocation;
    }

    public async findDefinitionInWorkspace(typeName: string): Promise<vscode.Location[]> {
        const cacheKey = `workspace_${typeName}`;
        const cached = this.cacheManager.get<vscode.Location[]>('workspace', cacheKey);
        if (cached) {
            return cached;
        }

        const locations: vscode.Location[] = [];
        if (vscode.workspace === undefined) {
            ErrorHandler.getInstance().handleWarning('vscode.workspace is missing, falling back to empty file list', {
                component: 'DefinitionLookup',
                operation: 'findDefinitionInWorkspace'
            });
            this.cacheManager.set('workspace', cacheKey, locations);
            return locations;
        }
        const files = await vscode.workspace.findFiles(config.filePatterns.thrift);

        for (const file of files) {
            try {
                const openDoc = vscode.workspace.textDocuments.find(d => d.uri.toString() === file.toString());
                let text = '';
                if (openDoc) {
                    text = openDoc.getText();
                } else {
                    const content = await vscode.workspace.fs.readFile(file);
                    text = this.decoder.decode(content);
                }

                const def = this.findDefinitionInDocument(file, text, typeName);
                if (def) {
                    locations.push(def);
                }
            } catch {
                continue;
            }
        }

        this.cacheManager.set('workspace', cacheKey, locations);
        return locations;
    }

    private traverseAST(node: nodes.ThriftNode, callback: (node: nodes.ThriftNode) => boolean): boolean {
        if (!callback(node)) {
            return false;
        }

        if (node.type === nodes.ThriftNodeType.Document) {
            const doc = node;
            if (doc.body.length > 0) {
                for (const item of doc.body) {
                    if (!this.traverseAST(item, callback)) {
                        return false;
                    }
                }
            }
        } else if (node.type === nodes.ThriftNodeType.Struct ||
            node.type === nodes.ThriftNodeType.Union ||
            node.type === nodes.ThriftNodeType.Exception) {
            const struct = node;
            for (const field of struct.fields) {
                if (!this.traverseAST(field, callback)) {
                    return false;
                }
            }
        } else if (node.type === nodes.ThriftNodeType.Enum) {
            const enumNode = node;
            for (const member of enumNode.members) {
                if (!this.traverseAST(member, callback)) {
                    return false;
                }
            }
        } else if (node.type === nodes.ThriftNodeType.Service) {
            const service = node;
            for (const func of service.functions) {
                if (!this.traverseAST(func, callback)) {
                    return false;
                }
            }
        } else if (node.type === nodes.ThriftNodeType.Interaction) {
            const interaction = node;
            for (const func of interaction.functions) {
                if (!this.traverseAST(func, callback)) {
                    return false;
                }
            }
        } else if (node.type === nodes.ThriftNodeType.Function) {
            const func = node;
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
}

function rangeContainsNodeName(node: nodes.ThriftNode, sourceRange: vscode.Range): boolean {
    if (node.nameRange === undefined) {
        return false;
    }
    return node.nameRange.start.line === sourceRange.start.line &&
        sourceRange.start.character >= node.nameRange.start.character &&
        sourceRange.end.character <= node.nameRange.end.character;
}

function isDefinitionNode(node: nodes.ThriftNode): boolean {
    return node.type === nodes.ThriftNodeType.Const ||
        node.type === nodes.ThriftNodeType.Typedef ||
        node.type === nodes.ThriftNodeType.Enum ||
        node.type === nodes.ThriftNodeType.EnumMember ||
        node.type === nodes.ThriftNodeType.Struct ||
        node.type === nodes.ThriftNodeType.Union ||
        node.type === nodes.ThriftNodeType.Exception ||
        node.type === nodes.ThriftNodeType.Service ||
        node.type === nodes.ThriftNodeType.Interaction ||
        node.type === nodes.ThriftNodeType.Function;
}

function hashText(text: string): string {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
        hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
    }
    return hash.toString(36);
}
