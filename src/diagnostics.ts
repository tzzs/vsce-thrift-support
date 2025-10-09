import * as vscode from 'vscode';
import * as path from 'path';

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
    return /^-?\d+$/.test(t) || /^-?0x[0-9a-fA-F]+$/.test(t);
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
        if (ch === '<') {depth++;}
        if (ch === '>') {depth = Math.max(0, depth - 1);}
        if (ch === ',' && depth === 0) {
            parts.push(buf);
            buf = '';
        } else {
            buf += ch;
        }
    }
    if (buf) {parts.push(buf);}
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
                if (ch === '"' && !inSingle) { inDouble = !inDouble; }
                else if (ch === '\'' && !inDouble) { inSingle = !inSingle; }
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
            if (ch === '"') {inD = !inD;} else {inS = !inS;}
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
        if (!inS && !inD && ch === '/' && next === '/') {
            break; // ignore rest of the line
        }

        out += ch;
        i++;
    }
    return out;
}

// Parse a struct/union/exception field line to extract id, type and name robustly
function parseFieldSignature(codeLine: string): { id: number; typeText: string; name: string; typeStart: number; typeEnd: number } | null {
    const headerRe = /^(\s*)(\d+)\s*:\s*(?:required|optional)?\s*/;
    const m = headerRe.exec(codeLine);
    if (!m) {return null;}
    const id = parseInt(m[2], 10);
    let i = m[0].length;
    const n = codeLine.length;

    // parse type until we reach whitespace followed by a valid name token, while respecting <...> and (...)
    let typeBuf = '';
    let angle = 0;
    let paren = 0;
    // skip leading spaces
    while (i < n && /\s/.test(codeLine[i])) {i++;}
    const typeStart = i;
    while (i < n) {
        const ch = codeLine[i];
        if (ch === '<') {angle++;}
        if (ch === '>') {angle = Math.max(0, angle - 1);}
        if (ch === '(') {paren++;}
        if (ch === ')') {paren = Math.max(0, paren - 1);}

        // termination: at outer level (no < or () depth) see whitespace then a name token next
        if (angle === 0 && paren === 0 && /\s/.test(ch)) {
            // peek next non-space run as potential name
            let j = i;
            while (j < n && /\s/.test(codeLine[j])) {j++;}
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
    while (i < n && /\s/.test(codeLine[i])) {i++;}
    const nameM = /^([A-Za-z_][A-Za-z0-9_]*)/.exec(codeLine.slice(i));
    if (!nameM) {return null;}
    const name = nameM[1];

    return { id, typeText: typeBuf.trim(), name, typeStart, typeEnd };
}

function isKnownType(typeName: string, definedTypes: Set<string>): boolean {
    if (!typeName) {return false;}
    const t = stripTypeAnnotations(typeName).trim();
    if (PRIMITIVES.has(t)) {return true;}
    if (definedTypes.has(t)) {return true;}
    if (/^[A-Za-z_][A-Za-z0-9_]*\.[A-Za-z_][A-Za-z0-9_]*$/.test(t)) {return true;} // namespace.Type
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
            if (!escaped && ch === '\\') { escaped = true; continue; }
            if (!escaped && ch === '\'') {inS = false;}
            escaped = false;
            continue;
        }
        if (inD) {
            if (!escaped && ch === '\\') { escaped = true; continue; }
            if (!escaped && ch === '"') {inD = false;}
            escaped = false;
            continue;
        }
        if (ch === '\'') { inS = true; continue; }
        if (ch === '"') { inD = true; continue; }
        if (ch === '<') {depthAngle++;}
        else if (ch === '>') {depthAngle = Math.max(0, depthAngle - 1);}
        else if (ch === '[') {depthBracket++;}
        else if (ch === ']') {depthBracket = Math.max(0, depthBracket - 1);}
        else if (ch === '{') {depthBrace++;}
        else if (ch === '}') {depthBrace = Math.max(0, depthBrace - 1);}
        else if (ch === '(') {depthParen++;}
        else if (ch === ')') {depthParen = Math.max(0, depthParen - 1);}
        else if (ch === '=' && depthAngle === 0 && depthBracket === 0 && depthBrace === 0 && depthParen === 0) {
            eq = i;
            break;
        }
    }
    if (eq === -1) {return null;}

    // Capture value until a top-level comma/semicolon or annotation start '(' is reached
    let i = eq + 1;
    depthAngle = depthBracket = depthBrace = depthParen = 0;
    inS = inD = false; escaped = false;
    let buf = '';
    const n = codeLine.length;
    while (i < n) {
        const ch = codeLine[i];
        if (inS) {
            buf += ch;
            if (!escaped && ch === '\\') { escaped = true; i++; continue; }
            if (!escaped && ch === '\'') {inS = false;}
            escaped = false;
            i++;
            continue;
        }
        if (inD) {
            buf += ch;
            if (!escaped && ch === '\\') { escaped = true; i++; continue; }
            if (!escaped && ch === '"') {inD = false;}
            escaped = false;
            i++;
            continue;
        }
        if (ch === '\'') { inS = true; buf += ch; i++; continue; }
        if (ch === '"') { inD = true; buf += ch; i++; continue; }

        if (ch === '<') {depthAngle++;}
        else if (ch === '>') {depthAngle = Math.max(0, depthAngle - 1);}
        else if (ch === '[') {depthBracket++;}
        else if (ch === ']') {depthBracket = Math.max(0, depthBracket - 1);}
        else if (ch === '{') {depthBrace++;}
        else if (ch === '}') {depthBrace = Math.max(0, depthBrace - 1);}
        else if (ch === '(' && depthAngle === 0 && depthBracket === 0 && depthBrace === 0 && depthParen === 0) {
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
        if (!isQuotedString(v)) {return false;}
        const inner = v.slice(1, -1);
        return uuidRegex.test(inner);
    }
    if (/^list<.+>$/.test(t)) {
        if (!(v.startsWith('[') && v.endsWith(']'))) {return false;}
        const inner = v.slice(1, -1).trim();
        if (inner.length === 0) {return true;} // allow empty list defaults: []
        return true; // content validation is out of scope here
    }
    if (/^set<.+>$/.test(t)) {
        // Accept both {} and [] as set literals (be lenient for common authoring styles)
        const isBrace = v.startsWith('{') && v.endsWith('}');
        const isBracket = v.startsWith('[') && v.endsWith(']');
        if (!isBrace && !isBracket) {return false;}
        const inner = v.slice(1, -1).trim();
        if (inner.length === 0) {return true;} // allow empty set defaults: {} or []
        // heuristic: set has no ':' at top level
        const colonTopLevel = isBrace
            ? /:(?=(?:[^\{]*\{[^\}]*\})*[^\}]*$)/.test(v)
            : /:(?=(?:[^\[]*\[[^\]]*\])*[^\]]*$)/.test(v);
        return !colonTopLevel;
    }
    if (/^map<.+>$/.test(t)) {
        if (!(v.startsWith('{') && v.endsWith('}'))) {return false;}
        const inner = v.slice(1, -1).trim();
        if (inner.length === 0) {return true;} // allow empty map defaults: {}
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
    const state = { inBlock: false };
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
                // Invalid path, skip
            }
        }
    }

    return includedFiles;
}

