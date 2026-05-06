/**
 * Check whether a line matches a service method signature.
 * @param line - Line to test.
 * @returns True when the line matches a service method signature.
 */
export function isServiceMethodLine(line: string): boolean {
    return /^\s*(oneway\s+)?[A-Za-z_][A-Za-z0-9_]*(?:\s*<[^>]*>)?\s+[A-Za-z_][A-Za-z0-9_]*\s*\([^)]*\)(\s*throws\s*\([^)]*\))?\s*[;,]?$/.test(line);
}
