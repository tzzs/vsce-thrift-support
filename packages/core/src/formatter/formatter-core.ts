import {ConstField, EnumField, StructField, ThriftFormattingOptions} from '../interfaces.types';
import {ThriftParser} from '../ast/parser';
import {buildAstIndex} from './ast-index';
import {
    buildEnumFieldFromAst,
    buildStructFieldFromAst,
    isEnumFieldText,
    isStructFieldText,
    parseConstFieldText,
    parseEnumFieldText,
    parseStructFieldText
} from './field-parser';
import {formatConstFields} from './const-format';
import {formatBlockComment} from './comment-format';
import {formatEnumContentLine} from './enum-content';
import {formatEnumFields} from './field-format';
import {formatStructFields} from './struct-format';
import {getIndent, getServiceIndent} from './indent';
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
import {isAnnotationStartLine, isEnumStartLine, isInteractionStartLine, isServiceStartLine, isStructStartLine} from './line-detection';
import {formatServiceContentLine} from './service-content';
import {isServiceMethodLine} from './service-method';
import {formatStructContentLine} from './struct-content';
import {formatSingleLineEnum, formatSingleLineService, formatSingleLineStruct} from './single-line-format';
import {normalizeGenericsInSignature, splitTopLevelParts} from './text-utils';
import {createLineRange, LineRange} from '../utils/line-range';
import {hashContent} from '../utils/cache-expiry';
import {ErrorHandler} from '../utils/error-handler';

const formatErrorHandler = new ErrorHandler();

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
 * @param dirtyRange - Optional dirty range for incremental formatting.
 * @returns Formatted Thrift content.
 */
