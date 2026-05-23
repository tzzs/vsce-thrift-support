"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatServiceContentLine = void 0;
function formatServiceContentLine(line, serviceIndentLevel, options, deps, annotationDepth = 0) {
    if (line === '{') {
        return {
            formattedLines: [deps.getServiceIndent(serviceIndentLevel, options) + line],
            closeService: false,
            annotationDepth
        };
    }
    if (/^\s*@[A-Za-z_][A-Za-z0-9_]*\s*\{/.test(line) && !line.includes('}')) {
        return {
            formattedLines: [deps.getServiceIndent(serviceIndentLevel + 1, options) + line],
            closeService: false,
            annotationDepth: annotationDepth + 1
        };
    }
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
exports.formatServiceContentLine = formatServiceContentLine;
function countNetBraces(line) {
    let net = 0;
    let inDouble = false;
    let inSingle = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inDouble) {
            if (ch === '\\') {
                i++;
                continue;
            }
            if (ch === '"') {
                inDouble = false;
            }
        }
        else if (inSingle) {
            if (ch === '\\') {
                i++;
                continue;
            }
            if (ch === "'") {
                inSingle = false;
            }
        }
        else if (ch === '"') {
            inDouble = true;
        }
        else if (ch === "'") {
            inSingle = true;
        }
        else if (ch === '/' && line[i + 1] === '/') {
            break;
        }
        else if (ch === '{') {
            net++;
        }
        else if (ch === '}') {
            net--;
        }
    }
    return net;
}
//# sourceMappingURL=service-content.js.map