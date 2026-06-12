import {Range} from '../types';
import * as nodes from './nodes.types';
import {findTypeRangeInLine} from './parser-helpers';
import {findFirstIdentifier, findIdentifierIndex, findLastIdentifier, findSymbolIndex, readQualifiedIdentifier} from './token-utils';
import {Token} from './tokenizer';

export interface ConstHeader {
    typeText: string;
    name: string;
}

export interface ServiceHeader {
    extendsName?: string;
    extendsRange?: Range;
}

export function parseNamespaceDeclaration(
    parent: nodes.ThriftNode,
    line: string,
    lineNumber: number,
    tokens: Token[]
): nodes.Namespace | undefined {
    const scope = readQualifiedIdentifier(tokens, 1);
    const namespace = scope ? readQualifiedIdentifier(tokens, scope.endIndex) : null;
    if (!scope || !namespace) {
        return undefined;
    }
    return {
        type: nodes.ThriftNodeType.Namespace,
        range: createLineRange(line, lineNumber),
        nameRange: new Range(lineNumber, namespace.startOffset, lineNumber, namespace.endOffset),
        parent,
        scope: scope.value,
        namespace: namespace.value,
        name: namespace.value
    };
}

export function parseIncludeDeclaration(
    parent: nodes.ThriftNode,
    line: string,
    lineNumber: number,
    tokens: Token[],
    includeKind: 'include' | 'cpp_include' = 'include'
): nodes.Include | undefined {
    const pathToken = tokens[1];
    if (pathToken === undefined || pathToken.type !== 'string') {
        return undefined;
    }
    return {
        type: nodes.ThriftNodeType.Include,
        range: createLineRange(line, lineNumber),
        parent,
        path: pathToken.value,
        includeKind,
        name: pathToken.value
    };
}

export function parseTypedefDeclaration(
    parent: nodes.ThriftNode,
    line: string,
    lineNumber: number,
    tokens: Token[]
): nodes.Typedef | undefined {
    const nameToken = findLastIdentifier(tokens, tokens.length);
    if (nameToken === null || nameToken.index <= 0) {
        return undefined;
    }
    const keywordToken = tokens[0];
    const aliasType = line.slice(keywordToken.end, nameToken.start).trim();
    return {
        type: nodes.ThriftNodeType.Typedef,
        range: createLineRange(line, lineNumber),
        nameRange: new Range(lineNumber, nameToken.start, lineNumber, nameToken.end),
        parent,
        aliasType,
        aliasTypeRange: findTypeRangeInLine(line, lineNumber, aliasType, keywordToken.end),
        name: nameToken.value
    };
}

export function readConstDeclarationHeader(line: string, tokens: Token[]): ConstHeader | undefined {
    const equalsIndex = findSymbolIndex(tokens, '=');
    if (equalsIndex === -1) {
        return undefined;
    }
    const nameToken = findLastIdentifier(tokens, equalsIndex);
    if (nameToken === null) {
        return undefined;
    }
    const keywordToken = tokens[0];
    const typeText = line.slice(keywordToken.end, nameToken.start).trim();
    if (typeText.length === 0) {
        return undefined;
    }
    return {
        typeText,
        name: nameToken.value
    };
}

export function readServiceHeader(tokens: Token[], lineNumber: number): ServiceHeader {
    const nameToken = findFirstIdentifier(tokens, 1);
    if (nameToken === null) {
        return {};
    }
    const extendsIndex = findIdentifierIndex(tokens, 'extends', nameToken.index + 1);
    if (extendsIndex === -1) {
        return {};
    }
    const parentName = readQualifiedIdentifier(tokens, extendsIndex + 1);
    if (parentName === null) {
        return {};
    }
    return {
        extendsName: parentName.value,
        extendsRange: new Range(lineNumber, parentName.startOffset, lineNumber, parentName.endOffset)
    };
}

function createLineRange(line: string, lineNumber: number): Range {
    return new Range(lineNumber, 0, lineNumber, line.length);
}
