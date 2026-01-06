import { ThriftFormattingOptions } from '../interfaces.types';

/**
 * Build indentation string for the given level.
 * @param level - Indent depth.
 * @param options - Formatting options.
 * @returns Indentation string.
 */
export function getIndent(level: number, options: ThriftFormattingOptions): string {
    const indentSize = options.indentSize || 2;
    if (options.insertSpaces) {
        return ' '.repeat(level * indentSize);
    }
    return '\t'.repeat(level);
}

/**
 * Build indentation string for service formatting.
 * @param level - Indent depth.
 * @param options - Formatting options.
 * @returns Indentation string.
 */
export function getServiceIndent(level: number, options: ThriftFormattingOptions): string {
    return getIndent(level, options);
}
