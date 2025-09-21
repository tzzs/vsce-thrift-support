import * as vscode from 'vscode';

export type ThriftIssue = {
    message: string;
    range: vscode.Range;
    severity: vscode.DiagnosticSeverity;
    code?: string;
};

const PRIMITIVES = new Set<string>([
    'void', 'bool', 'byte', 'i8', 'i16', 'i32', 'i64', 'double', 'string', 'binary', 'uuid'
]);

function parseContainerType(typeText: string): boolean {
    const t = typeText.replace(/\s+/g, '');
    if (/^list<.+>$/.test(t)) return true;
    if (/^set<.+>$/.test(t)) return true;
    if (/^map<[^,]+,[^>]+>$/.test(t)) return true;
    return false;
}

function splitTopLevelAngles(typeInner: string): string[] {
    const parts: string[] = [];
    let buf = '';
    let depth = 0;
    for (let i = 0; i < typeInner.length; i++) {
        const ch = typeInner[i];
        if (ch === '<') depth++;
        if (ch === '>') depth = Math.max(0, depth - 1);
        if (ch === ',' && depth === 0) {
            parts.push(buf);
            buf = '';
        } else {
            buf += ch;
        }
    }
    if (buf) parts.push(buf);
    return parts.map(s => s.trim()).filter(Boolean);
}

// Strip Thrift type annotations like `(python.immutable = "")` that can appear after types
function stripTypeAnnotations(typeText: string): string {
    // Remove any parenthesized annotation segments (not nested in Thrift)
    return typeText.replace(/\([^()]*\)/g, '').trim();
}

