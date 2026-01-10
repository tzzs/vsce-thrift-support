import * as vscode from 'vscode';

/**
 * Normalize a formatting range to full lines.
 * @param document - Source document.
 * @param range - Raw formatting range.
 * @returns Normalized range aligned to full lines.
 */
export function normalizeFormattingRange(
    document: vscode.TextDocument,
    range: vscode.Range
): vscode.Range {
    const totalLines = typeof document.lineCount === 'number'
        ? document.lineCount
        : document.getText().split('\n').length;
    const lastLine = Math.max(0, totalLines - 1);
    const startLine = Math.min(Math.max(range.start.line, 0), lastLine);
    const endLine = Math.min(Math.max(range.end.line, startLine), lastLine);
    const start = new vscode.Position(startLine, 0);
    const endLineText = document.lineAt(endLine).text;
    const end = new vscode.Position(endLine, endLineText.length);
    return new vscode.Range(start, end);
}

/**
 * Build minimal text edits by trimming common prefix/suffix.
 * @param document - Source document.
 * @param range - Formatting range.
 * @param originalText - Original text in range.
 * @param formattedText - Formatted text in range.
 * @returns Text edits for minimal replacement.
 */
export function buildMinimalEdits(
    document: vscode.TextDocument,
    range: vscode.Range,
    originalText: string,
    formattedText: string
): vscode.TextEdit[] {
    if (originalText === formattedText) {
        return [];
    }

    let prefix = 0;
    const maxPrefix = Math.min(originalText.length, formattedText.length);
    while (prefix < maxPrefix && originalText[prefix] === formattedText[prefix]) {
        prefix += 1;
    }

    let suffix = 0;
    const maxSuffix = Math.min(
        originalText.length - prefix,
        formattedText.length - prefix
    );
    while (
        suffix < maxSuffix &&
        originalText[originalText.length - 1 - suffix] === formattedText[formattedText.length - 1 - suffix]
        ) {
        suffix += 1;
    }

    const rangeStartOffset = getOffsetAt(document, range.start);
    const replaceStartOffset = rangeStartOffset + prefix;
    const replaceEndOffset = rangeStartOffset + (originalText.length - suffix);
    const replacement = formattedText.substring(prefix, formattedText.length - suffix);

    const start = document.positionAt(replaceStartOffset);
    const end = document.positionAt(replaceEndOffset);
    return [vscode.TextEdit.replace(new vscode.Range(start, end), replacement)];
}

function getOffsetAt(document: vscode.TextDocument, position: vscode.Position): number {
    const docAny = document as vscode.TextDocument & { offsetAt?: (pos: vscode.Position) => number };
    if (typeof docAny.offsetAt === 'function') {
        return docAny.offsetAt(position);
    }
    const start = new vscode.Position(0, 0);
    return document.getText(new vscode.Range(start, position)).length;
}
