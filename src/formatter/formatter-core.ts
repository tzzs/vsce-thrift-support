import { ConstField, EnumField, StructField, ThriftFormattingOptions } from '../interfaces.types';
import { ThriftParser } from '../ast/parser';
import { buildAstIndex } from './ast-index';
import {
    buildEnumFieldFromAst,
    buildStructFieldFromAst,
    isEnumFieldText,
    isStructFieldText,
    parseConstFieldText,
    parseEnumFieldText,
    parseStructFieldText
} from './field-parser';
import { formatConstFields } from './const-format';
import { formatBlockComment } from './comment-format';
import { formatEnumContentLine } from './enum-content';
import { formatEnumFields, formatStructFields } from './field-format';
import { getIndent, getServiceIndent } from './indent';
import {
    formatInlineEnum,
    formatInlineService,
    formatInlineStructLike,
    isInlineEnum,
    isInlineService,
    isInlineStructLike
} from './inline-format';
import {
    flushConstBlockIfNeeded,
    flushStructFieldsIfNeeded,
    formatOpenBraceLine,
    formatSkippedLine,
    formatTypedefLine,
    handleConstStartLine
} from './line-handlers';
import { isEnumStartLine, isServiceStartLine, isStructStartLine } from './line-detection';
import { formatServiceContentLine } from './service-content';
import { isServiceMethodLine } from './service-method';
import { formatStructContentLine } from './struct-content';
import {
    formatSingleLineEnum,
    formatSingleLineService,
    formatSingleLineStruct
} from './single-line-format';
import { normalizeGenericsInSignature, splitTopLevelParts } from './text-utils';

