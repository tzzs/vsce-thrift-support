import * as nodes from '../ast/nodes.types';

// Simple structural check used when no AST index is available.
// Kept as a basic heuristic for standalone calls, not used in the formatter main loop.
function isServiceMethodByPattern(line: string): boolean {
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('#') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
        return false;
    }
    // A service method line has the shape: [oneway] TypeOrVoid name(...)
    if (/^\s*(?:oneway\s+)?[A-Za-z_][A-Za-z0-9_<>\s,]*\s+[A-Za-z_][A-Za-z0-9_]*\s*\(/.test(line)) {
        return true;
    }
    return false;
}

/**
 * Check whether a line matches a service method.
 * Uses AST index lookup when available (preferred in the formatter main loop).
 * Falls back to a simple structural pattern for standalone calls.
 */
export function isServiceMethodLine(
    line: string,
    lineIndex?: number,
    serviceFunctionIndex?: Map<number, nodes.ThriftFunction>
): boolean {
    if (serviceFunctionIndex !== undefined && lineIndex !== undefined) {
        return serviceFunctionIndex.has(lineIndex);
    }
    return isServiceMethodByPattern(line);
}
