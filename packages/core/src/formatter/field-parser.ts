import {ConstField, EnumField, StructField} from '../interfaces.types';
import * as nodes from '../ast/nodes.types';
import {QuoteTracker} from '../utils/quote-tracker';
import {BracketDepthTracker} from '../utils/bracket-depth-tracker';

/**
 * 拆分行内注释。
 * @param line 原始行文本
 * @returns 代码与注释
 */
export function splitLineComment(line: string): {code: string; comment: string} {
    const qt = new QuoteTracker();
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        const next = i + 1 < line.length ? line[i + 1] : '';
        if (!qt.inside()) {
            if (ch === '/' && next === '/') {
                return {code: line.slice(0, i), comment: line.slice(i).trim()};
            }
            if (ch === '#') {
                return {code: line.slice(0, i), comment: line.slice(i).trim()};
            }
        }
        qt.feed(ch);
    }
    return {code: line, comment: ''};
}

/**
 * 拆分尾部注解。
 * @param source 原始文本
 * @returns 基础文本与注解文本
 */
export function splitTrailingAnnotation(source: string): {base: string; annotation: string} {
    const trimmed = source.trimEnd();
    if (!trimmed.endsWith(')')) {
        return {base: source.trim(), annotation: ''};
    }
    const qt = new QuoteTracker();
    const stack: number[] = [];
    let lastPair: {start: number; end: number} | null = null;

    for (let i = 0; i < trimmed.length; i++) {
        const ch = trimmed[i];
        if (!qt.inside()) {
            if (ch === '(') {
                stack.push(i);
                continue;
            }
            if (ch === ')' && stack.length > 0) {
                const start = stack.pop() as number;
                if (stack.length === 0) {
                    lastPair = {start, end: i};
                }
                continue;
            }
        }
        qt.feed(ch);
    }

    if (!lastPair) {
        return {base: source.trim(), annotation: ''};
    }
    const tail = trimmed.slice(lastPair.end + 1).trim();
    if (tail) {
        return {base: source.trim(), annotation: ''};
    }
    return {
        base: trimmed.slice(0, lastPair.start).trimEnd(),
        annotation: trimmed.slice(lastPair.start, lastPair.end + 1)
    };
}

/**
 * 规范化类型字符串中的空白。
 * @param type 类型文本
 * @returns 规范化后的类型
 */
export function normalizeType(type: string): string {
    const qt = new QuoteTracker();
    const out: string[] = [];
    let i = 0;
    while (i < type.length) {
        const ch = type[i];
        if (qt.inside()) {
            out.push(ch);
            qt.feed(ch);
            i++;
            continue;
        }
        if (ch === '\'' || ch === '"') {
            out.push(ch);
            qt.feed(ch);
            i++;
            continue;
        }
        // Consume whitespace before/after <, >, and around ,
        if (ch === '<' || ch === '>' || ch === ',') {
            // Trim trailing whitespace before the symbol
            while (out.length > 0 && out[out.length - 1] === ' ') {
                out.pop();
            }
            out.push(ch);
            // Skip whitespace after the symbol
            i++;
            while (i < type.length && type[i] === ' ') { i++; }
            continue;
        }
        out.push(ch);
        i++;
    }
    return out.join('');
}

/**
 * 基于 AST 构建结构体字段描述。
 * @param line 原始行文本（多行字段时为整段拼接、用 \n 分隔）
 * @param field AST 字段节点
 * @returns 结构体字段信息
 */
export function buildStructFieldFromAst(line: string, field: nodes.Field): StructField | null {
    if (line.includes('\n')) {
        return buildMultiLineStructFieldFromAst(line, field);
    }
    const {code, comment} = splitLineComment(line);
    let remainder = code.trim();
    let trailing = '';
    const suffixMatch = remainder.match(/^(.*?)([,;]\s*)$/);
    if (suffixMatch) {
        remainder = suffixMatch[1].trim();
        trailing = suffixMatch[2].trim();
    }
    let annotation = '';
    const annSplit = splitTrailingAnnotation(remainder);
    if (annSplit.annotation) {
        remainder = annSplit.base;
        annotation = annSplit.annotation;
    }

    const qualifier = field.requiredness ?? '';
    const type = normalizeType(field.fieldType || '');
    const name = field.name ?? '';
    let suffix = '';
    if (field.defaultValue !== undefined) {
        suffix = ` = ${field.defaultValue}`;
    }
    if (trailing) {
        suffix += trailing;
    }

    if (!name || !type) {
        return null;
    }

    return {
        line: line.trim(),
        id: String(field.id),
        qualifier,
        type,
        name,
        suffix,
        comment,
        annotation
    };
}

