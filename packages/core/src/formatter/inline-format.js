"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatInlineService = exports.formatInlineEnum = exports.formatInlineStructLike = exports.isInlineService = exports.isInlineEnum = exports.isInlineStructLike = void 0;
function isInlineStructLike(line) {
    return /^(struct|union|exception)\b/.test(line) && line.includes('{') && line.includes('}');
}
exports.isInlineStructLike = isInlineStructLike;
function isInlineEnum(line) {
    return /^(enum|senum)\b/.test(line) && line.includes('{') && line.includes('}');
}
exports.isInlineEnum = isInlineEnum;
function isInlineService(line) {
    return /^service\b/.test(line) && line.includes('{') && line.includes('}');
}
exports.isInlineService = isInlineService;
function formatInlineStructLike(line, indentLevel, options, deps) {
    const openBraceIndex = line.indexOf('{');
    const closeBraceIndex = line.lastIndexOf('}');
    if (openBraceIndex === -1 || closeBraceIndex === -1 || openBraceIndex >= closeBraceIndex) {
        return null;
    }
    const structHeader = line.substring(0, openBraceIndex).trim();
    const structContent = line.substring(openBraceIndex + 1, closeBraceIndex).trim();
    const out = [];
    out.push(deps.getIndent(indentLevel, options) + structHeader + ' {');
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
            out.push(...formattedFields);
        }
    }
    out.push(deps.getIndent(indentLevel, options) + '}');
    return out;
}
exports.formatInlineStructLike = formatInlineStructLike;
function formatInlineEnum(line, indentLevel, options, deps) {
    const openBraceIndex = line.indexOf('{');
    const closeBraceIndex = line.lastIndexOf('}');
    if (openBraceIndex === -1 || closeBraceIndex === -1 || openBraceIndex >= closeBraceIndex) {
        return null;
    }
    const enumHeader = line.substring(0, openBraceIndex).trim();
    const enumContent = line.substring(openBraceIndex + 1, closeBraceIndex).trim();
    const out = [];
    out.push(deps.getIndent(indentLevel, options) + enumHeader + ' {');
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
            out.push(...formattedFields);
        }
    }
    out.push(deps.getIndent(indentLevel, options) + '}');
    return out;
}
exports.formatInlineEnum = formatInlineEnum;
function formatInlineService(line, indentLevel, options, deps) {
    const openBraceIndex = line.indexOf('{');
    const closeBraceIndex = line.lastIndexOf('}');
    if (openBraceIndex === -1 || closeBraceIndex === -1 || openBraceIndex >= closeBraceIndex) {
        return null;
    }
    const serviceHeader = line.substring(0, openBraceIndex).trim();
    const serviceContent = line.substring(openBraceIndex + 1, closeBraceIndex).trim();
    const out = [];
    out.push(deps.getIndent(indentLevel, options) + serviceHeader + ' {');
    if (serviceContent) {
        const methodStrings = deps.splitTopLevelParts(serviceContent);
        for (const methodStr of methodStrings) {
            const trimmedMethod = methodStr.trim();
            if (trimmedMethod) {
                const normalizedMethod = deps.normalizeGenericsInSignature(trimmedMethod);
                out.push(deps.getServiceIndent(indentLevel + 1, options) + normalizedMethod);
            }
        }
    }
    out.push(deps.getIndent(indentLevel, options) + '}');
    return out;
}
exports.formatInlineService = formatInlineService;
//# sourceMappingURL=inline-format.js.map