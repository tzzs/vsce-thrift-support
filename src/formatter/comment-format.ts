import {ThriftFormattingOptions} from '../interfaces.types';

type IndentProvider = (level: number, options: ThriftFormattingOptions) => string;

interface CommentFormatDeps {
    getIndent: IndentProvider;
    getServiceIndent: IndentProvider;
}

interface BlockCommentResult {
    formattedLines: string[];
    endIndex: number;
}

/**
 * Format a block comment starting at the given index.
 * @param lines - Full document lines.
 * @param startIndex - Index where the block comment starts.
 * @param indentLevel - Current indentation level.
 * @param inService - Whether the formatter is inside a service block.
 * @param serviceIndentLevel - Base indentation level for service blocks.
 * @param options - Formatting options.
 * @param deps - Formatting dependencies.
 * @returns Formatted block comment lines and the last index consumed, or null if not a block comment.
 */
export function formatBlockComment(
    lines: string[],
    startIndex: number,
    indentLevel: number,
    inService: boolean,
    serviceIndentLevel: number,
    options: ThriftFormattingOptions,
    deps: CommentFormatDeps
): BlockCommentResult | null {
    const originalLine = lines[startIndex];
    const line = originalLine.trim();
    if (!line.startsWith('/*')) {
        return null;
    }

    const commentLines: string[] = [originalLine];
    let j = startIndex + 1;
    let closed = line.includes('*/');
    while (!closed && j < lines.length) {
        commentLines.push(lines[j]);
        if (lines[j].includes('*/')) {
            closed = true;
        }
        j++;
    }

    const indentStr = inService
        ? deps.getServiceIndent(serviceIndentLevel + 1, options)
        : deps.getIndent(indentLevel, options);

    if (commentLines.length === 1) {
        return {
            formattedLines: [indentStr + line],
            endIndex: startIndex
        };
    }

    const formattedLines: string[] = [];
    const openTrim = commentLines[0].trim();
    const openIsDoc = openTrim.startsWith('/**');
    const openToken = openIsDoc ? '/**' : '/*';
    const openRest = openTrim.slice(openToken.length);
    formattedLines.push(indentStr + openToken + openRest);

    for (let k = 1; k < commentLines.length - 1; k++) {
        let mid = commentLines[k].trim();
        if (mid.startsWith('*')) {
            mid = mid.slice(1);
        }
        mid = mid.replace(/^\s*/, '');
        const alignmentSpace = ' ';
        if (mid.length > 0) {
            formattedLines.push(indentStr + alignmentSpace + '* ' + mid);
        } else {
            formattedLines.push(indentStr + alignmentSpace + '*');
        }
    }

    const closingSpace = ' ';
    formattedLines.push(indentStr + closingSpace + '*/');

    return {
        formattedLines,
        endIndex: j - 1
    };
}
