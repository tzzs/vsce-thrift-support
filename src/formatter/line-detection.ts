/**
 * Check if a line starts a struct/union/exception definition.
 * @param line - Raw line content.
 * @returns True when the line opens a struct-like block.
 */
export function isStructStartLine(line: string): boolean {
    return /^(struct|union|exception)\b/.test(line) && line.includes('{') && !line.includes('}');
}

/**
 * Check if a line starts an enum definition.
 * @param line - Raw line content.
 * @returns True when the line opens an enum block.
 */
export function isEnumStartLine(line: string): boolean {
    return /^(enum|senum)\b/.test(line) && line.includes('{') && !line.includes('}');
}

/**
 * Check if a line starts a service definition.
 * @param line - Raw line content.
 * @returns True when the line opens a service block.
 */
export function isServiceStartLine(line: string): boolean {
    return /^service\b/.test(line) && line.includes('{') && !line.includes('}');
}
