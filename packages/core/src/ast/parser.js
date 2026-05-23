"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ThriftParser = void 0;
const types_1 = require("../types");
const nodes = __importStar(require("./nodes.types"));
const config_1 = require("../config");
const cache_1 = require("./cache");
const line_range_1 = require("../utils/line-range");
const factory_1 = require("./factory");
const cache_expiry_1 = require("../utils/cache-expiry");
const parser_helpers_1 = require("./parser-helpers");
const token_utils_1 = require("./token-utils");
const tokenizer_1 = require("./tokenizer");
class ThriftParser {
    static astByUri = new Map();
    text;
    lines;
    currentLine = 0;
    tokenizer;
    constructor(content) {
        this.text = content;
        this.lines = this.text.split(/\r?\n/);
        this.tokenizer = new tokenizer_1.ThriftTokenizer();
    }
    static parseWithCacheByVersion(uri, content, version) {
        const ast = (0, cache_1.parseWithAstCache)(uri, content, () => {
            const parser = new ThriftParser(content);
            return parser.parse();
        }, version);
        ThriftParser.setCachedAstByUriUnsafe(uri, ast);
        return ast;
    }
    static parseContentWithCache(uri, content) {
        const ast = (0, cache_1.parseWithAstCache)(uri, content, () => {
            const parser = new ThriftParser(content);
            return parser.parse();
        });
        ThriftParser.setCachedAstByUriUnsafe(uri, ast);
        return ast;
    }
    static clearExpiredCache() {
        (0, cache_1.clearExpiredAstCache)();
        ThriftParser.clearExpiredAstByUriCache();
    }
    static clearDocumentCache(uri) {
        (0, cache_1.clearAstCacheForDocument)(uri);
        ThriftParser.astByUri.delete(uri);
    }
    parse() {
        const estimatedSize = Math.min(this.lines.length, 1000);
        const root = (0, factory_1.createDocument)({
            range: this.createRange(0, 0, this.lines.length > 0 ? this.lines.length - 1 : 0, this.lines.length > 0 ? this.lines[this.lines.length - 1].length : 0),
            body: new Array(estimatedSize)
        });
        this.currentLine = 0;
        let bodyIndex = 0;
        while (this.currentLine < this.lines.length) {
            const node = this.parseNextNode(root);
            if (node) {
                if (bodyIndex >= root.body.length) {
                    root.body.length = Math.min(root.body.length * 2, 100000);
                }
                root.body[bodyIndex++] = node;
                this.addChild(root, node);
            }
        }
        root.body.length = bodyIndex;
        return root;
    }
    parseSection(startLine, endLine, existingAst) {
        const ast = existingAst ?? (0, factory_1.createDocument)({
            range: this.createRange(0, 0, this.lines.length > 0 ? this.lines.length - 1 : 0, this.lines.length > 0 ? this.lines[this.lines.length - 1].length : 0),
            body: []
        });
        const originalCurrentLine = this.currentLine;
        const existingNodeMap = new Map();
        if (existingAst) {
            for (const node of existingAst.body) {
                const key = `${node.range.start.line}-${node.range.end.line}`;
                existingNodeMap.set(key, node);
            }
        }
        this.currentLine = startLine;
        while (this.currentLine <= endLine && this.currentLine < this.lines.length) {
            const line = this.lines[this.currentLine];
            if (line.trim()) {
                const node = this.parseNextNode(ast);
                if (node) {
                    const overlapKey = `${node.range.start.line}-${node.range.end.line}`;
                    const existingNode = existingNodeMap.get(overlapKey);
                    if (!existingNode) {
                        ast.body.push(node);
                        this.addChild(ast, node);
                    }
                    else {
                        const index = ast.body.findIndex(n => n.range.start.line === existingNode.range.start.line &&
                            n.range.end.line === existingNode.range.end.line);
                        if (index !== -1) {
                            ast.body[index] = node;
                        }
                        else {
                            ast.body.push(node);
                        }
                        this.addChild(ast, node);
                    }
                }
            }
            else {
                this.currentLine++;
            }
        }
        this.currentLine = originalCurrentLine;
        return ast;
    }
    ensureChildren(node) {
        return node.children ??= [];
    }
    addChild(parent, child) {
        const children = this.ensureChildren(parent);
        if (!children.includes(child)) {
            children.push(child);
        }
    }
    scanLine(line) {
        const scan = this.tokenizer.scanLine(line);
        return {
            stripped: scan.stripped,
            tokens: (0, token_utils_1.filterMeaningfulTokens)(scan.tokens)
        };
    }
    countBraces(tokens) {
        let open = 0;
        let close = 0;
        for (const token of tokens) {
            if (token.type !== 'symbol') {
                continue;
            }
            if (token.value === '{') {
                open++;
            }
            else if (token.value === '}') {
                close++;
            }
        }
        return { open, close };
    }
    parseNextNode(parent) {
        if (this.currentLine >= this.lines.length) {
            return null;
        }
        const line = this.lines[this.currentLine];
        const scan = this.scanLine(line);
        const trimmed = scan.stripped.trim();
        if (!trimmed) {
            this.currentLine++;
            return null;
        }
        const tokens = scan.tokens;
        if (tokens.length === 0) {
            this.currentLine++;
            return null;
        }
        const keywordToken = tokens[0];
        if (keywordToken.type !== 'identifier') {
            this.currentLine++;
            return null;
        }
        if (keywordToken.value === 'namespace') {
            const scope = (0, token_utils_1.readQualifiedIdentifier)(tokens, 1);
            const namespace = scope ? (0, token_utils_1.readQualifiedIdentifier)(tokens, scope.endIndex) : null;
            if (scope && namespace) {
                const node = {
                    type: nodes.ThriftNodeType.Namespace,
                    range: this.createRange(this.currentLine, 0, this.currentLine, line.length),
                    nameRange: this.createRange(this.currentLine, namespace.startOffset, this.currentLine, namespace.endOffset),
                    parent: parent,
                    scope: scope.value,
                    namespace: namespace.value,
                    name: namespace.value
                };
                this.currentLine++;
                return node;
            }
            const invalid = this.createInvalidNode(parent, line, 'Invalid namespace declaration');
            this.currentLine++;
            return invalid;
        }
        if (keywordToken.value === 'include') {
            const pathToken = tokens[1];
            if (pathToken !== undefined && pathToken.type === 'string') {
                const node = {
                    type: nodes.ThriftNodeType.Include,
                    range: this.createRange(this.currentLine, 0, this.currentLine, line.length),
                    parent: parent,
                    path: pathToken.value,
                    name: pathToken.value
                };
                this.currentLine++;
                return node;
            }
            const invalid = this.createInvalidNode(parent, line, 'Invalid include declaration');
            this.currentLine++;
            return invalid;
        }
        if (keywordToken.value === 'struct' || keywordToken.value === 'union' || keywordToken.value === 'exception') {
            const nameToken = (0, token_utils_1.findFirstIdentifier)(tokens, 1);
            if (nameToken) {
                return this.parseStruct(parent, keywordToken.value, nameToken.value);
            }
            const invalid = this.createInvalidNode(parent, line, `Invalid ${keywordToken.value} declaration`);
            this.currentLine++;
            return invalid;
        }
        if (keywordToken.value === 'enum' || keywordToken.value === 'senum') {
            const nameToken = (0, token_utils_1.findFirstIdentifier)(tokens, 1);
            if (nameToken) {
                return this.parseEnum(parent, nameToken.value, keywordToken.value === 'senum');
            }
            const invalid = this.createInvalidNode(parent, line, `Invalid ${keywordToken.value} declaration`);
            this.currentLine++;
            return invalid;
        }
        if (keywordToken.value === 'service') {
            const nameToken = (0, token_utils_1.findFirstIdentifier)(tokens, 1);
            if (nameToken) {
                let extendsName;
                const extendsIndex = (0, token_utils_1.findIdentifierIndex)(tokens, 'extends', nameToken.index + 1);
                if (extendsIndex !== -1) {
                    const parentName = (0, token_utils_1.readQualifiedIdentifier)(tokens, extendsIndex + 1);
                    if (parentName) {
                        extendsName = parentName.value;
                    }
                }
                return this.parseService(parent, nameToken.value, extendsName);
            }
            const invalid = this.createInvalidNode(parent, line, 'Invalid service declaration');
            this.currentLine++;
            return invalid;
        }
        if (keywordToken.value === 'interaction') {
            const nameToken = (0, token_utils_1.findFirstIdentifier)(tokens, 1);
            if (nameToken) {
                return this.parseInteraction(parent, nameToken.value);
            }
            const invalid = this.createInvalidNode(parent, line, 'Invalid interaction declaration');
            this.currentLine++;
            return invalid;
        }
        if (keywordToken.value === 'const') {
            const equalsIndex = (0, token_utils_1.findSymbolIndex)(tokens, '=');
            if (equalsIndex !== -1) {
                const nameToken = (0, token_utils_1.findLastIdentifier)(tokens, equalsIndex);
                if (nameToken) {
                    const typeText = line.slice(keywordToken.end, nameToken.start).trim();
                    if (typeText) {
                        return this.parseConst(parent, typeText, nameToken.value);
                    }
                }
            }
            const invalid = this.createInvalidNode(parent, line, 'Invalid const declaration');
            this.currentLine++;
            return invalid;
        }
        if (keywordToken.value === 'typedef') {
            const nameToken = (0, token_utils_1.findLastIdentifier)(tokens, tokens.length);
            if (nameToken && nameToken.index > 0) {
                const keywordIndex = keywordToken.end;
                const aliasType = line.slice(keywordIndex, nameToken.start).trim();
                const node = {
                    type: nodes.ThriftNodeType.Typedef,
                    range: this.createRange(this.currentLine, 0, this.currentLine, line.length),
                    nameRange: this.createRange(this.currentLine, nameToken.start, this.currentLine, nameToken.end),
                    parent: parent,
                    aliasType: aliasType,
                    aliasTypeRange: (0, parser_helpers_1.findTypeRangeInLine)(line, this.currentLine, aliasType, keywordIndex),
                    name: nameToken.value
                };
                this.currentLine++;
                return node;
            }
            const invalid = this.createInvalidNode(parent, line, 'Invalid typedef declaration');
            this.currentLine++;
            return invalid;
        }
        this.currentLine++;
        return null;
    }
    createInvalidNode(parent, line, message) {
        return {
            type: nodes.ThriftNodeType.Invalid,
            range: this.createRange(this.currentLine, 0, this.currentLine, line.length),
            parent: parent,
            raw: line,
            message
        };
    }
    parseStruct(parent, structType, name) {
        const startLine = this.currentLine;
        const type = structType === 'exception' ? nodes.ThriftNodeType.Exception :
            structType === 'union' ? nodes.ThriftNodeType.Union : nodes.ThriftNodeType.Struct;
        const line = this.lines[startLine];
        const keywordIndex = line.indexOf(structType);
        const searchStart = keywordIndex >= 0 ? keywordIndex + structType.length : 0;
        const structNode = (0, factory_1.createStructBlock)({
            type,
            name,
            nameRange: (0, parser_helpers_1.findWordRangeInLine)(line, startLine, name, searchStart),
            parent
        });
        this.currentLine = this.parseStructBody(structNode);
        structNode.range = this.createRange(startLine, 0, this.currentLine, (this.lines[this.currentLine] ?? '').length);
        return structNode;
    }
    parseStructBody(parent) {
        let braceCount = 0;
        while (this.currentLine < this.lines.length) {
            const line = this.lines[this.currentLine];
            const scan = this.scanLine(line);
            const braceStats = this.countBraces(scan.tokens);
            if (braceStats.open > 0) {
                braceCount += braceStats.open - braceStats.close;
                break;
            }
            this.currentLine++;
        }
        this.currentLine++;
        if (braceCount <= 0) {
            return this.currentLine;
        }
        while (this.currentLine < this.lines.length && braceCount > 0) {
            const line = this.lines[this.currentLine];
            const scan = this.scanLine(line);
            const braceStats = this.countBraces(scan.tokens);
            if (braceStats.open > 0 || braceStats.close > 0) {
                braceCount += braceStats.open - braceStats.close;
                if (braceCount <= 0) {
                    this.currentLine++;
                    break;
                }
            }
            const field = this.parseStructFieldLine(parent, line, scan.stripped, scan.tokens);
            if (field) {
                parent.fields.push(field);
                this.addChild(parent, field);
            }
            this.currentLine++;
        }
        return this.currentLine;
    }
    parseStructFieldLine(parent, line, cleanLine, tokens) {
        const trimmed = cleanLine.trim();
        if (!trimmed) {
            return null;
        }
        if (tokens.length === 0) {
            return null;
        }
        const idIndex = tokens.findIndex(token => token.type === 'number');
        if (idIndex === -1) {
            return this.parseStructFieldLineFallback(parent, line, cleanLine);
        }
        const colonIndex = (0, token_utils_1.findSymbolIndexFrom)(tokens, ':', idIndex + 1);
        if (colonIndex === -1) {
            return this.parseStructFieldLineFallback(parent, line, cleanLine);
        }
        let cursor = colonIndex + 1;
        let requiredness;
        if (tokens[cursor]?.type === 'identifier' &&
            (tokens[cursor].value === 'required' || tokens[cursor].value === 'optional')) {
            requiredness = tokens[cursor].value;
            cursor += 1;
        }
        const typeStartToken = tokens[cursor];
        if (typeStartToken === undefined) {
            return this.parseStructFieldLineFallback(parent, line, cleanLine);
        }
        let nameTokenIndex = -1;
        let angleDepth = 0;
        for (let i = cursor; i < tokens.length; i++) {
            const token = tokens[i];
            if (token.type === 'symbol') {
                if (token.value === '<') {
                    angleDepth += 1;
                }
                else if (token.value === '>') {
                    angleDepth = Math.max(0, angleDepth - 1);
                }
                if (angleDepth === 0 && (token.value === '(' || token.value === '=' || token.value === ',' || token.value === ';')) {
                    break;
                }
                continue;
            }
            if (token.type === 'identifier') {
                nameTokenIndex = i;
            }
        }
        if (nameTokenIndex === -1) {
            return this.parseStructFieldLineFallback(parent, line, cleanLine);
        }
        const nameToken = tokens[nameTokenIndex];
        const fieldType = cleanLine.slice(typeStartToken.start, nameToken.start).trim();
        if (!fieldType) {
            return this.parseStructFieldLineFallback(parent, line, cleanLine);
        }
        const valueTarget = (0, parser_helpers_1.stripTrailingAnnotation)(cleanLine.replace(/[,;]\s*$/, ''));
        const nameRange = this.createRange(this.currentLine, nameToken.start, this.currentLine, nameToken.end);
        const typeRange = this.createRange(this.currentLine, typeStartToken.start, this.currentLine, nameToken.start);
        const defaultInfo = (0, parser_helpers_1.findDefaultValueRange)(valueTarget);
        const defaultStart = defaultInfo ? defaultInfo.start : null;
        const defaultEnd = defaultInfo ? defaultInfo.end : null;
        return (0, factory_1.createField)({
            range: this.createRange(this.currentLine, 0, this.currentLine, line.length),
            nameRange,
            typeRange,
            parent,
            id: parseInt(tokens[idIndex].value, 10),
            requiredness,
            fieldType,
            name: nameToken.value,
            defaultValue: defaultInfo?.value,
            defaultValueRange: defaultStart !== null && defaultEnd !== null
                ? this.createRange(this.currentLine, defaultStart, this.currentLine, defaultEnd)
                : undefined
        });
    }
    parseStructFieldLineFallback(parent, line, cleanLine) {
        const trimmed = cleanLine.trim();
        const codeStart = cleanLine.indexOf(trimmed);
        const fieldMatch = trimmed.match(/^(\d+):\s*(?:(required|optional)\s+)?([a-zA-Z0-9_<>.,]+)\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
        if (!fieldMatch) {
            return null;
        }
        const valueTarget = (0, parser_helpers_1.stripTrailingAnnotation)(cleanLine.replace(/[,;]\s*$/, ''));
        const nameRange = (0, parser_helpers_1.findNameRangeInLine)(cleanLine, this.currentLine, fieldMatch[4], trimmed);
        const typeRange = (0, parser_helpers_1.findTypeRangeInLine)(cleanLine, this.currentLine, fieldMatch[3].trim(), codeStart);
        const defaultInfo = (0, parser_helpers_1.findDefaultValueRange)(valueTarget);
        const defaultStart = defaultInfo ? defaultInfo.start : null;
        const defaultEnd = defaultInfo ? defaultInfo.end : null;
        return (0, factory_1.createField)({
            range: this.createRange(this.currentLine, 0, this.currentLine, line.length),
            nameRange,
            typeRange,
            parent,
            id: parseInt(fieldMatch[1], 10),
            requiredness: fieldMatch[2],
            fieldType: fieldMatch[3].trim(),
            name: fieldMatch[4],
            defaultValue: defaultInfo?.value,
            defaultValueRange: defaultStart !== null && defaultEnd !== null
                ? this.createRange(this.currentLine, defaultStart, this.currentLine, defaultEnd)
                : undefined
        });
    }
    parseEnum(parent, name, isSenum) {
        const startLine = this.currentLine;
        const line = this.lines[startLine];
        const keywordIndex = line.indexOf(isSenum ? 'senum' : 'enum');
        const searchStart = keywordIndex >= 0 ? keywordIndex + (isSenum ? 'senum'.length : 'enum'.length) : 0;
        const enumNode = (0, factory_1.createEnumBlock)({
            name,
            nameRange: (0, parser_helpers_1.findWordRangeInLine)(line, startLine, name, searchStart),
            parent,
            isSenum
        });
        this.currentLine = this.parseEnumBody(enumNode);
        enumNode.range = this.createRange(startLine, 0, this.currentLine, (this.lines[this.currentLine] ?? '').length);
        return enumNode;
    }
    parseEnumBody(parent) {
        let braceCount = 0;
        while (this.currentLine < this.lines.length) {
            const line = this.lines[this.currentLine];
            const scan = this.scanLine(line);
            if (scan.stripped.includes('{')) {
                braceCount++;
                break;
            }
            this.currentLine++;
        }
        this.currentLine++;
        while (this.currentLine < this.lines.length && braceCount > 0) {
            const line = this.lines[this.currentLine];
            const scan = this.scanLine(line);
            const trimmed = scan.stripped.trim();
            if (trimmed.includes('{')) {
                braceCount++;
            }
            if (trimmed.includes('}')) {
                braceCount--;
                if (braceCount <= 0) {
                    this.currentLine++;
                    break;
                }
            }
            const member = this.parseEnumMemberLine(parent, line, scan.stripped, scan.tokens);
            if (member) {
                parent.members.push(member);
                this.addChild(parent, member);
            }
            this.currentLine++;
        }
        return this.currentLine;
    }
    parseEnumMemberLine(parent, line, cleanLine, tokens) {
        const trimmed = cleanLine.trim();
        if (!trimmed) {
            return null;
        }
        if (tokens.length === 0) {
            return null;
        }
        const nameToken = tokens.find(token => token.type === 'identifier');
        if (!nameToken) {
            return null;
        }
        const equalsIndex = (0, token_utils_1.findSymbolIndex)(tokens, '=');
        let initializer;
        let initializerRange;
        if (equalsIndex !== -1) {
            let startOffset = null;
            let endOffset = null;
            let angleDepth = 0;
            let bracketDepth = 0;
            let braceDepth = 0;
            let parenDepth = 0;
            for (let i = equalsIndex + 1; i < tokens.length; i++) {
                const token = tokens[i];
                if (token.type === 'symbol') {
                    if (token.value === '<') {
                        angleDepth += 1;
                    }
                    else if (token.value === '>') {
                        angleDepth = Math.max(0, angleDepth - 1);
                    }
                    else if (token.value === '[') {
                        bracketDepth += 1;
                    }
                    else if (token.value === ']') {
                        bracketDepth = Math.max(0, bracketDepth - 1);
                    }
                    else if (token.value === '{') {
                        braceDepth += 1;
                    }
                    else if (token.value === '}') {
                        braceDepth = Math.max(0, braceDepth - 1);
                    }
                    else if (token.value === '(') {
                        parenDepth += 1;
                    }
                    else if (token.value === ')') {
                        parenDepth = Math.max(0, parenDepth - 1);
                    }
                    if (angleDepth === 0 && bracketDepth === 0 && braceDepth === 0 && parenDepth === 0 &&
                        (token.value === ',' || token.value === ';' || token.value === '(')) {
                        break;
                    }
                }
                startOffset ??= token.start;
                endOffset = token.end;
            }
            if (startOffset !== null && endOffset !== null) {
                const rawInitializer = cleanLine.slice(startOffset, endOffset).trim();
                const trimmed = (0, parser_helpers_1.stripTrailingAnnotation)(rawInitializer.replace(/[,;]\s*$/, '')).trim();
                initializer = trimmed || undefined;
                if (initializer !== undefined && initializer !== '') {
                    initializerRange = this.createRange(this.currentLine, startOffset, this.currentLine, endOffset);
                }
            }
        }
        initializerRange ??= (0, parser_helpers_1.findInitializerRange)(cleanLine, cleanLine, initializer, this.currentLine);
        const nameRange = this.createRange(this.currentLine, nameToken.start, this.currentLine, nameToken.end);
        return {
            type: nodes.ThriftNodeType.EnumMember,
            range: this.createRange(this.currentLine, 0, this.currentLine, line.length),
            nameRange,
            parent: parent,
            name: nameToken.value,
            initializer,
            initializerRange
        };
    }
    parseService(parent, name, extendsClass) {
        const startLine = this.currentLine;
        const line = this.lines[startLine];
        const keywordIndex = line.indexOf('service');
        const searchStart = keywordIndex >= 0 ? keywordIndex + 'service'.length : 0;
        const serviceNode = (0, factory_1.createServiceBlock)({
            name,
            nameRange: (0, parser_helpers_1.findWordRangeInLine)(line, startLine, name, searchStart),
            parent,
            extends: extendsClass
        });
        this.currentLine = this.parseServiceBody(serviceNode);
        serviceNode.range = this.createRange(startLine, 0, this.currentLine, (this.lines[this.currentLine] ?? '').length);
        return serviceNode;
    }
    parseInteraction(parent, name) {
        const startLine = this.currentLine;
        const line = this.lines[startLine];
        const keywordIndex = line.indexOf('interaction');
        const searchStart = keywordIndex >= 0 ? keywordIndex + 'interaction'.length : 0;
        const interactionNode = (0, factory_1.createInteractionBlock)({
            name,
            nameRange: (0, parser_helpers_1.findWordRangeInLine)(line, startLine, name, searchStart),
            parent
        });
        this.currentLine = this.parseInteractionBody(interactionNode);
        interactionNode.range = this.createRange(startLine, 0, this.currentLine, (this.lines[this.currentLine] ?? '').length);
        return interactionNode;
    }
    parseInteractionBody(parent) {
        let braceCount = 0;
        while (this.currentLine < this.lines.length) {
            const line = this.lines[this.currentLine];
            const scan = this.scanLine(line);
            const braceStats = this.countBraces(scan.tokens);
            if (braceStats.open > 0) {
                braceCount += braceStats.open - braceStats.close;
                break;
            }
            this.currentLine++;
        }
        this.currentLine++;
        if (braceCount <= 0) {
            return this.currentLine;
        }
        while (this.currentLine < this.lines.length && braceCount > 0) {
            const line = this.lines[this.currentLine];
            const scan = this.scanLine(line);
            const braceStats = this.countBraces(scan.tokens);
            if (braceStats.open > 0 || braceStats.close > 0) {
                braceCount += braceStats.open - braceStats.close;
                if (braceCount <= 0) {
                    this.currentLine++;
                    break;
                }
            }
            const funcParsed = this.parseServiceFunctionLine(line, scan.stripped, scan.tokens);
            if (funcParsed) {
                const funcNode = this.buildFunctionNode(parent, funcParsed, line);
                if (funcNode) {
                    parent.functions.push(funcNode);
                    this.addChild(parent, funcNode);
                }
            }
            this.currentLine++;
        }
        return this.currentLine;
    }
    parseServiceBody(parent) {
        let braceCount = 0;
        while (this.currentLine < this.lines.length) {
            const line = this.lines[this.currentLine];
            const scan = this.scanLine(line);
            const braceStats = this.countBraces(scan.tokens);
            if (braceStats.open > 0) {
                braceCount += braceStats.open - braceStats.close;
                break;
            }
            this.currentLine++;
        }
        this.currentLine++;
        if (braceCount <= 0) {
            return this.currentLine;
        }
        while (this.currentLine < this.lines.length && braceCount > 0) {
            const line = this.lines[this.currentLine];
            const scan = this.scanLine(line);
            const braceStats = this.countBraces(scan.tokens);
            if (braceStats.open > 0 || braceStats.close > 0) {
                braceCount += braceStats.open - braceStats.close;
                if (braceCount <= 0) {
                    this.currentLine++;
                    break;
                }
            }
            const funcParsed = this.parseServiceFunctionLine(line, scan.stripped, scan.tokens);
            if (funcParsed) {
                const funcNode = this.buildFunctionNode(parent, funcParsed, line);
                if (funcNode) {
                    parent.functions.push(funcNode);
                    this.addChild(parent, funcNode);
                }
            }
            else {
                const perfNode = this.parsePerforms(parent, line, scan.stripped, scan.tokens);
                if (perfNode) {
                    (parent.performs ??= []).push(perfNode);
                    this.addChild(parent, perfNode);
                }
            }
            this.currentLine++;
        }
        return this.currentLine;
    }
    buildFunctionNode(parent, funcParsed, line) {
        const { name, returnType, nameRange, returnTypeRange, oneway, isStream, isSink, funcStartLine, funcStartChar } = funcParsed;
        let funcEndLine = funcParsed.funcEndLine;
        let funcEndChar = funcParsed.funcEndChar;
        const args = [];
        const throwsFields = [];
        const parenStartPos = line.indexOf('(');
        let argResult = null;
        if (parenStartPos !== -1) {
            argResult = (0, parser_helpers_1.readParenthesizedText)(this.lines, this.currentLine, parenStartPos + 1);
            if (argResult) {
                args.push(...(0, parser_helpers_1.parseFieldList)(argResult.text, this.currentLine, parenStartPos + 1));
            }
        }
        let parenCount = 0;
        let foundEnd = false;
        if (argResult) {
            funcEndLine = argResult.endLine;
            funcEndChar = this.lines[argResult.endLine] ? this.lines[argResult.endLine].length : 0;
        }
        for (let i = funcStartChar; i < line.length; i++) {
            const char = line[i];
            if (char === '(') {
                parenCount++;
            }
            else if (char === ')') {
                parenCount--;
                if (parenCount === 0) {
                    let j = i + 1;
                    while (j < line.length && /\s/.test(line[j])) {
                        j++;
                    }
                    if (line.substring(j, j + 6) === 'throws') {
                        let throwsParenCount = 0;
                        for (let k = j + 6; k < line.length; k++) {
                            if (line[k] === '(') {
                                throwsParenCount++;
                            }
                            else if (line[k] === ')') {
                                throwsParenCount--;
                                if (throwsParenCount === 0) {
                                    j = k + 1;
                                    break;
                                }
                            }
                        }
                    }
                    while (j < line.length && /\s/.test(line[j])) {
                        j++;
                    }
                    if (j < line.length && (line[j] === ',' || line[j] === ';' || line[j] === '{')) {
                        funcEndChar = j + 1;
                        foundEnd = true;
                        break;
                    }
                }
            }
        }
        if (!foundEnd) {
            let searchLine = funcStartLine + 1;
            while (searchLine < this.lines.length && !foundEnd) {
                const searchLineText = this.lines[searchLine];
                for (let i = 0; i < searchLineText.length; i++) {
                    const char = searchLineText[i];
                    if (char === '(') {
                        parenCount++;
                    }
                    else if (char === ')') {
                        parenCount--;
                        if (parenCount === 0) {
                            let j = i + 1;
                            while (j < searchLineText.length && /\s/.test(searchLineText[j])) {
                                j++;
                            }
                            if (searchLineText.substring(j, j + 6) === 'throws') {
                                let throwsParenCount = 0;
                                for (let k = j + 6; k < searchLineText.length; k++) {
                                    if (searchLineText[k] === '(') {
                                        throwsParenCount++;
                                    }
                                    else if (searchLineText[k] === ')') {
                                        throwsParenCount--;
                                        if (throwsParenCount === 0) {
                                            j = k + 1;
                                            break;
                                        }
                                    }
                                }
                            }
                            while (j < searchLineText.length && /\s/.test(searchLineText[j])) {
                                j++;
                            }
                            if (j < searchLineText.length && (searchLineText[j] === ',' || searchLineText[j] === ';' || searchLineText[j] === '{')) {
                                funcEndLine = searchLine;
                                funcEndChar = j + 1;
                                foundEnd = true;
                                break;
                            }
                        }
                    }
                }
                if (!foundEnd) {
                    searchLine++;
                }
            }
        }
        const throwsStart = (0, parser_helpers_1.findThrowsStartInRange)(this.lines, argResult ? argResult.endLine : funcStartLine, argResult ? argResult.endChar + 1 : Math.max(parenStartPos + 1, funcStartChar), funcEndLine, funcEndChar);
        let throwsResult = null;
        if (throwsStart) {
            throwsResult = (0, parser_helpers_1.readParenthesizedText)(this.lines, throwsStart.line, throwsStart.char + 1);
            if (throwsResult) {
                throwsFields.push(...(0, parser_helpers_1.parseFieldList)(throwsResult.text, throwsStart.line, throwsStart.char + 1));
            }
        }
        if (throwsResult) {
            funcEndLine = Math.max(funcEndLine, throwsResult.endLine);
            funcEndChar = throwsResult.endChar;
        }
        else if (argResult) {
            funcEndLine = Math.max(funcEndLine, argResult.endLine);
            funcEndChar = argResult.endChar;
        }
        const funcNode = {
            type: nodes.ThriftNodeType.Function,
            range: this.createRange(funcStartLine, funcStartChar, funcEndLine, funcEndChar),
            nameRange,
            parent: parent,
            name,
            returnType,
            returnTypeRange,
            oneway,
            isStream: isStream || undefined,
            isSink: isSink || undefined,
            arguments: args,
            throws: throwsFields
        };
        args.forEach(arg => {
            arg.parent = funcNode;
            this.addChild(funcNode, arg);
        });
        throwsFields.forEach(field => {
            field.parent = funcNode;
            this.addChild(funcNode, field);
        });
        return funcNode;
    }
    parsePerforms(parent, line, cleanLine, tokens) {
        const trimmed = cleanLine.trim();
        if (!trimmed || tokens.length === 0) {
            return null;
        }
        if (tokens[0].type !== 'identifier' || tokens[0].value !== 'performs') {
            return null;
        }
        const nameToken = tokens[1];
        if (nameToken === undefined || nameToken.type !== 'identifier') {
            return null;
        }
        const nameRange = this.createRange(this.currentLine, nameToken.start, this.currentLine, nameToken.end);
        return {
            type: nodes.ThriftNodeType.Performs,
            range: this.createRange(this.currentLine, 0, this.currentLine, line.length),
            nameRange,
            parent: parent,
            name: nameToken.value,
            interactionName: nameToken.value,
            interactionNameRange: nameRange
        };
    }
    parseServiceFunctionLine(line, cleanLine, tokens) {
        const trimmed = cleanLine.trim();
        if (!trimmed) {
            return null;
        }
        if (tokens.length === 0) {
            return null;
        }
        const parenIndex = (0, token_utils_1.findSymbolIndex)(tokens, '(');
        if (parenIndex === -1) {
            return null;
        }
        let nameTokenIndex = -1;
        for (let i = parenIndex - 1; i >= 0; i--) {
            if (tokens[i].type === 'identifier') {
                nameTokenIndex = i;
                break;
            }
        }
        if (nameTokenIndex === -1) {
            return null;
        }
        const oneway = tokens[0].type === 'identifier' && tokens[0].value === 'oneway';
        let returnTypeStartIndex = oneway ? 1 : 0;
        let isStream = false;
        let isSink = false;
        if (returnTypeStartIndex < tokens.length && tokens[returnTypeStartIndex].type === 'identifier') {
            if (tokens[returnTypeStartIndex].value === 'stream') {
                isStream = true;
                returnTypeStartIndex += 1;
            }
            else if (tokens[returnTypeStartIndex].value === 'sink') {
                isSink = true;
                returnTypeStartIndex += 1;
            }
        }
        const returnTypeStartToken = tokens[returnTypeStartIndex];
        if (returnTypeStartToken === undefined || returnTypeStartIndex >= nameTokenIndex) {
            return null;
        }
        const nameToken = tokens[nameTokenIndex];
        const typeStart = isStream ? returnTypeStartIndex - 1 : (isSink ? returnTypeStartIndex - 1 : returnTypeStartIndex);
        const returnType = cleanLine.slice(tokens[typeStart].start, nameToken.start).trim();
        if (!returnType) {
            return this.parseServiceFunctionLineFallback(line, cleanLine);
        }
        const funcStartLine = this.currentLine;
        const funcStartChar = tokens[typeStart].start;
        const nameRange = this.createRange(funcStartLine, nameToken.start, funcStartLine, nameToken.end);
        const returnTypeRange = this.createRange(funcStartLine, tokens[typeStart].start, funcStartLine, nameToken.start);
        return {
            name: nameToken.value,
            returnType,
            nameRange,
            returnTypeRange,
            oneway,
            isStream,
            isSink,
            funcStartLine,
            funcStartChar,
            funcEndLine: funcStartLine,
            funcEndChar: line.length
        };
    }
    parseServiceFunctionLineFallback(line, cleanLine) {
        const trimmed = cleanLine.trim();
        const funcMatch = trimmed.match(/^(?:(oneway)\s+)?(?:(stream|sink)\s+)?([a-zA-Z0-9_<>.,]+)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/);
        if (!funcMatch) {
            return null;
        }
        const funcStartLine = this.currentLine;
        const funcStartChar = cleanLine.indexOf(funcMatch[0]);
        const returnTypeRaw = funcMatch[3].trim();
        const isStream = funcMatch[2] === 'stream';
        const isSink = funcMatch[2] === 'sink';
        const returnType = isStream ? `stream ${returnTypeRaw}` : (isSink ? `sink ${returnTypeRaw}` : returnTypeRaw);
        const nameRange = (0, parser_helpers_1.findWordRangeInLine)(cleanLine, funcStartLine, funcMatch[4], funcStartChar);
        const returnTypeRange = (0, parser_helpers_1.findTypeRangeInLine)(cleanLine, funcStartLine, returnType, funcStartChar);
        return {
            name: funcMatch[4],
            returnType,
            nameRange,
            returnTypeRange,
            oneway: !!funcMatch[1],
            isStream,
            isSink,
            funcStartLine,
            funcStartChar,
            funcEndLine: funcStartLine,
            funcEndChar: line.length
        };
    }
    parseConst(parent, valueType, name) {
        const startLine = this.currentLine;
        const line = this.lines[startLine];
        const keywordIndex = line.indexOf('const');
        const searchStart = keywordIndex >= 0 ? keywordIndex + 'const'.length : 0;
        let endLine = this.currentLine;
        let depthBrace = 0;
        let depthBracket = 0;
        let depthParen = 0;
        let seenEquals = false;
        let inS = false;
        let inD = false;
        let escaped = false;
        let eqLine = -1;
        let eqChar = -1;
        while (endLine < this.lines.length) {
            const line = this.lines[endLine];
            for (let i = 0; i < line.length; i++) {
                const ch = line[i];
                if (inS) {
                    if (!escaped && ch === '\\') {
                        escaped = true;
                        continue;
                    }
                    if (!escaped && ch === '\'') {
                        inS = false;
                    }
                    escaped = false;
                    continue;
                }
                if (inD) {
                    if (!escaped && ch === '\\') {
                        escaped = true;
                        continue;
                    }
                    if (!escaped && ch === '"') {
                        inD = false;
                    }
                    escaped = false;
                    continue;
                }
                if (ch === '\'') {
                    inS = true;
                    continue;
                }
                if (ch === '"') {
                    inD = true;
                    continue;
                }
                if (ch === '=' && !seenEquals) {
                    seenEquals = true;
                    if (eqLine === -1) {
                        eqLine = endLine;
                        eqChar = i;
                    }
                    continue;
                }
                if (!seenEquals) {
                    continue;
                }
                if (ch === '{') {
                    depthBrace++;
                }
                if (ch === '}') {
                    depthBrace = Math.max(0, depthBrace - 1);
                }
                if (ch === '[') {
                    depthBracket++;
                }
                if (ch === ']') {
                    depthBracket = Math.max(0, depthBracket - 1);
                }
                if (ch === '(') {
                    depthParen++;
                }
                if (ch === ')') {
                    depthParen = Math.max(0, depthParen - 1);
                }
            }
            if (seenEquals && depthBrace === 0 && depthBracket === 0 && depthParen === 0) {
                break;
            }
            endLine++;
        }
        const valueRangeInfo = (0, parser_helpers_1.buildConstValueRange)(this.lines, startLine, endLine, eqLine, eqChar);
        const constNode = {
            type: nodes.ThriftNodeType.Const,
            range: this.createRange(startLine, 0, endLine, (this.lines[endLine] ?? '').length),
            nameRange: (0, parser_helpers_1.findWordRangeInLine)(line, startLine, name, searchStart),
            parent: parent,
            valueType: valueType,
            valueTypeRange: (0, parser_helpers_1.findTypeRangeInLine)(line, startLine, valueType, searchStart),
            name: name,
            value: valueRangeInfo.value,
            valueRange: valueRangeInfo.range
        };
        this.currentLine = endLine + 1;
        return constNode;
    }
    parseRange(startLine, endLine) {
        const nodesInRange = [];
        const actualStartLine = Math.max(0, Math.min(startLine, this.lines.length - 1));
        const actualEndLine = Math.max(actualStartLine, Math.min(endLine, this.lines.length - 1));
        const originalCurrentLine = this.currentLine;
        this.currentLine = actualStartLine;
        while (this.currentLine <= actualEndLine && this.currentLine < this.lines.length) {
            const line = this.lines[this.currentLine];
            if (line.trim()) {
                const tempParent = (0, factory_1.createDocument)({
                    range: this.createRange(actualStartLine, 0, actualEndLine, (this.lines[actualEndLine] ?? '').length),
                    body: []
                });
                const node = this.parseNextNode(tempParent);
                if (node) {
                    nodesInRange.push(node);
                }
            }
            else {
                this.currentLine++;
            }
        }
        this.currentLine = originalCurrentLine;
        return nodesInRange;
    }
    analyzeAffectedRegion(startLine, endLine) {
        let affectedStart = startLine;
        let affectedEnd = endLine;
        for (let line = startLine; line >= 0 && line > startLine - 50; line--) {
            const text = this.lines[line];
            if (text && (text.trim().match(/\b(struct|service|interaction|enum|union|exception)\s+\w+/) ||
                text.trim().includes('{'))) {
                affectedStart = line;
                let braceDepth = 0;
                for (let searchLine = line; searchLine < this.lines.length && searchLine < line + 100; searchLine++) {
                    const searchText = this.lines[searchLine];
                    const openBraces = (searchText.match(/{/g) ?? []).length;
                    const closeBraces = (searchText.match(/}/g) ?? []).length;
                    braceDepth += openBraces - closeBraces;
                    if (braceDepth <= 0) {
                        affectedEnd = Math.max(affectedEnd, searchLine);
                        break;
                    }
                }
                break;
            }
        }
        for (let line = endLine; line < this.lines.length && line < endLine + 20; line++) {
            const text = this.lines[line];
            if (text && (text.includes('}') || text.trim().endsWith(';') || text.trim().endsWith(','))) {
                affectedEnd = line;
                break;
            }
        }
        return { start: affectedStart, end: affectedEnd };
    }
    analyzeDependencies(ast) {
        const dependencies = new Map();
        for (const node of ast.body) {
            const nodeDeps = [];
            if (node.type === nodes.ThriftNodeType.Service) {
                const service = node;
                for (const func of service.functions) {
                    this.addTypeDependency(ast, func.returnType, nodeDeps);
                    for (const arg of func.arguments) {
                        this.addTypeDependency(ast, arg.fieldType, nodeDeps);
                    }
                    for (const thr of func.throws) {
                        this.addTypeDependency(ast, thr.fieldType, nodeDeps);
                    }
                }
            }
            else if (node.type === nodes.ThriftNodeType.Struct ||
                node.type === nodes.ThriftNodeType.Exception ||
                node.type === nodes.ThriftNodeType.Union) {
                const structLike = node;
                for (const field of structLike.fields) {
                    this.addTypeDependency(ast, field.fieldType, nodeDeps);
                }
            }
            else if (node.type === nodes.ThriftNodeType.Const) {
                const constNode = node;
                this.addTypeDependency(ast, constNode.valueType, nodeDeps);
            }
            if (nodeDeps.length > 0) {
                dependencies.set(node, nodeDeps);
            }
        }
        return dependencies;
    }
    addTypeDependency(ast, typeStr, deps) {
        if (typeStr === undefined || typeStr === '') {
            return;
        }
        const typeMatches = typeStr.match(/[a-zA-Z_][a-zA-Z0-9_]*/g) ?? [];
        for (const typeName of typeMatches) {
            for (const potentialDep of ast.body) {
                if (potentialDep.name === typeName &&
                    (potentialDep.type === nodes.ThriftNodeType.Struct ||
                        potentialDep.type === nodes.ThriftNodeType.Enum ||
                        potentialDep.type === nodes.ThriftNodeType.Typedef ||
                        potentialDep.type === nodes.ThriftNodeType.Service)) {
                    if (!deps.includes(potentialDep)) {
                        deps.push(potentialDep);
                    }
                }
            }
        }
    }
    saveParseContext() {
        return {
            currentLine: this.currentLine,
            lines: this.lines,
            token: this.tokenizer
        };
    }
    restoreParseContext(context) {
        this.currentLine = context.currentLine;
        this.lines = context.lines;
        this.tokenizer = context.token;
    }
    static incrementalParseWithCache(uri, content, dirtyRange) {
        let fullAst = ThriftParser.getCachedAstByUriUnsafe(uri);
        if (!fullAst) {
            fullAst = (0, cache_1.parseWithAstCache)(uri, content, () => {
                const parser = new ThriftParser(content);
                return parser.parse();
            });
            ThriftParser.setCachedAstByUriUnsafe(uri, fullAst);
        }
        const parser = new ThriftParser(content);
        const affectedRange = parser.analyzeAffectedRegion(dirtyRange.startLine, dirtyRange.endLine);
        const rangeContent = parser.extractRangeContent(affectedRange.start, affectedRange.end);
        let newNodes = (0, cache_1.getCachedAstRange)(uri, (0, line_range_1.createLineRange)(affectedRange.start, affectedRange.end), rangeContent);
        const affectedNodes = [];
        newNodes ??= parser.parseRange(affectedRange.start, affectedRange.end);
        for (const node of fullAst.body) {
            if (node.range.start.line <= affectedRange.end && node.range.end.line >= affectedRange.start) {
                affectedNodes.push(node);
            }
        }
        const incrementalResult = {
            ast: fullAst,
            affectedNodes: affectedNodes,
            newNodes: newNodes
        };
        const mergedAst = parser.mergeIncrementalResults(fullAst, incrementalResult);
        (0, cache_1.setCachedAstRange)(uri, (0, line_range_1.createLineRange)(affectedRange.start, affectedRange.end), rangeContent, newNodes);
        (0, cache_1.setCachedAst)(uri, content, mergedAst);
        ThriftParser.setCachedAstByUriUnsafe(uri, mergedAst);
        return {
            ...incrementalResult,
            ast: mergedAst
        };
    }
    extractRangeContent(startLine, endLine) {
        return this.lines.slice(startLine, endLine + 1).join('\n');
    }
    mergeIncrementalResults(fullAst, incrementalResult) {
        if (incrementalResult.newNodes.length === 0) {
            return fullAst;
        }
        const updatedAst = {
            ...fullAst,
            body: [...fullAst.body]
        };
        if (incrementalResult.affectedNodes.length > 0) {
            updatedAst.body = updatedAst.body.filter(node => !incrementalResult.affectedNodes.some(affectedNode => this.rangesOverlap(affectedNode.range, node.range)));
        }
        for (const newNode of incrementalResult.newNodes) {
            this.reparentNode(updatedAst, newNode);
            let inserted = false;
            for (let i = 0; i < updatedAst.body.length; i++) {
                if (updatedAst.body[i].range.start.line > newNode.range.start.line) {
                    updatedAst.body.splice(i, 0, newNode);
                    inserted = true;
                    break;
                }
            }
            if (!inserted) {
                updatedAst.body.push(newNode);
            }
        }
        updatedAst.body.sort((a, b) => a.range.start.line - b.range.start.line);
        return updatedAst;
    }
    rangesOverlap(a, b) {
        return a.start.line <= b.end.line && a.end.line >= b.start.line;
    }
    static getCachedAstByUriUnsafe(uri) {
        const cached = ThriftParser.astByUri.get(uri);
        if (cached && (0, cache_expiry_1.isFresh)(cached.timestamp, config_1.config.cache.astMaxAgeMs)) {
            return cached.ast;
        }
        return null;
    }
    static setCachedAstByUriUnsafe(uri, ast) {
        ThriftParser.astByUri.set(uri, { ast, timestamp: Date.now() });
    }
    static clearExpiredAstByUriCache() {
        const now = Date.now();
        for (const [uri, entry] of Array.from(ThriftParser.astByUri.entries())) {
            if ((0, cache_expiry_1.isExpired)(entry.timestamp, config_1.config.cache.astMaxAgeMs, now)) {
                ThriftParser.astByUri.delete(uri);
            }
        }
    }
    reparentNode(parent, node) {
        node.parent = parent;
        const children = this.getChildNodes(node);
        children.forEach(child => this.reparentNode(node, child));
    }
    getChildNodes(node) {
        const result = new Set();
        if (node.children) {
            node.children.forEach(child => result.add(child));
        }
        if (node.type === nodes.ThriftNodeType.Document) {
            (node.body ?? []).forEach(child => result.add(child));
        }
        else if (node.type === nodes.ThriftNodeType.Enum) {
            (node.members ?? []).forEach(child => result.add(child));
        }
        else if (node.type === nodes.ThriftNodeType.Struct ||
            node.type === nodes.ThriftNodeType.Union ||
            node.type === nodes.ThriftNodeType.Exception) {
            (node.fields ?? []).forEach(child => result.add(child));
        }
        else if (node.type === nodes.ThriftNodeType.Service) {
            (node.functions ?? []).forEach(child => result.add(child));
            (node.performs ?? []).forEach(child => result.add(child));
        }
        else if (node.type === nodes.ThriftNodeType.Interaction) {
            (node.functions ?? []).forEach(child => result.add(child));
        }
        else if (node.type === nodes.ThriftNodeType.Function) {
            (node.arguments ?? []).forEach(child => result.add(child));
            (node.throws ?? []).forEach(child => result.add(child));
        }
        return Array.from(result);
    }
    createRange(startLine, startChar, endLine, endChar) {
        return new types_1.Range(startLine, startChar, endLine, endChar);
    }
}
exports.ThriftParser = ThriftParser;
//# sourceMappingURL=parser.js.map