const DEFAULT_FORMAT_OPTIONS: ThriftFormattingOptions = {
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

/**
 * Format Thrift source with unified rules.
 * @param content - Raw Thrift content to format.
 * @param options - Formatting options.
 * @returns Formatted Thrift content.
 */
export function formatThriftContent(
    content: string,
    options: ThriftFormattingOptions = DEFAULT_FORMAT_OPTIONS
): string {
    const lines = content.split(/\r?\n/);
    const ast = new ThriftParser(content).parse();
    const astIndex = buildAstIndex(ast);
    const {
        structStarts,
        structFieldIndex,
        enumStarts,
        enumMemberIndex,
        serviceStarts,
        constStarts,
        constEnds
    } = astIndex;
    const formattedLines: string[] = [];
    let indentLevel = (options.initialContext && typeof options.initialContext.indentLevel === 'number')
        ? options.initialContext.indentLevel : 0;
    let inStruct = !!(options.initialContext && options.initialContext.inStruct);
    let inEnum = !!(options.initialContext && options.initialContext.inEnum);
    let inService = !!(options.initialContext && options.initialContext.inService);
    let serviceIndentLevel = (options.initialContext && typeof options.initialContext.indentLevel === 'number')
        ? options.initialContext.indentLevel : 0;
    let structFields: StructField[] = [];
    let enumFields: EnumField[] = [];
    let constFields: ConstField[] = [];
    let inConstBlock = false;
    // Track the indent level where the current const block started, so flushing uses the correct base indent
    let constBlockIndentLevel: number | null = null;

    for (let i = 0; i < lines.length; i++) {
        let originalLine = lines[i];
        let line = originalLine.trim();
        const isConstStart = constStarts.has(i);
        const isStructStart = structStarts.has(i) || isStructStartLine(line);
        const isEnumStart = enumStarts.has(i) || isEnumStartLine(line);
        const isServiceStart = serviceStarts.has(i) || isServiceStartLine(line);

        // Flush accumulated struct fields before non-field separators/comments inside struct
        const structFlush = flushStructFieldsIfNeeded(
            inStruct,
            structFields,
            line,
            i,
            structFieldIndex,
            indentLevel,
            options,
            {
                formatStructFields: (fields, innerOptions, level) =>
                    formatStructFields(fields, innerOptions, level, { getIndent }),
                isStructFieldText
            }
        );
        if (structFlush.formattedLines.length > 0) {
            formattedLines.push(...structFlush.formattedLines);
        }
        structFields = structFlush.structFields;

        // Handle block comments
        const blockComment = formatBlockComment(
            lines,
            i,
            indentLevel,
            inService,
            serviceIndentLevel,
            options,
            { getIndent, getServiceIndent }
        );
        if (blockComment) {
            formattedLines.push(...blockComment.formattedLines);
            i = blockComment.endIndex;
            continue;
        }

        // Flush const block if needed
        const constFlush = flushConstBlockIfNeeded(
            inConstBlock,
            constFields,
            isConstStart,
            constBlockIndentLevel,
            indentLevel,
            options,
            {
                formatConstFields: (fields, innerOptions, level) =>
                    formatConstFields(fields, innerOptions, level, { getIndent })
            }
        );
        if (constFlush.formattedLines.length > 0) {
            formattedLines.push(...constFlush.formattedLines);
        }
        constFields = constFlush.constFields;
        inConstBlock = constFlush.inConstBlock;
        constBlockIndentLevel = constFlush.constBlockIndentLevel;

        // Skip empty lines and line comments
        const skippedLine = formatSkippedLine(
            line,
            inService,
            serviceIndentLevel,
            indentLevel,
            options,
            { getIndent, getServiceIndent }
        );
        if (skippedLine) {
            formattedLines.push(...skippedLine);
            continue;
        }

        // Handle const fields (AST indexed)
        const constStart = handleConstStartLine(
            lines,
            i,
            isConstStart,
            constEnds,
            inStruct,
            inEnum,
            inService,
            indentLevel,
            constFields,
            constBlockIndentLevel,
            { parseConstFieldText }
        );
        if (constStart.handled) {
            constFields = constStart.constFields;
            inConstBlock = constStart.inConstBlock;
            constBlockIndentLevel = constStart.constBlockIndentLevel;
            i = constStart.nextIndex;
            continue;
        }

        // Typedef normalization
        const typedefLine = formatTypedefLine(line, indentLevel, options, {
            getIndent,
            normalizeGenericsInSignature
        });
        if (typedefLine) {
            formattedLines.push(...typedefLine);
            continue;
        }

        // Handle struct/union/exception definitions
        if (isInlineStructLike(line)) {
            const formattedInline = formatInlineStructLike(line, indentLevel, options, {
                getIndent,
                getServiceIndent,
                formatStructFields: (fields, inlineOptions, level) =>
                    formatStructFields(fields, inlineOptions, level, { getIndent }),
                formatEnumFields: (fields, inlineOptions, level) =>
                    formatEnumFields(fields, inlineOptions, level, { getIndent }),
                parseStructFieldText,
                parseEnumFieldText,
                normalizeGenericsInSignature,
                splitTopLevelParts
            });
            if (formattedInline) {
                formattedLines.push(...formattedInline);
                continue;
            }
        }
        if (isStructStart) {
            const formattedSingleLine = formatSingleLineStruct(line, indentLevel, options, {
                getIndent,
                getServiceIndent,
                formatStructFields: (fields, innerOptions, level) =>
                    formatStructFields(fields, innerOptions, level, { getIndent }),
                formatEnumFields: (fields, innerOptions, level) =>
                    formatEnumFields(fields, innerOptions, level, { getIndent }),
                parseStructFieldText,
                parseEnumFieldText,
                normalizeGenericsInSignature,
                splitTopLevelParts
            });
            if (formattedSingleLine) {
                formattedLines.push(...formattedSingleLine);
                continue;
            }
            formattedLines.push(getIndent(indentLevel, options) + line);
            indentLevel++;
            inStruct = true;
            continue;
        }

        // Handle service definitions
        if (isInlineService(line)) {
            const formattedInline = formatInlineService(line, indentLevel, options, {
                getIndent,
                getServiceIndent,
                formatStructFields: (fields, inlineOptions, level) =>
                    formatStructFields(fields, inlineOptions, level, { getIndent }),
                formatEnumFields: (fields, inlineOptions, level) =>
                    formatEnumFields(fields, inlineOptions, level, { getIndent }),
                parseStructFieldText,
                parseEnumFieldText,
                normalizeGenericsInSignature,
                splitTopLevelParts
            });
            if (formattedInline) {
                formattedLines.push(...formattedInline);
                continue;
            }
        }
        if (isServiceStart) {
            const formattedSingleLine = formatSingleLineService(line, indentLevel, options, {
                getIndent,
                getServiceIndent,
                formatStructFields: (fields, innerOptions, level) =>
                    formatStructFields(fields, innerOptions, level, { getIndent }),
                formatEnumFields: (fields, innerOptions, level) =>
                    formatEnumFields(fields, innerOptions, level, { getIndent }),
                parseStructFieldText,
                parseEnumFieldText,
                normalizeGenericsInSignature,
                splitTopLevelParts
            });
            if (formattedSingleLine) {
                formattedLines.push(...formattedSingleLine);
                continue;
            }
            formattedLines.push(getIndent(indentLevel, options) + line);
            // For service, we want methods to be indented 2 spaces, not 4
            // So we don't increment indentLevel here, but track service state
            inService = true;
            serviceIndentLevel = indentLevel; // Track the service base level
            continue;
        }
        if (inStruct) {
            const structResult = formatStructContentLine(
                line,
                i,
                indentLevel,
                structFields,
                structFieldIndex,
                options,
                {
                    getIndent,
                    formatStructFields: (fields, innerOptions, level) =>
                        formatStructFields(fields, innerOptions, level, { getIndent }),
                    buildStructFieldFromAst,
                    parseStructFieldText,
                    normalizeGenericsInSignature,
                    isServiceMethod: isServiceMethodLine
                }
            );
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

        // Handle service content
        if (inService) {
            const serviceResult = formatServiceContentLine(line, serviceIndentLevel, options, {
                getServiceIndent,
                normalizeGenericsInSignature,
                isServiceMethod: isServiceMethodLine
            });
            formattedLines.push(...serviceResult.formattedLines);
            if (serviceResult.closeService) {
                inService = false;
            }
            continue;
        }

        if (isInlineEnum(line)) {
            const formattedInline = formatInlineEnum(line, indentLevel, options, {
                getIndent,
                getServiceIndent,
                formatStructFields: (fields, inlineOptions, level) =>
                    formatStructFields(fields, inlineOptions, level, { getIndent }),
                formatEnumFields: (fields, inlineOptions, level) =>
                    formatEnumFields(fields, inlineOptions, level, { getIndent }),
                parseStructFieldText,
                parseEnumFieldText,
                normalizeGenericsInSignature,
                splitTopLevelParts
            });
            if (formattedInline) {
                formattedLines.push(...formattedInline);
                continue;
            }
        }
        if (isEnumStart) {
            const formattedSingleLine = formatSingleLineEnum(line, indentLevel, options, {
                getIndent,
                getServiceIndent,
                formatStructFields: (fields, innerOptions, level) =>
                    formatStructFields(fields, innerOptions, level, { getIndent }),
                formatEnumFields: (fields, innerOptions, level) =>
                    formatEnumFields(fields, innerOptions, level, { getIndent }),
                parseStructFieldText,
                parseEnumFieldText,
                normalizeGenericsInSignature,
                splitTopLevelParts
            });
            if (formattedSingleLine) {
                formattedLines.push(...formattedSingleLine);
                continue;
            }
            formattedLines.push(getIndent(indentLevel, options) + line);
            indentLevel++;
            inEnum = true;
            continue;
        }
        if (inEnum) {
            const enumResult = formatEnumContentLine(
                line,
                i,
                indentLevel,
                enumFields,
                enumMemberIndex,
                options,
                {
                    getIndent,
                    formatEnumFields: (fields, innerOptions, level) =>
                        formatEnumFields(fields, innerOptions, level, { getIndent }),
                    buildEnumFieldFromAst,
                    parseEnumFieldText,
                    isEnumFieldText
                }
            );
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

        const openBraceLine = formatOpenBraceLine(line, indentLevel, options, { getIndent });
        if (openBraceLine) {
            formattedLines.push(...openBraceLine);
            continue;
        }

        formattedLines.push(getIndent(indentLevel, options) + line);
    }

    if (constFields.length > 0) {
        const formattedFields = formatConstFields(constFields, options, constBlockIndentLevel ?? indentLevel, {
            getIndent
        });
        formattedLines.push(...formattedFields);
    }
    if (structFields.length > 0) {
        const formattedFields = formatStructFields(structFields, options, indentLevel, {
            getIndent
        });
        formattedLines.push(...formattedFields);
    }
    if (enumFields.length > 0) {
        const formattedFields = formatEnumFields(enumFields, options, indentLevel, {
            getIndent
        });
        formattedLines.push(...formattedFields);
    }

    const cleaned = formattedLines.map(l => l.replace(/\s+$/g, ''));
    return cleaned.join('\n');
}
