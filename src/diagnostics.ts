import * as vscode from 'vscode';
import * as path from 'path';
import {PerformanceMonitor} from './performanceMonitor';
import {ThriftFileWatcher} from '../utils/fileWatcher';
import {ErrorHandler} from '../utils/errorHandler';

export type ThriftIssue = {
    message: string;
    range: vscode.Range;
    severity: vscode.DiagnosticSeverity;
    code?: string;
};

const PRIMITIVES = new Set<string>([
    'void', 'bool', 'byte', 'i8', 'i16', 'i32', 'i64', 'double', 'string', 'binary', 'uuid', 'slist'
]);

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

// Parse a struct/union/exception field line to extract id, type and name robustly
function parseFieldSignature(codeLine: string): {
    id: number;
    typeText: string;
    name: string;
    typeStart: number;
    typeEnd: number
} | null {
    const headerRe = /^(\s*)(\d+)\s*:\s*(?:required|optional)?\s*/;
    const m = headerRe.exec(codeLine);
    if (!m) {
        return null;
    }
    const id = parseInt(m[2], 10);
    let i = m[0].length;
    const n = codeLine.length;

    // parse type until we reach whitespace followed by a valid name token, while respecting <...> and (...)
    let typeBuf = '';
    let angle = 0;
    let paren = 0;
    // skip leading spaces
    while (i < n && /\s/.test(codeLine[i])) {
        i++;
    }
    const typeStart = i;
    while (i < n) {
        const ch = codeLine[i];
        if (ch === '<') {
            angle++;
        }
        if (ch === '>') {
            angle = Math.max(0, angle - 1);
        }
        if (ch === '(') {
            paren++;
        }
        if (ch === ')') {
            paren = Math.max(0, paren - 1);
        }

        // termination: at outer level (no < or () depth) see whitespace then a name token next
        if (angle === 0 && paren === 0 && /\s/.test(ch)) {
            // peek next non-space run as potential name
            let j = i;
            while (j < n && /\s/.test(codeLine[j])) {
                j++;
            }
            const rest = codeLine.slice(j);
            const nameM = /^([A-Za-z_][A-Za-z0-9_]*)/.exec(rest);
            if (nameM) {
                // stop before the whitespace
                break;
            }
        }

        typeBuf += ch;
        i++;
    }
    const typeEnd = i; // exclusive

    // now parse field name
    while (i < n && /\s/.test(codeLine[i])) {
        i++;
    }
    const nameM = /^([A-Za-z_][A-Za-z0-9_]*)/.exec(codeLine.slice(i));
    if (!nameM) {
        return null;
    }
    const name = nameM[1];

    return {id, typeText: typeBuf.trim(), name, typeStart, typeEnd};
}

function isKnownType(typeName: string, definedTypes: Set<string>): boolean {
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
    if (/^[A-Za-z_][A-Za-z0-9_]*\.[A-Za-z_][A-Za-z0-9_]*$/.test(t)) {
        return true;
    } // namespace.Type
    if (parseContainerType(t)) {
        const inner = t.slice(t.indexOf('<') + 1, t.lastIndexOf('>'));
        const parts = splitTopLevelAngles(inner);
        return parts.every(p => isKnownType(p, definedTypes));
    }
    return false;
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

function valueMatchesType(valueRaw: string, typeText: string, definedTypes: Set<string>, kindMap: Map<string, string>): boolean {
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
        // Accept both {} and [] as set literals (be lenient for common authoring styles)
        const isBrace = v.startsWith('{') && v.endsWith('}');
        const isBracket = v.startsWith('[') && v.endsWith(']');
        if (!isBrace && !isBracket) {
            return false;
        }
        const inner = v.slice(1, -1).trim();
        if (inner.length === 0) {
            return true;
        } // allow empty set defaults: {} or []
        // heuristic: set has no ':' at top level
        const colonTopLevel = isBrace
            ? /:(?=(?:[^\{]*\{[^\}]*\})*[^\}]*$)/.test(v)
            : /:(?=(?:[^\[]*\[[^\]]*\])*[^\]]*$)/.test(v);
        return !colonTopLevel;
    }
    if (/^map<.+>$/.test(t)) {
        if (!(v.startsWith('{') && v.endsWith('}'))) {
            return false;
        }
        const inner = v.slice(1, -1).trim();
        if (inner.length === 0) {
            return true;
        } // allow empty map defaults: {}
        // heuristic: map has ':' at top level
        return /:(?=(?:[^\{]*\{[^\}]*\})*[^\}]*$)/.test(v);
    }

    // For typedefs or user types: we can't fully validate value shape here; accept quoted or simple tokens
    return true;
}

