import * as vscode from 'vscode';
import * as path from 'path';
import { PerformanceMonitor, performanceMonitor } from './performance-monitor';
import { ThriftParser } from './ast/parser';
import * as nodes from './ast/nodes.types';
import { ThriftFileWatcher } from './utils/file-watcher';
import { ErrorHandler } from './utils/error-handler';
import { config } from './config';
import { LruCache } from './utils/lru-cache';
import { CoreDependencies } from './utils/dependencies';
import {
    LineRange,
    collapseLineRanges,
    lineRangeFromChange,
    mergeLineRanges,
    normalizeLineRange,
    rangeContainsLineRange,
    rangeIntersectsLineRange
} from './utils/line-range';

export type ThriftIssue = {
    message: string;
    range: vscode.Range;
    severity: vscode.DiagnosticSeverity;
    code?: string;
};

type BlockCacheValue = { hash: number; issues: ThriftIssue[] };
type MemberCacheValue = { range: LineRange; hash: number; issues: ThriftIssue[] };
type BlockCache = LruCache<string, BlockCacheValue>;
type MemberCache = LruCache<string, MemberCacheValue>;
type MemberCacheByBlock = LruCache<string, MemberCache>;

const PRIMITIVES = new Set<string>([
    'void', 'bool', 'byte', 'i8', 'i16', 'i32', 'i64', 'double', 'string', 'binary', 'uuid', 'slist'
]);

function isDiagnosticsDebugEnabled(): boolean {
    try {
        return !!vscode.workspace.getConfiguration('thrift').get('diagnostics.debug', false);
    } catch {
        return false;
    }
}

function logDiagnostics(message: string) {
    if (!isDiagnosticsDebugEnabled()) {
        return;
    }
    console.log(message);
}

// New helpers for value/type validation
const integerTypes = new Set<string>(['byte', 'i8', 'i16', 'i32', 'i64']);
const uuidRegex = /^[0-9a-fA-F]{8}-([0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}$/;

function isIntegerLiteral(text: string): boolean {
    const t = text.trim();
    // 只匹配纯整数，不匹配浮点数
    return /^-?\d+$/.test(t) && !/^-?\d+\.\d+$/.test(t);
}

function isFloatLiteral(text: string): boolean {
    const t = text.trim();
    return /^-?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(t);
}

function isQuotedString(text: string): boolean {
    const t = text.trim();
    if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
        return t.length >= 2;
    }
    return false;
}

function parseContainerType(typeText: string): boolean {
    const noSpace = typeText.replace(/\s+/g, '');
    // list<T>
    if (/^list<.*>$/.test(noSpace)) {
        const inner = typeText.slice(typeText.indexOf('<') + 1, typeText.lastIndexOf('>'));
        return inner.trim().length > 0;
    }
    // set<T>
    if (/^set<.*>$/.test(noSpace)) {
        const inner = typeText.slice(typeText.indexOf('<') + 1, typeText.lastIndexOf('>'));
        return inner.trim().length > 0;
    }
    // map<K,V> (ensure exactly two top-level parts)
    if (/^map<.*>$/.test(noSpace)) {
        const inner = typeText.slice(typeText.indexOf('<') + 1, typeText.lastIndexOf('>'));
        const parts = splitTopLevelAngles(inner);
        return parts.length === 2;
    }
    return false;
}

function splitTopLevelAngles(typeInner: string): string[] {
    const parts: string[] = [];
    let buf = '';
    let depth = 0;
    for (let i = 0; i < typeInner.length; i++) {
        const ch = typeInner[i];
        if (ch === '<') {
            depth++;
        }
        if (ch === '>') {
            depth = Math.max(0, depth - 1);
        }
        if (ch === ',' && depth === 0) {
            parts.push(buf);
            buf = '';
        } else {
            buf += ch;
        }
    }
    if (buf) {
        parts.push(buf);
    }
    return parts.map(s => s.trim()).filter(Boolean);
}

// Strip Thrift type annotations like `(python.immutable = "")` that can appear after types
// Robustly handle escaped quotes and parentheses inside annotation string values.
function stripTypeAnnotations(typeText: string): string {
    let out = '';
    let inSingle = false;
    let inDouble = false;
    let escaped = false;
    let parenDepth = 0;

    for (let i = 0; i < typeText.length; i++) {
        const ch = typeText[i];

        // Track string state and escapes
        if (parenDepth > 0) {
            // Inside annotation parentheses: we still need to correctly handle
            // quotes and escapes so that parentheses inside quoted strings do not
            // affect parenDepth.
            if (!escaped && ch === '\\') {
                escaped = true;
                continue; // skip content inside annotations
            }
            if (!escaped) {
                if (ch === '"' && !inSingle) {
                    inDouble = !inDouble;
                    continue; // skip content inside annotations
                }
                if (ch === '\'' && !inDouble) {
                    inSingle = !inSingle;
                    continue; // skip content inside annotations
                }
            } else {
                // consume escaped character
                escaped = false;
                continue; // skip content inside annotations
            }
        }

        // Only consider parentheses when not inside a quoted string
        if (!inSingle && !inDouble) {
            if (ch === '(') {
                parenDepth++;
                continue; // start skipping annotation content
            }
            if (ch === ')') {
                if (parenDepth > 0) {
                    parenDepth--;
                    continue; // end skipping annotation content
                }
            }
        }

        // Outside annotation parentheses: emit characters normally
        if (parenDepth === 0) {
            // Maintain string/escape state even though types rarely contain quotes
            if (!escaped && ch === '\\') {
                escaped = true;
                out += ch;
                continue;
            }
            if (!escaped) {
                if (ch === '"' && !inSingle) {
                    inDouble = !inDouble;
                } else if (ch === '\'' && !inDouble) {
                    inSingle = !inSingle;
                }
                out += ch;
            } else {
                out += ch;
                escaped = false;
            }
        }
        // If parenDepth > 0, we skip annotation content entirely
    }

    return out.trim();
}

// Remove comments from a single line while tracking multi-line block comment state
function stripCommentsFromLine(rawLine: string, state: { inBlock: boolean }): string {
    let out = '';
    let inS = false, inD = false, escaped = false;
    for (let i = 0; i < rawLine.length;) {
        const ch = rawLine[i];
        const next = i + 1 < rawLine.length ? rawLine[i + 1] : '';

        // Enter/exit block comment when not inside a string
        if (!inS && !inD && !state.inBlock && ch === '/' && next === '*') {
            state.inBlock = true;
            i += 2;
            continue;
        }
        if (state.inBlock) {
            const endIdx = rawLine.indexOf('*/', i);
            if (endIdx === -1) {
                // whole rest is inside a block comment
                return out;
            } else {
                state.inBlock = false;
                i = endIdx + 2;
                continue;
            }
        }

        // Handle string state and escapes
        if ((ch === '"' && !inS && !escaped) || (ch === "'" && !inD && !escaped)) {
            if (ch === '"') {
                inD = !inD;
            } else {
                inS = !inS;
            }
            out += ch;
            i++;
            continue;
        }
        if ((inS || inD) && ch === '\\' && !escaped) {
            // preserve escape and the next character verbatim
            out += ch;
            i++;
            escaped = true;
            continue;
        }
        if (escaped) {
            out += ch;
            i++;
            escaped = false;
            continue;
        }

        // Line comment start only if not inside a string
        if (!inS && !inD) {
            if ((ch === '/' && next === '/') || ch === '#') {
                break; // ignore rest of the line
            }
        }

        out += ch;
        i++;
    }
    return out;
}

