/**
 * Chunked formatting for large files.
 *
 * When a file exceeds CHUNK_THRESHOLD lines, we split along top-level block
 * boundaries (namespace, include, typedef, const, struct, enum, service, etc.)
 * and format each chunk independently. This keeps per-chunk work bounded and
 * avoids O(n^2) effects from alignment column scanning across thousands of
 * unrelated fields.
 *
 * The chunks are determined by the AST's top-level body nodes. Lines between
 * top-level nodes (comments, blank lines) are grouped with the *next* node
 * (leading context). The formatted chunks are joined with the original inter-
 * block spacing preserved (blank lines between definitions).
 */

import {ThriftFormattingOptions} from '../interfaces.types';
import {ThriftParser} from '../ast/parser';
import * as nodes from '../ast/nodes.types';

/**
 * Files shorter than this are formatted in one pass (no chunking overhead).
 * Set high because the direct path is already fast (6000 lines < 20ms).
 * Chunking adds per-chunk AST parse overhead that only pays off for very
 * large files where O(n) effects in alignment scanning compound.
 */
export const CHUNK_THRESHOLD = 10000;

interface Chunk {
    startLine: number;
    endLine: number; // inclusive
    text: string;
}

/**
 * Split content into top-level chunks using AST body node boundaries.
 * Each chunk contains exactly one top-level definition plus any leading
 * comments/blank lines that precede it.
 */
export function splitIntoChunks(content: string): Chunk[] {
    const lines = content.split('\n');
    if (lines.length <= CHUNK_THRESHOLD) {
        return [{startLine: 0, endLine: lines.length - 1, text: content}];
    }

    let ast: nodes.ThriftDocument;
    try {
        ast = new ThriftParser(content).parse();
    } catch {
        // Parse failure → single chunk fallback
        return [{startLine: 0, endLine: lines.length - 1, text: content}];
    }

    const bodyNodes = ast.body.filter(
        n => n.type !== nodes.ThriftNodeType.Invalid
    );

    if (bodyNodes.length === 0) {
        return [{startLine: 0, endLine: lines.length - 1, text: content}];
    }

    const chunks: Chunk[] = [];
    let prevEnd = -1;

    for (let i = 0; i < bodyNodes.length; i++) {
        const node = bodyNodes[i];
        const nodeEnd = node.range.end.line;

        // Leading lines (comments, blanks) between previous node end and this node start
        const chunkStart = prevEnd + 1;
        const chunkEnd = Math.max(nodeEnd, chunkStart);

        chunks.push({
            startLine: chunkStart,
            endLine: chunkEnd,
            text: lines.slice(chunkStart, chunkEnd + 1).join('\n')
        });

        prevEnd = chunkEnd;
    }

    // Trailing lines after last node (dangling comments, blank lines)
    if (prevEnd < lines.length - 1) {
        const trailingStart = prevEnd + 1;
        const trailingText = lines.slice(trailingStart).join('\n');
        if (trailingText.trim().length > 0) {
            chunks.push({
                startLine: trailingStart,
                endLine: lines.length - 1,
                text: trailingText
            });
        }
    }

    return chunks;
}

/**
 * Format content using chunked strategy.
 * Each chunk is formatted independently with `formatFn`, then reassembled.
 */
export function formatChunked(
    content: string,
    options: ThriftFormattingOptions,
    formatFn: (chunk: string, opts: ThriftFormattingOptions) => string
): string {
    const chunks = splitIntoChunks(content);

    if (chunks.length <= 1) {
        return formatFn(content, options);
    }

    const formattedChunks: string[] = [];

    for (const chunk of chunks) {
        const formatted = formatFn(chunk.text, options);
        formattedChunks.push(formatted);
    }

    return formattedChunks.join('\n');
}