// Parse types from a Thrift file content and return a map of type names to their kinds
function parseTypesFromContent(content: string): Map<string, string> {
    const typeKind = new Map<string, string>();
    const lines = content.split('\n');

    // Strip comments for each line with block-comment awareness
    const codeLines: string[] = [];
    const state = {inBlock: false};
    for (const raw of lines) {
        codeLines.push(stripCommentsFromLine(raw, state));
    }

    const typedefDefRe = /^(\s*)typedef\s+([^\s;]+(?:\s*<[^>]+>)?)\s+([A-Za-z_][A-Za-z0-9_]*)/;
    const typeDefRe = /^(\s*)(struct|union|exception|enum|senum|service)\s+([A-Za-z_][A-Za-z0-9_]*)/;

    for (let i = 0; i < codeLines.length; i++) {
        const line = codeLines[i];
        const mTypedef = line.match(typedefDefRe);
        if (mTypedef) {
            typeKind.set(mTypedef[3], 'typedef');
            continue;
        }
        const mType = line.match(typeDefRe);
        if (mType) {
            typeKind.set(mType[3], mType[2]);
        }
    }

    return typeKind;
}

// Get included file paths from a Thrift document
async function getIncludedFiles(document: vscode.TextDocument): Promise<vscode.Uri[]> {
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
                // Invalid path, skip - this is expected for some cases
                // No need to log as error, this is normal behavior
            }
        }
    }

    return includedFiles;
}

// 包含文件类型缓存 - 避免重复分析相同文件
const includeTypesCache = new Map<string, Map<string, string>>();
const includeFileTimestamps = new Map<string, number>();
const includeFileStats = new Map<string, { mtime: number, size: number }>();
const INCLUDE_CACHE_MAX_AGE = 3 * 60 * 1000; // 3分钟缓存

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
                fileStats = {mtime: stat.mtime, size: stat.size};
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
                fileStats && cachedStats &&
                fileStats.mtime === cachedStats.mtime &&
                fileStats.size === cachedStats.size;

            if (cacheValid) {
                // 使用缓存的数据
                console.log(`[Diagnostics] Using cached types for included file: ${path.basename(includedFile.fsPath)}`);
                for (const [name, kind] of cachedTypes) {
                    if (!includedTypes.has(name)) {
                        includedTypes.set(name, kind);
                    }
                }
                continue;
            }

            console.log(`[Diagnostics] Analyzing included file: ${path.basename(includedFile.fsPath)} (cache miss)`);

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

            const types = parseTypesFromContent(text);

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
                    additionalInfo: {reason: 'includedFileAnalysis'}
                });
            }
            continue;
        }
    }

    return includedTypes;
}

// 清理包含文件缓存
function clearIncludeCache(): void {
    const now = Date.now();
    for (const [file, timestamp] of includeFileTimestamps.entries()) {
        if (now - timestamp > INCLUDE_CACHE_MAX_AGE) {
            includeTypesCache.delete(file);
            includeFileTimestamps.delete(file);
            includeFileStats.delete(file);
        }
    }
}

