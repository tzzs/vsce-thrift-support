/**
 * 输出格式化：诊断/AST/符号的文本和 JSON 输出。
 */
import type {ThriftIssue} from '@tanzz/thrift-core';
import {DiagnosticSeverity} from '@tanzz/thrift-core';

const SEVERITY_LABELS: Record<number, string> = {
    [DiagnosticSeverity.Error]: 'error',
    [DiagnosticSeverity.Warning]: 'warning',
    [DiagnosticSeverity.Information]: 'info',
    [DiagnosticSeverity.Hint]: 'hint',
};

export function formatIssuesText(filePath: string, issues: ThriftIssue[]): string {
    if (issues.length === 0) {return '';}

    const lines: string[] = [];
    for (const issue of issues) {
        const severity = SEVERITY_LABELS[issue.severity] ?? 'unknown';
        const line = issue.range.start.line + 1;
        const col = issue.range.start.character + 1;
        lines.push(`${filePath}:${line}:${col}: ${severity}: ${issue.message}${issue.code !== null && issue.code !== undefined ? ` [${issue.code}]` : ''}`);
    }
    return lines.join('\n');
}

export function formatIssuesJson(filePath: string, issues: ThriftIssue[]): object[] {
    return issues.map(issue => ({
        file: filePath,
        line: issue.range.start.line + 1,
        column: issue.range.start.character + 1,
        endLine: issue.range.end.line + 1,
        endColumn: issue.range.end.character + 1,
        severity: SEVERITY_LABELS[issue.severity] ?? 'unknown',
        message: issue.message,
        code: issue.code ?? null,
    }));
}

export interface SymbolInfo {
    name: string;
    kind: string;
    line: number;
    detail?: string;
    children?: SymbolInfo[];
}

export function formatSymbolsText(symbols: SymbolInfo[], indent: number = 0): string {
    const lines: string[] = [];
    const prefix = '  '.repeat(indent);
    for (const sym of symbols) {
        const detail = sym.detail !== null && sym.detail !== undefined ? ` ${sym.detail}` : '';
        lines.push(`${prefix}${sym.kind} ${sym.name}${detail} (line ${sym.line})`);
        if (sym.children && sym.children.length > 0) {
            lines.push(formatSymbolsText(sym.children, indent + 1));
        }
    }
    return lines.join('\n');
}