function stripStringLiterals(rawLine: string): string {
    let out = '';
    let inS = false;
    let inD = false;
    let escaped = false;

    for (let i = 0; i < rawLine.length; i++) {
        const ch = rawLine[i];

        if (escaped) {
            escaped = false;
            continue;
        }
        if (inS) {
            if (ch === '\\') {
                escaped = true;
                continue;
            }
            if (ch === '\'') {
                inS = false;
            }
            continue;
        }
        if (inD) {
            if (ch === '\\') {
                escaped = true;
                continue;
            }
            if (ch === '"') {
                inD = false;
            }
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

        out += ch;
    }

    return out;
}

const STRUCTURAL_TOKEN_PATTERN = /\b(struct|union|exception|enum|senum|service|typedef|const|namespace|include)\b/;
const STRUCTURAL_CHAR_PATTERN = /[{}]/;

function sanitizeStructuralText(rawLine: string): string {
    const withoutComments = stripCommentsFromLine(rawLine, { inBlock: false });
    return stripStringLiterals(withoutComments);
}

function hasStructuralTokens(rawLine: string): boolean {
    const sanitized = sanitizeStructuralText(rawLine);
    return STRUCTURAL_CHAR_PATTERN.test(sanitized) || STRUCTURAL_TOKEN_PATTERN.test(sanitized);
}

function includesKeyword(rawLine: string): boolean {
    return /\binclude\b/.test(sanitizeStructuralText(rawLine));
}

export const diagnosticsTestUtils = {
    includesKeyword,
    hasStructuralTokens,
    sanitizeStructuralText
};


// isKnownType checks if a type name is known 
function isKnownType(typeName: string, definedTypes: Set<string>, includeAliases: Set<string>): boolean {
    if (!typeName) {
        return false;
    }
    const t = stripTypeAnnotations(typeName).trim();
    if (PRIMITIVES.has(t)) {
        return true;
    }
    if (definedTypes.has(t)) {
        return true;
    }
    const namespaced = t.match(/^([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)$/);
    if (namespaced) {
        const alias = namespaced[1];
        const base = namespaced[2];
        if (!includeAliases.has(alias)) {
            return false;
        }
        return PRIMITIVES.has(base) || definedTypes.has(base);
    }
    if (parseContainerType(t)) {
        const inner = t.slice(t.indexOf('<') + 1, t.lastIndexOf('>'));
        const parts = splitTopLevelAngles(inner);
        return parts.every(p => isKnownType(p, definedTypes, includeAliases));
    }
    return false;
}

function resolveNamespacedBase(typeName: string, includeAliases: Set<string>): string | null {
    if (!typeName.includes('.')) {
        return typeName;
    }
    const parts = typeName.split('.');
    const alias = parts[0];
    if (!alias || !includeAliases.has(alias)) {
        return null;
    }
    return parts[parts.length - 1] || null;
}

// Extract default value for a field line (comment-stripped)
function extractDefaultValue(codeLine: string): string | null {
    // Find '=' at top level (not inside quotes or any brackets/parentheses)
    let depthAngle = 0, depthBracket = 0, depthBrace = 0, depthParen = 0;
    let inS = false, inD = false, escaped = false;
    let eq = -1;
    for (let i = 0; i < codeLine.length; i++) {
        const ch = codeLine[i];
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
        if (ch === '<') {
            depthAngle++;
        } else if (ch === '>') {
            depthAngle = Math.max(0, depthAngle - 1);
        } else if (ch === '[') {
            depthBracket++;
        } else if (ch === ']') {
            depthBracket = Math.max(0, depthBracket - 1);
        } else if (ch === '{') {
            depthBrace++;
        } else if (ch === '}') {
            depthBrace = Math.max(0, depthBrace - 1);
        } else if (ch === '(') {
            depthParen++;
        } else if (ch === ')') {
            depthParen = Math.max(0, depthParen - 1);
        } else if (ch === '=' && depthAngle === 0 && depthBracket === 0 && depthBrace === 0 && depthParen === 0) {
            eq = i;
            break;
        }
    }
    if (eq === -1) {
        return null;
    }

    // Capture value until a top-level comma/semicolon or annotation start '(' is reached
    let i = eq + 1;
    depthAngle = depthBracket = depthBrace = depthParen = 0;
    inS = inD = false;
    escaped = false;
    let buf = '';
    const n = codeLine.length;
    while (i < n) {
        const ch = codeLine[i];
        if (inS) {
            buf += ch;
            if (!escaped && ch === '\\') {
                escaped = true;
                i++;
                continue;
            }
            if (!escaped && ch === '\'') {
                inS = false;
            }
            escaped = false;
            i++;
            continue;
        }
        if (inD) {
            buf += ch;
            if (!escaped && ch === '\\') {
                escaped = true;
                i++;
                continue;
            }
            if (!escaped && ch === '"') {
                inD = false;
            }
            escaped = false;
            i++;
            continue;
        }
        if (ch === '\'') {
            inS = true;
            buf += ch;
            i++;
            continue;
        }
        if (ch === '"') {
            inD = true;
            buf += ch;
            i++;
            continue;
        }

        if (ch === '<') {
            depthAngle++;
        } else if (ch === '>') {
            depthAngle = Math.max(0, depthAngle - 1);
        } else if (ch === '[') {
            depthBracket++;
        } else if (ch === ']') {
            depthBracket = Math.max(0, depthBracket - 1);
        } else if (ch === '{') {
            depthBrace++;
        } else if (ch === '}') {
            depthBrace = Math.max(0, depthBrace - 1);
        } else if (ch === '(' && depthAngle === 0 && depthBracket === 0 && depthBrace === 0 && depthParen === 0) {
            // Annotation section begins; default value ends before annotations
            break;
        } else if (ch === '(') {
            depthParen++;
        } else if (ch === ')') {
            depthParen = Math.max(0, depthParen - 1);
        }

        if ((ch === ',' || ch === ';') && depthAngle === 0 && depthBracket === 0 && depthBrace === 0 && depthParen === 0) {
            break;
        }

        buf += ch;
        i++;
    }
    return buf.trim();
}

function valueMatchesType(valueRaw: string, typeText: string): boolean {
    const t = stripTypeAnnotations(typeText).trim();
    const v = valueRaw.trim();

    if (integerTypes.has(t)) {
        return isIntegerLiteral(v);
    }
    if (t === 'double') {
        return isIntegerLiteral(v) || isFloatLiteral(v);
    }
    if (t === 'bool') {
        return v === 'true' || v === 'false';
    }
    if (t === 'string' || t === 'binary') {
        return isQuotedString(v);
    }
    if (t === 'uuid') {
        if (!isQuotedString(v)) {
            return false;
        }
        const inner = v.slice(1, -1);
        return uuidRegex.test(inner);
    }
    if (/^list<.+>$/.test(t)) {
        if (!(v.startsWith('[') && v.endsWith(']'))) {
            return false;
        }
        const inner = v.slice(1, -1).trim();
        if (inner.length === 0) {
            return true;
        } // allow empty list defaults: []
        return true; // content validation is out of scope here
    }
    if (/^set<.+>$/.test(t)) {
        // Keep set defaults lenient to avoid false positives on complex literals.
        return true;
    }
    if (/^map<.+>$/.test(t)) {
        // Keep map defaults lenient to avoid false positives on complex literals.
        return true;
    }

    // For typedefs or user types: we can't fully validate value shape here; accept quoted or simple tokens
    return true;
}

function isValidDefaultValue(typeText: string, valueText: string): boolean {
    const value = valueText.trim();
    if (!value) {
        return true;
    }
    return valueMatchesType(value, typeText);
}

// Parse types from a Thrift file content and return a map of type names to their kinds
function collectTypesFromAst(ast: nodes.ThriftDocument): Map<string, string> {
    const typeKind = new Map<string, string>();
    for (const node of ast.body) {
        switch (node.type) {
            case nodes.ThriftNodeType.Typedef:
                if (node.name) {
                    typeKind.set(node.name, 'typedef');
                }
                break;
            case nodes.ThriftNodeType.Enum:
                if (node.name) {
                    typeKind.set(node.name, (node as nodes.Enum).isSenum ? 'senum' : 'enum');
                }
                break;
            case nodes.ThriftNodeType.Struct:
                if (node.name) {
                    typeKind.set(node.name, 'struct');
                }
                break;
            case nodes.ThriftNodeType.Union:
                if (node.name) {
                    typeKind.set(node.name, 'union');
                }
                break;
            case nodes.ThriftNodeType.Exception:
                if (node.name) {
                    typeKind.set(node.name, 'exception');
                }
                break;
            case nodes.ThriftNodeType.Service:
                if (node.name) {
                    typeKind.set(node.name, 'service');
                }
                break;
            default:
                break;
        }
    }
    return typeKind;
}

function parseTypesFromContent(content: string, uri: string): Map<string, string> {
    const ast = ThriftParser.parseContentWithCache(uri, content);
    return collectTypesFromAst(ast);
}

// Get included file paths from a Thrift document
async function getIncludedFiles(document: vscode.TextDocument): Promise<vscode.Uri[]> {
    const includedFiles: vscode.Uri[] = [];
    const documentDir = path.dirname(document.uri.fsPath);
    const ast = ThriftParser.parseWithCache(document);

    for (const node of ast.body) {
        if (node.type !== nodes.ThriftNodeType.Include) {
            continue;
        }
        const includePath = (node as nodes.Include).path;
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
            // Invalid path, skip - this is expected for some cases
            // No need to log as error, this is normal behavior
        }
    }

    return includedFiles;
}

// 包含文件类型缓存 - 避免重复分析相同文件
const includeTypesCache = new Map<string, Map<string, string>>();
const includeFileTimestamps = new Map<string, number>();
const includeFileStats = new Map<string, { mtime: number, size: number }>();
const INCLUDE_CACHE_MAX_AGE = config.cache.includeTypesMaxAgeMs;

// Collect types from all included files (带智能缓存优化版本)
async function collectIncludedTypes(document: vscode.TextDocument, errorHandler?: ErrorHandler): Promise<Map<string, string>> {
    const includedTypes = new Map<string, string>();
    const includedFiles = await getIncludedFiles(document);
    const now = Date.now();
    const decoder = new TextDecoder('utf-8');

    for (const includedFile of includedFiles) {
        try {
            const includedFileKey = includedFile.toString();

            // 检查文件状态是否发生变化
            let fileStats;
            try {
                const stat = await vscode.workspace.fs.stat(includedFile);
                fileStats = { mtime: stat.mtime, size: stat.size };
            } catch {
                // 无法获取文件状态，使用缓存或跳过
                fileStats = null;
            }

            const cachedStats = includeFileStats.get(includedFileKey);
            const cachedTypes = includeTypesCache.get(includedFileKey);
            const cachedTime = includeFileTimestamps.get(includedFileKey);

            // 判断缓存是否有效：时间未过期且文件状态未变化
            const cacheValid = cachedTypes && cachedTime &&
                (now - cachedTime) < INCLUDE_CACHE_MAX_AGE &&
                (!fileStats || !cachedStats || (
                    fileStats.mtime === cachedStats.mtime &&
                    fileStats.size === cachedStats.size
                ));

            if (cacheValid) {
                // 使用缓存的数据
                logDiagnostics(`[Diagnostics] Using cached types for included file: ${path.basename(includedFile.fsPath)}`);
                for (const [name, kind] of cachedTypes) {
                    if (!includedTypes.has(name)) {
                        includedTypes.set(name, kind);
                    }
                }
                continue;
            }

            logDiagnostics(`[Diagnostics] Analyzing included file: ${path.basename(includedFile.fsPath)} (cache miss)`);

            // 缓存无效，重新分析
            // 关键修复: 不要使用 openTextDocument，因为它会触发 onDidOpenTextDocument 事件，导致递归扫描
            // 只有当文档已经在编辑器中打开时才使用 TextDocument，否则直接读取文件内容
            let text = '';
            const openDoc = vscode.workspace.textDocuments.find(d => d.uri.toString() === includedFileKey);

            if (openDoc) {
                text = openDoc.getText();
            } else {
                const content = await vscode.workspace.fs.readFile(includedFile);
                text = decoder.decode(content);
            }

            const types = parseTypesFromContent(text, includedFileKey);

            // 更新缓存
            includeTypesCache.set(includedFileKey, new Map(types));
            includeFileTimestamps.set(includedFileKey, now);
            if (fileStats) {
                includeFileStats.set(includedFileKey, fileStats);
            }

            // Add types from this included file
            for (const [name, kind] of types) {
                if (!includedTypes.has(name)) {
                    includedTypes.set(name, kind);
                }
            }
        } catch (error) {
            // File might not exist or be accessible, skip
            if (errorHandler) {
                errorHandler.handleError(error, {
                    component: 'DiagnosticManager',
                    operation: 'collectIncludedTypes',
                    filePath: includedFile.fsPath,
                    additionalInfo: { reason: 'includedFileAnalysis' }
                });
            }
            continue;
        }
    }

    return includedTypes;
}

function collectIncludedTypesFromCache(includedFiles: vscode.Uri[]): Map<string, string> | null {
    const includedTypes = new Map<string, string>();
    const now = Date.now();
    for (const includedFile of includedFiles) {
        const includedFileKey = includedFile.toString();
        const cachedTypes = includeTypesCache.get(includedFileKey);
        const cachedTime = includeFileTimestamps.get(includedFileKey);
        if (!cachedTypes || !cachedTime || (now - cachedTime) >= INCLUDE_CACHE_MAX_AGE) {
            return null;
        }
        for (const [name, kind] of cachedTypes) {
            if (!includedTypes.has(name)) {
                includedTypes.set(name, kind);
            }
        }
    }
    return includedTypes;
}

interface AnalysisContext {
    includeAliases: Set<string>;
    typeKind: Map<string, string>;
}

function collectIncludeAliasesFromAst(ast: nodes.ThriftDocument): Set<string> {
    const includeAliases = new Set<string>();
    for (const node of ast.body) {
        if (node.type === nodes.ThriftNodeType.Include) {
            const includePath = (node as nodes.Include).path;
            const alias = path.basename(includePath, '.thrift');
            if (alias) {
                includeAliases.add(alias);
            }
        }
    }
    return includeAliases;
}

function buildAnalysisContext(ast: nodes.ThriftDocument): AnalysisContext {
    return {
        includeAliases: collectIncludeAliasesFromAst(ast),
        typeKind: collectTypesFromAst(ast)
    };
}

function analyzeThriftAst(
    ast: nodes.ThriftDocument,
    lines: string[],
    includedTypes?: Map<string, string>,
    context?: AnalysisContext,
    analysisScope?: LineRange
): ThriftIssue[] {
    const issues: ThriftIssue[] = [];

    // First pass: strip comments for each line with block-comment awareness
    const codeLines: string[] = [];
    const state = { inBlock: false };
    for (const raw of lines) {
        codeLines.push(stripCommentsFromLine(raw, state));
    }

    const includeAliases = context?.includeAliases ?? collectIncludeAliasesFromAst(ast);
    const typeKind = context?.typeKind
        ? new Map(context.typeKind)
        : collectTypesFromAst(ast);

    if (includedTypes) {
        for (const [name, kind] of includedTypes) {
            if (!typeKind.has(name)) {
                typeKind.set(name, kind);
            }
        }
    }

    const definedTypes = new Set<string>([...typeKind.keys()]);

    const findTypeRange = (lineNo: number, typeText: string, fallback: vscode.Range): vscode.Range => {
        if (lineNo >= 0 && lineNo < lines.length) {
            const idx = lines[lineNo].indexOf(typeText);
            if (idx >= 0) {
                return new vscode.Range(lineNo, idx, lineNo, idx + typeText.length);
            }
        }
        return fallback;
    };

    // Validate service extends
    for (const node of ast.body) {
        if (node.type !== nodes.ThriftNodeType.Service) {
            continue;
        }
        const serviceNode = node as nodes.Service;
        if (!serviceNode.extends) {
            continue;
        }
        const parentName = serviceNode.extends;
        let base = parentName;
        let parentKind = typeKind.get(parentName);
        if (!parentKind && parentName.includes('.')) {
            base = resolveNamespacedBase(parentName, includeAliases) || '';
            parentKind = base ? typeKind.get(base) : undefined;
        }

        const lineNo = serviceNode.range.start.line;
        const lineText = lines[lineNo] || '';
        const col = lineText.indexOf('extends');
        const range = col >= 0
            ? new vscode.Range(lineNo, col, lineNo, col + 'extends'.length)
            : serviceNode.range;

        if (!base || !parentKind) {
            issues.push({
                message: `Unknown parent service '${parentName}' in extends`,
                range,
                severity: vscode.DiagnosticSeverity.Error,
                code: 'service.extends.unknown'
            });
        } else if (parentKind !== 'service') {
            issues.push({
                message: `Parent type '${parentName}' is not a service`,
                range,
                severity: vscode.DiagnosticSeverity.Error,
                code: 'service.extends.notService'
            });
        }
    }

    // Validate nodes via AST
    for (const node of ast.body) {
        switch (node.type) {
            case nodes.ThriftNodeType.Typedef: {
                const typedefNode = node as nodes.Typedef;
                const baseType = typedefNode.aliasType.trim();
                if (!isKnownType(baseType, definedTypes, includeAliases) && !PRIMITIVES.has(baseType)) {
                    const lineNo = typedefNode.range.start.line;
                    issues.push({
                        message: `Unknown base type '${baseType}' in typedef`,
                        range: findTypeRange(lineNo, baseType, typedefNode.range),
                        severity: vscode.DiagnosticSeverity.Error,
                        code: 'typedef.unknownBase'
                    });
                }
                break;
            }
            case nodes.ThriftNodeType.Const: {
                const constNode = node as nodes.Const;
                const constType = constNode.valueType.trim();
                if (!isKnownType(constType, definedTypes, includeAliases)) {
                    const lineNo = constNode.range.start.line;
                    issues.push({
                        message: `Unknown type '${constType}'`,
                        range: findTypeRange(lineNo, constType, constNode.range),
                        severity: vscode.DiagnosticSeverity.Error,
                        code: 'type.unknown'
                    });
                }
                break;
            }
            case nodes.ThriftNodeType.Enum: {
                const enumNode = node as nodes.Enum;
                if (!enumNode.isSenum) {
                    for (const member of enumNode.members) {
                        if (member.initializer && !isIntegerLiteral(member.initializer)) {
                            issues.push({
                                message: `Enum value must be an integer literal`,
                                range: member.range,
                                severity: vscode.DiagnosticSeverity.Error,
                                code: 'enum.valueNotInteger'
                            });
                        }
                    }
                }
                break;
            }
            case nodes.ThriftNodeType.Struct:
            case nodes.ThriftNodeType.Union:
            case nodes.ThriftNodeType.Exception: {
                const structNode = node as nodes.Struct;
                const fieldIds = new Set<number>();
                for (const field of structNode.fields) {
                    if (fieldIds.has(field.id)) {
                        issues.push({
                            message: `Duplicate field id ${field.id}`,
                            range: field.range,
                            severity: vscode.DiagnosticSeverity.Error,
                            code: 'field.duplicateId'
                        });
                    }
                    fieldIds.add(field.id);

                    if (!isKnownType(field.fieldType, definedTypes, includeAliases)) {
                        issues.push({
                            message: `Unknown type '${field.fieldType}'`,
                            range: field.typeRange || field.range,
                            severity: vscode.DiagnosticSeverity.Error,
                            code: 'type.unknown'
                        });
                    }

                    if (field.defaultValue && !isValidDefaultValue(field.fieldType, field.defaultValue)) {
                        issues.push({
                            message: `Invalid default value '${field.defaultValue}' for type '${field.fieldType}'`,
                            range: field.defaultValueRange || field.range,
                            severity: vscode.DiagnosticSeverity.Warning,
                            code: 'value.typeMismatch'
                        });
                    }
                }
                break;
            }
            case nodes.ThriftNodeType.Service: {
                const serviceNode = node as nodes.Service;
                for (const fn of serviceNode.functions) {
                    if (fn.oneway) {
                        if (fn.returnType.trim() !== 'void') {
                            issues.push({
                                message: `oneway method '${fn.name}' must return void`,
                                range: fn.range,
                                severity: vscode.DiagnosticSeverity.Error,
                                code: 'service.oneway.returnNotVoid'
                            });
                        }
                        if (fn.throws && fn.throws.length > 0) {
                            issues.push({
                                message: `oneway method '${fn.name}' must not declare throws`,
                                range: fn.range,
                                severity: vscode.DiagnosticSeverity.Error,
                                code: 'service.oneway.hasThrows'
                            });
                        }
                    }
                    if (!isKnownType(fn.returnType, definedTypes, includeAliases)) {
                        const lineNo = fn.range.start.line;
                        issues.push({
                            message: `Unknown return type '${fn.returnType}'`,
                            range: findTypeRange(lineNo, fn.returnType, fn.range),
                            severity: vscode.DiagnosticSeverity.Error,
                            code: 'service.returnType.unknown'
                        });
                    }

                    for (const arg of fn.arguments) {
                        if (!isKnownType(arg.fieldType, definedTypes, includeAliases)) {
                            issues.push({
                                message: `Unknown type '${arg.fieldType}'`,
                                range: arg.typeRange || arg.range,
                                severity: vscode.DiagnosticSeverity.Error,
                                code: 'type.unknown'
                            });
                        }
                    }

                    for (const thr of fn.throws) {
                        const base = resolveNamespacedBase(thr.fieldType, includeAliases);
                        const kind = base ? typeKind.get(base) : undefined;
                        if (!base || !kind) {
                            issues.push({
                                message: `Unknown exception type '${thr.fieldType}' in throws`,
                                range: thr.range,
                                severity: vscode.DiagnosticSeverity.Error,
                                code: 'service.throws.unknown'
                            });
                        } else if (kind !== 'exception') {
                            issues.push({
                                message: `Type '${thr.fieldType}' in throws is not an exception`,
                                range: thr.range,
                                severity: vscode.DiagnosticSeverity.Error,
                                code: 'service.throws.notException'
                            });
                        }
                    }
                }
                break;
            }
            default:
                break;
        }
    }

    // Bracket/angle balance tracking
    const stack: { ch: string; line: number; char: number }[] = [];
    for (let lineNo = 0; lineNo < codeLines.length; lineNo++) {
        const line = codeLines[lineNo];
        let inS = false, inD = false, escaped = false;
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

            if (ch === '{' || ch === '(' || ch === '<') {
                stack.push({ ch, line: lineNo, char: i });
            } else if (ch === '}' || ch === ')' || ch === '>') {
                if (ch === '>') {
                    const top = stack[stack.length - 1];
                    if (top && top.ch === '<') {
                        stack.pop();
                    }
                    continue;
                }
                const open = stack.pop();
                if (!open) {
                    issues.push({
                        message: `Unmatched closing '${ch}'`,
                        range: new vscode.Range(lineNo, i, lineNo, i + 1),
                        severity: vscode.DiagnosticSeverity.Error,
                        code: 'syntax.unmatchedCloser'
                    });
                } else {
                    const pair: Record<string, string> = { '}': '{', ')': '(' };
                    if (open.ch !== pair[ch]) {
                        issues.push({
                            message: `Mismatched '${open.ch}' and '${ch}'`,
                            range: new vscode.Range(lineNo, i, lineNo, i + 1),
                            severity: vscode.DiagnosticSeverity.Error,
                            code: 'syntax.mismatched'
                        });
                    }
                }
            }
        }
    }

    for (const open of stack) {
        issues.push({
            message: `Unclosed '${open.ch}'`,
            range: new vscode.Range(open.line, open.char, open.line, open.char + 1),
            severity: vscode.DiagnosticSeverity.Error,
            code: 'syntax.unclosed'
        });
    }

    if (analysisScope) {
        const normalized = normalizeLineRange(analysisScope);
        if (normalized) {
            return issues.filter(issue => rangeIntersectsLineRange(issue.range, normalized));
        }
    }

    return issues;
}