export function analyzeThriftText(text: string, uri?: vscode.Uri, includedTypes?: Map<string, string>): ThriftIssue[] {
    const lines = text.split('\n');
    const issues: ThriftIssue[] = [];

    // First pass: strip comments for each line with block-comment awareness
    const codeLines: string[] = [];
    const state = {inBlock: false};
    for (const raw of lines) {
        codeLines.push(stripCommentsFromLine(raw, state));
    }

    // Gather defined types in this file (from comment-stripped code) and type kind map
    const typeKind = new Map<string, string>(); // name -> kind
    const typedefDefRe = /^(\s*)typedef\s+([^\s;]+(?:\s*<[^>]+>)?)\s+([A-Za-z_][A-Za-z0-9_]*)/;
    // 支持 service 扩展父服务为命名空间形式（如 shared.SharedService 或 multi.segment.Name）
    const typeDefRe = /^(\s*)(struct|union|exception|enum|senum|service)\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s+extends\s+([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*))?/;
    const serviceExtends: Array<{ lineNo: number; parent: string; col: number }> = [];
    for (let i = 0; i < codeLines.length; i++) {
        const line = codeLines[i];
        const mTypedef = line.match(typedefDefRe);
        if (mTypedef) {
            typeKind.set(mTypedef[3], 'typedef'); // alias name
            continue;
        }
        const mType = line.match(typeDefRe);
        if (mType) {
            typeKind.set(mType[3], mType[2]);
            if (mType[2] === 'service' && mType[4]) {
                const idx = line.indexOf('extends');
                serviceExtends.push({lineNo: i, parent: mType[4], col: idx >= 0 ? idx : 0});
            }
        }
    }

    // Merge with included types if provided
    if (includedTypes) {
        for (const [name, kind] of includedTypes) {
            if (!typeKind.has(name)) {
                typeKind.set(name, kind);
            }
        }
    }

    const definedTypes = new Set<string>([...typeKind.keys()]);

    // Validate service extends
    for (const ext of serviceExtends) {
        let parentName = ext.parent;
        let parentKind = typeKind.get(parentName);

        // Handle namespaced types (e.g., shared.SharedService)
        if (!parentKind && parentName.includes('.')) {
            const baseName = parentName.split('.').pop();
            if (baseName) {
                parentKind = typeKind.get(baseName);
                parentName = baseName;
            }
        }

        if (!parentKind) {
            issues.push({
                message: `Unknown parent service '${ext.parent}' in extends`,
                range: new vscode.Range(ext.lineNo, ext.col, ext.lineNo, ext.col + 7),
                severity: vscode.DiagnosticSeverity.Error,
                code: 'service.extends.unknown'
            });
        } else if (parentKind !== 'service') {
            issues.push({
                message: `Parent type '${ext.parent}' is not a service`,
                range: new vscode.Range(ext.lineNo, ext.col, ext.lineNo, ext.col + 7),
                severity: vscode.DiagnosticSeverity.Error,
                code: 'service.extends.notService'
            });
        }
    }

    // Bracket/angle balance tracking and context
    const stack: { ch: string; line: number; char: number }[] = [];
    let braceDepth = 0;
    const typeCtxStack: string[] = [];
    let pendingTypeKind: string | null = null;
    let inFieldBlock = false; // struct/union/exception only
    let currentFieldIds = new Set<number>();

    for (let lineNo = 0; lineNo < codeLines.length; lineNo++) {
        const rawLine = lines[lineNo];
        const line = codeLines[lineNo];

        // detect start of a type declaration to attach upcoming '{'
        const tStart = line.match(typeDefRe);
        if (tStart) {
            pendingTypeKind = tStart[2];
        }

        // Track quotes to avoid counting brackets inside string literals
        let inS = false, inD = false, escaped = false;
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];

            // Handle string literal state
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

            // Only count brackets when not inside a string
            if (ch === '{' || ch === '(' || ch === '<') {
                stack.push({ch, line: lineNo, char: i});
                if (ch === '{') {
                    braceDepth++;
                    if (pendingTypeKind) {
                        typeCtxStack.push(pendingTypeKind);
                        inFieldBlock = (pendingTypeKind === 'struct' || pendingTypeKind === 'union' || pendingTypeKind === 'exception');
                        // reset field ids per block
                        if (inFieldBlock) {
                            currentFieldIds = new Set<number>();
                        }
                        pendingTypeKind = null;
                    }
                }
            } else if (ch === '}' || ch === ')' || ch === '>') {
                if (ch === '>') {
                    // Only match '>' when the stack top is '<'; otherwise ignore
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
                    const pair: Record<string, string> = {'}': '{', ')': '('};
                    if (open.ch !== pair[ch]) {
                        issues.push({
                            message: `Mismatched '${open.ch}' and '${ch}'`,
                            range: new vscode.Range(lineNo, i, lineNo, i + 1),
                            severity: vscode.DiagnosticSeverity.Error,
                            code: 'syntax.mismatched'
                        });
                    }
                    if (ch === '}') {
                        braceDepth = Math.max(0, braceDepth - 1);
                        const popped = typeCtxStack.pop();
                        if (popped && (popped === 'struct' || popped === 'union' || popped === 'exception')) {
                            inFieldBlock = false;
                        }
                    }
                }
            }
        }

        // Inside enum block: validate explicit values
        if (typeCtxStack[typeCtxStack.length - 1] === 'enum') {
            const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)(?:\s*=\s*([^,;]+))?/);
            if (m) {
                const valueRaw = (m[2] || '').trim();
                if (valueRaw) {
                    if (!isIntegerLiteral(valueRaw)) {
                        issues.push({
                            message: `Enum value must be an integer literal`,
                            range: new vscode.Range(lineNo, m.index || 0, lineNo, (m.index || 0) + (m[0]?.length || 1)),
                            severity: vscode.DiagnosticSeverity.Error,
                            code: 'enum.valueNotInteger'
                        });
                    }
                    // 移除负数限制，允许负整数作为enum值
                }
            }
        }

        // At top-level inside a struct/union/exception block: collect field issues
        if (inFieldBlock && braceDepth > 0) {
            const sig = parseFieldSignature(line);
            if (sig) {
                const {id, typeText, name, typeStart, typeEnd} = sig;
                if (currentFieldIds.has(id)) {
                    issues.push({
                        message: `Duplicate field id ${id}`,
                        range: new vscode.Range(lineNo, 0, lineNo, line.length),
                        severity: vscode.DiagnosticSeverity.Error,
                        code: 'field.duplicateId'
                    });
                } else {
                    currentFieldIds.add(id);
                }

                // Validate type known-ness (including containers)
                if (!isKnownType(typeText, definedTypes)) {
                    issues.push({
                        message: `Unknown type '${typeText}'`,
                        range: new vscode.Range(lineNo, typeStart, lineNo, typeEnd),
                        severity: vscode.DiagnosticSeverity.Error,
                        code: 'type.unknown'
                    });
                }

                // Validate default value type compatibility if present
                const def = extractDefaultValue(line);
                if (def !== null) {
                    const ok = valueMatchesType(def, typeText, definedTypes, typeKind);
                    if (!ok) {
                        issues.push({
                            message: `Default value does not match declared type`,
                            range: new vscode.Range(lineNo, 0, lineNo, line.length),
                            severity: vscode.DiagnosticSeverity.Error,
                            code: 'value.typeMismatch'
                        });
                    }
                }
            }
        }

        // Typedef validation
        const mTypedef = line.match(typedefDefRe);
        if (mTypedef) {
            const baseType = mTypedef[2].trim();
            // The base type itself must be known (resolve containers recursively)
            if (!isKnownType(baseType, definedTypes) && !PRIMITIVES.has(baseType)) {
                // compute base type range within the line: after 'typedef' keyword and spaces
                const afterTypedef = line.indexOf('typedef') + 'typedef'.length;
                let baseStart = afterTypedef;
                while (baseStart < line.length && /\s/.test(line[baseStart])) {
                    baseStart++;
                }
                const baseEnd = baseStart + (mTypedef[2] ? mTypedef[2].length : 0);
                issues.push({
                    message: `Unknown base type '${baseType}' in typedef`,
                    range: new vscode.Range(lineNo, Math.max(0, baseStart), lineNo, Math.max(baseStart, baseEnd)),
                    severity: vscode.DiagnosticSeverity.Error,
                    code: 'typedef.unknownBase'
                });
            }
        }
    }

    // Validate service methods and throws
    for (let lineNo = 0; lineNo < codeLines.length; lineNo++) {
        const line = codeLines[lineNo];
        const m = line.match(/^\s*(oneway\s+)?([A-Za-z_][A-Za-z0-9_]*)\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)(\s*throws\s*\(([^)]*)\))?/);
        if (m) {
            const isOneway = !!m[1];
            const returnType = m[2];
            const throwsPart = m[6];

            if (isOneway) {
                if (returnType !== 'void') {
                    issues.push({
                        message: `oneway methods must return void`,
                        range: new vscode.Range(lineNo, 0, lineNo, line.length),
                        severity: vscode.DiagnosticSeverity.Error,
                        code: 'service.oneway.returnNotVoid'
                    });
                }
                if (throwsPart) {
                    issues.push({
                        message: `oneway methods cannot declare throws`,
                        range: new vscode.Range(lineNo, 0, lineNo, line.length),
                        severity: vscode.DiagnosticSeverity.Error,
                        code: 'service.oneway.hasThrows'
                    });
                }
            }

            if (throwsPart) {
                const exMatches = throwsPart.split(',').map(s => s.trim()).filter(Boolean);
                for (const ex of exMatches) {
                    const mEx = ex.match(/\d+\s*:\s*([A-Za-z_][A-Za-z0-9_\.]*)\s+[A-Za-z_][A-Za-z0-9_]*/);
                    if (mEx) {
                        const exType = mEx[1].trim();
                        const base = exType.includes('.') ? exType.split('.').pop()! : exType;
                        const kind = typeKind.get(base);
                        if (!kind) {
                            issues.push({
                                message: `Unknown exception type '${exType}' in throws`,
                                range: new vscode.Range(lineNo, 0, lineNo, line.length),
                                severity: vscode.DiagnosticSeverity.Error,
                                code: 'service.throws.unknown'
                            });
                        } else if (kind !== 'exception') {
                            issues.push({
                                message: `Type '${exType}' in throws is not an exception`,
                                range: new vscode.Range(lineNo, 0, lineNo, line.length),
                                severity: vscode.DiagnosticSeverity.Error,
                                code: 'service.throws.notException'
                            });
                        }
                    }
                }
            }
        }
    }

    // Unclosed openers
    for (const open of stack) {
        issues.push({
            message: `Unclosed '${open.ch}'`,
            range: new vscode.Range(open.line, open.char, open.line, open.char + 1),
            severity: vscode.DiagnosticSeverity.Error,
            code: 'syntax.unclosed'
        });
    }

    return issues;
}

