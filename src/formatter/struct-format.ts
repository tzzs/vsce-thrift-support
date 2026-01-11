import {StructField, ThriftFormattingOptions} from '../interfaces.types';

type IndentProvider = (level: number, options: ThriftFormattingOptions) => string;

interface StructFormatDeps {
    getIndent: IndentProvider;
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

        if (options.alignFieldNames) {
            if (field.suffix) {
                const hasDefaultValue = field.suffix.includes('=');
                if (hasDefaultValue && options.alignStructDefaults) {
                    const normalized = field.suffix.replace(/\s*=\s*/, ' = ');
                    contentWidth += maxNameWidth + normalized.length;
                } else {
                    contentWidth += field.name.length + field.suffix.length;
                }
            } else {
                contentWidth += field.name.length;
            }
        } else {
            contentWidth += field.name.length;
            if (field.suffix) {
                contentWidth += field.suffix.length;
            }
        }

        if (options.alignAnnotations && field.annotation) {
            contentWidth += 1;
            contentWidth += maxAnnotationWidth;
        } else if (field.annotation) {
            contentWidth += 1 + field.annotation.length;
        }

        if (options.trailingComma === 'preserve') {
            if ((field.suffix && field.suffix.includes(','))) {
                contentWidth += 1;
            }
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
            let w = 0;
            w += maxFieldIdWidth + 2;
            if (options.alignTypes) {
                w += maxQualifierWidth;
                if (maxQualifierWidth > 0) {
                    w += 1;
                }
            } else {
                w += f.qualifier.length;
                if (f.qualifier.length > 0) {
                    w += 1;
                }
            }
            w += (options.alignTypes ? maxTypeWidth : f.type.length);
            w += 1;
            if (options.alignFieldNames) {
                if (f.suffix) {
                    let s = f.suffix;
                    if (/\,\s*$/.test(s)) {
                        s = s.replace(/,\s*$/, '');
                    }
                    const hasDefault = s.includes('=');
                    if (hasDefault) {
                        s = s.replace(/\s*=\s*/, ' = ');
                    }
                    if (hasDefault && options.alignStructDefaults) {
                        w += maxNameWidth + s.length;
                    } else {
                        w += f.name.length + s.length;
                    }
                } else {
                    w += f.name.length;
                }
            } else {
                w += f.name.length;
                if (f.suffix) {
                    let s = f.suffix;
                    if (/\,\s*$/.test(s)) {
                        s = s.replace(/,\s*$/, '');
                    }
                    if (s.includes('=')) {
                        s = s.replace(/\s*=\s*/, ' = ');
                    }
                    w += s.length;
                }
            }
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
        let appendedComma = false;

        if (hasComma) {
            cleanSuffix = cleanSuffix.replace(/,\s*$/, '');
        }

        if (cleanSuffix && cleanSuffix.includes('=')) {
            cleanSuffix = cleanSuffix.replace(/\s*=\s*/, ' = ');
        }

        if (options.trailingComma === 'add' && !hasComma && !hasSemicolon) {
            hasComma = true;
        } else if (options.trailingComma === 'remove' && hasComma && !hasSemicolon) {
            hasComma = false;
        }

        if (options.alignFieldNames) {
            if (cleanSuffix) {
                const hasDefaultValue = cleanSuffix.includes('=');

                if (hasDefaultValue) {
                    if (options.alignStructDefaults) {
                        formattedLine += field.name.padEnd(maxNameWidth);
                    } else {
                        formattedLine += field.name;
                    }
                } else {
                    formattedLine += field.name;
                }
                formattedLine += cleanSuffix;
            } else {
                formattedLine += field.name;
            }
            if (field.annotation) {
                if (options.alignAnnotations) {
                    const currentWidth = formattedLine.length - deps.getIndent(indentLevel, options).length;
                    const spaces = targetAnnoStart - currentWidth + 1;
                    formattedLine += ' '.repeat(spaces) + field.annotation;
                    if (hasComma && options.trailingComma !== 'add') {
                        formattedLine += ',';
                        appendedComma = true;
                    }
                } else {
                    formattedLine += ' ' + field.annotation;
                    if (hasComma && options.trailingComma !== 'add') {
                        formattedLine += ',';
                        appendedComma = true;
                    }
                }
            }
            if (hasComma && options.trailingComma !== 'add' && !appendedComma) {
                formattedLine += ',';
                appendedComma = true;
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
            if (hasComma && options.trailingComma === 'add') {
                formattedLine += ',';
            }
        } else {
            formattedLine += field.name;
            if (cleanSuffix) {
                formattedLine += cleanSuffix;
            }
            if (field.annotation) {
                if (options.alignAnnotations) {
                    const currentWidth = formattedLine.length - deps.getIndent(indentLevel, options).length;
                    const spaces = targetAnnoStart - currentWidth + 1;
                    formattedLine += ' '.repeat(spaces) + field.annotation;
                    if (hasComma && options.trailingComma !== 'add') {
                        formattedLine += ',';
                        appendedComma = true;
                    }
                } else {
                    formattedLine += ' ' + field.annotation;
                }
            }
            if (hasComma && options.trailingComma !== 'add' && !appendedComma) {
                formattedLine += ',';
                appendedComma = true;
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
            if (hasComma && options.trailingComma === 'add') {
                formattedLine += ',';
            }
        }

        return formattedLine;
    });
}
