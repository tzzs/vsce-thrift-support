import * as vscode from 'vscode';
import {ThriftParser, nodes, ErrorHandler, parseContainerTypeInfo} from '@tanzz/thrift-core';
import type {Range as CoreRange} from '@tanzz/thrift-core';
import {CoreDependencies} from './utils/dependencies';

export const SEMANTIC_TOKEN_TYPES = [
    'namespace',
    'type',
    'struct',
    'enum',
    'enumMember',
    'interface',
    'function',
    'method',
    'property',
    'variable',
    'parameter',
    'class'
] as const;

export const SEMANTIC_TOKEN_MODIFIERS = [
    'declaration',
    'definition',
    'readonly',
    'defaultLibrary'
] as const;

const TOKEN_TYPE_INDEX: Record<string, number> = (() => {
    const map: Record<string, number> = {};
    SEMANTIC_TOKEN_TYPES.forEach((name, idx) => { map[name] = idx; });
    return map;
})();

const TOKEN_MODIFIER_INDEX: Record<string, number> = (() => {
    const map: Record<string, number> = {};
    SEMANTIC_TOKEN_MODIFIERS.forEach((name, idx) => { map[name] = idx; });
    return map;
})();

export function buildLegend(): vscode.SemanticTokensLegend {
    return new vscode.SemanticTokensLegend(
        Array.from(SEMANTIC_TOKEN_TYPES),
        Array.from(SEMANTIC_TOKEN_MODIFIERS)
    );
}

const PRIMITIVE_TYPES = new Set<string>([
    'void', 'bool', 'byte', 'i8', 'i16', 'i32', 'i64',
    'double', 'string', 'binary', 'uuid', 'slist'
]);

const CONTAINER_KEYWORDS = new Set<string>([
    'list', 'set', 'map', 'stream', 'sink'
]);

export interface RawSemanticToken {
    line: number;
    startChar: number;
    length: number;
    tokenType: number;
    tokenModifiers: number;
}

function modifierBitmask(modifiers: readonly string[]): number {
    let mask = 0;
    for (const m of modifiers) {
        const idx = TOKEN_MODIFIER_INDEX[m];
        if (idx !== undefined) {
            mask |= (1 << idx);
        }
    }
    return mask;
}

function pushTokenFromRange(
    out: RawSemanticToken[],
    range: CoreRange | undefined,
    tokenType: number,
    modifiers: readonly string[] = []
): void {
    if (!range) {
        return;
    }
    if (range.start.line !== range.end.line) {
        return;
    }
    const length = range.end.character - range.start.character;
    if (length <= 0) {
        return;
    }
    out.push({
        line: range.start.line,
        startChar: range.start.character,
        length,
        tokenType,
        tokenModifiers: modifierBitmask(modifiers)
    });
}

const IDENT_RE = /[A-Za-z_][A-Za-z_0-9]*/g;

function scanIdentifierTokens(
    out: RawSemanticToken[],
    text: string,
    range: CoreRange
): void {
    if (range.start.line !== range.end.line) {
        return;
    }
    const baseLine = range.start.line;
    const baseChar = range.start.character;

    let match: RegExpExecArray | null;
    IDENT_RE.lastIndex = 0;
    while ((match = IDENT_RE.exec(text)) !== null) {
        const ident = match[0];
        const offset = match.index;

        if (PRIMITIVE_TYPES.has(ident) || CONTAINER_KEYWORDS.has(ident)) {
            continue;
        }

        const prevCh = offset > 0 ? text[offset - 1] : '';
        const nextCh = text[offset + ident.length];

        let tokenType: number;
        if (nextCh === '.') {
            tokenType = TOKEN_TYPE_INDEX['namespace'];
        } else if (prevCh === '.') {
            tokenType = TOKEN_TYPE_INDEX['type'];
        } else {
            tokenType = TOKEN_TYPE_INDEX['type'];
        }

        out.push({
            line: baseLine,
            startChar: baseChar + offset,
            length: ident.length,
            tokenType,
            tokenModifiers: 0
        });
    }
}

function emitTypeReferenceTokens(
    out: RawSemanticToken[],
    typeText: string,
    typeRange: CoreRange | undefined
): void {
    if (!typeRange || !typeText) {
        return;
    }
    if (typeRange.start.line !== typeRange.end.line) {
        return;
    }
    if (parseContainerTypeInfo(typeText)) {
        scanIdentifierTokens(out, typeText, typeRange);
        return;
    }
    scanIdentifierTokens(out, typeText, typeRange);
}

/**
 * Build raw semantic tokens by walking the AST. Exported for unit testing.
 */
