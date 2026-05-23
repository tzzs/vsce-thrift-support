"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatSingleLineService = exports.formatSingleLineEnum = exports.formatSingleLineStruct = void 0;
function formatSingleLineStruct(line, indentLevel, options, deps) {
    if (!line.includes('{') || !line.includes('}')) {
        return null;
    }
    const openBraceIndex = line.indexOf('{');
    const closeBraceIndex = line.lastIndexOf('}');
    if (openBraceIndex === -1 || closeBraceIndex === -1 || openBraceIndex >= closeBraceIndex) {
        return null;
    }
    const structHeader = line.substring(0, openBraceIndex).trim();
    const structContent = line.substring(openBraceIndex + 1, closeBraceIndex).trim();
    const formattedLines = [];
    formattedLines.push(deps.getIndent(indentLevel, options) + structHeader + ' {');
    if (structContent) {
        const fieldStrings = deps.splitTopLevelParts(structContent);
        const fieldInfos = [];
        for (const fieldStr of fieldStrings) {
            const fieldInfo = deps.parseStructFieldText(fieldStr.trim());
            if (fieldInfo) {
                fieldInfos.push(fieldInfo);
            }
        }
        if (fieldInfos.length > 0) {
            const formattedFields = deps.formatStructFields(fieldInfos, options, indentLevel + 1);
            formattedLines.push(...formattedFields);
        }
    }
    formattedLines.push(deps.getIndent(indentLevel, options) + '}');
    return formattedLines;
}
exports.formatSingleLineStruct = formatSingleLineStruct;
function formatSingleLineEnum(line, indentLevel, options, deps) {
    if (!line.includes('{') || !line.includes('}')) {
        return null;
    }
    const openBraceIndex = line.indexOf('{');
    const closeBraceIndex = line.lastIndexOf('}');
    if (openBraceIndex === -1 || closeBraceIndex === -1 || openBraceIndex >= closeBraceIndex) {
        return null;
    }
    const enumHeader = line.substring(0, openBraceIndex).trim();
    const enumContent = line.substring(openBraceIndex + 1, closeBraceIndex).trim();
    const formattedLines = [];
    formattedLines.push(deps.getIndent(indentLevel, options) + enumHeader + ' {');
    if (enumContent) {
        const fieldStrings = deps.splitTopLevelParts(enumContent);
        const enumFieldInfos = [];
        for (const fieldStr of fieldStrings) {
            const fieldInfo = deps.parseEnumFieldText(fieldStr.trim());
            if (fieldInfo) {
                enumFieldInfos.push(fieldInfo);
            }
        }
        if (enumFieldInfos.length > 0) {
            const formattedFields = deps.formatEnumFields(enumFieldInfos, options, indentLevel + 1);
            formattedLines.push(...formattedFields);
        }
    }
    formattedLines.push(deps.getIndent(indentLevel, options) + '}');
    return formattedLines;
}
exports.formatSingleLineEnum = formatSingleLineEnum;
function formatSingleLineService(line, indentLevel, options, deps) {
    if (!line.includes('{') || !line.includes('}')) {
        return null;
    }
    const openBraceIndex = line.indexOf('{');
    const closeBraceIndex = line.lastIndexOf('}');
    if (openBraceIndex === -1 || closeBraceIndex === -1 || openBraceIndex >= closeBraceIndex) {
        return null;
    }
    const serviceHeader = line.substring(0, openBraceIndex).trim();
    const serviceContent = line.substring(openBraceIndex + 1, closeBraceIndex).trim();
    const formattedLines = [];
    formattedLines.push(deps.getIndent(indentLevel, options) + serviceHeader + ' {');
    if (serviceContent) {
        const methodStrings = deps.splitTopLevelParts(serviceContent);
        for (const methodStr of methodStrings) {
            const trimmedMethod = methodStr.trim();
            if (trimmedMethod) {
                const normalizedMethod = deps.normalizeGenericsInSignature(trimmedMethod);
                formattedLines.push(deps.getServiceIndent(indentLevel + 1, options) + normalizedMethod);
            }
        }
    }
    formattedLines.push(deps.getIndent(indentLevel, options) + '}');
    return formattedLines;
}
exports.formatSingleLineService = formatSingleLineService;
//# sourceMappingURL=single-line-format.js.map