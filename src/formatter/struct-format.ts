import {StructField, ThriftFormattingOptions} from '../interfaces.types';

type IndentProvider = (level: number, options: ThriftFormattingOptions) => string;

interface StructFormatDeps {
    getIndent: IndentProvider;
}

/**
 * Calculate the starting position for annotations based on field content width.
 * This function is used both for max content width calculation and target annotation alignment.
 */
function calculateAnnotationStartPosition(
    field: StructField,
    options: ThriftFormattingOptions,
    maxFieldIdWidth: number,
    maxQualifierWidth: number,
    maxTypeWidth: number,
    maxNameWidth: number
): number {
    let w = 0;
    w += maxFieldIdWidth + 2;
    if (options.alignTypes) {
        w += maxQualifierWidth;
        if (maxQualifierWidth > 0) {
            w += 1;
        }
    } else {
        w += field.qualifier.length;
        if (field.qualifier.length > 0) {
            w += 1;
        }
    }
    w += (options.alignTypes ? maxTypeWidth : field.type.length);
    w += 1;
    if (options.alignFieldNames && (field.suffix || field.annotation || field.comment)) {
        w += maxNameWidth;
        if (field.suffix) {
            let s = field.suffix;
            if (/\,\s*$/.test(s)) {
                s = s.replace(/,\s*$/, '');
            }
            if (s.includes('=')) {
                s = s.replace(/\s*=\s*/, ' = ');
            }
            w += s.length;
        }
    } else {
        w += field.name.length;
        if (field.suffix) {
            let s = field.suffix;
            if (/\,\s*$/.test(s)) {
                s = s.replace(/,\s*$/, '');
            }
            if (s.includes('=')) {
                s = s.replace(/\s*=\s*/, ' = ');
            }
            w += s.length;
        }
    }
    return w;
}

/**
 * Format struct fields with alignment options.
 * @param fields - Struct fields to format.
 * @param options - Formatting options.
 * @param indentLevel - Base indentation level for the fields.
 * @param deps - Formatting dependencies.
 * @returns Formatted struct field lines.
 */