export class DiagnosticManager {
    private collection: vscode.DiagnosticCollection;
    private analysisQueue = new Map<string, NodeJS.Timeout>();
    private documentStates = new Map<string, { version: number; isAnalyzing: boolean; lastAnalysis?: number }>();
    private readonly ANALYSIS_DELAY = 300; // 300ms
    private readonly MIN_ANALYSIS_INTERVAL = 1000; // 最少1秒间隔

    // 文件依赖跟踪 - key: 文件路径, value: 依赖该文件的其他文件路径集合
    private fileDependencies = new Map<string, Set<string>>();
    // 反向依赖跟踪 - key: 文件路径, value: 该文件包含的其他文件路径集合
    private fileIncludes = new Map<string, Set<string>>();
    private errorHandler = ErrorHandler.getInstance();

    constructor() {
        this.collection = vscode.languages.createDiagnosticCollection('thrift');
    }

    public scheduleAnalysis(doc: vscode.TextDocument, immediate: boolean = false, skipDependents: boolean = false, triggerSource?: string) {
        if (doc.languageId !== 'thrift') return;

        const key = this.getDocumentKey(doc);
        const triggerInfo = triggerSource ? ` (triggered by ${triggerSource})` : '';
        console.log(`[Diagnostics] Schedule analysis for ${path.basename(doc.uri.fsPath)}, immediate=${immediate}, skipDependents=${skipDependents}${triggerInfo}`);

        // 清除之前的分析队列
        const existingTimeout = this.analysisQueue.get(key);
        if (existingTimeout) {
            clearTimeout(existingTimeout);
        }

        // 检查是否需要分析
        if (!this.shouldAnalyzeDocument(doc)) {
            console.log(`[Diagnostics] Skip analysis for ${path.basename(doc.uri.fsPath)} - shouldAnalyzeDocument returned false`);
            return;
        }

        if (immediate) {
            // 立即分析
            this.performAnalysis(doc);
        } else {
            // 延迟分析
            const timeout = setTimeout(() => {
                this.analysisQueue.delete(key);
                this.performAnalysis(doc);
            }, this.ANALYSIS_DELAY);

            this.analysisQueue.set(key, timeout);
        }

        // 如果需要分析依赖文件，延迟分析它们（避免连锁反应）
        if (!skipDependents) {
            const dependentFiles = this.getDependentFiles(key);
            if (dependentFiles.length > 0) {
                console.log(`[Diagnostics] File ${path.basename(doc.uri.fsPath)} changed, scheduling analysis for ${dependentFiles.length} dependent files${triggerInfo}`);

                // 延迟分析依赖文件，避免立即连锁反应
                setTimeout(() => {
                    for (const dependentKey of dependentFiles) {
                        const dependentDoc = vscode.workspace.textDocuments.find(d => this.getDocumentKey(d) === dependentKey);
                        if (dependentDoc && dependentDoc.languageId === 'thrift') {
                            console.log(`[Diagnostics] Scheduling analysis for dependent file: ${path.basename(dependentDoc.uri.fsPath)} (triggered by dependency change)`);
                            // 使用 skipDependents=true 避免递归分析
                            this.scheduleAnalysis(dependentDoc, false, true, 'dependency');
                        }
                    }
                }, this.ANALYSIS_DELAY * 2); // 双倍延迟
            }
        }
    }

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
            console.log(`[Diagnostics] Cleared include cache for: ${path.basename(doc.uri.fsPath)}`);
        }
    }

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

    private shouldAnalyzeDocument(doc: vscode.TextDocument): boolean {
        const key = this.getDocumentKey(doc);
        const state = this.documentStates.get(key);

        if (!state) return true;

        // 如果正在分析，跳过
        if (state.isAnalyzing) return false;

        // 如果版本没有变化，跳过
        if (state.version === doc.version) return false;

        // 检查最小分析间隔
        const now = Date.now();
        if (state.lastAnalysis && (now - state.lastAnalysis) < this.MIN_ANALYSIS_INTERVAL) {
            return false;
        }

        return true;
    }

    private async performAnalysis(doc: vscode.TextDocument) {
        const key = this.getDocumentKey(doc);
        console.log(`[Diagnostics] Starting analysis for ${path.basename(doc.uri.fsPath)}`);

        // 更新状态
        const state = this.documentStates.get(key) || {version: doc.version, isAnalyzing: false};
        state.isAnalyzing = true;
        state.version = doc.version;
        this.documentStates.set(key, state);

        try {
            // 使用性能监控包装分析过程
            await PerformanceMonitor.measureAsync(
                'Thrift诊断分析',
                async () => {
                    try {
                        // Collect types from included files
                        const includedFiles = await getIncludedFiles(doc);
                        const includedTypes = await collectIncludedTypes(doc, this.errorHandler);

                        // 跟踪文件依赖关系
                        this.trackFileDependencies(doc, includedFiles);

                        const issues = analyzeThriftText(doc.getText(), doc.uri, includedTypes);
                        const diagnostics = issues.map(i => new vscode.Diagnostic(i.range, i.message, i.severity));

                        // 原子性更新诊断信息
                        this.collection.set(doc.uri, diagnostics);

                        console.log(`文档 ${path.basename(doc.uri.fsPath)} 分析完成: ${diagnostics.length} 个问题`);
                    } catch (error) {
                        this.errorHandler.handleError(error, {
                            component: 'DiagnosticManager',
                            operation: 'analyzeDocument',
                            filePath: doc.uri.fsPath,
                            additionalInfo: {documentVersion: doc.version}
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
}

export function registerDiagnostics(context: vscode.ExtensionContext) {
    const diagnosticManager = new DiagnosticManager();

    // 使用 ThriftFileWatcher 监控.thrift文件变化
    const fileWatcher = ThriftFileWatcher.getInstance();

    const diagnosticsFileWatcher = fileWatcher.createWatcher('**/*.thrift', () => {
        // 当有任何.thrift文件变化时，清除相关缓存并重新分析
        console.log(`[Diagnostics] File system watcher triggered, clearing caches and rescheduling analysis`);

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
                diagnosticManager.scheduleAnalysis(e.document, false, false, 'documentChange');
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
                console.log(`[Diagnostics] Active text editor changed to: ${path.basename(editor.document.uri.fsPath)}`);
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