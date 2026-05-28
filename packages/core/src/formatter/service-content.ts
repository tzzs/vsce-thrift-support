import {ThriftFormattingOptions} from '../interfaces.types';

type IndentProvider = (level: number, options: ThriftFormattingOptions) => string;
type ServiceMethodMatcher = (line: string, lineIndex: number) => boolean;
type SignatureNormalizer = (text: string) => string;

interface ServiceContentDeps {
    getServiceIndent: IndentProvider;
    normalizeGenericsInSignature: SignatureNormalizer;
    isServiceMethod: ServiceMethodMatcher;
}

interface ServiceContentResult {
    formattedLines: string[];
    closeService: boolean;
    annotationDepth: number;
}

/**
 * Format a line inside a service block.
 * @param line - Current line (trimmed).
 * @param serviceIndentLevel - Base indentation level for the service.
 * @param options - Formatting options.
 * @param deps - Formatting dependencies.
 * @param annotationDepth - Current annotation block nesting depth (caller-maintained).
 * @returns Formatting result with closeService flag and updated annotationDepth.
 */
export function formatServiceContentLine(
    line: string,
    lineIndex: number,
    serviceIndentLevel: number,
    options: ThriftFormattingOptions,
    deps: ServiceContentDeps,
    annotationDepth = 0
): ServiceContentResult {
    if (line === '{') {
        return {
            formattedLines: [deps.getServiceIndent(serviceIndentLevel, options) + line],
            closeService: false,
            annotationDepth
        };
    }

    // Multi-line annotation block start (e.g. @MethodMetadata{)
    if (/^\s*@[A-Za-z_][A-Za-z0-9_]*\s*\{/.test(line) && !line.includes('}')) {
        return {
            formattedLines: [deps.getServiceIndent(serviceIndentLevel + 1, options) + line],
            closeService: false,
            annotationDepth: annotationDepth + 1
        };
    }

    // Lines inside an annotation block: count net braces while skipping string
    // literals and line comments so that `key = "value with {brace}"` or
    // `// {` do not affect the tracked depth.
    if (annotationDepth > 0) {
        const newDepth = annotationDepth + countNetBraces(line);

        if (newDepth <= 0) {
            return {
                formattedLines: [deps.getServiceIndent(serviceIndentLevel + 1, options) + line],
                closeService: false,
                annotationDepth: 0
            };
        }
        return {
            formattedLines: [deps.getServiceIndent(serviceIndentLevel + 2, options) + line],
            closeService: false,
            annotationDepth: newDepth
        };
    }

    if (line.startsWith('}')) {
        return {
            formattedLines: [deps.getServiceIndent(serviceIndentLevel, options) + line],
            closeService: true,
            annotationDepth: 0
        };
    }

    if (/^\s*\d+:\s*/.test(line)) {
        const paramIndent = deps.getServiceIndent(serviceIndentLevel + 2, options);
        return {
            formattedLines: [paramIndent + line.trim()],
            closeService: false,
            annotationDepth
        };
    }

    if (deps.isServiceMethod(line, lineIndex)) {
        const normalized = deps.normalizeGenericsInSignature(line);
        const methodIndent = deps.getServiceIndent(serviceIndentLevel + 1, options);
        return {
            formattedLines: [methodIndent + normalized],
            closeService: false,
            annotationDepth
        };
    }

    if (line.trim().startsWith('/**') || line.trim().startsWith('*') || line.trim().startsWith('*/')) {
        return {
            formattedLines: [deps.getServiceIndent(serviceIndentLevel + 1, options) + line.trim()],
            closeService: false,
            annotationDepth
        };
    }

    return {
        formattedLines: [deps.getServiceIndent(serviceIndentLevel + 1, options) + line],
        closeService: false,
        annotationDepth
    };
}

/**
 * Count the net number of structural braces on a single (trimmed) line,
 * ignoring braces that appear inside string literals or after a `//` comment.
 */
function countNetBraces(line: string): number {
    let net = 0;
    let inDouble = false;
    let inSingle = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inDouble) {
            if (ch === '\\') { i++; continue; }
            if (ch === '"') { inDouble = false; }
        } else if (inSingle) {
            if (ch === '\\') { i++; continue; }
            if (ch === "'") { inSingle = false; }
        } else if (ch === '"') {
            inDouble = true;
        } else if (ch === "'") {
            inSingle = true;
        } else if (ch === '/' && line[i + 1] === '/') {
            break; // rest of line is a comment
        } else if (ch === '{') {
            net++;
        } else if (ch === '}') {
            net--;
        }
    }
    return net;
}