/**
 * 分析 Thrift 文本并返回诊断问题列表。
 */
export function analyzeThriftText(text: string, uri?: vscode.Uri, includedTypes?: Map<string, string>): ThriftIssue[] {
    const lines = text.split('\n');
    const ast = uri
        ? ThriftParser.parseContentWithCache(uri.toString(), text)
        : new ThriftParser(text).parse();

    return analyzeThriftAst(ast, lines, includedTypes);
}


/**
 * DiagnosticManager：负责诊断调度、缓存与依赖跟踪。
 */
export class DiagnosticManager {
    private collection: vscode.DiagnosticCollection;
    private analysisQueue = new Map<string, NodeJS.Timeout>();
    private documentStates = new Map<string, {
        version: number;
        isAnalyzing: boolean;
        lastAnalysis?: number;
        dirtyLineCount?: number;
        includesMayChange?: boolean;
        useCachedIncludes?: boolean;
        useIncrementalDiagnostics?: boolean;
        dirtyRange?: LineRange;
        dirtyRanges?: LineRange[];
        lastDiagnostics?: vscode.Diagnostic[];
        lastAst?: nodes.ThriftDocument;
        lastAnalysisContext?: AnalysisContext;
        lastBlockCache?: BlockCache;
        lastMemberCache?: MemberCacheByBlock;
    }>();
    private readonly ANALYSIS_DELAY = config.diagnostics.analysisDelayMs;
    private readonly MIN_ANALYSIS_INTERVAL = config.diagnostics.minAnalysisIntervalMs;
    private readonly MAX_CONCURRENT_ANALYSES = Math.max(1, config.diagnostics.maxConcurrentAnalyses);
    private inFlightAnalyses = 0;
    private analysisWaiters: Array<() => void> = [];
    private pendingAnalyses = new Set<string>();

