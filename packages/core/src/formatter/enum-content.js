"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatEnumContentLine = void 0;
function formatEnumContentLine(line, lineIndex, indentLevel, enumFields, enumMemberIndex, options, deps) {
    if (line.startsWith('}')) {
        const formattedLines = [];
        if (enumFields.length > 0) {
            const formattedFields = deps.formatEnumFields(enumFields, options, indentLevel);
            formattedLines.push(...formattedFields);
            enumFields = [];
        }
        const nextIndent = indentLevel - 1;
        formattedLines.push(deps.getIndent(nextIndent, options) + line);
        return {
            handled: true,
            inEnum: false,
            indentLevel: nextIndent,
            enumFields,
            formattedLines
        };
    }
    const hasEnumField = enumMemberIndex.has(lineIndex) || deps.isEnumFieldText(line);
    const formattedLines = [];
    if (enumFields.length > 0 && !hasEnumField) {
        const formattedFields = deps.formatEnumFields(enumFields, options, indentLevel);
        formattedLines.push(...formattedFields);
        enumFields = [];
    }
    const enumNode = enumMemberIndex.get(lineIndex);
    const fieldInfo = enumNode
        ? deps.buildEnumFieldFromAst(line, enumNode)
        : deps.parseEnumFieldText(line);
    if (fieldInfo) {
        return {
            handled: true,
            inEnum: true,
            indentLevel,
            enumFields: [...enumFields, fieldInfo],
            formattedLines
        };
    }
    return {
        handled: formattedLines.length > 0,
        inEnum: true,
        indentLevel,
        enumFields,
        formattedLines
    };
}
exports.formatEnumContentLine = formatEnumContentLine;
//# sourceMappingURL=enum-content.js.map