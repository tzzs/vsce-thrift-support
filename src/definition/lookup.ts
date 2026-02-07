import * as vscode from 'vscode';
import * as nodes from '../ast/nodes.types';
import {ThriftParser} from '../ast/parser';
import {CacheManager} from '../utils/cache-manager';
import {config} from '../config';
import {createLocation} from '../utils/vscode-utils';

export class DefinitionLookup {
    private readonly decoder = new TextDecoder('utf-8');

    constructor(private readonly cacheManager: CacheManager) {
    }

    public async findDefinitionInDocument(
        uri: vscode.Uri,
        text: string,
        typeName: string
    ): Promise<vscode.Location | undefined> {
        const cacheKey = `document_${uri.toString()}_${typeName}`;
        const cached = this.cacheManager.get<vscode.Location[]>('document', cacheKey);
        if (cached && cached.length > 0) {
            return cached[0];
        }

        const parser = new ThriftParser(text);
        const ast = parser.parse();

        let foundLocation: vscode.Location | undefined;
        this.traverseAST(ast, (node) => {
            if (node.name === typeName) {
                foundLocation = createLocation(uri, node.range);
                return false;
            }
            return true;
        });

        const locations = foundLocation ? [foundLocation] : [];
        this.cacheManager.set('document', cacheKey, locations);
        return foundLocation;
    }

    public async findDefinitionInWorkspace(typeName: string): Promise<vscode.Location[]> {
        const cacheKey = `workspace_${typeName}`;
        const cached = this.cacheManager.get<vscode.Location[]>('workspace', cacheKey);
        if (cached) {
            return cached;
        }

        const locations: vscode.Location[] = [];
        if (!vscode.workspace) {
            console.error('[DefinitionLookup] vscode.workspace is missing, falling back to empty file list');
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

                const def = await this.findDefinitionInDocument(file, text, typeName);
                if (def) {
                    locations.push(def);
                }
            } catch {

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
            const doc = node ;
            if (doc.body) {
                for (const item of doc.body) {
                    if (!this.traverseAST(item, callback)) {
                        return false;
                    }
                }
            }
        } else if (node.type === nodes.ThriftNodeType.Struct ||
            node.type === nodes.ThriftNodeType.Union ||
            node.type === nodes.ThriftNodeType.Exception) {
            const struct = node ;
            for (const field of struct.fields) {
                if (!this.traverseAST(field, callback)) {
                    return false;
                }
            }
        } else if (node.type === nodes.ThriftNodeType.Enum) {
            const enumNode = node ;
            for (const member of enumNode.members) {
                if (!this.traverseAST(member, callback)) {
                    return false;
                }
            }
        } else if (node.type === nodes.ThriftNodeType.Service) {
            const service = node ;
            for (const func of service.functions) {
                if (!this.traverseAST(func, callback)) {
                    return false;
                }
            }
        } else if (node.type === nodes.ThriftNodeType.Function) {
            const func = node ;
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
