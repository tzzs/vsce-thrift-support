import {ThriftFormattingOptions} from '../interfaces.types';

type IndentProvider = (level: number, options: ThriftFormattingOptions) => string;
type ServiceMethodMatcher = (line: string) => boolean;
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

    // Lines inside an annotation block: use net brace count to track nesting depth.
    // This correctly handles nested {} (e.g. map literals) without premature depth reduction.
    if (annotationDepth > 0) {
        const opens = (line.match(/\{/g) ?? []).length;
        const closes = (line.match(/\}/g) ?? []).length;
        const newDepth = annotationDepth + opens - closes;

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

    if (deps.isServiceMethod(line)) {
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