/**
 * 处理跨行的 struct field。
 * 输入是源文件中 field 起始行到结束行的拼接（用 \n 分隔）。
 * 输出的 suffix 中保留 \n，延续行已 trim 前导空白，留待格式化阶段重新缩进。
 */
function buildMultiLineStructFieldFromAst(text: string, field: nodes.Field): StructField | null {
    const rawLines = text.split('\n');
    const cleanedLines = rawLines.map(l => splitLineComment(l).code);
    const qualifier = field.requiredness ?? '';
    const type = normalizeType(field.fieldType || '');
    const name = field.name ?? '';
    if (!name || !type) {
        return null;
    }

    const firstLine = cleanedLines[0];
    const eqIdx = findTopLevelEqualsIndex(firstLine);
    if (eqIdx === -1) {
        // No `=` on the first line — fall back to single-line behavior on first line.
        return buildStructFieldFromAst(rawLines[0], field);
    }

    const lastIdx = cleanedLines.length - 1;
    let lastClean = cleanedLines[lastIdx].trimEnd();
    let trailing = '';
    const tsMatch = lastClean.match(/([,;]\s*)$/);
    if (tsMatch) {
        trailing = tsMatch[1].trim();
        lastClean = lastClean.slice(0, lastClean.length - tsMatch[1].length).trimEnd();
    }
    let annotation = '';
    const annSplit = splitTrailingAnnotation(lastClean);
    if (annSplit.annotation) {
        annotation = annSplit.annotation;
        lastClean = annSplit.base.trimEnd();
    }

    const firstDV = firstLine.slice(eqIdx + 1).trim();
    const dvParts: string[] = [firstDV];
    for (let i = 1; i < lastIdx; i++) {
        dvParts.push(cleanedLines[i].trim());
    }
    if (lastIdx > 0) {
        const lastDV = lastClean.trim();
        if (lastDV) {
            dvParts.push(lastDV);
        }
    }
    const defaultValueText = dvParts.join('\n');

    let suffix = ` = ${defaultValueText}`;
    if (trailing) {
        suffix += trailing;
    }

    return {
        line: text.trim(),
        id: String(field.id),
        qualifier,
        type,
        name,
        suffix,
        comment: '',
        annotation
    };
}

/**
 * 找到首行中的顶层 `=`（不在字符串、`<>`、`[]`、`{}`、`()` 内）。
 */
function findTopLevelEqualsIndex(text: string): number {
    const qt = new QuoteTracker();
    const bt = new BracketDepthTracker();
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (!qt.inside()) {
            bt.feed(ch);
            if (ch === '=' && bt.atTop()) {
                return i;
            }
        }
        qt.feed(ch);
    }
    return -1;
}

/**
 * 从文本解析结构体字段信息。
 * @param text 字段文本
 * @returns 字段信息
 */
export function parseStructFieldText(text: string): StructField | null {
    if (!text || text.length > 4000) {
        return null;
    }
    const {code, comment} = splitLineComment(text);
    let remainder = code.trim();

    const prefixMatch = remainder.match(/^\s*(\d+:\s*(?:required|optional)?\s*)(.*)$/);
    if (!prefixMatch) {
        return null;
    }
    const prefix = prefixMatch[1];
    remainder = prefixMatch[2]!;

    const idQualMatch = prefix.match(/^\s*(\d+):\s*((?:required|optional)?)\s*/);
    const id = idQualMatch ? idQualMatch[1] : '';
    const qualifier = idQualMatch ? idQualMatch[2] : '';

    let trailing = '';
    const suffixMatch = remainder.match(/^(.*?)([,;]\s*)$/);
    if (suffixMatch) {
        remainder = suffixMatch[1].trim();
        trailing = suffixMatch[2].trim();
    }

    let annotation = '';
    const annSplit = splitTrailingAnnotation(remainder);
    if (annSplit.annotation) {
        remainder = annSplit.base;
        annotation = annSplit.annotation;
    }

    const fieldMatch = remainder.match(/^(.+?)\s+([a-zA-Z_][a-zA-Z0-9_]*)(?:\s*=\s*(.+))?$/);
    if (!fieldMatch) {
        return null;
    }

    const type = normalizeType(fieldMatch[1].trim());
    const name = fieldMatch[2];
    const defaultValue = fieldMatch[3];

    let suffix = '';
    if (defaultValue) {
        suffix = ` = ${defaultValue.trim()}`;
    }
    if (trailing) {
        suffix += trailing;
    }

    return {
        line: text.trim(),
        id,
        qualifier,
        type,
        name,
        suffix,
        comment,
        annotation
    };
}

