import {PrintBuffer} from './printer';
import {QuoteTracker} from '../utils/quote-tracker';

function isInlineDelimited(value: string): boolean {
    if (value.length < 2) { return false; }
    const open = value[0];
    if (open !== '[' && open !== '{') { return false; }
    const close = open === '[' ? ']' : '}';
    const qt = new QuoteTracker();
    let depth = 0;
    for (let i = 0; i < value.length; i++) {
        const ch = value[i];
        if (qt.inside()) { qt.feed(ch); continue; }
        if (ch === '\'' || ch === '"') { qt.feed(ch); continue; }
        if (ch === open) { depth++; }
        if (ch === close) { depth--; }
    }
    return depth === 0 && value[value.length - 1] === close;
}

function splitCollectionItems(inner: string): string[] {
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
        if (ch === '"' || ch === '\'') {
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
    return items;
}

export function renderConstCollection(
    value: string,
    indentStr: string,
    indentLevel: number,
    maxWidth: number
): string {
    const isInline = !value.includes('\n') && isInlineDelimited(value);
    if (!isInline) {
        return value;
    }

    const open = value[0];
    const close = value[value.length - 1];
    const inner = value.substring(1, value.length - 1).trim();
    const items = splitCollectionItems(inner);

    if (items.length === 0) {
        return `${open}${close}`;
    }

    const buf = new PrintBuffer({indentStr, maxWidth});
    buf.group(g => {
        g.text(open);
        for (let i = 0; i < items.length; i++) {
            if (i > 0) {
                g.text(',');
                g.softline(' ');
            } else {
                g.softline('');
            }
            if (i === 0) {
                g.text(items[i]);
            } else {
                g.text(items[i]);
            }
        }
        g.softline('');
        g.text(close);
    });

    const rendered = buf.render();
    if (rendered.length === 1) {
        return rendered[0];
    }

    const valueIndent = indentStr.repeat(indentLevel + 1);
    const baseIndent = indentStr.repeat(indentLevel);
    const lines: string[] = [open];
    for (let i = 0; i < items.length; i++) {
        const comma = i < items.length - 1 ? ',' : '';
        lines.push(valueIndent + items[i] + comma);
    }
    lines.push(baseIndent + close);
    return lines.join('\n');
}