export function formatStructFields(
    fields: StructField[],
    options: ThriftFormattingOptions,
    indentLevel: number,
    deps: StructFormatDeps
): string[] {
    const sortedFields = fields;

    const needsAlignment = options.alignTypes || options.alignFieldNames || options.alignComments || options.alignAnnotations;

    if (!needsAlignment && options.trailingComma === 'preserve') {
        return sortedFields.map(f => deps.getIndent(indentLevel, options) + f.line);
    }

    let maxFieldIdWidth = 0;
    let maxQualifierWidth = 0;
    let maxTypeWidth = 0;
    let maxNameWidth = 0;
    let maxAnnotationWidth = 0;
    let maxContentWidth = 0;

    const parsedFields = sortedFields.map(field => {
        maxFieldIdWidth = Math.max(maxFieldIdWidth, field.id.length);
        maxQualifierWidth = Math.max(maxQualifierWidth, field.qualifier.length);
        maxTypeWidth = Math.max(maxTypeWidth, field.type.length);
        maxNameWidth = Math.max(maxNameWidth, field.name.length);
        if (options.alignAnnotations && field.annotation) {
            maxAnnotationWidth = Math.max(maxAnnotationWidth, field.annotation.length);
        }
        return field;
    });

    parsedFields.forEach(field => {
        let contentWidth = 0;
        contentWidth += maxFieldIdWidth + 2;

        if (options.alignTypes) {
            contentWidth += maxQualifierWidth;
            if (maxQualifierWidth > 0) {
                contentWidth += 1;
            }
        } else {
            contentWidth += field.qualifier.length;
            if (field.qualifier.length > 0) {
                contentWidth += 1;
            }
        }

        if (options.alignTypes) {
            contentWidth += maxTypeWidth;
        } else {
            contentWidth += field.type.length;
        }
        contentWidth += 1;

        // Clean suffix for width calculation to ensure idempotency
        // For idempotency, calculate based on ideal output, not input spacing
        // Trailing spaces in suffix are alignment padding and should be ignored
        let cleanSuffixForWidth = field.suffix || '';
        // Detect comma from suffix (original location)
        let hasCommaForWidth = field.suffix ? /,\s*$/.test(field.suffix) : false;

        // Idempotency fix: when preserving commas, if we have a comment/annotation
        // and the field is likely not the last one, assume comma should be present
        // This handles cases where comma was moved to end in previous format pass
        if (options.trailingComma === 'preserve' && !hasCommaForWidth && (field.comment || field.annotation)) {
            // Heuristic: fields with comments/annotations in a struct are usually not the last field
            // This is imperfect but ensures idempotency for common cases
            hasCommaForWidth = true;
        }

        // Remove trailing spaces that are just for alignment
        // These spaces are not meaningful content and should not affect width calculation
        cleanSuffixForWidth = cleanSuffixForWidth.replace(/\s+$/, '');

        if (hasCommaForWidth) {
            cleanSuffixForWidth = cleanSuffixForWidth.replace(/,\s*$/, '');
        }
        if (cleanSuffixForWidth && cleanSuffixForWidth.includes('=')) {
            cleanSuffixForWidth = cleanSuffixForWidth.replace(/\s*=\s*/, ' = ');
        }

        if (options.alignFieldNames && (cleanSuffixForWidth || field.annotation || field.comment)) {
            contentWidth += maxNameWidth;
            if (cleanSuffixForWidth) {
                contentWidth += cleanSuffixForWidth.length;
            }
        } else {
            contentWidth += field.name.length;
            if (cleanSuffixForWidth) {
                contentWidth += cleanSuffixForWidth.length;
            }
        }

        if (options.alignAnnotations && field.annotation) {
            contentWidth += 1;
            contentWidth += maxAnnotationWidth;
        } else if (field.annotation) {
            contentWidth += 1 + field.annotation.length;
        }

        // Add comma width if present (for idempotency, use hasCommaForWidth instead of checking field.suffix)
        // Also add comma width when in 'add' mode and there's no semicolon
        let finalHasComma = hasCommaForWidth;
        if (options.trailingComma === 'add' && !/;/.test(field.suffix || '')) {
            finalHasComma = true;
        }

        if (options.trailingComma === 'preserve' && hasCommaForWidth) {
            contentWidth += 1;
        } else if (options.trailingComma === 'add' && !/;/.test(field.suffix || '')) {
            contentWidth += 1;
        }

        maxContentWidth = Math.max(maxContentWidth, contentWidth);
    });

    const targetAnnoStart = (() => {
        if (!options.alignAnnotations) {
            return 0;
        }
        let max = 0;
        parsedFields.forEach(f => {
            if (!f || !f.annotation) {
                return;
            }
            const w = calculateAnnotationStartPosition(
                f,
                options,
                maxFieldIdWidth,
                maxQualifierWidth,
                maxTypeWidth,
                maxNameWidth
            );
            if (w > max) {
                max = w;
            }
        });
        return max;
    })();

    const commentCount = parsedFields.reduce((acc, f) => acc + ((f && f.comment) ? 1 : 0), 0);

    return parsedFields.map(field => {
        let formattedLine = deps.getIndent(indentLevel, options);

        const fieldIdWithColon = field.id + ':';
        formattedLine += fieldIdWithColon.padEnd(maxFieldIdWidth + 1) + ' ';

        if (options.alignTypes) {
            formattedLine += field.qualifier.padEnd(maxQualifierWidth);
            if (maxQualifierWidth > 0) {
                formattedLine += ' ';
            }
        } else {
            formattedLine += field.qualifier;
            if (field.qualifier.length > 0) {
                formattedLine += ' ';
            }
        }

        if (options.alignTypes) {
            formattedLine += field.type.padEnd(maxTypeWidth);
        } else {
            formattedLine += field.type;
        }

        formattedLine += ' ';

        let cleanSuffix = field.suffix || '';
        let hasComma = cleanSuffix ? /,\s*$/.test(cleanSuffix) : false;
        const hasSemicolon = cleanSuffix ? /;/.test(cleanSuffix) : false;

        // Remove trailing spaces that are just for alignment (for idempotency)
        // These spaces are not meaningful content
        cleanSuffix = cleanSuffix.replace(/\s+$/, '');

        // Remove trailing comma from suffix (we'll add it back later before annotation/comment)
        if (hasComma) {
            cleanSuffix = cleanSuffix.replace(/,\s*$/, '');
        }

        // Remove semicolon from suffix (we'll add it back later before annotation/comment)
        if (hasSemicolon) {
            cleanSuffix = cleanSuffix.replace(/;/g, '');
        }

        if (cleanSuffix && cleanSuffix.includes('=')) {
            cleanSuffix = cleanSuffix.replace(/\s*=\s*/, ' = ');
        }

        if (options.trailingComma === 'add' && !hasComma && !hasSemicolon) {
            hasComma = true;
        } else if (options.trailingComma === 'remove' && hasComma && !hasSemicolon) {
            hasComma = false;
        }

        if (options.alignFieldNames && (field.suffix || field.annotation || field.comment)) {
            formattedLine += field.name.padEnd(maxNameWidth);
            if (cleanSuffix) {
                formattedLine += cleanSuffix;
            }
        } else {
            formattedLine += field.name;
            if (cleanSuffix) {
                formattedLine += cleanSuffix;
            }
        }

        if (field.annotation) {
            if (options.alignAnnotations) {
                const currentWidth = formattedLine.length - deps.getIndent(indentLevel, options).length;
                const spaces = targetAnnoStart - currentWidth + 1;
                formattedLine += ' '.repeat(Math.max(0, spaces)) + field.annotation;
            } else {
                formattedLine += ' ' + field.annotation;
            }
        }

        if (field.comment) {
            if (options.alignComments) {
                const currentWidth = formattedLine.length - deps.getIndent(indentLevel, options).length;
                const diff = maxContentWidth - currentWidth;
                const basePad = Math.max(1, diff + 1);
                const padSpaces = commentCount > 1 ? basePad : 1;
                formattedLine += ' '.repeat(padSpaces) + field.comment;
            } else {
                formattedLine += ' ' + field.comment;
            }
        }

        // Add comma or semicolon at the end of the line (after comment if present)
        if (hasSemicolon) {
            formattedLine += ';';
        } else if (hasComma) {
            formattedLine += ',';
        }

        return formattedLine;
    });
}
