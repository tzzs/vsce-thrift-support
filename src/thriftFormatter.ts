
import { ThriftFormattingOptions, StructField, EnumField, ConstField } from './interfaces';
import { ThriftParser } from './thriftParser';

export class ThriftFormatter {
    private parser: ThriftParser;

    constructor() {
        this.parser = new ThriftParser();
    }

    public formatThriftCode(text: string, options: ThriftFormattingOptions): string {
        const lines = text.split('\n');
        const formattedLines: string[] = [];
        let indentLevel = (options.initialContext && typeof options.initialContext.indentLevel === 'number')
            ? options.initialContext.indentLevel : 0;
        let inStruct = !!(options.initialContext && options.initialContext.inStruct);
        let inEnum = !!(options.initialContext && options.initialContext.inEnum);
        let structFields: StructField[] = [];
        let enumFields: EnumField[] = [];
        let constFields: ConstField[] = [];
        let inConstBlock = false;
        // Track the indent level where the current const block started, so flushing uses the correct base indent
        let constBlockIndentLevel: number | null = null;

        for (let i = 0; i < lines.length; i++) {
            let originalLine = lines[i];
            let line = originalLine.trim();

            // Flush accumulated struct fields before non-field separators/comments inside struct
            if (inStruct && structFields.length > 0 && !this.parser.isStructField(line) && !line.startsWith('}')) {
                const formattedFields = this.formatStructFields(structFields, options, indentLevel);
                formattedLines.push(...formattedFields);
                structFields = [];
            }

            // Handle block comments
            if (line.startsWith('/*')) {
                const commentLines: string[] = [originalLine];
                let j = i + 1;
                let closed = line.includes('*/');
                while (!closed && j < lines.length) {
                    commentLines.push(lines[j]);
                    if (lines[j].includes('*/')) { closed = true; }
                    j++;
                }

                const indentStr = this.getIndent(indentLevel, options);

                // Single-line block comment
                if (commentLines.length === 1) {
                    formattedLines.push(indentStr + line);
                    continue;
                }

                const openTrim = commentLines[0].trim();
                const openIsDoc = openTrim.startsWith('/**');
                const openToken = openIsDoc ? '/**' : '/*';
                const openRest = openTrim.slice(openToken.length);
                formattedLines.push(indentStr + openToken + openRest);

                for (let k = 1; k < commentLines.length - 1; k++) {
                    let mid = commentLines[k].trim();
                    if (mid.startsWith('*')) { mid = mid.slice(1); }
                    mid = mid.replace(/^\s*/, '');
                    if (mid.length > 0) {
                        formattedLines.push(indentStr + ' * ' + mid);
                    } else {
                        formattedLines.push(indentStr + ' *');
                    }
                }

                formattedLines.push(indentStr + ' */');
                i = j - 1;
                continue;
            }

            // Flush const block if needed
            if (inConstBlock && constFields.length > 0 && !this.parser.isConstField(line) && !this.parser.isConstStart(line)) {
                const formattedFields = this.formatConstFields(constFields, options, constBlockIndentLevel ?? indentLevel);
                formattedLines.push(...formattedFields);
                constFields = [];
                inConstBlock = false;
                constBlockIndentLevel = null;
            }

            // Skip empty lines and line comments
            if (!line || line.startsWith('//') || line.startsWith('#')) {
                formattedLines.push(this.getIndent(indentLevel, options) + line);
                continue;
            }

            // Handle const fields
            if (this.parser.isConstStart(line)) {
                let constValue = line;
                let j = i + 1;
                while (j < lines.length && !(lines[j].trim().endsWith('}') || lines[j].trim().endsWith(']'))) {
                    constValue += '\n' + lines[j].trim();
                    j++;
                }
                if (j < lines.length) {
                    constValue += '\n' + lines[j].trim();
                }
                const fieldInfo = this.parser.parseConstField(constValue);
                if (fieldInfo) {
                    if (constFields.length === 0) { constBlockIndentLevel = indentLevel; }
                    constFields.push(fieldInfo);
                    inConstBlock = true;
                }
                i = j;
                continue;
            } else if (this.parser.isConstField(line)) {
                const fieldInfo = this.parser.parseConstField(line);
                if (fieldInfo) {
                    if (constFields.length === 0) { constBlockIndentLevel = indentLevel; }
                    constFields.push(fieldInfo);
                    inConstBlock = true;
                    continue;
                }
            } else if (inConstBlock && constFields.length > 0 && !this.parser.isConstField(line) && !this.parser.isConstStart(line)) {
            }

            // Typedef normalization
            if (/^\s*typedef\b/.test(line)) {
                const normalized = this.normalizeGenericsInSignature(line);
                formattedLines.push(this.getIndent(indentLevel, options) + normalized);
                continue;
            }

            // Handle struct/union/exception/service definitions
            if (this.parser.isStructStart(line)) {
                if (line.includes('{') && line.includes('}')) {
                    formattedLines.push(this.getIndent(indentLevel, options) + line);
                    continue;
                }
                formattedLines.push(this.getIndent(indentLevel, options) + line);
                indentLevel++;
                inStruct = true;
                continue;
            }
            if (inStruct) {
                if (line.startsWith('}')) {
                    if (structFields.length > 0) {
                        const formattedFields = this.formatStructFields(structFields, options, indentLevel);
                        formattedLines.push(...formattedFields);
                        structFields = [];
                    }
                    indentLevel--;
                    formattedLines.push(this.getIndent(indentLevel, options) + line);
                    inStruct = false;
                    continue;
                }

                if (this.parser.reServiceMethod.test(line)) {
                    const normalized = this.normalizeGenericsInSignature(line);
                    formattedLines.push(this.getIndent(indentLevel, options) + normalized);
                    continue;
                }

                if (this.parser.isStructField(line)) {
                    const fieldInfo = this.parser.parseStructField(line);
                    if (fieldInfo) {
                        structFields.push(fieldInfo);
                        continue;
                    }
                }
            }

            if (this.parser.isEnumStart(line)) {
                if (line.includes('{') && line.includes('}')) {
                    formattedLines.push(this.getIndent(indentLevel, options) + line);
                    continue;
                }
                formattedLines.push(this.getIndent(indentLevel, options) + line);
                indentLevel++;
                inEnum = true;
                continue;
            }
            if (inEnum) {
                if (line.startsWith('}')) {
                    if (enumFields.length > 0) {
                        const formattedFields = this.formatEnumFields(enumFields, options, indentLevel);
                        formattedLines.push(...formattedFields);
                        enumFields = [];
                    }
                    indentLevel--;
                    formattedLines.push(this.getIndent(indentLevel, options) + line);
                    inEnum = false;
                    continue;
                }

                if (this.parser.isEnumField(line)) {
                    const fieldInfo = this.parser.parseEnumField(line);
                    if (fieldInfo) {
                        enumFields.push(fieldInfo);
                        continue;
                    }
                }
            }

            if (line === '{') {
                const level = Math.max(indentLevel - 1, 0);
                formattedLines.push(this.getIndent(level, options) + line);
                continue;
            }

            formattedLines.push(this.getIndent(indentLevel, options) + line);
        }

        if (constFields.length > 0) {
            const formattedFields = this.formatConstFields(constFields, options, constBlockIndentLevel ?? indentLevel);
            formattedLines.push(...formattedFields);
        }
        if (structFields.length > 0) {
            const formattedFields = this.formatStructFields(structFields, options, indentLevel);
            formattedLines.push(...formattedFields);
        }
        if (enumFields.length > 0) {
            const formattedFields = this.formatEnumFields(enumFields, options, indentLevel);
            formattedLines.push(...formattedFields);
        }

        const cleaned = formattedLines.map(l => l.replace(/\s+$/g, ''));
        return cleaned.join('\n');
    }