// Collect types from all included files
async function collectIncludedTypes(document: vscode.TextDocument): Promise<Map<string, string>> {
    const includedTypes = new Map<string, string>();
    const includedFiles = await getIncludedFiles(document);

    for (const includedFile of includedFiles) {
        try {
            const includedDocument = await vscode.workspace.openTextDocument(includedFile);
            const types = parseTypesFromContent(includedDocument.getText());

            // Add types from this included file
            for (const [name, kind] of types) {
                if (!includedTypes.has(name)) {
                    includedTypes.set(name, kind);
                }
            }
        } catch (error) {
            // File might not exist or be accessible, skip
            continue;
        }
    }

    return includedTypes;
}

export function analyzeThriftText(text: string, uri?: vscode.Uri, includedTypes?: Map<string, string>): ThriftIssue[] {
    const lines = text.split('\n');
    const issues: ThriftIssue[] = [];

    // First pass: strip comments for each line with block-comment awareness
    const codeLines: string[] = [];
    const state = { inBlock: false };
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
                serviceExtends.push({ lineNo: i, parent: mType[4], col: idx >= 0 ? idx : 0 });
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
                if (!escaped && ch === '\\') { escaped = true; continue; }
                if (!escaped && ch === '\'') { inS = false; }
                escaped = false;
                continue;
            }
            if (inD) {
                if (!escaped && ch === '\\') { escaped = true; continue; }
                if (!escaped && ch === '"') { inD = false; }
                escaped = false;
                continue;
            }
            if (ch === '\'') { inS = true; continue; }
            if (ch === '"') { inD = true; continue; }

            // Only count brackets when not inside a string
            if (ch === '{' || ch === '(' || ch === '<') {
                stack.push({ ch, line: lineNo, char: i });
                if (ch === '{') {
                    braceDepth++;
                    if (pendingTypeKind) {
                        typeCtxStack.push(pendingTypeKind);
                        inFieldBlock = (pendingTypeKind === 'struct' || pendingTypeKind === 'union' || pendingTypeKind === 'exception');
                        // reset field ids per block
                        if (inFieldBlock) {currentFieldIds = new Set<number>();}
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
                    const pair: Record<string, string> = { '}': '{', ')': '(' };
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
                    } else if (/^-/.test(valueRaw)) {
                        issues.push({
                            message: `Enum value must be non-negative`,
                            range: new vscode.Range(lineNo, m.index || 0, lineNo, (m.index || 0) + (m[0]?.length || 1)),
                            severity: vscode.DiagnosticSeverity.Error,
                            code: 'enum.negativeValue'
                        });
                    }
                }
            }
        }

        // At top-level inside a struct/union/exception block: collect field issues
        if (inFieldBlock && braceDepth > 0) {
            const sig = parseFieldSignature(line);
            if (sig) {
                const { id, typeText, name, typeStart, typeEnd } = sig;
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
                while (baseStart < line.length && /\s/.test(line[baseStart])) {baseStart++;}
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

export function registerDiagnostics(context: vscode.ExtensionContext) {
    const collection = vscode.languages.createDiagnosticCollection('thrift');

    async function analyzeDocument(doc: vscode.TextDocument) {
        if (doc.languageId !== 'thrift') {return;}

        // Collect types from included files
        const includedTypes = await collectIncludedTypes(doc);
        const issues = analyzeThriftText(doc.getText(), doc.uri, includedTypes);
        const diagnostics = issues.map(i => new vscode.Diagnostic(i.range, i.message, i.severity));
        collection.set(doc.uri, diagnostics);
    }

    // Initial pass
    if (vscode.window.activeTextEditor) {
        analyzeDocument(vscode.window.activeTextEditor.document);
    }

    context.subscriptions.push(
        vscode.workspace.onDidOpenTextDocument(doc => analyzeDocument(doc)),
        vscode.workspace.onDidChangeTextDocument(e => analyzeDocument(e.document)),
        vscode.workspace.onDidSaveTextDocument(doc => analyzeDocument(doc)),
        vscode.workspace.onDidCloseTextDocument(doc => collection.delete(doc.uri))
    );
}