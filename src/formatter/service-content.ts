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
}

// Module-level state for tracking annotation block depth inside service/interaction bodies.
// Reset at the start of each formatting run via resetServiceAnnotationDepth().
let serviceAnnotationDepth = 0;

export function resetServiceAnnotationDepth(): void {
    serviceAnnotationDepth = 0;
}

/**
 * Format a line inside a service block.
 * @param line - Current line (trimmed).
 * @param serviceIndentLevel - Base indentation level for the service.
 * @param options - Formatting options.
 * @param deps - Formatting dependencies.
 * @returns Formatting result with closeService flag.
 */
export function formatServiceContentLine(
    line: string,
    serviceIndentLevel: number,
    options: ThriftFormattingOptions,
    deps: ServiceContentDeps
): ServiceContentResult {
    if (line === '{') {
        return {
            formattedLines: [deps.getServiceIndent(serviceIndentLevel, options) + line],
            closeService: false
        };
    }

    // Multi-line annotation block start (e.g. @MethodMetadata{)
    if (/^\s*@[A-Za-z_][A-Za-z0-9_]*\s*\{/.test(line) && !line.includes('}')) {
        serviceAnnotationDepth++;
        return {
            formattedLines: [deps.getServiceIndent(serviceIndentLevel + 1, options) + line],
            closeService: false
        };
    }

    // Lines inside an annotation block should be indented one extra level
    if (serviceAnnotationDepth > 0) {
        if (line.startsWith('}')) {
            serviceAnnotationDepth--;
            return {
                formattedLines: [deps.getServiceIndent(serviceIndentLevel + 1, options) + line],
                closeService: false
            };
        }
        return {
            formattedLines: [deps.getServiceIndent(serviceIndentLevel + 2, options) + line],
            closeService: false
        };
    }

    if (line.startsWith('}')) {
        return {
            formattedLines: [deps.getServiceIndent(serviceIndentLevel, options) + line],
            closeService: true
        };
    }

    if (/^\s*\d+:\s*/.test(line)) {
        const paramIndent = deps.getServiceIndent(serviceIndentLevel + 2, options);
        return {
            formattedLines: [paramIndent + line.trim()],
            closeService: false
        };
    }

    if (deps.isServiceMethod(line)) {
        const normalized = deps.normalizeGenericsInSignature(line);
        const methodIndent = deps.getServiceIndent(serviceIndentLevel + 1, options);
        return {
            formattedLines: [methodIndent + normalized],
            closeService: false
        };
    }

    if (line.trim().startsWith('/**') || line.trim().startsWith('*') || line.trim().startsWith('*/')) {
        return {
            formattedLines: [deps.getServiceIndent(serviceIndentLevel + 1, options) + line.trim()],
            closeService: false
        };
    }

    return {
        formattedLines: [deps.getServiceIndent(serviceIndentLevel + 1, options) + line],
        closeService: false
    };
}
