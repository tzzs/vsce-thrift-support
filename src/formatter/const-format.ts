import { ConstField, ThriftFormattingOptions } from '../interfaces.types';

type IndentProvider = (level: number, options: ThriftFormattingOptions) => string;

interface ConstFormatDeps {
    getIndent: IndentProvider;
}

/**
 * Format const fields with alignment and collection expansion options.
 * @param fields - Const fields to format.
 * @param options - Formatting options.
 * @param indentLevel - Base indentation level for the const block.
 * @param deps - Formatting dependencies.
 * @returns Formatted const field lines.
 */
export function formatConstFields(
    fields: ConstField[],
    options: ThriftFormattingOptions,
    indentLevel: number,
    deps: ConstFormatDeps
): string[] {
    if (fields.length === 0) {
        return [];
    }

    const collectionStyle = options.collectionStyle || 'preserve';
    const maxLineLength = options.maxLineLength || 100;

    const indent = deps.getIndent(indentLevel, options);
    const valueIndent = deps.getIndent(indentLevel + 1, options);
    const alignComments = options.alignComments !== false;

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
                    if (current.trim()) {
                        items.push(current.trim());
                    }
                    current = '';
                } else {
                    current += ch;
                }
            }
            if (current.trim()) {
                items.push(current.trim());
            }

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
        if (!f.comment) {
            continue;
        }
        const firstLineValue = f.value.includes('\n') ? f.value.split('\n')[0] : f.value;
        const base = `const ${f.type.padEnd(maxTypeWidth)} ${f.name.padEnd(maxNameWidth)} = ${firstLineValue}`;
        if (base.length > maxFirstLineBaseLen) {
            maxFirstLineBaseLen = base.length;
        }
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
                    while (idx >= 0 && outLines[idx] === '') {
                        idx--;
                    }
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
                    if (!trimmed || trimmed === '}' || trimmed === ']') {
                        continue;
                    }
                    const m = l.match(/^(\s*)(.*?)(\s*)(\/\/.*)$/);
                    if (m) {
                        const leading = m[1] || '';
                        const content = (m[2] || '').replace(/\s+$/, '');
                        const len = leading.length + content.length;
                        if (len > maxContentLen) {
                            maxContentLen = len;
                        }
                        indices.push(idx);
                    }
                }
                if (indices.length > 0) {
                    for (const idx of indices) {
                        const l = outLines[idx];
                        const m = l.match(/^(\s*)(.*?)(\s*)(\/\/.*)$/);
                        if (!m) {
                            continue;
                        }
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