    // 文件依赖跟踪 - key: 文件路径, value: 依赖该文件的其他文件路径集合
    private fileDependencies = new Map<string, Set<string>>();
    // 反向依赖跟踪 - key: 文件路径, value: 该文件包含的其他文件路径集合
    private fileIncludes = new Map<string, Set<string>>();
    private errorHandler: ErrorHandler;
    private performanceMonitor: PerformanceMonitor;

    constructor(errorHandler?: ErrorHandler, performanceMonitorInstance?: PerformanceMonitor) {
        this.errorHandler = errorHandler ?? new ErrorHandler();
        this.performanceMonitor = performanceMonitorInstance ?? performanceMonitor;
        this.collection = vscode.languages.createDiagnosticCollection('thrift');
    }

    /**
     * 安排文档诊断任务（支持节流与依赖触发）。
     */
    public scheduleAnalysis(
        doc: vscode.TextDocument,
        immediate: boolean = false,
        skipDependents: boolean = false,
        triggerSource?: string,
        dirtyLineCount?: number,
        includesMayChange?: boolean,
        dirtyRange?: LineRange,
        structuralChange?: boolean,
        dirtyRanges?: LineRange[]
    ) {
        if (doc.languageId !== 'thrift') { return; }

        const key = this.getDocumentKey(doc);
        const triggerInfo = triggerSource ? ` (triggered by ${triggerSource})` : '';
        const dirtyInfo = dirtyLineCount !== undefined ? `, dirtyLines=${dirtyLineCount}` : '';

        const useIncremental = config.incremental.analysisEnabled &&
            dirtyLineCount !== undefined &&
            dirtyLineCount <= config.incremental.maxDirtyLines &&
            !includesMayChange &&
            !structuralChange;

        // 增量模式：小改动时避免触发依赖文件连锁分析
        if (useIncremental) {
            skipDependents = true;
        }

        logDiagnostics(`[Diagnostics] Schedule analysis for ${path.basename(doc.uri.fsPath)}, immediate=${immediate}, skipDependents=${skipDependents}${triggerInfo}${dirtyInfo}`);

        // 清除之前的分析队列
        const existingTimeout = this.analysisQueue.get(key);
        if (existingTimeout) {
            clearTimeout(existingTimeout);
        }

        const state = this.documentStates.get(key);
        const now = Date.now();
        const lastGap = state?.lastAnalysis ? now - state.lastAnalysis : Number.POSITIVE_INFINITY;
        const throttleDelay = lastGap < this.MIN_ANALYSIS_INTERVAL ? this.MIN_ANALYSIS_INTERVAL - lastGap : 0;

        // 若正在分析则跳过
        if (state?.isAnalyzing) { return; }
        // 同一版本且无需节流等待，则不重复分析
        if (state && state.version === doc.version && throttleDelay === 0) { return; }

        const baseDelay = immediate ? 0 : this.ANALYSIS_DELAY;
        const delay = Math.max(baseDelay, throttleDelay);

        const timeout = setTimeout(() => {
            this.analysisQueue.delete(key);
            this.enqueueAnalysis(doc);
        }, delay);

        this.analysisQueue.set(key, timeout);
        this.documentStates.set(key, {
            version: doc.version,
            isAnalyzing: state?.isAnalyzing ?? false,
            lastAnalysis: state?.lastAnalysis,
            dirtyLineCount,
            includesMayChange,
            useCachedIncludes: useIncremental,
            useIncrementalDiagnostics: useIncremental,
            dirtyRange: dirtyRange ? { ...dirtyRange } : undefined,
            dirtyRanges: dirtyRanges?.map(range => ({ ...range })) ?? state?.dirtyRanges,
            lastDiagnostics: state?.lastDiagnostics
        });

        // 如果需要分析依赖文件，延迟分析它们（避免连锁反应）
        if (!skipDependents) {
            const dependentFiles = this.getDependentFiles(key);
            if (dependentFiles.length > 0) {
                logDiagnostics(`[Diagnostics] File ${path.basename(doc.uri.fsPath)} changed, scheduling analysis for ${dependentFiles.length} dependent files${triggerInfo}`);

                // 延迟分析依赖文件，避免立即连锁反应
                setTimeout(() => {
                    for (const dependentKey of dependentFiles) {
                        const dependentDoc = vscode.workspace.textDocuments.find(d => this.getDocumentKey(d) === dependentKey);
                        if (dependentDoc && dependentDoc.languageId === 'thrift') {
                            logDiagnostics(`[Diagnostics] Scheduling analysis for dependent file: ${path.basename(dependentDoc.uri.fsPath)} (triggered by dependency change)`);
                            // 使用 skipDependents=true 避免递归分析
                            this.scheduleAnalysis(dependentDoc, false, true, 'dependency');
                        }
                    }
                }, this.ANALYSIS_DELAY * config.diagnostics.dependentAnalysisDelayFactor);
            }
        }
    }