/**
 * 判断是否为结构体字段行。
 * @param line 行文本
 * @returns 是否为字段
 */
export function isStructFieldText(line: string): boolean {
    const t = line.trimStart();
    const c = t.charCodeAt(0);
    if (!(c >= 48 && c <= 57)) {
        return false;
    }
    return /^\s*\d+:\s*(?:required|optional)?\s*.+$/.test(line);
}

/**
 * 基于 AST 构建枚举字段描述。
 * @param line 原始行文本
 * @param member AST 枚举成员
 * @returns 枚举字段信息
 */
export function buildEnumFieldFromAst(line: string, member: nodes.EnumMember): EnumField | null {
    const {code, comment} = splitLineComment(line);
    let remainder = code.trim();
    let trailing = '';
    const suffixMatch = remainder.match(/^(.*?)([,;]\s*)$/);
    if (suffixMatch) {
        remainder = suffixMatch[1].trim();
        trailing = suffixMatch[2].trim();
    }

    let annotation = '';
    const annSplit = splitTrailingAnnotation(remainder);
    if (annSplit.annotation) {
        remainder = annSplit.base;
        annotation = annSplit.annotation;
    }

    let value = member.initializer;
    if (value === undefined || value === '') {
        const match = remainder.match(/=\s*([^,;]+)\s*$/);
        if (match) {
            value = match[1].trim();
        }
    }
    if (member.name === undefined || member.name === '') {
        return null;
    }

    return {
        line: line.trim(),
        name: member.name,
        value: value ?? '',
        suffix: trailing,
        comment,
        annotation
    };
}

/**
 * 从文本解析枚举字段信息。
 * @param text 字段文本
 * @returns 枚举字段信息
 */
export function parseEnumFieldText(text: string): EnumField | null {
    if (!text) {
        return null;
    }
    const {code, comment} = splitLineComment(text);
    let remainder = code.trim();

    let trailing = '';
    const suffixMatch = remainder.match(/^(.*?)([,;]\s*)$/);
    if (suffixMatch) {
        remainder = suffixMatch[1].trim();
        trailing = suffixMatch[2].trim();
    }

    let annotation = '';
    const annSplit = splitTrailingAnnotation(remainder);
    if (annSplit.annotation) {
        remainder = annSplit.base;
        annotation = annSplit.annotation;
    }

    const fieldMatch = remainder.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*(?:=\s*(.+))?$/);
    if (!fieldMatch) {
        return null;
    }

    return {
        line: text.trim(),
        name: fieldMatch[1],
        value: (fieldMatch[2] || '').trim(),
        suffix: trailing,
        comment,
        annotation
    };
}

/**
 * 判断是否为枚举字段行。
 * @param line 行文本
 * @returns 是否为枚举字段
 */
export function isEnumFieldText(line: string): boolean {
    const t = line.trimStart();
    const cc = t.charCodeAt(0);
    const isLetter = (cc >= 65 && cc <= 90) || (cc >= 97 && cc <= 122) || cc === 95;
    if (!isLetter) {
        return false;
    }
    return /^\s*[a-zA-Z_][a-zA-Z0-9_]*\s*=\s*[-+]?(?:\d+|0x[0-9a-fA-F]+)/i.test(line);
}

/**
 * 解析 const 字段信息。
 * @param source 常量文本
 * @returns const 字段信息
 */
export function parseConstFieldText(source: string): ConstField | null {
    if (!source) {
        return null;
    }
    const lines = source.split('\n');
    const header = (lines[0] || '').trim();
    const m = header.match(/^const\s+([\w<>,\s]+?)\s+(\w+)\s*=\s*(.*)$/);
    if (!m) {
        return null;
    }
    const type = normalizeType(m[1].trim());
    const name = m[2].trim();
    let firstValuePart = (m[3] || '').trim();

    let comment = '';
    const commentIdx = firstValuePart.indexOf('//');
    if (commentIdx >= 0) {
        comment = firstValuePart.slice(commentIdx).trim();
        firstValuePart = firstValuePart.slice(0, commentIdx).trim();
    }

    let value = firstValuePart;
    if (lines.length > 1) {
        const rest = lines.slice(1).map(l => l.trim()).join('\n');
        value = (value ? value + '\n' : '') + rest;
    }

    return {
        line: header,
        type,
        name,
        value,
        comment
    };
}