export function buildSemanticTokensFromAst(ast: nodes.ThriftDocument): RawSemanticToken[] {
    const tokens: RawSemanticToken[] = [];

    const walkArg = (arg: nodes.Field): void => {
        pushTokenFromRange(tokens, arg.nameRange, TOKEN_TYPE_INDEX['parameter'], ['declaration']);
        emitTypeReferenceTokens(tokens, arg.fieldType, arg.typeRange);
    };

    const walk = (node: nodes.ThriftNode): void => {
        switch (node.type) {
            case nodes.ThriftNodeType.Namespace: {
                pushTokenFromRange(tokens, node.nameRange, TOKEN_TYPE_INDEX['namespace'], ['declaration']);
                break;
            }
            case nodes.ThriftNodeType.Include: {
                break;
            }
            case nodes.ThriftNodeType.Const: {
                pushTokenFromRange(tokens, node.nameRange, TOKEN_TYPE_INDEX['variable'], ['declaration', 'readonly']);
                emitTypeReferenceTokens(tokens, node.valueType, node.valueTypeRange);
                break;
            }
            case nodes.ThriftNodeType.Typedef: {
                pushTokenFromRange(tokens, node.nameRange, TOKEN_TYPE_INDEX['type'], ['declaration']);
                emitTypeReferenceTokens(tokens, node.aliasType, node.aliasTypeRange);
                break;
            }
            case nodes.ThriftNodeType.Enum: {
                pushTokenFromRange(tokens, node.nameRange, TOKEN_TYPE_INDEX['enum'], ['declaration']);
                for (const member of node.members) {
                    walk(member);
                }
                break;
            }
            case nodes.ThriftNodeType.EnumMember: {
                pushTokenFromRange(tokens, node.nameRange, TOKEN_TYPE_INDEX['enumMember'], ['declaration', 'readonly']);
                break;
            }
            case nodes.ThriftNodeType.Struct:
            case nodes.ThriftNodeType.Union:
            case nodes.ThriftNodeType.Exception: {
                const typeIdx = node.type === nodes.ThriftNodeType.Exception
                    ? TOKEN_TYPE_INDEX['class']
                    : TOKEN_TYPE_INDEX['struct'];
                pushTokenFromRange(tokens, node.nameRange, typeIdx, ['declaration']);
                for (const field of node.fields) {
                    walk(field);
                }
                break;
            }
            case nodes.ThriftNodeType.Service: {
                pushTokenFromRange(tokens, node.nameRange, TOKEN_TYPE_INDEX['interface'], ['declaration']);
                for (const func of node.functions) {
                    walk(func);
                }
                if (Array.isArray(node.performs)) {
                    for (const performs of node.performs) {
                        walk(performs);
                    }
                }
                break;
            }
            case nodes.ThriftNodeType.Interaction: {
                pushTokenFromRange(tokens, node.nameRange, TOKEN_TYPE_INDEX['interface'], ['declaration']);
                for (const func of node.functions) {
                    walk(func);
                }
                break;
            }
            case nodes.ThriftNodeType.Performs: {
                emitTypeReferenceTokens(tokens, node.interactionName, node.interactionNameRange);
                break;
            }
            case nodes.ThriftNodeType.Function: {
                pushTokenFromRange(tokens, node.nameRange, TOKEN_TYPE_INDEX['method'], ['declaration']);
                emitTypeReferenceTokens(tokens, node.returnType, node.returnTypeRange);
                for (const arg of node.arguments) {
                    walkArg(arg);
                }
                for (const t of node.throws) {
                    walkArg(t);
                }
                break;
            }
            case nodes.ThriftNodeType.Field: {
                pushTokenFromRange(tokens, node.nameRange, TOKEN_TYPE_INDEX['property'], ['declaration']);
                emitTypeReferenceTokens(tokens, node.fieldType, node.typeRange);
                break;
            }
            default:
                break;
        }
    };

    for (const child of ast.body) {
        walk(child);
    }

    tokens.sort((a, b) => {
        if (a.line !== b.line) {
            return a.line - b.line;
        }
        return a.startChar - b.startChar;
    });
    return tokens;
}

/**
 * AST-driven semantic tokens provider.
 */
export class ThriftSemanticTokensProvider implements vscode.DocumentSemanticTokensProvider {
    private readonly legend: vscode.SemanticTokensLegend;
    private readonly errorHandler: ErrorHandler;

    constructor(deps?: Partial<CoreDependencies>) {
        this.legend = buildLegend();
        this.errorHandler = deps?.errorHandler ?? new ErrorHandler();
    }

    public getLegend(): vscode.SemanticTokensLegend {
        return this.legend;
    }

    public provideDocumentSemanticTokens(
        document: vscode.TextDocument,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.SemanticTokens> {
        try {
            if (token.isCancellationRequested) {
                return new vscode.SemanticTokens(new Uint32Array(0));
            }

            const ast = this.errorHandler.wrapSync(() => {
                return ThriftParser.parseWithCacheByVersion(
                    document.uri.fsPath,
                    document.getText(),
                    document.version
                );
            }, {
                component: 'ThriftSemanticTokensProvider',
                operation: 'parseAst',
                filePath: document.uri.fsPath
            }, null);

            if (!ast) {
                return new vscode.SemanticTokens(new Uint32Array(0));
            }

            const raw = buildSemanticTokensFromAst(ast);
            const builder = new vscode.SemanticTokensBuilder(this.legend);

            for (const t of raw) {
                if (token.isCancellationRequested) {
                    break;
                }
                builder.push(
                    new vscode.Range(t.line, t.startChar, t.line, t.startChar + t.length),
                    SEMANTIC_TOKEN_TYPES[t.tokenType],
                    expandModifiers(t.tokenModifiers)
                );
            }

            return builder.build();
        } catch (error) {
            this.errorHandler.handleError(error, {
                component: 'ThriftSemanticTokensProvider',
                operation: 'provideDocumentSemanticTokens',
                filePath: document.uri.fsPath
            });
            return new vscode.SemanticTokens(new Uint32Array(0));
        }
    }
}

function expandModifiers(mask: number): string[] {
    const out: string[] = [];
    for (let i = 0; i < SEMANTIC_TOKEN_MODIFIERS.length; i++) {
        if ((mask & (1 << i)) !== 0) {
            out.push(SEMANTIC_TOKEN_MODIFIERS[i]);
        }
    }
    return out;
}

/**
 * Register the semantic tokens provider with VS Code.
 */
export function registerSemanticTokensProvider(
    context: vscode.ExtensionContext,
    deps?: Partial<CoreDependencies>
): ThriftSemanticTokensProvider {
    const provider = new ThriftSemanticTokensProvider(deps);
    context.subscriptions.push(
        vscode.languages.registerDocumentSemanticTokensProvider(
            {language: 'thrift'},
            provider,
            provider.getLegend()
        )
    );
    return provider;
}