    private enqueueAnalysis(doc: vscode.TextDocument): void {
        const key = this.getDocumentKey(doc);
        if (this.pendingAnalyses.has(key)) {
            return;
        }
        this.pendingAnalyses.add(key);
        void this.runWithLimit(async () => {
            try {
                await this.performAnalysis(doc);
            } finally {
                this.pendingAnalyses.delete(key);
            }
        });
    }

    private async runWithLimit<T>(task: () => Promise<T>): Promise<T> {
        if (this.MAX_CONCURRENT_ANALYSES <= 0) {
            return task();
        }
        await this.acquireSlot();
        try {
            return await task();
        } finally {
            this.releaseSlot();
        }
    }

    private acquireSlot(): Promise<void> {
        if (this.inFlightAnalyses < this.MAX_CONCURRENT_ANALYSES) {
            this.inFlightAnalyses += 1;
            return Promise.resolve();
        }
        return new Promise(resolve => {
            this.analysisWaiters.push(() => {
                this.inFlightAnalyses += 1;
                resolve();
            });
        });
    }

    private releaseSlot(): void {
        this.inFlightAnalyses = Math.max(0, this.inFlightAnalyses - 1);
        const next = this.analysisWaiters.shift();
        if (next) {
            next();
        }
    }

    /**
     * 清理指定文档的诊断与缓存。
     */
    public clearDocument(doc: vscode.TextDocument) {
        const key = this.getDocumentKey(doc);

        // 清除分析队列
        const timeout = this.analysisQueue.get(key);
        if (timeout) {
            clearTimeout(timeout);
            this.analysisQueue.delete(key);
        }

        // 清除状态
        this.documentStates.delete(key);

        // 清除依赖关系
        const oldIncludes = this.fileIncludes.get(key);
        if (oldIncludes) {
            for (const includedKey of oldIncludes) {
                const dependents = this.fileDependencies.get(includedKey);
                if (dependents) {
                    dependents.delete(key);
                    if (dependents.size === 0) {
                        this.fileDependencies.delete(includedKey);
                    }
                }
            }
        }
        this.fileIncludes.delete(key);

        // 清除诊断信息
        this.collection.delete(doc.uri);

        // 清除包含文件缓存（如果这个文件是被包含的文件）
        const docUri = doc.uri.toString();
        if (includeTypesCache.has(docUri)) {
            includeTypesCache.delete(docUri);
            includeFileTimestamps.delete(docUri);
            includeFileStats.delete(docUri);
            logDiagnostics(`[Diagnostics] Cleared include cache for: ${path.basename(doc.uri.fsPath)}`);
        }
    }

