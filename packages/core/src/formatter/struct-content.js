"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatStructContentLine = void 0;
function formatStructContentLine(line, lineIndex, indentLevel, structFields, structFieldIndex, options, deps) {
    if (line.startsWith('}')) {
        const formattedLines = [];
        if (structFields.length > 0) {
            const formattedFields = deps.formatStructFields(structFields, options, indentLevel);
            formattedLines.push(...formattedFields);
            structFields = [];
        }
        const nextIndent = indentLevel - 1;
        formattedLines.push(deps.getIndent(nextIndent, options) + line);
        return {
            handled: true,
            inStruct: false,
            indentLevel: nextIndent,
            structFields,
            formattedLines
        };
    }
    if (deps.isServiceMethod(line)) {
        const normalized = deps.normalizeGenericsInSignature(line);
        return {
            handled: true,
            inStruct: true,
            indentLevel,
            structFields,
            formattedLines: [deps.getIndent(indentLevel, options) + normalized]
        };
    }
    const fieldNode = structFieldIndex.get(lineIndex);
    const fieldInfo = fieldNode
        ? deps.buildStructFieldFromAst(line, fieldNode)
        : deps.parseStructFieldText(line);
    if (fieldInfo) {
        return {
            handled: true,
            inStruct: true,
            indentLevel,
            structFields: [...structFields, fieldInfo],
            formattedLines: []
        };
    }
    return {
        handled: false,
        inStruct: true,
        indentLevel,
        structFields,
        formattedLines: []
    };
}
exports.formatStructContentLine = formatStructContentLine;
//# sourceMappingURL=struct-content.js.map