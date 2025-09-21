import * as vscode from 'vscode';

export type ThriftIssue = {
    message: string;
    range: vscode.Range;
    severity: vscode.DiagnosticSeverity;
    code?: string;
};

const PRIMITIVES = new Set<string>([
    'void', 'bool', 'byte', 'i8', 'i16', 'i32', 'i64', 'double', 'string', 'binary'
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

function isKnownType(typeName: string, definedTypes: Set<string>): boolean {
    if (!typeName) return false;
    const t = typeName.trim();
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

    // Gather defined types in this file
    const definedTypes = new Set<string>();
    // Handle typedef separately so we collect the alias (new name), not the base type
    const typedefDefRe = /^(\s*)typedef\s+([^\s;]+(?:\s*<[^>]+>)?)\s+([A-Za-z_][A-Za-z0-9_]*)/;
    const typeDefRe = /^(\s*)(struct|union|exception|enum|service)\s+([A-Za-z_][A-Za-z0-9_]*)/;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
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

    for (let lineNo = 0; lineNo < lines.length; lineNo++) {
        const rawLine = lines[lineNo];
        const line = rawLine.replace(/\/\*.*?\*\//g, '').replace(/\/\/.*$/, '');

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
            // 1: required i32 id,
            const fieldMatch = rawLine.match(/^(\s*)(\d+)\s*:\s*(?:required|optional)?\s*([^\s,;]+(?:\s*<[^>]+>)?)\s+([A-Za-z_][A-Za-z0-9_]*)/);
            if (fieldMatch) {
                const id = parseInt(fieldMatch[2], 10);
                const typeText = fieldMatch[3];
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

                if (!isKnownType(typeText, definedTypes)) {
                    const typeStart = rawLine.indexOf(typeText);
                    issues.push({
                        message: `Unknown or invalid type '${typeText}'`,
                        range: new vscode.Range(lineNo, Math.max(0, typeStart), lineNo, Math.max(0, typeStart + typeText.length)),
                        severity: vscode.DiagnosticSeverity.Error,
                        code: 'type.unknown'
                    });
                }
            }
        }

        // typedef validation
        const typedefMatch = rawLine.match(/^\s*typedef\s+([^\s;]+(?:\s*<[^>]+>)?)\s+([A-Za-z_][A-Za-z0-9_]*)/);
        if (typedefMatch) {
            const baseType = typedefMatch[1].trim();
            if (!isKnownType(baseType, definedTypes)) {
                const typeStart = rawLine.indexOf(baseType);
                issues.push({
                    message: `Unknown base type '${baseType}' in typedef`,
                    range: new vscode.Range(lineNo, Math.max(0, typeStart), lineNo, Math.max(0, typeStart + baseType.length)),
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