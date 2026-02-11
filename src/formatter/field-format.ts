import {EnumField, ThriftFormattingOptions} from '../interfaces.types';

type IndentProvider = (level: number, options: ThriftFormattingOptions) => string;

interface FieldFormatDeps {
    getIndent: IndentProvider;
}

/**
 * Format enum fields with alignment options.
 * @param fields - Enum fields to format.
 * @param options - Formatting options.
 * @param indentLevel - Base indentation level for the fields.
 * @param deps - Formatting dependencies.
 * @returns Formatted enum field lines.
 */
export function formatEnumFields(
    fields: EnumField[],
    options: ThriftFormattingOptions,
    indentLevel: number,
    deps: FieldFormatDeps
): string[] {
    const needsAlignment = options.alignEnumNames || options.alignEnumEquals || options.alignEnumValues || options.alignComments || options.trailingComma !== 'preserve';
    if (!needsAlignment) {
        return fields.map(f => deps.getIndent(indentLevel, options) + f.line);
    }

    const indent = deps.getIndent(indentLevel, options);

    const maxNameWidth = Math.max(...fields.map(f => f.name.length), 0);
    let maxContentWidth = 0;
    let maxAnnoStart = 0;
    const interim: Array<{
        base: string;
        comment: string;
        hasComma: boolean;
        hasSemicolon: boolean;
        annotation: string
    }> = [];

    for (const f of fields) {
        let hasComma = f.suffix ? /,/.test(f.suffix) : false;
        const hasSemicolon = f.suffix ? /;/.test(f.suffix) : false;

        if (!hasSemicolon) {
            if (options.trailingComma === 'add') {
                hasComma = true;
            } else if (options.trailingComma === 'remove') {
                hasComma = false;
            }
        }

        let base = indent;
        if (options.alignEnumEquals) {
            base += f.name.padEnd(maxNameWidth) + ' = ';
        } else {
            const namePart = options.alignEnumNames ? f.name.padEnd(maxNameWidth) : f.name;
            base += namePart + ' = ';
        }

        const valueStr = '' + f.value;
        base += valueStr;

        const baseWidth = base.length - indent.length;
        if (options.alignAnnotations && f.annotation) {
            maxAnnoStart = Math.max(maxAnnoStart, baseWidth);
        }

        interim.push({
            base,
            comment: f.comment,
            hasComma,
            hasSemicolon,
            annotation: f.annotation || ''
        });
    }

    if (options.alignAnnotations) {
        interim.forEach(({base, annotation, hasComma, hasSemicolon}) => {
            let line = base;
            if (annotation) {
                const currentWidth = base.length - indent.length;
                const spaces = maxAnnoStart - currentWidth + 1;
                line = base + ' '.repeat(Math.max(1, spaces)) + annotation;
            }
            if (hasSemicolon || hasComma) {
                line += hasSemicolon ? ';' : ',';
            }
            maxContentWidth = Math.max(maxContentWidth, line.length - indent.length);
        });
    } else {
        interim.forEach(({base, annotation, hasComma, hasSemicolon}) => {
            let line = base;
            if (annotation) {
                line = base + ' ' + annotation;
            }
            if (hasSemicolon || hasComma) {
                line += hasSemicolon ? ';' : ',';
            }
            maxContentWidth = Math.max(maxContentWidth, line.length - indent.length);
        });
    }

    return interim.map(({base, comment, hasComma, hasSemicolon, annotation}) => {
        let line = base;

        if (annotation) {
            if (options.alignAnnotations) {
                const currentWidth = line.length - indent.length;
                const spaces = maxAnnoStart - currentWidth + 1;
                line += ' '.repeat(Math.max(1, spaces)) + annotation;
            } else {
                line += ' ' + annotation;
            }
        }

        if (hasSemicolon) {
            line += ';';
        } else if (hasComma) {
            line += ',';
        }

        if (comment) {
            if (options.alignComments) {
                const currentWidth = line.length - indent.length;
                const pad = Math.max(1, maxContentWidth - currentWidth + 1);
                line += ' '.repeat(pad) + comment;
            } else {
                line += ' ' + comment;
            }
        }

        return line;
    });
}
