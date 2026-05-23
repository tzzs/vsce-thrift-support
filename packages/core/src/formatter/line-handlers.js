"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatOpenBraceLine = exports.formatTypedefLine = exports.handleConstStartLine = exports.formatSkippedLine = exports.flushConstBlockIfNeeded = exports.flushStructFieldsIfNeeded = void 0;
function flushStructFieldsIfNeeded(inStruct, structFields, line, lineIndex, structFieldIndex, indentLevel, options, deps) {
    if (!inStruct || structFields.length === 0) {
        return { structFields, formattedLines: [], flushed: false };
    }
    const hasStructField = structFieldIndex.has(lineIndex) || deps.isStructFieldText(line);
    if (!hasStructField && !line.startsWith('}')) {
        const formattedLines = deps.formatStructFields(structFields, options, indentLevel);
        return { structFields: [], formattedLines, flushed: true };
    }
    return { structFields, formattedLines: [], flushed: false };
}
exports.flushStructFieldsIfNeeded = flushStructFieldsIfNeeded;
function flushConstBlockIfNeeded(inConstBlock, constFields, isConstStart, constBlockIndentLevel, indentLevel, options, deps) {
    if (inConstBlock && constFields.length > 0 && !isConstStart) {
        const formattedLines = deps.formatConstFields(constFields, options, constBlockIndentLevel ?? indentLevel);
        return {
            constFields: [],
            inConstBlock: false,
            constBlockIndentLevel: null,
            formattedLines,
            flushed: true
        };
    }
    return {
        constFields,
        inConstBlock,
        constBlockIndentLevel,
        formattedLines: [],
        flushed: false
    };
}
exports.flushConstBlockIfNeeded = flushConstBlockIfNeeded;
function formatSkippedLine(line, inService, serviceIndentLevel, indentLevel, options, deps, inInteraction) {
    if (!line || line.startsWith('//') || line.startsWith('#')) {
        const indent = (inService || inInteraction === true)
            ? deps.getServiceIndent(serviceIndentLevel + 1, options)
            : deps.getIndent(indentLevel, options);
        return [indent + line];
    }
    return null;
}
exports.formatSkippedLine = formatSkippedLine;
function handleConstStartLine(lines, lineIndex, isConstStart, constEnds, inStruct, inEnum, inService, indentLevel, constFields, constBlockIndentLevel, deps) {
    if (!isConstStart) {
        return {
            handled: false,
            nextIndex: lineIndex,
            constFields,
            inConstBlock: false,
            constBlockIndentLevel
        };
    }
    const endLine = constEnds.get(lineIndex) ?? lineIndex;
    const constText = lines.slice(lineIndex, endLine + 1).join('\n');
    const fieldInfo = deps.parseConstFieldText(constText);
    let inConstBlock = false;
    if (fieldInfo) {
        if (constFields.length === 0) {
            constBlockIndentLevel = (inStruct || inEnum || inService) ? indentLevel : 0;
        }
        constFields = [...constFields, fieldInfo];
        inConstBlock = true;
    }
    return {
        handled: true,
        nextIndex: endLine,
        constFields,
        inConstBlock,
        constBlockIndentLevel
    };
}
exports.handleConstStartLine = handleConstStartLine;
function formatTypedefLine(line, indentLevel, options, deps) {
    if (/^\s*typedef\b/.test(line)) {
        const normalized = deps.normalizeGenericsInSignature(line);
        return [deps.getIndent(indentLevel, options) + normalized];
    }
    return null;
}
exports.formatTypedefLine = formatTypedefLine;
function formatOpenBraceLine(line, indentLevel, options, deps) {
    if (line === '{') {
        const level = Math.max(indentLevel - 1, 0);
        return [deps.getIndent(level, options) + line];
    }
    return null;
}
exports.formatOpenBraceLine = formatOpenBraceLine;
//# sourceMappingURL=line-handlers.js.map