    public getIndent(level: number, options: ThriftFormattingOptions): string {
        const indentSize = options.indentSize || 4;
        if (options.insertSpaces) {
            return ' '.repeat(level * indentSize);
        } else {
            return '\t'.repeat(level);
        }
    }

    private formatStructFields(
        fields: StructField[],
        options: ThriftFormattingOptions,
        indentLevel: number
    ): string[] {
        const sortedFields = [...fields].sort((a, b) => {
            const aIdMatch = a.line.match(/^\s*(\d+):/);
            const bIdMatch = b.line.match(/^\s*(\d+):/);
            if (aIdMatch && bIdMatch) {
                return parseInt(aIdMatch[1]) - parseInt(bIdMatch[1]);
            }
            return 0;
        });

        const needsAlignment = options.alignTypes || options.alignFieldNames || options.alignComments || options.alignAnnotations;

        if (!needsAlignment && options.trailingComma === 'preserve') {
            return sortedFields.map(f => this.getIndent(indentLevel, options) + f.line);
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
            contentWidth += maxFieldIdWidth + 2; // +2 for ": "

            if (options.alignTypes) {
                contentWidth += maxQualifierWidth;
                if (maxQualifierWidth > 0) { contentWidth += 1; }
            } else {
                contentWidth += field.qualifier.length;
                if (field.qualifier.length > 0) { contentWidth += 1; }
            }

            if (options.alignTypes) {
                contentWidth += maxTypeWidth;
            } else {
                contentWidth += field.type.length;
            }
            contentWidth += 1; // space after type

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
            if (!options.alignAnnotations) { return 0; }
            let max = 0;
            parsedFields.forEach(f => {
                if (!f || !f.annotation) { return; }
                let w = 0;
                w += maxFieldIdWidth + 2;
                if (options.alignTypes) {
                    w += maxQualifierWidth;
                    if (maxQualifierWidth > 0) { w += 1; }
                } else {
                    w += f.qualifier.length;
                    if (f.qualifier.length > 0) { w += 1; }
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
                if (w > max) { max = w; }
            });
            return max;
        })();

        const commentCount = parsedFields.reduce((acc, f) => acc + ((f && f.comment) ? 1 : 0), 0);

        return parsedFields.map(field => {
            let formattedLine = this.getIndent(indentLevel, options);

            const fieldIdWithColon = field.id + ':';
            formattedLine += fieldIdWithColon.padEnd(maxFieldIdWidth + 1) + ' ';

            if (options.alignTypes) {
                formattedLine += field.qualifier.padEnd(maxQualifierWidth);
                if (maxQualifierWidth > 0) { formattedLine += ' '; }
            } else {
                formattedLine += field.qualifier;
                if (field.qualifier.length > 0) { formattedLine += ' '; }
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
                        const currentWidth = formattedLine.length - this.getIndent(indentLevel, options).length;
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
                        const currentWidth = formattedLine.length - this.getIndent(indentLevel, options).length;
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
                        const currentWidth = formattedLine.length - this.getIndent(indentLevel, options).length;
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
                        const currentWidth = formattedLine.length - this.getIndent(indentLevel, options).length;
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

    private formatEnumFields(
        fields: EnumField[],
        options: ThriftFormattingOptions,
        indentLevel: number
    ): string[] {
        const needsAlignment = options.alignEnumNames || options.alignEnumEquals || options.alignEnumValues || options.alignComments || options.trailingComma !== 'preserve';
        if (!needsAlignment) {
            return fields.map(f => this.getIndent(indentLevel, options) + f.line);
        }

        const indent = this.getIndent(indentLevel, options);

        const maxNameWidth = Math.max(...fields.map(f => f.name.length), 0);
        const maxValueWidth = options.alignEnumValues ? Math.max(...fields.map(f => String(f.value).length)) : 0;

        let maxContentWidth = 0;
        const interim: Array<{ base: string; comment: string; hasComma: boolean; hasSemicolon: boolean }> = [];

        for (const f of fields) {
            let hasComma = f.suffix ? /,/.test(f.suffix) : false;
            const hasSemicolon = f.suffix ? /;/.test(f.suffix) : false;

            if (!hasSemicolon) {
                if (options.trailingComma === 'add') { hasComma = true; }
                else if (options.trailingComma === 'remove') { hasComma = false; }
            }

            // Handle name/equals alignment
            let base = indent;
            if (options.alignEnumEquals) {
                base += f.name.padEnd(maxNameWidth) + ' = ';
            } else {
                const namePart = options.alignEnumNames ? f.name.padEnd(maxNameWidth) : f.name;
                base += namePart + ' = ';
            }

            let valueStr = '' + f.value;
            if (options.alignEnumValues) {
                valueStr = valueStr.padEnd(maxValueWidth);
            }
            base += valueStr;

            if (!hasSemicolon && options.trailingComma !== 'add' && hasComma) {
                base += ',';
            }

            interim.push({ base, comment: f.comment, hasComma, hasSemicolon });
            maxContentWidth = Math.max(maxContentWidth, base.length - indent.length);
        }
        return interim.map(({ base, comment, hasComma, hasSemicolon }) => {
            let line = base;
            if (comment) {
                if (options.alignComments) {
                    const currentWidth = base.length - indent.length;
                    const pad = Math.max(1, maxContentWidth - currentWidth + 1);
                    line = base + ' '.repeat(pad) + comment;
                } else {
                    line = base + ' ' + comment;
                }
            }
            if (hasSemicolon) {
                line += ';';
            }
            if (!hasSemicolon && hasComma && options.trailingComma === 'add') {
                line += ',';
            }
            return line;
        });
    }

    private formatConstFields(
        fields: ConstField[],
        options: ThriftFormattingOptions,
        indentLevel: number
    ): string[] {
        if (fields.length === 0) { return []; }

        const collectionStyle = options.collectionStyle || 'preserve';
        const maxLineLength = options.maxLineLength || 100;

        const indent = this.getIndent(indentLevel, options);
        const valueIndent = this.getIndent(indentLevel + 1, options);
        const alignComments = options.alignComments !== false;

        // Expand inline collections
        const adjFields = fields.map((f) => {
            let value = f.value;
            const isInlineCollection = !value.includes('\n') && ((/^\[.*\]$/.test(value)) || (/^\{.*\}$/.test(value)));

            let shouldExpand = false;
            if (isInlineCollection) {
                if (collectionStyle === 'multiline') {
                    shouldExpand = true;
                } else if (collectionStyle === 'auto') {
                    const inlineLine = `${indent}const ${f.type} ${f.name} = ${value}${f.comment ? ' ' + f.comment : ''}`;
                    if (inlineLine.length > maxLineLength) {
                        shouldExpand = true;
                    }
                }
            }

            if (shouldExpand) {
                const open = value[0];
                const close = value[value.length - 1];
                const inner = value.substring(1, value.length - 1).trim();

                const items: string[] = [];
                let current = '';
                let depth = 0;
                let inString = false;
                let stringChar = '';
                for (let i = 0; i < inner.length; i++) {
                    const ch = inner[i];
                    const prev = i > 0 ? inner[i - 1] : '';
                    if (inString) {
                        current += ch;
                        if (ch === stringChar && prev !== '\\') {
                            inString = false;
                        }
                        continue;
                    }
                    if (ch === '"' || ch === "'") {
                        inString = true;
                        stringChar = ch;
                        current += ch;
                        continue;
                    }
                    if (ch === '[' || ch === '{' || ch === '(') {
                        depth++;
                        current += ch;
                        continue;
                    }
                    if (ch === ']' || ch === '}' || ch === ')') {
                        depth--;
                        current += ch;
                        continue;
                    }
                    if (ch === ',' && depth === 0) {
                        if (current.trim()) { items.push(current.trim()); }
                        current = '';
                    } else {
                        current += ch;
                    }
                }
                if (current.trim()) { items.push(current.trim()); }

                const lines: string[] = [open];
                for (let idx = 0; idx < items.length; idx++) {
                    const comma = idx < items.length - 1 ? ',' : '';
                    lines.push(items[idx] + comma);
                }
                lines.push(close);
                value = lines.join('\n');
            }

            return { ...f, value };
        });

        const maxTypeWidth = Math.max(...adjFields.map(f => f.type.length));
        const maxNameWidth = Math.max(...adjFields.map(f => f.name.length));

        let maxFirstLineBaseLen = 0;
        for (const f of adjFields) {
            if (!f.comment) { continue; }
            const firstLineValue = f.value.includes('\n') ? f.value.split('\n')[0] : f.value;
            const base = `const ${f.type.padEnd(maxTypeWidth)} ${f.name.padEnd(maxNameWidth)} = ${firstLineValue}`;
            if (base.length > maxFirstLineBaseLen) { maxFirstLineBaseLen = base.length; }
        }

        return adjFields.map(field => {
            const paddedType = field.type.padEnd(maxTypeWidth);
            const paddedName = field.name.padEnd(maxNameWidth);

            if (field.value.includes('\n')) {
                const lines = field.value.split('\n');
                const firstLine = lines[0];
                const outLines: string[] = [];

                let first = `${indent}const ${paddedType} ${paddedName} = ${firstLine}`;
                if (field.comment) {
                    if (alignComments) {
                        const currentLen = first.length - indent.length;
                        const pad = Math.max(1, maxFirstLineBaseLen - currentLen + 1);
                        first = first + ' '.repeat(pad) + field.comment;
                    } else {
                        first += ` ${field.comment}`;
                    }
                }
                outLines.push(first);

                for (let i = 1; i < lines.length; i++) {
                    const raw = lines[i];
                    const line = raw.trim();
                    if (!line) {
                        outLines.push('');
                        continue;
                    }

                    if (line === '}' || line === ']') {
                        outLines.push(indent + line);
                        continue;
                    }

                    if (line.startsWith('//')) {
                        let idx = outLines.length - 1;
                        while (idx >= 0 && outLines[idx] === '') { idx--; }
                        if (idx >= 0) {
                            outLines[idx] += ` ${line}`;
                        } else {
                            outLines.push(indent + line);
                        }
                        continue;
                    }

                    outLines.push(valueIndent + line);
                }

                if (alignComments) {
                    const indices: number[] = [];
                    let maxContentLen = 0;
                    for (let idx = 1; idx < outLines.length; idx++) {
                        const l = outLines[idx];
                        const trimmed = l.trim();
                        if (!trimmed || trimmed === '}' || trimmed === ']') { continue; }
                        const m = l.match(/^(\s*)(.*?)(\s*)(\/\/.*)$/);
                        if (m) {
                            const leading = m[1] || '';
                            const content = (m[2] || '').replace(/\s+$/, '');
                            const len = leading.length + content.length;
                            if (len > maxContentLen) { maxContentLen = len; }
                            indices.push(idx);
                        }
                    }
                    if (indices.length > 0) {
                        for (const idx of indices) {
                            const l = outLines[idx];
                            const m = l.match(/^(\s*)(.*?)(\s*)(\/\/.*)$/);
                            if (!m) { continue; }
                            const leading = m[1] || '';
                            const content = (m[2] || '').replace(/\s+$/, '');
                            const comment = (m[4] || '').replace(/^\s+/, '');
                            const currentLen = leading.length + content.length;
                            const pad = Math.max(1, maxContentLen - currentLen + 1);
                            outLines[idx] = leading + content + ' '.repeat(pad) + comment;
                        }
                    }
                }

                return outLines.join('\n');
            } else {
                let base = `${indent}const ${paddedType} ${paddedName} = ${field.value}`;
                if (field.comment) {
                    if (alignComments) {
                        const currentLen = base.length - indent.length;
                        const pad = Math.max(1, maxFirstLineBaseLen - currentLen + 1);
                        base = base + ' '.repeat(pad) + field.comment;
                    } else {
                        base += ` ${field.comment}`;
                    }
                }
                return base;
            }
        });
    }

    private normalizeGenericsInSignature(text: string): string {
        if (!text) { return text; }
        let code = text;
        let comment = '';
        const cm = code.match(/^(.*?)(\/\/.*)$/);
        if (cm) {
            code = cm[1].trimEnd();
            comment = cm[2];
        }
        let res: string[] = [];
        let depthAngle = 0;
        let inS = false, inD = false;
        const n = code.length;
        for (let i = 0; i < n; i++) {
            const ch = code[i];

            if (inD) {
                if (ch === '\\' && i + 1 < n) { res.push(ch); res.push(code[++i]); continue; }
                res.push(ch);
                if (ch === '"') { inD = false; }
                continue;
            }
            if (inS) {
                if (ch === '\\' && i + 1 < n) { res.push(ch); res.push(code[++i]); continue; }
                res.push(ch);
                if (ch === "'") { inS = false; }
                continue;
            }

            if (ch === '"') { inD = true; res.push(ch); continue; }
            if (ch === "'") { inS = true; res.push(ch); continue; }
            if (ch === '<') {
                while (res.length > 0 && res[res.length - 1] === ' ') { res.pop(); }
                res.push('<');
                depthAngle++;
                while (i + 1 < n && code[i + 1] === ' ') { i++; }
                continue;
            }
            if (ch === ',' && depthAngle > 0) {
                while (res.length > 0 && res[res.length - 1] === ' ') { res.pop(); }
                res.push(',');
                while (i + 1 < n && code[i + 1] === ' ') { i++; }
                continue;
            }
            if (ch === '>') {
                if (depthAngle > 0) {
                    while (res.length > 0 && res[res.length - 1] === ' ') { res.pop(); }
                    res.push('>');
                    depthAngle = Math.max(0, depthAngle - 1);
                    let k = i + 1;
                    while (k < n && code[k] === ' ') { k++; }
                    if (k < n) {
                        const next = code[k];
                        if (next === ',' || next === '>' || next === ')') {
                            i = k - 1;
                        }
                    } else {
                        i = k - 1;
                    }
                    continue;
                }
            }
            res.push(ch);
        }
        const normalized = res.join('');
        return comment ? `${normalized} ${comment}` : normalized;
    }
}