// Remove comments from a single line while tracking multi-line block comment state
function stripCommentsFromLine(rawLine: string, state: { inBlock: boolean }): string {
    let out = '';
    for (let i = 0; i < rawLine.length; ) {
        if (!state.inBlock && rawLine[i] === '/' && i + 1 < rawLine.length && rawLine[i + 1] === '*') {
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
        if (!state.inBlock && rawLine[i] === '/' && i + 1 < rawLine.length && rawLine[i + 1] === '/') {
            // line comment start -> ignore rest
            break;
        }
        out += rawLine[i++];
    }
    return out;
}

// Parse a struct/union/exception field line to extract id, type and name robustly
function parseFieldSignature(codeLine: string): { id: number; typeText: string; name: string } | null {
    const headerRe = /^(\s*)(\d+)\s*:\s*(?:required|optional)?\s*/;
    const m = headerRe.exec(codeLine);
    if (!m) return null;
    const id = parseInt(m[2], 10);
    let i = m[0].length;
    const n = codeLine.length;

    // parse type until we reach whitespace followed by a valid name token, while respecting <...> and (...)
    let typeBuf = '';
    let angle = 0;
    let paren = 0;
    // skip leading spaces
    while (i < n && /\s/.test(codeLine[i])) i++;
    while (i < n) {
        const ch = codeLine[i];
        if (ch === '<') angle++;
        if (ch === '>') angle = Math.max(0, angle - 1);
        if (ch === '(') paren++;
        if (ch === ')') paren = Math.max(0, paren - 1);

        // termination: at outer level (no < or () depth) see whitespace then a name token next
        if (angle === 0 && paren === 0 && /\s/.test(ch)) {
            // peek next non-space run as potential name
            let j = i;
            while (j < n && /\s/.test(codeLine[j])) j++;
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

    // now parse field name
    while (i < n && /\s/.test(codeLine[i])) i++;
    const nameM = /^([A-Za-z_][A-Za-z0-9_]*)/.exec(codeLine.slice(i));
    if (!nameM) return null;
    const name = nameM[1];

    return { id, typeText: typeBuf.trim(), name };
}

function isKnownType(typeName: string, definedTypes: Set<string>): boolean {
    if (!typeName) return false;
    const t = stripTypeAnnotations(typeName).trim();
    if (PRIMITIVES.has(t)) return true;
    if (definedTypes.has(t)) return true;
    if (/^[A-Za-z_][A-Za-z0-9_]*\.[A-Za-z_][A-Za-z0-9_]*$/.test(t)) return true; // namespace.Type
    if (parseContainerType(t)) {
        const inner = t.slice(t.indexOf('<') + 1, t.lastIndexOf('>'));
        const parts = splitTopLevelAngles(inner);
        return parts.every(p => isKnownType(p, definedTypes));
    }
    return false;
}

export function analyzeThriftText(text: string, uri?: vscode.Uri): ThriftIssue[] {
    const lines = text.split('\n');
    const issues: ThriftIssue[] = [];

    // First pass: strip comments for each line with block-comment awareness
    const codeLines: string[] = [];
    const state = { inBlock: false };
    for (const raw of lines) {
        codeLines.push(stripCommentsFromLine(raw, state));
    }

    // Gather defined types in this file (from comment-stripped code)
    const definedTypes = new Set<string>();
    // Handle typedef separately so we collect the alias (new name), not the base type
    const typedefDefRe = /^(\s*)typedef\s+([^\s;]+(?:\s*<[^>]+>)?)\s+([A-Za-z_][A-Za-z0-9_]*)/;
    const typeDefRe = /^(\s*)(struct|union|exception|enum|service)\s+([A-Za-z_][A-Za-z0-9_]*)/;
    for (let i = 0; i < codeLines.length; i++) {
        const line = codeLines[i];
        const mTypedef = line.match(typedefDefRe);
        if (mTypedef) {
            definedTypes.add(mTypedef[3]); // alias name
            continue;
        }
        const mType = line.match(typeDefRe);
        if (mType) {
            definedTypes.add(mType[3]);
        }
    }

    // Bracket/angle balance tracking and duplicate field id detection
    const stack: { ch: string; line: number; char: number }[] = [];
    let inTypeBlock = false;
    let currentFieldIds = new Set<number>();

    for (let lineNo = 0; lineNo < codeLines.length; lineNo++) {
        const rawLine = lines[lineNo];
        const line = codeLines[lineNo];

        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '{' || ch === '(' || ch === '<') {
                stack.push({ ch, line: lineNo, char: i });
                if (ch === '{') {
                    if (!inTypeBlock) {
                        inTypeBlock = true;
                        currentFieldIds = new Set<number>();
                    }
                }
            } else if (ch === '}' || ch === ')' || ch === '>') {
                const open = stack.pop();
                if (!open) {
                    issues.push({
                        message: `Unmatched closing '${ch}'`,
                        range: new vscode.Range(lineNo, i, lineNo, i + 1),
                        severity: vscode.DiagnosticSeverity.Error,
                        code: 'syntax.unmatchedCloser'
                    });
                } else {
                    const pair: Record<string, string> = { '}': '{', ')': '(', '>': '<' };
                    if (open.ch !== pair[ch]) {
                        issues.push({
                            message: `Mismatched '${open.ch}' and '${ch}'`,
                            range: new vscode.Range(lineNo, i, lineNo, i + 1),
                            severity: vscode.DiagnosticSeverity.Error,
                            code: 'syntax.mismatched'
                        });
                    }
                    if (ch === '}') {
                        inTypeBlock = false;
                    }
                }
            }
        }

        if (inTypeBlock) {
            const parsed = parseFieldSignature(line);
            if (parsed) {
                const { id, typeText } = parsed;
                if (currentFieldIds.has(id)) {
                    issues.push({
                        message: `Duplicate field id ${id}`,
                        range: new vscode.Range(lineNo, 0, lineNo, rawLine.length),
                        severity: vscode.DiagnosticSeverity.Error,
                        code: 'field.duplicateId'
                    });
                } else {
                    currentFieldIds.add(id);
                }

                const cleanType = stripTypeAnnotations(typeText);
                if (!isKnownType(cleanType, definedTypes)) {
                    const typeStart = Math.max(0, rawLine.indexOf(typeText));
                    issues.push({
                        message: `Unknown or invalid type '${typeText}'`,
                        range: new vscode.Range(lineNo, typeStart, lineNo, Math.max(typeStart, typeStart + typeText.length)),
                        severity: vscode.DiagnosticSeverity.Error,
                        code: 'type.unknown'
                    });
                }
            }
        }

        // typedef validation
        const typedefMatch = line.match(/^\s*typedef\s+([^\s;]+(?:\s*<[^>]+>)?)\s+([A-Za-z_][A-Za-z0-9_]*)/);
        if (typedefMatch) {
            const baseTypeRaw = typedefMatch[1].trim();
            const baseType = stripTypeAnnotations(baseTypeRaw);
            if (!isKnownType(baseType, definedTypes)) {
                const typeStart = Math.max(0, rawLine.indexOf(baseTypeRaw));
                issues.push({
                    message: `Unknown base type '${baseTypeRaw}' in typedef`,
                    range: new vscode.Range(lineNo, typeStart, lineNo, Math.max(typeStart, typeStart + baseTypeRaw.length)),
                    severity: vscode.DiagnosticSeverity.Error,
                    code: 'typedef.unknownBase'
                });
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
    context.subscriptions.push(collection);

    const analyzeAndPublish = (doc: vscode.TextDocument) => {
        if (doc.languageId !== 'thrift') return;
        const issues = analyzeThriftText(doc.getText(), doc.uri);
        const diagnostics = issues.map(iss => {
            const d = new vscode.Diagnostic(iss.range, iss.message, iss.severity);
            d.source = 'thrift';
            if (iss.code) d.code = iss.code;
            return d;
        });
        collection.set(doc.uri, diagnostics);
    };

    // Analyze already-open Thrift documents
    vscode.workspace.textDocuments.forEach(doc => analyzeAndPublish(doc));

    // Analyze the active editor document (in case it wasn't in textDocuments yet)
    const active = vscode.window?.activeTextEditor?.document;
    if (active) {
        analyzeAndPublish(active);
    }

    // Re-analyze on open/change and clear on close
    context.subscriptions.push(
        vscode.workspace.onDidOpenTextDocument(doc => analyzeAndPublish(doc))
    );
    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument(e => analyzeAndPublish(e.document))
    );
    context.subscriptions.push(
        vscode.workspace.onDidCloseTextDocument(doc => {
            if (doc.languageId === 'thrift') {
                collection.delete(doc.uri);
            }
        })
    );
}