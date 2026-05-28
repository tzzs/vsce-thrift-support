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
    if (options.alignFieldNames && (field.suffix || (field.annotation !== undefined && field.annotation !== ''))) {
        w += maxNameWidth;
        if (field.suffix) {
            let s = field.suffix;
            if (/,\s*$/.test(s)) {
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
            if (/,\s*$/.test(s)) {
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
        const isMultiLineField = !!(field.suffix && field.suffix.includes('\n'));
        if (!isMultiLineField && options.alignAnnotations && field.annotation !== undefined && field.annotation !== '') {
            maxAnnotationWidth = Math.max(maxAnnotationWidth, field.annotation.length);
        }
        return field;
    });

    parsedFields.forEach(field => {
        // Multi-line fields' annotations/comments live on the last line and don't participate in alignment.
        if (field.suffix && field.suffix.includes('\n')) {
            return;
        }
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
        const hasCommaForWidth = field.suffix ? /,\s*$/.test(field.suffix) : false;

        // Remove trailing spaces that are just for alignment
        // These spaces are not meaningful content and should not affect width calculation
        cleanSuffixForWidth = cleanSuffixForWidth.replace(/\s+$/, '');

        if (hasCommaForWidth) {
            cleanSuffixForWidth = cleanSuffixForWidth.replace(/,\s*$/, '');
        }
        if (cleanSuffixForWidth && cleanSuffixForWidth.includes('=')) {
            cleanSuffixForWidth = cleanSuffixForWidth.replace(/\s*=\s*/, ' = ');
        }

        if (options.alignFieldNames && (cleanSuffixForWidth || (field.annotation !== undefined && field.annotation !== ''))) {
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

        if (options.alignAnnotations && field.annotation !== undefined && field.annotation !== '') {
            contentWidth += 1;
            contentWidth += maxAnnotationWidth;
        } else if (field.annotation !== undefined && field.annotation !== '') {
            contentWidth += 1 + field.annotation.length;
        }

        // Add comma width if present (for idempotency, use hasCommaForWidth instead of checking field.suffix)
        // Also add comma width when in 'add' mode and there's no semicolon
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
            if (f === undefined || f.annotation === undefined || f.annotation === '') {
                return;
            }
            if (f.suffix && f.suffix.includes('\n')) {
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

    const commentCount = parsedFields.reduce((acc, f) => acc + ((f !== undefined && f.comment) ? 1 : 0), 0);

    return parsedFields.map(field => {
        if (field.suffix && field.suffix.includes('\n')) {
            return formatMultiLineStructField(
                field,
                options,
                indentLevel,
                deps,
                maxFieldIdWidth,
                maxQualifierWidth,
                maxTypeWidth,
                maxNameWidth
            );
        }
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

        const hasContentAfterName = (cleanSuffix && cleanSuffix.length > 0) || (field.annotation !== undefined && field.annotation !== '');
        if (options.alignFieldNames && hasContentAfterName) {
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

        if (field.annotation !== undefined && field.annotation !== '') {
            if (options.alignAnnotations) {
                const currentWidth = formattedLine.length - deps.getIndent(indentLevel, options).length;
                const spaces = targetAnnoStart - currentWidth + 1;
                formattedLine += ' '.repeat(Math.max(0, spaces)) + field.annotation;
            } else {
                formattedLine += ' ' + field.annotation;
            }
        }

        // Add comma or semicolon before comment (not after)
        if (hasSemicolon) {
            formattedLine += ';';
        } else if (hasComma) {
            formattedLine += ',';
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

        return formattedLine;
    });
}

/**
 * Format a struct field whose default value spans multiple lines.
 * Outputs a multi-line string: header on the first line, continuation lines re-indented
 * one level deeper, and the closing bracket + annotation/trailing on the final line.
 */
function formatMultiLineStructField(
    field: StructField,
    options: ThriftFormattingOptions,
    indentLevel: number,
    deps: StructFormatDeps,
    maxFieldIdWidth: number,
    maxQualifierWidth: number,
    maxTypeWidth: number,
    maxNameWidth: number
): string {
    const baseIndent = deps.getIndent(indentLevel, options);
    const innerIndent = deps.getIndent(indentLevel + 1, options);

    let suffix = field.suffix || '';
    let hasComma = /,\s*$/.test(suffix);
    const hasSemicolon = /;\s*$/.test(suffix);
    suffix = suffix.replace(/\s+$/, '');
    if (hasComma) {
        suffix = suffix.replace(/,\s*$/, '');
    }
    if (hasSemicolon) {
        suffix = suffix.replace(/;\s*$/, '');
    }
    if (options.trailingComma === 'add' && !hasComma && !hasSemicolon) {
        hasComma = true;
    } else if (options.trailingComma === 'remove' && hasComma && !hasSemicolon) {
        hasComma = false;
    }

    // suffix is like " = {\nLine2\nLine3\n}"  — strip leading " = "
    const eqStripped = suffix.replace(/^\s*=\s*/, '');
    const parts = eqStripped.split('\n');
    const firstDV = parts[0] ?? '';
    const middleDV = parts.length > 2 ? parts.slice(1, -1) : [];
    const lastDV = parts.length > 1 ? parts[parts.length - 1] : '';

    // String continuation (backslash-terminated multi-line string): preserve verbatim
    // so the embedded whitespace inside the string isn't perturbed.
    if (firstDV.startsWith('"') || firstDV.startsWith('\'')) {
        let header = baseIndent;
        header += (field.id + ':').padEnd(maxFieldIdWidth + 1) + ' ';
        if (options.alignTypes) {
            header += field.qualifier.padEnd(maxQualifierWidth);
            if (maxQualifierWidth > 0) {
                header += ' ';
            }
            header += field.type.padEnd(maxTypeWidth);
        } else {
            header += field.qualifier;
            if (field.qualifier.length > 0) {
                header += ' ';
            }
            header += field.type;
        }
        header += ' ';
        header += options.alignFieldNames ? field.name.padEnd(maxNameWidth) : field.name;
        header += ' = ' + firstDV;
        const tailLines = [...middleDV];
        let last = lastDV;
        if (field.annotation !== undefined && field.annotation !== '') {
            last += ' ' + field.annotation;
        }
        if (hasSemicolon) { last += ';'; }
        else if (hasComma) { last += ','; }
        if (field.comment) { last += ' ' + field.comment; }
        if (parts.length > 1) {
            tailLines.push(last);
        }
        return [header, ...tailLines].join('\n');
    }

    let firstLine = baseIndent;
    firstLine += (field.id + ':').padEnd(maxFieldIdWidth + 1) + ' ';
    if (options.alignTypes) {
        firstLine += field.qualifier.padEnd(maxQualifierWidth);
        if (maxQualifierWidth > 0) {
            firstLine += ' ';
        }
        firstLine += field.type.padEnd(maxTypeWidth);
    } else {
        firstLine += field.qualifier;
        if (field.qualifier.length > 0) {
            firstLine += ' ';
        }
        firstLine += field.type;
    }
    firstLine += ' ';
    if (options.alignFieldNames) {
        firstLine += field.name.padEnd(maxNameWidth);
    } else {
        firstLine += field.name;
    }
    firstLine += ' = ' + firstDV;

    const middleLines = middleDV.map(m => innerIndent + m);

    let lastLine = baseIndent + lastDV;
    if (field.annotation !== undefined && field.annotation !== '') {
        lastLine += ' ' + field.annotation;
    }
    if (hasSemicolon) {
        lastLine += ';';
    } else if (hasComma) {
        lastLine += ',';
    }
    if (field.comment) {
        lastLine += ' ' + field.comment;
    }

    return [firstLine, ...middleLines, lastLine].join('\n');
}