    /**
     * 释放所有资源。
     */
    public dispose() {
        // 清除所有待处理的分析
        for (const timeout of this.analysisQueue.values()) {
            clearTimeout(timeout);
        }
        this.analysisQueue.clear();
        this.documentStates.clear();
        this.fileDependencies.clear();
        this.fileIncludes.clear();
        this.collection.dispose();
    }

    // Testing methods to expose internal state for unit tests
    public getFileDependenciesForTesting(): Map<string, Set<string>> {
        return this.fileDependencies;
    }

    public getFileIncludesForTesting(): Map<string, Set<string>> {
        return this.fileIncludes;
    }

    private getDocumentKey(doc: vscode.TextDocument): string {
        return doc.uri.toString();
    }

    // 跟踪文件依赖关系
    private trackFileDependencies(document: vscode.TextDocument, includedFiles: vscode.Uri[]) {
        const docKey = this.getDocumentKey(document);

        // 清除旧的依赖关系
        const oldIncludes = this.fileIncludes.get(docKey);
        if (oldIncludes) {
            // 从其他文件的依赖列表中移除当前文件
            for (const includedKey of oldIncludes) {
                const dependents = this.fileDependencies.get(includedKey);
                if (dependents) {
                    dependents.delete(docKey);
                    if (dependents.size === 0) {
                        this.fileDependencies.delete(includedKey);
                    }
                }
            }
        }

        // 建立新的依赖关系
        const newIncludes = new Set<string>();
        for (const includedFile of includedFiles) {
            const includedKey = includedFile.toString();
            newIncludes.add(includedKey);

            // 添加到依赖映射
            if (!this.fileDependencies.has(includedKey)) {
                this.fileDependencies.set(includedKey, new Set<string>());
            }
            this.fileDependencies.get(includedKey)!.add(docKey);
        }

        // 更新包含映射
        this.fileIncludes.set(docKey, newIncludes);
    }

    // 获取依赖指定文件的所有文件
    private getDependentFiles(fileKey: string): string[] {
        const dependents = this.fileDependencies.get(fileKey);
        return dependents ? Array.from(dependents) : [];
    }

    private async performAnalysis(doc: vscode.TextDocument) {
        const key = this.getDocumentKey(doc);
        logDiagnostics(`[Diagnostics] Starting analysis for ${path.basename(doc.uri.fsPath)}`);

        // 更新状态
        const state = this.documentStates.get(key) || { version: doc.version, isAnalyzing: false };
        state.isAnalyzing = true;
        state.version = doc.version;
        this.documentStates.set(key, state);

        try {
            // 使用性能监控包装分析过程
            await this.performanceMonitor.measureAsync(
                'Thrift诊断分析',
                async () => {
                    try {
                        // Collect types from included files
                        const includedFiles = await getIncludedFiles(doc);
                        const cachedIncludedTypes = state.useCachedIncludes
                            ? collectIncludedTypesFromCache(includedFiles)
                            : null;
                        const includedTypes = cachedIncludedTypes
                            ? cachedIncludedTypes
                            : await collectIncludedTypes(doc, this.errorHandler);

                        // 跟踪文件依赖关系（缓存命中时可跳过）
                        if (!cachedIncludedTypes) {
                            this.trackFileDependencies(doc, includedFiles);
                        }

                        const text = doc.getText();
                        const lines = text.split('\n');
                        let issues: ThriftIssue[] = [];
                        let usedPartial = false;
                        let blockRange: LineRange | null = null;
                        let memberRange: LineRange | null = null;

                        if (state.useIncrementalDiagnostics && state.dirtyRange && state.lastAst && state.lastAnalysisContext) {
                            const changeRanges = state.dirtyRanges?.length
                                ? state.dirtyRanges
                                : [state.dirtyRange];
                            blockRange = findBestContainingRangeForChanges(state.lastAst, changeRanges);
                            if (blockRange) {
                                const blockKey = `${blockRange.startLine}-${blockRange.endLine}`;
                                const blockLines = lines.slice(blockRange.startLine, blockRange.endLine + 1).join('\n');
                                const blockHash = hashText(blockLines);
                                const cachedBlock = state.lastBlockCache?.get(blockKey);
                                if (cachedBlock && cachedBlock.hash === blockHash) {
                                    issues = cachedBlock.issues;
                                    memberRange = findBestContainingMemberRangeForChanges(state.lastAst, changeRanges);
                                } else {
                                    let memberCacheHit = false;
                                    const partialLines = buildPartialLines(lines, blockRange.startLine, blockRange.endLine);
                                    const partialText = partialLines.join('\n');
                                    const partialKey = `${doc.uri.toString()}#partial:${blockRange.startLine}-${blockRange.endLine}`;
                                    const partialAst = ThriftParser.parseContentWithCache(partialKey, partialText);
                                    memberRange = findBestContainingMemberRangeForChanges(partialAst, changeRanges);
                                    const memberKey = memberRange ? `${memberRange.startLine}-${memberRange.endLine}` : null;
                                    const memberHash = memberRange
                                        ? hashText(partialLines.slice(memberRange.startLine, memberRange.endLine + 1).join('\n'))
                                        : null;
                                    const cachedMember = memberKey
                                        ? state.lastMemberCache?.get(blockKey)?.get(memberKey)
                                        : null;

                                    if (cachedMember && cachedMember.hash === memberHash) {
                                        issues = cachedMember.issues;
                                        memberCacheHit = true;
                                    } else {
                                        issues = analyzeThriftAst(
                                            partialAst,
                                            partialLines,
                                            includedTypes,
                                            state.lastAnalysisContext,
                                            memberRange ?? undefined
                                        );
                                    }
                                    if (!memberCacheHit) {
                                        if (!state.lastBlockCache) {
                                            state.lastBlockCache = createBlockCache();
                                        }
                                        const blockIssues = issues.filter(issue => rangeIntersectsLineRange(issue.range, blockRange!));
                                        state.lastBlockCache.set(blockKey, { hash: blockHash, issues: blockIssues });
                                        if (!state.lastMemberCache) {
                                            state.lastMemberCache = createMemberCacheByBlock();
                                        }
                                        const blockNode = findContainingNode(partialAst, blockRange);
                                        if (blockNode) {
                                            state.lastMemberCache.set(blockKey, buildMemberCacheForNode(blockNode, partialLines, issues));
                                        }
                                    } else if (memberKey && memberRange && memberHash !== null) {
                                        if (!state.lastMemberCache) {
                                            state.lastMemberCache = createMemberCacheByBlock();
                                        }
                                        const blockMembers = state.lastMemberCache.get(blockKey) ?? createMemberCache();
                                        blockMembers.set(memberKey, { range: memberRange, hash: memberHash, issues });
                                        state.lastMemberCache.set(blockKey, blockMembers);
                                    }
                                }
                                usedPartial = true;
                            }
                        }

                        if (!usedPartial) {
                            const ast = ThriftParser.parseContentWithCache(doc.uri.toString(), text);
                            issues = analyzeThriftAst(ast, lines, includedTypes);
                            state.lastAst = ast;
                            state.lastAnalysisContext = buildAnalysisContext(ast);
                            state.lastBlockCache = buildBlockCache(ast, lines, issues);
                            state.lastMemberCache = buildMemberCache(ast, lines, issues);
                        }

                        const mergeRange = memberRange ?? blockRange;
                        if (usedPartial && mergeRange) {
                            issues = issues.filter(issue => rangeIntersectsLineRange(issue.range, mergeRange));
                        }

                        const mergeState = usedPartial && mergeRange
                            ? { ...state, dirtyRange: mergeRange }
                            : usedPartial
                                ? state
                            : { ...state, useIncrementalDiagnostics: false };
                        const incrementalDiagnostics = this.mergeIncrementalDiagnostics(
                            issues,
                            mergeState,
                            doc
                        );
                        const diagnostics = incrementalDiagnostics
                            ? incrementalDiagnostics
                            : issues.map(i => new vscode.Diagnostic(i.range, i.message, i.severity));

                        // 原子性更新诊断信息
                        this.collection.set(doc.uri, diagnostics);
                        state.lastDiagnostics = diagnostics;

                        logDiagnostics(`文档 ${path.basename(doc.uri.fsPath)} 分析完成: ${diagnostics.length} 个问题`);
                    } catch (error) {
                        this.errorHandler.handleError(error, {
                            component: 'DiagnosticManager',
                            operation: 'analyzeDocument',
                            filePath: doc.uri.fsPath,
                            additionalInfo: { documentVersion: doc.version }
                        });
                        // 出错时清空诊断信息，避免显示过时错误
                        this.collection.set(doc.uri, []);
                    }
                },
                doc
            );
        } finally {
            // 更新状态
            state.isAnalyzing = false;
            state.lastAnalysis = Date.now();
            this.documentStates.set(key, state);
        }
    }

