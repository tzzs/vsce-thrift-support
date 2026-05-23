"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatThriftContent = void 0;
const parser_1 = require("../ast/parser");
const ast_index_1 = require("./ast-index");
const field_parser_1 = require("./field-parser");
const const_format_1 = require("./const-format");
const comment_format_1 = require("./comment-format");
const enum_content_1 = require("./enum-content");
const field_format_1 = require("./field-format");
const struct_format_1 = require("./struct-format");
const indent_1 = require("./indent");
const inline_format_1 = require("./inline-format");
const line_handlers_1 = require("./line-handlers");
const line_detection_1 = require("./line-detection");
const service_content_1 = require("./service-content");
const service_method_1 = require("./service-method");
const struct_content_1 = require("./struct-content");
const single_line_format_1 = require("./single-line-format");
const text_utils_1 = require("./text-utils");
const line_range_1 = require("../utils/line-range");
const cache_expiry_1 = require("../utils/cache-expiry");
const error_handler_1 = require("../utils/error-handler");
const comment_map_1 = require("./comment-map");
const formatErrorHandler = new error_handler_1.ErrorHandler();
const DEFAULT_FORMAT_OPTIONS = {
    trailingComma: 'preserve',
    alignTypes: true,
    alignFieldNames: true,
    alignStructDefaults: false,
    alignAnnotations: true,
    alignComments: true,
    alignEnumNames: true,
    alignEnumEquals: true,
    alignEnumValues: true,
    indentSize: 4,
    maxLineLength: 100,
    collectionStyle: 'preserve',
    insertSpaces: true,
    tabSize: 4
};
function formatThriftContent(content, options = DEFAULT_FORMAT_OPTIONS, dirtyRange) {
    const lines = content.split(/\r?\n/);
    const lastLineIndex = Math.max(0, lines.length - 1);
    if (dirtyRange) {
        const startLine = Math.max(0, Math.min(dirtyRange.startLine, lastLineIndex));
        const endLine = Math.max(0, Math.min(dirtyRange.endLine, lastLineIndex));
        dirtyRange = (0, line_range_1.createLineRange)(startLine, endLine);
    }
    let ast;
    if (dirtyRange && options.incrementalFormattingEnabled === true) {
        const uri = `mock:formatter:${(0, cache_expiry_1.hashContent)(content)}`;
        const incrementalResult = parser_1.ThriftParser.incrementalParseWithCache(uri, content, dirtyRange);
        ast = incrementalResult?.ast ?? new parser_1.ThriftParser(content).parse();
    }
    else {
        ast = new parser_1.ThriftParser(content).parse();
    }
    const astIndex = (0, ast_index_1.buildAstIndex)(ast);
    let cachedCommentMap = null;
    const getCommentMap = () => {
        cachedCommentMap ??= (0, comment_map_1.buildCommentMap)(content, astIndex);
        return cachedCommentMap;
    };
    void getCommentMap;
    const { structStarts, structFieldIndex, enumStarts, enumMemberIndex, serviceStarts, interactionStarts, constStarts, constEnds } = astIndex;
    const formattedLines = [];
    let indentLevel = (options.initialContext && typeof options.initialContext.indentLevel === 'number')
        ? options.initialContext.indentLevel : 0;
    let inStruct = !!(options.initialContext && options.initialContext.inStruct);
    let inEnum = !!(options.initialContext && options.initialContext.inEnum);
    let inService = options.initialContext?.inService === true;
    let inInteraction = options.initialContext?.inInteraction === true;
    let serviceIndentLevel = (options.initialContext && typeof options.initialContext.indentLevel === 'number')
        ? options.initialContext.indentLevel : 0;
    let structFields = [];
    let enumFields = [];
    let constFields = [];
    let inConstBlock = false;
    let constBlockIndentLevel = null;
    let topAnnotationDepth = 0;
    let serviceAnnotationDepth = 0;
    let interactionAnnotationDepth = 0;
    for (let i = 0; i < lines.length; i++) {
        try {
            const originalLine = lines[i];
            const line = originalLine.trim();
            const isConstStart = constStarts.has(i);
            const isStructStart = structStarts.has(i) || (0, line_detection_1.isStructStartLine)(line);
            const isEnumStart = enumStarts.has(i) || (0, line_detection_1.isEnumStartLine)(line);
            const isServiceStart = serviceStarts.has(i) || (0, line_detection_1.isServiceStartLine)(line);
            const isInteractionStart = interactionStarts.has(i) || (0, line_detection_1.isInteractionStartLine)(line);
            const structFlush = (0, line_handlers_1.flushStructFieldsIfNeeded)(inStruct, structFields, line, i, structFieldIndex, indentLevel, options, {
                formatStructFields: (fields, innerOptions, level) => (0, struct_format_1.formatStructFields)(fields, innerOptions, level, { getIndent: indent_1.getIndent }),
                isStructFieldText: field_parser_1.isStructFieldText
            });
            if (structFlush.formattedLines.length > 0) {
                formattedLines.push(...structFlush.formattedLines);
            }
            structFields = structFlush.structFields;
            const blockComment = (0, comment_format_1.formatBlockComment)(lines, i, indentLevel, inService, serviceIndentLevel, options, { getIndent: indent_1.getIndent, getServiceIndent: indent_1.getServiceIndent });
            if (blockComment) {
                formattedLines.push(...blockComment.formattedLines);
                i = blockComment.endIndex;
                continue;
            }
            const constFlush = (0, line_handlers_1.flushConstBlockIfNeeded)(inConstBlock, constFields, isConstStart, constBlockIndentLevel, indentLevel, options, {
                formatConstFields: (fields, innerOptions, level) => (0, const_format_1.formatConstFields)(fields, innerOptions, level, { getIndent: indent_1.getIndent })
            });
            if (constFlush.formattedLines.length > 0) {
                formattedLines.push(...constFlush.formattedLines);
            }
            constFields = constFlush.constFields;
            inConstBlock = constFlush.inConstBlock;
            constBlockIndentLevel = constFlush.constBlockIndentLevel;
            const skippedLine = (0, line_handlers_1.formatSkippedLine)(line, inService, serviceIndentLevel, indentLevel, options, { getIndent: indent_1.getIndent, getServiceIndent: indent_1.getServiceIndent }, inInteraction);
            if (skippedLine) {
                formattedLines.push(...skippedLine);
                continue;
            }
            const constStart = (0, line_handlers_1.handleConstStartLine)(lines, i, isConstStart, constEnds, inStruct, inEnum, inService, indentLevel, constFields, constBlockIndentLevel, { parseConstFieldText: field_parser_1.parseConstFieldText });
            if (constStart.handled) {
                constFields = constStart.constFields;
                inConstBlock = constStart.inConstBlock;
                constBlockIndentLevel = constStart.constBlockIndentLevel;
                i = constStart.nextIndex;
                continue;
            }
            const typedefLine = (0, line_handlers_1.formatTypedefLine)(line, indentLevel, options, {
                getIndent: indent_1.getIndent,
                normalizeGenericsInSignature: text_utils_1.normalizeGenericsInSignature
            });
            if (typedefLine) {
                formattedLines.push(...typedefLine);
                continue;
            }
            if ((0, inline_format_1.isInlineStructLike)(line)) {
                const formattedInline = (0, inline_format_1.formatInlineStructLike)(line, indentLevel, options, {
                    getIndent: indent_1.getIndent,
                    getServiceIndent: indent_1.getServiceIndent,
                    formatStructFields: (fields, inlineOptions, level) => (0, struct_format_1.formatStructFields)(fields, inlineOptions, level, { getIndent: indent_1.getIndent }),
                    formatEnumFields: (fields, inlineOptions, level) => (0, field_format_1.formatEnumFields)(fields, inlineOptions, level, { getIndent: indent_1.getIndent }),
                    parseStructFieldText: field_parser_1.parseStructFieldText,
                    parseEnumFieldText: field_parser_1.parseEnumFieldText,
                    normalizeGenericsInSignature: text_utils_1.normalizeGenericsInSignature,
                    splitTopLevelParts: text_utils_1.splitTopLevelParts
                });
                if (formattedInline) {
                    formattedLines.push(...formattedInline);
                    continue;
                }
            }
            if (isStructStart) {
                const formattedSingleLine = (0, single_line_format_1.formatSingleLineStruct)(line, indentLevel, options, {
                    getIndent: indent_1.getIndent,
                    getServiceIndent: indent_1.getServiceIndent,
                    formatStructFields: (fields, innerOptions, level) => (0, struct_format_1.formatStructFields)(fields, innerOptions, level, { getIndent: indent_1.getIndent }),
                    formatEnumFields: (fields, innerOptions, level) => (0, field_format_1.formatEnumFields)(fields, innerOptions, level, { getIndent: indent_1.getIndent }),
                    parseStructFieldText: field_parser_1.parseStructFieldText,
                    parseEnumFieldText: field_parser_1.parseEnumFieldText,
                    normalizeGenericsInSignature: text_utils_1.normalizeGenericsInSignature,
                    splitTopLevelParts: text_utils_1.splitTopLevelParts
                });
                if (formattedSingleLine) {
                    formattedLines.push(...formattedSingleLine);
                    continue;
                }
                formattedLines.push((0, indent_1.getIndent)(indentLevel, options) + line);
                indentLevel++;
                inStruct = true;
                continue;
            }
            if ((0, inline_format_1.isInlineService)(line)) {
                const formattedInline = (0, inline_format_1.formatInlineService)(line, indentLevel, options, {
                    getIndent: indent_1.getIndent,
                    getServiceIndent: indent_1.getServiceIndent,
                    formatStructFields: (fields, inlineOptions, level) => (0, struct_format_1.formatStructFields)(fields, inlineOptions, level, { getIndent: indent_1.getIndent }),
                    formatEnumFields: (fields, inlineOptions, level) => (0, field_format_1.formatEnumFields)(fields, inlineOptions, level, { getIndent: indent_1.getIndent }),
                    parseStructFieldText: field_parser_1.parseStructFieldText,
                    parseEnumFieldText: field_parser_1.parseEnumFieldText,
                    normalizeGenericsInSignature: text_utils_1.normalizeGenericsInSignature,
                    splitTopLevelParts: text_utils_1.splitTopLevelParts
                });
                if (formattedInline) {
                    formattedLines.push(...formattedInline);
                    continue;
                }
            }
            if (isServiceStart) {
                const formattedSingleLine = (0, single_line_format_1.formatSingleLineService)(line, indentLevel, options, {
                    getIndent: indent_1.getIndent,
                    getServiceIndent: indent_1.getServiceIndent,
                    formatStructFields: (fields, innerOptions, level) => (0, struct_format_1.formatStructFields)(fields, innerOptions, level, { getIndent: indent_1.getIndent }),
                    formatEnumFields: (fields, innerOptions, level) => (0, field_format_1.formatEnumFields)(fields, innerOptions, level, { getIndent: indent_1.getIndent }),
                    parseStructFieldText: field_parser_1.parseStructFieldText,
                    parseEnumFieldText: field_parser_1.parseEnumFieldText,
                    normalizeGenericsInSignature: text_utils_1.normalizeGenericsInSignature,
                    splitTopLevelParts: text_utils_1.splitTopLevelParts
                });
                if (formattedSingleLine) {
                    formattedLines.push(...formattedSingleLine);
                    continue;
                }
                formattedLines.push((0, indent_1.getIndent)(indentLevel, options) + line);
                inService = true;
                serviceIndentLevel = indentLevel;
                continue;
            }
            if (isInteractionStart) {
                formattedLines.push((0, indent_1.getIndent)(indentLevel, options) + line);
                inInteraction = true;
                serviceIndentLevel = indentLevel;
                continue;
            }
            if (inStruct) {
                const structResult = (0, struct_content_1.formatStructContentLine)(line, i, indentLevel, structFields, structFieldIndex, options, {
                    getIndent: indent_1.getIndent,
                    formatStructFields: (fields, innerOptions, level) => (0, struct_format_1.formatStructFields)(fields, innerOptions, level, { getIndent: indent_1.getIndent }),
                    buildStructFieldFromAst: field_parser_1.buildStructFieldFromAst,
                    parseStructFieldText: field_parser_1.parseStructFieldText,
                    normalizeGenericsInSignature: text_utils_1.normalizeGenericsInSignature,
                    isServiceMethod: service_method_1.isServiceMethodLine
                });
                structFields = structResult.structFields;
                if (structResult.formattedLines.length > 0) {
                    formattedLines.push(...structResult.formattedLines);
                }
                indentLevel = structResult.indentLevel;
                inStruct = structResult.inStruct;
                if (structResult.handled) {
                    continue;
                }
            }
            if (inService) {
                const serviceResult = (0, service_content_1.formatServiceContentLine)(line, serviceIndentLevel, options, {
                    getServiceIndent: indent_1.getServiceIndent,
                    normalizeGenericsInSignature: text_utils_1.normalizeGenericsInSignature,
                    isServiceMethod: service_method_1.isServiceMethodLine
                }, serviceAnnotationDepth);
                formattedLines.push(...serviceResult.formattedLines);
                serviceAnnotationDepth = serviceResult.annotationDepth;
                if (serviceResult.closeService) {
                    inService = false;
                    serviceAnnotationDepth = 0;
                }
                continue;
            }
            if (inInteraction) {
                const interactionResult = (0, service_content_1.formatServiceContentLine)(line, serviceIndentLevel, options, {
                    getServiceIndent: indent_1.getServiceIndent,
                    normalizeGenericsInSignature: text_utils_1.normalizeGenericsInSignature,
                    isServiceMethod: service_method_1.isServiceMethodLine
                }, interactionAnnotationDepth);
                formattedLines.push(...interactionResult.formattedLines);
                interactionAnnotationDepth = interactionResult.annotationDepth;
                if (interactionResult.closeService) {
                    inInteraction = false;
                    interactionAnnotationDepth = 0;
                }
                continue;
            }
            if ((0, line_detection_1.isAnnotationStartLine)(line)) {
                formattedLines.push((0, indent_1.getIndent)(indentLevel, options) + line);
                indentLevel++;
                topAnnotationDepth++;
                continue;
            }
            if (topAnnotationDepth > 0) {
                if (line === '}') {
                    topAnnotationDepth--;
                    if (topAnnotationDepth === 0) {
                        indentLevel--;
                    }
                }
                formattedLines.push((0, indent_1.getIndent)(indentLevel, options) + line);
                continue;
            }
            if ((0, inline_format_1.isInlineEnum)(line)) {
                const formattedInline = (0, inline_format_1.formatInlineEnum)(line, indentLevel, options, {
                    getIndent: indent_1.getIndent,
                    getServiceIndent: indent_1.getServiceIndent,
                    formatStructFields: (fields, inlineOptions, level) => (0, struct_format_1.formatStructFields)(fields, inlineOptions, level, { getIndent: indent_1.getIndent }),
                    formatEnumFields: (fields, inlineOptions, level) => (0, field_format_1.formatEnumFields)(fields, inlineOptions, level, { getIndent: indent_1.getIndent }),
                    parseStructFieldText: field_parser_1.parseStructFieldText,
                    parseEnumFieldText: field_parser_1.parseEnumFieldText,
                    normalizeGenericsInSignature: text_utils_1.normalizeGenericsInSignature,
                    splitTopLevelParts: text_utils_1.splitTopLevelParts
                });
                if (formattedInline) {
                    formattedLines.push(...formattedInline);
                    continue;
                }
            }
            if (isEnumStart) {
                const formattedSingleLine = (0, single_line_format_1.formatSingleLineEnum)(line, indentLevel, options, {
                    getIndent: indent_1.getIndent,
                    getServiceIndent: indent_1.getServiceIndent,
                    formatStructFields: (fields, innerOptions, level) => (0, struct_format_1.formatStructFields)(fields, innerOptions, level, { getIndent: indent_1.getIndent }),
                    formatEnumFields: (fields, innerOptions, level) => (0, field_format_1.formatEnumFields)(fields, innerOptions, level, { getIndent: indent_1.getIndent }),
                    parseStructFieldText: field_parser_1.parseStructFieldText,
                    parseEnumFieldText: field_parser_1.parseEnumFieldText,
                    normalizeGenericsInSignature: text_utils_1.normalizeGenericsInSignature,
                    splitTopLevelParts: text_utils_1.splitTopLevelParts
                });
                if (formattedSingleLine) {
                    formattedLines.push(...formattedSingleLine);
                    continue;
                }
                formattedLines.push((0, indent_1.getIndent)(indentLevel, options) + line);
                indentLevel++;
                inEnum = true;
                continue;
            }
            if (inEnum) {
                const enumResult = (0, enum_content_1.formatEnumContentLine)(line, i, indentLevel, enumFields, enumMemberIndex, options, {
                    getIndent: indent_1.getIndent,
                    formatEnumFields: (fields, innerOptions, level) => (0, field_format_1.formatEnumFields)(fields, innerOptions, level, { getIndent: indent_1.getIndent }),
                    buildEnumFieldFromAst: field_parser_1.buildEnumFieldFromAst,
                    parseEnumFieldText: field_parser_1.parseEnumFieldText,
                    isEnumFieldText: field_parser_1.isEnumFieldText
                });
                enumFields = enumResult.enumFields;
                if (enumResult.formattedLines.length > 0) {
                    formattedLines.push(...enumResult.formattedLines);
                }
                indentLevel = enumResult.indentLevel;
                inEnum = enumResult.inEnum;
                if (enumResult.handled) {
                    continue;
                }
            }
            const openBraceLine = (0, line_handlers_1.formatOpenBraceLine)(line, indentLevel, options, { getIndent: indent_1.getIndent });
            if (openBraceLine) {
                formattedLines.push(...openBraceLine);
                continue;
            }
            formattedLines.push((0, indent_1.getIndent)(indentLevel, options) + line);
        }
        catch (lineError) {
            formatErrorHandler.handleWarning('Line formatting failed, preserving original', {
                component: 'formatThriftContent',
                operation: 'formatLine',
                additionalInfo: { line: i, error: lineError instanceof Error ? lineError.message : 'Unknown' }
            });
            formattedLines.push((0, indent_1.getIndent)(indentLevel, options) + lines[i].trim());
        }
    }
    if (constFields.length > 0) {
        const formattedFields = (0, const_format_1.formatConstFields)(constFields, options, constBlockIndentLevel ?? indentLevel, {
            getIndent: indent_1.getIndent
        });
        formattedLines.push(...formattedFields);
    }
    if (structFields.length > 0) {
        const formattedFields = (0, struct_format_1.formatStructFields)(structFields, options, indentLevel, {
            getIndent: indent_1.getIndent
        });
        formattedLines.push(...formattedFields);
    }
    if (enumFields.length > 0) {
        const formattedFields = (0, field_format_1.formatEnumFields)(enumFields, options, indentLevel, {
            getIndent: indent_1.getIndent
        });
        formattedLines.push(...formattedFields);
    }
    const cleaned = formattedLines.map(l => l.trimEnd());
    return cleaned.join('\n');
}
exports.formatThriftContent = formatThriftContent;
//# sourceMappingURL=formatter-core.js.map