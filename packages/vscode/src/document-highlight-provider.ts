import * as vscode from 'vscode';
import {ThriftParser, nodes, ErrorHandler, parseContainerTypeInfo} from '@tanzz/thrift-core';
import {CoreDependencies} from './utils/dependencies';
import {toVscodeRange} from './utils/vscode-utils';
import {PRIMITIVE_TYPES, CONTAINER_KEYWORDS} from './utils/thrift-constants';

interface SimpleRange {
    start: {line: number; character: number};
    end: {line: number; character: number};
}

export interface HighlightOccurrence {
    range: SimpleRange;
    kind: vscode.DocumentHighlightKind;
}

/**
 * Build all in-document highlight ranges for an identifier name.
 *
 * - Declarations / definitions → DocumentHighlightKind.Write
 * - References / usages       → DocumentHighlightKind.Read
 *
 * Pure AST walk; exported for unit testing.
 */
export function collectHighlights(
    ast: nodes.ThriftDocument,
    target: string
): HighlightOccurrence[] {
    if (!target) {
        return [];
    }
    const out: HighlightOccurrence[] = [];

    const pushIfRange = (range: SimpleRange | undefined, kind: vscode.DocumentHighlightKind): void => {
        if (range) {
            out.push({range, kind});
        }
    };

    const matchTypeText = (text: string, range: SimpleRange | undefined): void => {
        if (!range || !text) {
            return;
        }
        if (range.start.line !== range.end.line) {
            return;
        }
        const baseLine = range.start.line;
        const baseChar = range.start.character;
        const matches = findIdentifierPositions(text, target);
        for (const offset of matches) {
            out.push({
                range: {
                    start: {line: baseLine, character: baseChar + offset},
                    end: {line: baseLine, character: baseChar + offset + target.length}
                },
                kind: vscode.DocumentHighlightKind.Read
            });
        }
    };

    const visit = (node: nodes.ThriftNode): void => {
        switch (node.type) {
            case nodes.ThriftNodeType.Namespace: {
                if (node.name === target) {
                    pushIfRange(node.nameRange, vscode.DocumentHighlightKind.Write);
                }
                break;
            }
            case nodes.ThriftNodeType.Const: {
                if (node.name === target) {
                    pushIfRange(node.nameRange, vscode.DocumentHighlightKind.Write);
                }
                matchTypeText(node.valueType, node.valueTypeRange);
                break;
            }
            case nodes.ThriftNodeType.Typedef: {
                if (node.name === target) {
                    pushIfRange(node.nameRange, vscode.DocumentHighlightKind.Write);
                }
                matchTypeText(node.aliasType, node.aliasTypeRange);
                break;
            }
            case nodes.ThriftNodeType.Enum: {
                if (node.name === target) {
                    pushIfRange(node.nameRange, vscode.DocumentHighlightKind.Write);
                }
                for (const member of node.members) {
                    visit(member);
                }
                break;
            }
            case nodes.ThriftNodeType.EnumMember: {
                if (node.name === target) {
                    pushIfRange(node.nameRange, vscode.DocumentHighlightKind.Write);
                }
                break;
            }
            case nodes.ThriftNodeType.Struct:
            case nodes.ThriftNodeType.Union:
            case nodes.ThriftNodeType.Exception: {
                if (node.name === target) {
                    pushIfRange(node.nameRange, vscode.DocumentHighlightKind.Write);
                }
                for (const field of node.fields) {
                    visit(field);
                }
                break;
            }
            case nodes.ThriftNodeType.Service: {
                if (node.name === target) {
                    pushIfRange(node.nameRange, vscode.DocumentHighlightKind.Write);
                }
                // service extends target → Read
                if (node.extends === target) {
                    pushIfRange(node.extendsRange ?? node.nameRange, vscode.DocumentHighlightKind.Read);
                }
                for (const func of node.functions) {
                    visit(func);
                }
                if (Array.isArray(node.performs)) {
                    for (const performs of node.performs) {
                        visit(performs);
                    }
                }
                break;
            }
            case nodes.ThriftNodeType.Interaction: {
                if (node.name === target) {
                    pushIfRange(node.nameRange, vscode.DocumentHighlightKind.Write);
                }
                for (const func of node.functions) {
                    visit(func);
                }
                break;
            }
            case nodes.ThriftNodeType.Performs: {
                if (node.interactionName === target) {
                    pushIfRange(node.interactionNameRange, vscode.DocumentHighlightKind.Read);
                }
                break;
            }
            case nodes.ThriftNodeType.Function: {
                if (node.name === target) {
                    pushIfRange(node.nameRange, vscode.DocumentHighlightKind.Write);
                }
                matchTypeText(node.returnType, node.returnTypeRange);
                for (const arg of node.arguments) {
                    visit(arg);
                }
                for (const t of node.throws) {
                    visit(t);
                }
                break;
            }
            case nodes.ThriftNodeType.Field: {
                if (node.name === target) {
                    pushIfRange(node.nameRange, vscode.DocumentHighlightKind.Write);
                }
                matchTypeText(node.fieldType, node.typeRange);
                break;
            }
            default:
                break;
        }
    };

    for (const child of ast.body) {
        visit(child);
    }

    return dedupe(out);
}