    private mergeIncrementalDiagnostics(
        issues: ThriftIssue[],
        state: {
            useIncrementalDiagnostics?: boolean;
            dirtyRange?: LineRange;
            lastDiagnostics?: vscode.Diagnostic[];
        },
        doc: vscode.TextDocument
    ): vscode.Diagnostic[] | null {
        if (!state.useIncrementalDiagnostics || !state.dirtyRange || !state.lastDiagnostics) {
            return null;
        }

        const lineRange = normalizeLineRange(state.dirtyRange);
        if (!lineRange) {
            return null;
        }

        const nextDiagnostics = issues
            .filter(issue => rangeIntersectsLineRange(issue.range, lineRange))
            .map(issue => new vscode.Diagnostic(issue.range, issue.message, issue.severity));

        const preserved = state.lastDiagnostics.filter(diagnostic => !rangeIntersectsLineRange(diagnostic.range, lineRange));
        const merged = [...preserved, ...nextDiagnostics];

        logDiagnostics(`[Diagnostics] Incremental merge applied for ${path.basename(doc.uri.fsPath)} (lines ${lineRange.startLine}-${lineRange.endLine})`);

        return merged;
    }
}

function findBestContainingRange(ast: nodes.ThriftDocument, dirtyRange: LineRange) {
    const normalized = normalizeLineRange(dirtyRange);
    if (!normalized) {
        return null;
    }
    let best: LineRange | null = null;
    let bestSpan = Number.POSITIVE_INFINITY;
    for (const node of ast.body) {
        if (node.range.start.line > normalized.startLine || node.range.end.line < normalized.endLine) {
            continue;
        }
        const span = node.range.end.line - node.range.start.line;
        if (span < bestSpan) {
            bestSpan = span;
            best = { startLine: node.range.start.line, endLine: node.range.end.line };
        }
    }
    return best;
}

function findBestContainingRangeForChanges(ast: nodes.ThriftDocument, dirtyRanges: LineRange[]) {
    const merged = mergeLineRanges(dirtyRanges);
    if (!merged.length) {
        return null;
    }
    let best: LineRange | null = null;
    let bestSpan = Number.POSITIVE_INFINITY;
    for (const node of ast.body) {
        const containsAll = merged.every(range => rangeContainsLineRange(node.range, range));
        if (!containsAll) {
            continue;
        }
        const span = node.range.end.line - node.range.start.line;
        if (span < bestSpan) {
            bestSpan = span;
            best = { startLine: node.range.start.line, endLine: node.range.end.line };
        }
    }
    return best;
}

function findBestContainingMemberRange(ast: nodes.ThriftDocument, dirtyRange: LineRange) {
    const normalized = normalizeLineRange(dirtyRange);
    if (!normalized) {
        return null;
    }
    let best: LineRange | null = null;
    let bestSpan = Number.POSITIVE_INFINITY;
    for (const node of ast.body) {
        if (!rangeContainsLineRange(node.range, normalized)) {
            continue;
        }
        let members: Array<{ range: vscode.Range }> = [];
        if (node.type === nodes.ThriftNodeType.Struct || node.type === nodes.ThriftNodeType.Union || node.type === nodes.ThriftNodeType.Exception) {
            members = (node as nodes.Struct).fields;
        } else if (node.type === nodes.ThriftNodeType.Enum) {
            members = (node as nodes.Enum).members;
        } else if (node.type === nodes.ThriftNodeType.Service) {
            members = (node as nodes.Service).functions;
        } else {
            continue;
        }
        for (const member of members) {
            if (!rangeContainsLineRange(member.range, normalized)) {
                continue;
            }
            const span = member.range.end.line - member.range.start.line;
            if (span < bestSpan) {
                bestSpan = span;
                best = { startLine: member.range.start.line, endLine: member.range.end.line };
            }
        }
    }
    return best;
}

function findBestContainingMemberRangeForChanges(ast: nodes.ThriftDocument, dirtyRanges: LineRange[]) {
    const merged = mergeLineRanges(dirtyRanges);
    if (!merged.length) {
        return null;
    }
    let best: LineRange | null = null;
    let bestSpan = Number.POSITIVE_INFINITY;
    for (const node of ast.body) {
        const containsAll = merged.every(range => rangeContainsLineRange(node.range, range));
        if (!containsAll) {
            continue;
        }
        let members: Array<{ range: vscode.Range }> = [];
        if (node.type === nodes.ThriftNodeType.Struct || node.type === nodes.ThriftNodeType.Union || node.type === nodes.ThriftNodeType.Exception) {
            members = (node as nodes.Struct).fields;
        } else if (node.type === nodes.ThriftNodeType.Enum) {
            members = (node as nodes.Enum).members;
        } else if (node.type === nodes.ThriftNodeType.Service) {
            members = (node as nodes.Service).functions;
        } else {
            continue;
        }
        for (const member of members) {
            const memberContainsAll = merged.every(range => rangeContainsLineRange(member.range, range));
            if (!memberContainsAll) {
                continue;
            }
            const span = member.range.end.line - member.range.start.line;
            if (span < bestSpan) {
                bestSpan = span;
                best = { startLine: member.range.start.line, endLine: member.range.end.line };
            }
        }
    }
    return best;
}

function findContainingNode(ast: nodes.ThriftDocument, targetRange: LineRange) {
    const normalized = normalizeLineRange(targetRange);
    if (!normalized) {
        return null;
    }
    let best: nodes.ThriftDocument['body'][number] | null = null;
    let bestSpan = Number.POSITIVE_INFINITY;
    for (const node of ast.body) {
        if (!rangeContainsLineRange(node.range, normalized)) {
            continue;
        }
        const span = node.range.end.line - node.range.start.line;
        if (span < bestSpan) {
            bestSpan = span;
            best = node;
        }
    }
    return best;
}

function buildPartialLines(lines: string[], startLine: number, endLine: number): string[] {
    return lines.map((line, idx) => (idx >= startLine && idx <= endLine) ? line : '');
}