export function formatThriftContent(
    content: string,
    options: ThriftFormattingOptions = DEFAULT_FORMAT_OPTIONS,
    dirtyRange?: LineRange
): string {
    const lines = content.split(/\r?\n/);

    const lastLineIndex = Math.max(0, lines.length - 1);
    if (dirtyRange) {
        const startLine = Math.max(0, Math.min(dirtyRange.startLine, lastLineIndex));
        const endLine = Math.max(0, Math.min(dirtyRange.endLine, lastLineIndex));
        dirtyRange = createLineRange(startLine, endLine);
    }

    let ast;
    if (dirtyRange && options.incrementalFormattingEnabled === true) {
        const uri = `mock:formatter:${hashContent(content)}`;
        const incrementalResult = ThriftParser.incrementalParseWithCache(uri, content, dirtyRange);
        ast = incrementalResult?.ast ?? new ThriftParser(content).parse();
    } else {
        ast = new ThriftParser(content).parse();
    }

    const astIndex = buildAstIndex(ast);
    const {
        structStarts,
        structFieldIndex,
        enumStarts,
        enumMemberIndex,
        serviceStarts,
        serviceFunctionIndex,
        interactionStarts,
        constStarts,
        constEnds
    } = astIndex;
    const formattedLines: string[] = [];
    let indentLevel = (options.initialContext && typeof options.initialContext.indentLevel === 'number')
        ? options.initialContext.indentLevel : 0;
    let inStruct = !!(options.initialContext && options.initialContext.inStruct);
    let inEnum = !!(options.initialContext && options.initialContext.inEnum);
    let inService = options.initialContext?.inService === true;
    let inInteraction = options.initialContext?.inInteraction === true;
    let serviceIndentLevel = (options.initialContext && typeof options.initialContext.indentLevel === 'number')
        ? options.initialContext.indentLevel : 0;
    let structFields: StructField[] = [];
    let enumFields: EnumField[] = [];
    let constFields: ConstField[] = [];
    let inConstBlock = false;
    // Track the indent level where the current const block started, so flushing uses the correct base indent
    let constBlockIndentLevel: number | null = null;
    // Track annotation block depth for top-level @Annotation{...} blocks
    let topAnnotationDepth = 0;
    // Caller-maintained annotation depths for service/interaction bodies (avoids module-level state)
    let serviceAnnotationDepth = 0;
    let interactionAnnotationDepth = 0;

    for (let i = 0; i < lines.length; i++) {
      try {
        const originalLine = lines[i];
        const line = originalLine.trim();
        const isConstStart = constStarts.has(i);
        const isStructStart = structStarts.has(i) || isStructStartLine(line);
        const isEnumStart = enumStarts.has(i) || isEnumStartLine(line);
        const isServiceStart = serviceStarts.has(i) || isServiceStartLine(line);
        const isInteractionStart = interactionStarts.has(i) || isInteractionStartLine(line);

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
                    formatStructFields(fields, innerOptions, level, {getIndent}),
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
            {getIndent, getServiceIndent}
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
                    formatConstFields(fields, innerOptions, level, {getIndent})
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
            {getIndent, getServiceIndent},
            inInteraction
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
            {parseConstFieldText}
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
                    formatStructFields(fields, inlineOptions, level, {getIndent}),
                formatEnumFields: (fields, inlineOptions, level) =>
                    formatEnumFields(fields, inlineOptions, level, {getIndent}),
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
                    formatStructFields(fields, innerOptions, level, {getIndent}),
                formatEnumFields: (fields, innerOptions, level) =>
                    formatEnumFields(fields, innerOptions, level, {getIndent}),
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
                    formatStructFields(fields, inlineOptions, level, {getIndent}),
                formatEnumFields: (fields, inlineOptions, level) =>
                    formatEnumFields(fields, inlineOptions, level, {getIndent}),
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
                    formatStructFields(fields, innerOptions, level, {getIndent}),
                formatEnumFields: (fields, innerOptions, level) =>
                    formatEnumFields(fields, innerOptions, level, {getIndent}),
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

        // Handle interaction definitions (similar to service)
        if (isInteractionStart) {
            formattedLines.push(getIndent(indentLevel, options) + line);
            inInteraction = true;
            serviceIndentLevel = indentLevel;
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
                        formatStructFields(fields, innerOptions, level, {getIndent}),
                    buildStructFieldFromAst,
                    parseStructFieldText,
                    normalizeGenericsInSignature,
                    isServiceMethod: (line, li) => isServiceMethodLine(line, li, serviceFunctionIndex)
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
            const serviceResult = formatServiceContentLine(line, i, serviceIndentLevel, options, {
                getServiceIndent,
                normalizeGenericsInSignature,
                isServiceMethod: (line, li) => isServiceMethodLine(line, li, serviceFunctionIndex)
            }, serviceAnnotationDepth);
            formattedLines.push(...serviceResult.formattedLines);
            serviceAnnotationDepth = serviceResult.annotationDepth;
            if (serviceResult.closeService) {
                inService = false;
                serviceAnnotationDepth = 0;
            }
            continue;
        }

        // Handle interaction content (same formatting as service)
        if (inInteraction) {
            const interactionResult = formatServiceContentLine(line, i, serviceIndentLevel, options, {
                getServiceIndent,
                normalizeGenericsInSignature,
                isServiceMethod: (line, li) => isServiceMethodLine(line, li, serviceFunctionIndex)
            }, interactionAnnotationDepth);
            formattedLines.push(...interactionResult.formattedLines);
            interactionAnnotationDepth = interactionResult.annotationDepth;
            if (interactionResult.closeService) {
                inInteraction = false;
                interactionAnnotationDepth = 0;
            }
            continue;
        }

        // Handle top-level annotation blocks (e.g. @ServiceMetadata{...})
        if (isAnnotationStartLine(line)) {
            formattedLines.push(getIndent(indentLevel, options) + line);
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
            formattedLines.push(getIndent(indentLevel, options) + line);
            continue;
        }

        if (isInlineEnum(line)) {
            const formattedInline = formatInlineEnum(line, indentLevel, options, {
                getIndent,
                getServiceIndent,
                formatStructFields: (fields, inlineOptions, level) =>
                    formatStructFields(fields, inlineOptions, level, {getIndent}),
                formatEnumFields: (fields, inlineOptions, level) =>
                    formatEnumFields(fields, inlineOptions, level, {getIndent}),
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
                    formatStructFields(fields, innerOptions, level, {getIndent}),
                formatEnumFields: (fields, innerOptions, level) =>
                    formatEnumFields(fields, innerOptions, level, {getIndent}),
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
                        formatEnumFields(fields, innerOptions, level, {getIndent}),
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

        const openBraceLine = formatOpenBraceLine(line, indentLevel, options, {getIndent});
        if (openBraceLine) {
            formattedLines.push(...openBraceLine);
            continue;
        }

        formattedLines.push(getIndent(indentLevel, options) + line);
      } catch (lineError) {
        formatErrorHandler.handleWarning('Line formatting failed, preserving original', {
            component: 'formatThriftContent',
            operation: 'formatLine',
            additionalInfo: {line: i, error: lineError instanceof Error ? lineError.message : 'Unknown'}
        });
        formattedLines.push(getIndent(indentLevel, options) + lines[i].trim());
      }
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

    const cleaned = formattedLines.map(l => l.trimEnd());
    return cleaned.join('\n');
}
