import {EnumField, StructField, ThriftFormattingOptions} from '../interfaces.types';

type IndentProvider = (level: number, options: ThriftFormattingOptions) => string;
type StructFormatter = (fields: StructField[], options: ThriftFormattingOptions, indentLevel: number) => string[];
type EnumFormatter = (fields: EnumField[], options: ThriftFormattingOptions, indentLevel: number) => string[];
type StructFieldParser = (text: string) => StructField | null;
type EnumFieldParser = (text: string) => EnumField | null;
type SignatureNormalizer = (text: string) => string;
type PartSplitter = (content: string) => string[];

interface InlineFormatDeps {
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
 * Check whether the line is an inline struct/union/exception definition.
 * @param line - Raw line content.
 * @returns True when the line contains a complete inline struct-like body.
 */
export function isInlineStructLike(line: string): boolean {
    return /^(struct|union|exception)\b/.test(line) && line.includes('{') && line.includes('}');
}

/**
 * Check whether the line is an inline enum definition.
 * @param line - Raw line content.
 * @returns True when the line contains a complete inline enum body.
 */
export function isInlineEnum(line: string): boolean {
    return /^(enum|senum)\b/.test(line) && line.includes('{') && line.includes('}');
}

/**
 * Check whether the line is an inline service definition.
 * @param line - Raw line content.
 * @returns True when the line contains a complete inline service body.
 */
export function isInlineService(line: string): boolean {
    return /^service\b/.test(line) && line.includes('{') && line.includes('}');
}

/**
 * Format an inline struct/union/exception definition into multi-line output.
 * @param line - Inline definition line.
 * @param indentLevel - Base indentation level.
 * @param options - Formatting options.
 * @param deps - Formatting dependencies.
 * @returns Formatted lines or null when not an inline body.
 */
export function formatInlineStructLike(
    line: string,
    indentLevel: number,
    options: ThriftFormattingOptions,
    deps: InlineFormatDeps
): string[] | null {
    const openBraceIndex = line.indexOf('{');
    const closeBraceIndex = line.lastIndexOf('}');
    if (openBraceIndex === -1 || closeBraceIndex === -1 || openBraceIndex >= closeBraceIndex) {
        return null;
    }
    const structHeader = line.substring(0, openBraceIndex).trim();
    const structContent = line.substring(openBraceIndex + 1, closeBraceIndex).trim();

    const out: string[] = [];
    out.push(deps.getIndent(indentLevel, options) + structHeader + ' {');
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
            out.push(...formattedFields);
        }
    }
    out.push(deps.getIndent(indentLevel, options) + '}');
    return out;
}

/**
 * Format an inline enum definition into multi-line output.
 * @param line - Inline enum definition line.
 * @param indentLevel - Base indentation level.
 * @param options - Formatting options.
 * @param deps - Formatting dependencies.
 * @returns Formatted lines or null when not an inline body.
 */
export function formatInlineEnum(
    line: string,
    indentLevel: number,
    options: ThriftFormattingOptions,
    deps: InlineFormatDeps
): string[] | null {
    const openBraceIndex = line.indexOf('{');
    const closeBraceIndex = line.lastIndexOf('}');
    if (openBraceIndex === -1 || closeBraceIndex === -1 || openBraceIndex >= closeBraceIndex) {
        return null;
    }
    const enumHeader = line.substring(0, openBraceIndex).trim();
    const enumContent = line.substring(openBraceIndex + 1, closeBraceIndex).trim();

    const out: string[] = [];
    out.push(deps.getIndent(indentLevel, options) + enumHeader + ' {');
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
            out.push(...formattedFields);
        }
    }
    out.push(deps.getIndent(indentLevel, options) + '}');
    return out;
}

/**
 * Format an inline service definition into multi-line output.
 * @param line - Inline service definition line.
 * @param indentLevel - Base indentation level.
 * @param options - Formatting options.
 * @param deps - Formatting dependencies.
 * @returns Formatted lines or null when not an inline body.
 */
export function formatInlineService(
    line: string,
    indentLevel: number,
    options: ThriftFormattingOptions,
    deps: InlineFormatDeps
): string[] | null {
    const openBraceIndex = line.indexOf('{');
    const closeBraceIndex = line.lastIndexOf('}');
    if (openBraceIndex === -1 || closeBraceIndex === -1 || openBraceIndex >= closeBraceIndex) {
        return null;
    }
    const serviceHeader = line.substring(0, openBraceIndex).trim();
    const serviceContent = line.substring(openBraceIndex + 1, closeBraceIndex).trim();

    const out: string[] = [];
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