function createBlockCache(): BlockCache {
    return new LruCache<string, BlockCacheValue>(
        config.cache.diagnosticsBlocks.maxSize,
        config.cache.diagnosticsBlocks.ttlMs
    );
}

function createMemberCacheByBlock(): MemberCacheByBlock {
    return new LruCache<string, MemberCache>(
        config.cache.diagnosticsBlocks.maxSize,
        config.cache.diagnosticsBlocks.ttlMs
    );
}

function createMemberCache(): MemberCache {
    return new LruCache<string, MemberCacheValue>(
        config.cache.diagnosticsMembers.maxSize,
        config.cache.diagnosticsMembers.ttlMs
    );
}

function buildMemberCache(ast: nodes.ThriftDocument, lines: string[], issues: ThriftIssue[]) {
    const cache = createMemberCacheByBlock();
    for (const node of ast.body) {
        const blockKey = `${node.range.start.line}-${node.range.end.line}`;
        cache.set(blockKey, buildMemberCacheForNode(node, lines, issues));
    }
    return cache;
}

function buildMemberCacheForNode(
    node: nodes.ThriftDocument['body'][number],
    lines: string[],
    issues: ThriftIssue[]
) {
    const cache = createMemberCache();
    let members: Array<{ range: vscode.Range }> = [];
    if (node.type === nodes.ThriftNodeType.Struct || node.type === nodes.ThriftNodeType.Union || node.type === nodes.ThriftNodeType.Exception) {
        members = (node as nodes.Struct).fields;
    } else if (node.type === nodes.ThriftNodeType.Enum) {
        members = (node as nodes.Enum).members;
    } else if (node.type === nodes.ThriftNodeType.Service) {
        members = (node as nodes.Service).functions;
    }

    for (const member of members) {
        const startLine = member.range.start.line;
        const endLine = member.range.end.line;
        const memberText = lines.slice(startLine, endLine + 1).join('\n');
        const memberIssues = issues.filter(issue => rangeIntersectsLineRange(issue.range, { startLine, endLine }));
        const key = `${startLine}-${endLine}`;
        cache.set(key, {
            range: { startLine, endLine },
            hash: hashText(memberText),
            issues: memberIssues
        });
    }
    return cache;
}

function buildBlockCache(ast: nodes.ThriftDocument, lines: string[], issues: ThriftIssue[]) {
    const cache = createBlockCache();
    for (const node of ast.body) {
        const startLine = node.range.start.line;
        const endLine = node.range.end.line;
        const key = `${startLine}-${endLine}`;
        const blockText = lines.slice(startLine, endLine + 1).join('\n');
        const blockIssues = issues.filter(issue => rangeIntersectsLineRange(issue.range, { startLine, endLine }));
        cache.set(key, { hash: hashText(blockText), issues: blockIssues });
    }
    return cache;
}

function hashText(text: string): number {
    let hash = 5381;
    for (let i = 0; i < text.length; i++) {
        hash = ((hash << 5) + hash) + text.charCodeAt(i);
        hash |= 0;
    }
    return hash;
}

/**
 * 注册诊断管理器和相关事件监听器
 * @param context vscode 扩展上下文
 */
/**
 * 注册诊断能力与文件监听。
 */
export function registerDiagnostics(context: vscode.ExtensionContext, deps?: Partial<CoreDependencies>) {
    const diagnosticManager = new DiagnosticManager(deps?.errorHandler, deps?.performanceMonitor);

    // 使用 ThriftFileWatcher 监控.thrift文件变化
    const fileWatcher = deps?.fileWatcher ?? new ThriftFileWatcher();

    const diagnosticsFileWatcher = fileWatcher.createWatcher(config.filePatterns.thrift, () => {
        // 当有任何.thrift文件变化时，清除相关缓存并重新分析
        logDiagnostics(`[Diagnostics] File system watcher triggered, clearing caches and rescheduling analysis`);

        // 清除所有包含缓存
        includeTypesCache.clear();
        includeFileTimestamps.clear();
        includeFileStats.clear();

        // 重新分析所有打开的thrift文档
        vscode.workspace.textDocuments.forEach(doc => {
            if (doc.languageId === 'thrift') {
                diagnosticManager.scheduleAnalysis(doc, false, false, 'fileSystemChange');
            }
        });
    });

    context.subscriptions.push(diagnosticsFileWatcher);

    // 注册事件监听器
    context.subscriptions.push(
        // 文档打开时立即分析
        vscode.workspace.onDidOpenTextDocument(doc => {
            if (doc.languageId === 'thrift') {
                diagnosticManager.scheduleAnalysis(doc, true, false, 'documentOpen');
            }
        }),

        // 文档内容变更时延迟分析
        vscode.workspace.onDidChangeTextDocument(e => {
            if (e.document.languageId === 'thrift') {
                let dirtyLines: number | undefined;
                let includesMayChange = false;
                let dirtyRange: LineRange | undefined;
                const dirtyRanges: LineRange[] = [];
                let mergedDirtyRanges: LineRange[] | undefined;
                let structuralChange = false;
                if (config.incremental.analysisEnabled) {
                    dirtyLines = e.contentChanges.reduce((acc, change) => {
                        const affected = change.text.split('\n').length - 1;
                        const removed = change.range.end.line - change.range.start.line;
                        return acc + Math.max(affected, removed);
                    }, 0);
                    includesMayChange = e.contentChanges.some(change => {
                        if (includesKeyword(change.text)) {
                            return true;
                        }
                        try {
                            const lineText = e.document.lineAt(change.range.start.line).text;
                            return includesKeyword(lineText);
                        } catch {
                            return false;
                        }
                    });
                    for (const change of e.contentChanges) {
                        const startLine = change.range.start.line;
                        const endLine = change.range.end.line;
                        dirtyRanges.push(lineRangeFromChange(change));

                        if (startLine !== endLine || change.text.includes('\n')) {
                            structuralChange = true;
                            continue;
                        }

                        if (hasStructuralTokens(change.text)) {
                            structuralChange = true;
                            continue;
                        }

                        try {
                            const lineText = e.document.lineAt(change.range.start.line).text;
                            if (hasStructuralTokens(lineText)) {
                                structuralChange = true;
                            }
                        } catch {
                            structuralChange = true;
                        }
                    }
                    mergedDirtyRanges = mergeLineRanges(dirtyRanges);
                    dirtyRange = collapseLineRanges(mergedDirtyRanges) ?? undefined;
                }
                diagnosticManager.scheduleAnalysis(
                    e.document,
                    false,
                    false,
                    'documentChange',
                    dirtyLines,
                    includesMayChange,
                    dirtyRange,
                    structuralChange,
                    mergedDirtyRanges
                );
            }
        }),

        // 文档保存时立即分析（确保显示最新状态）
        vscode.workspace.onDidSaveTextDocument(doc => {
            if (doc.languageId === 'thrift') {
                diagnosticManager.scheduleAnalysis(doc, true, false, 'documentSave');
            }
        }),

        // 文档关闭时清理
        vscode.workspace.onDidCloseTextDocument(doc => {
            if (doc.languageId === 'thrift') {
                diagnosticManager.clearDocument(doc);
            }
        }),

        // 监听文档激活事件 - 这可能是点击文件时触发扫描的原因
        vscode.window.onDidChangeActiveTextEditor(editor => {
            if (editor && editor.document.languageId === 'thrift') {
                logDiagnostics(`[Diagnostics] Active text editor changed to: ${path.basename(editor.document.uri.fsPath)}`);
                // 延迟分析，避免立即触发
                setTimeout(() => {
                    diagnosticManager.scheduleAnalysis(editor.document, false, false, 'documentActivate');
                }, 500);
            }
        }),

        // 扩展卸载时清理
        diagnosticManager
    );

    // 初始分析活动文档
    if (vscode.window.activeTextEditor && vscode.window.activeTextEditor.document.languageId === 'thrift') {
        diagnosticManager.scheduleAnalysis(vscode.window.activeTextEditor.document, true, false, 'extensionActivate');
    }
}
