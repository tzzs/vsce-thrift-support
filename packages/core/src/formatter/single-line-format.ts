import {EnumField, StructField, ThriftFormattingOptions} from '../interfaces.types';

type IndentProvider = (level: number, options: ThriftFormattingOptions) => string;
type StructFormatter = (fields: StructField[], options: ThriftFormattingOptions, indentLevel: number) => string[];
type EnumFormatter = (fields: EnumField[], options: ThriftFormattingOptions, indentLevel: number) => string[];
type StructFieldParser = (text: string) => StructField | null;
type EnumFieldParser = (text: string) => EnumField | null;
type SignatureNormalizer = (text: string) => string;
type PartSplitter = (content: string) => string[];

interface SingleLineFormatDeps {
    getIndent: IndentProvider;
    getServiceIndent: IndentProvider;
    formatStructFields: StructFormatter;
    formatEnumFields: EnumFormatter;
    parseStructFieldText: StructFieldParser;
    parseEnumFieldText: EnumFieldParser;
    normalizeGenericsInSignature: SignatureNormalizer;
    splitTopLevelParts: PartSplitter;
}

/**
 * Format a single-line struct/union/exception definition.
 * @param line - Single-line struct-like definition.
 * @param indentLevel - Base indentation level.
 * @param options - Formatting options.
 * @param deps - Formatting dependencies.
 * @returns Formatted lines, or null when not a valid single-line body.
 */
export function formatSingleLineStruct(
    line: string,
    indentLevel: number,
    options: ThriftFormattingOptions,
    deps: SingleLineFormatDeps
): string[] | null {
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
    const formattedLines: string[] = [];

    formattedLines.push(deps.getIndent(indentLevel, options) + structHeader + ' {');

    if (structContent) {
        const fieldStrings = deps.splitTopLevelParts(structContent);
        const fieldInfos: StructField[] = [];
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

/**
 * Format a single-line enum definition.
 * @param line - Single-line enum definition.
 * @param indentLevel - Base indentation level.
 * @param options - Formatting options.
 * @param deps - Formatting dependencies.
 * @returns Formatted lines, or null when not a valid single-line body.
 */
export function formatSingleLineEnum(
    line: string,
    indentLevel: number,
    options: ThriftFormattingOptions,
    deps: SingleLineFormatDeps
): string[] | null {
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
    const formattedLines: string[] = [];

    formattedLines.push(deps.getIndent(indentLevel, options) + enumHeader + ' {');

    if (enumContent) {
        const fieldStrings = deps.splitTopLevelParts(enumContent);
        const enumFieldInfos: EnumField[] = [];
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

/**
 * Format a single-line service definition.
 * @param line - Single-line service definition.
 * @param indentLevel - Base indentation level.
 * @param options - Formatting options.
 * @param deps - Formatting dependencies.
 * @returns Formatted lines, or null when not a valid single-line body.
 */
export function formatSingleLineService(
    line: string,
    indentLevel: number,
    options: ThriftFormattingOptions,
    deps: SingleLineFormatDeps
): string[] | null {
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
    const formattedLines: string[] = [];

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