function dedupe(occurrences: HighlightOccurrence[]): HighlightOccurrence[] {
    const seen = new Set<string>();
    const out: HighlightOccurrence[] = [];
    for (const occ of occurrences) {
        const key = `${occ.range.start.line}:${occ.range.start.character}-${occ.range.end.line}:${occ.range.end.character}:${occ.kind}`;
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        out.push(occ);
    }
    return out;
}

/**
 * Locate exact identifier occurrences of `name` within a text snippet,
 * skipping primitive and container keywords. Returns starting offsets.
 */
function findIdentifierPositions(text: string, target: string): number[] {
    if (!text || !target) {
        return [];
    }
    if (PRIMITIVE_TYPES.has(target) || CONTAINER_KEYWORDS.has(target)) {
        return [];
    }
    const offsets: number[] = [];
    const re = new RegExp('(?<![A-Za-z_0-9])' + escapeRegex(target) + '(?![A-Za-z_0-9])', 'g');
    const matches = text.matchAll(re);
    for (const m of matches) {
        if (m.index === undefined) {
            continue;
        }
        offsets.push(m.index);
    }
    // Use parseContainerTypeInfo to avoid matching keyword positions; but our regex already
    // excludes them via word boundary + name equality. Container parsing here is informational.
    parseContainerTypeInfo(text);
    return offsets;
}

function escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * AST-driven Document Highlight provider for Thrift.
 *
 * Picks up every occurrence of the identifier under the cursor in the
 * current document and marks definitions as Write, references as Read.
 */
export class ThriftDocumentHighlightProvider implements vscode.DocumentHighlightProvider {
    private readonly errorHandler: ErrorHandler;

    constructor(deps?: Partial<CoreDependencies>) {
        this.errorHandler = deps?.errorHandler ?? new ErrorHandler();
    }

    public provideDocumentHighlights(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.DocumentHighlight[]> {
        try {
            if (token.isCancellationRequested) {
                return [];
            }
            const wordRange = document.getWordRangeAtPosition(position, /[A-Za-z_][A-Za-z0-9_]*/);
            if (!wordRange) {
                return [];
            }
            const target = document.getText(wordRange);
            if (!target) {
                return [];
            }
            if (PRIMITIVE_TYPES.has(target) || CONTAINER_KEYWORDS.has(target)) {
                return [];
            }
            const ast = ThriftParser.parseWithCacheByVersion(
                document.uri.fsPath,
                document.getText(),
                document.version
            );
            const occurrences = collectHighlights(ast, target);
            return occurrences.map(o => new vscode.DocumentHighlight(toVscodeRange(o.range), o.kind));
        } catch (error) {
            this.errorHandler.handleError(error, {
                component: 'ThriftDocumentHighlightProvider',
                operation: 'provideDocumentHighlights',
                filePath: document.uri.fsPath
            });
            return [];
        }
    }
}

export function registerDocumentHighlightProvider(
    context: vscode.ExtensionContext,
    deps?: Partial<CoreDependencies>
): ThriftDocumentHighlightProvider {
    const provider = new ThriftDocumentHighlightProvider(deps);
    context.subscriptions.push(
        vscode.languages.registerDocumentHighlightProvider('thrift', provider)
    );
    return provider;
}
