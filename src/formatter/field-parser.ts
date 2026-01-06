import { ConstField, EnumField, StructField } from '../interfaces.types';
import * as nodes from '../ast/nodes.types';

/**
 * 拆分行内注释。
 * @param line 原始行文本
 * @returns 代码与注释
 */
export function splitLineComment(line: string): { code: string; comment: string } {
    let inS = false;
    let inD = false;
    let escaped = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        const next = i + 1 < line.length ? line[i + 1] : '';
        if (inS) {
            if (!escaped && ch === '\\') {
                escaped = true;
                continue;
            }
            if (!escaped && ch === '\'') {
                inS = false;
            }
            escaped = false;
            continue;
        }
        if (inD) {
            if (!escaped && ch === '\\') {
                escaped = true;
                continue;
            }
            if (!escaped && ch === '"') {
                inD = false;
            }
            escaped = false;
            continue;
        }
        if (ch === '\'') {
            inS = true;
            continue;
        }
        if (ch === '"') {
            inD = true;
            continue;
        }
        if (ch === '/' && next === '/') {
            return { code: line.slice(0, i), comment: line.slice(i).trim() };
        }
        if (ch === '#') {
            return { code: line.slice(0, i), comment: line.slice(i).trim() };
        }
    }
    return { code: line, comment: '' };
}

/**
 * 拆分尾部注解。
 * @param source 原始文本
 * @returns 基础文本与注解文本
 */
export function splitTrailingAnnotation(source: string): { base: string; annotation: string } {
    const trimmed = source.trimEnd();
    if (!trimmed.endsWith(')')) {
        return { base: source.trim(), annotation: '' };
    }
    let inS = false;
    let inD = false;
    let escaped = false;
    const stack: number[] = [];
    let lastPair: { start: number; end: number } | null = null;

    for (let i = 0; i < trimmed.length; i++) {
        const ch = trimmed[i];
        if (inS) {
            if (!escaped && ch === '\\') {
                escaped = true;
                continue;
            }
            if (!escaped && ch === '\'') {
                inS = false;
            }
            escaped = false;
            continue;
        }
        if (inD) {
            if (!escaped && ch === '\\') {
                escaped = true;
                continue;
            }
            if (!escaped && ch === '"') {
                inD = false;
            }
            escaped = false;
            continue;
        }
        if (ch === '\'') {
            inS = true;
            continue;
        }
        if (ch === '"') {
            inD = true;
            continue;
        }
        if (ch === '(') {
            stack.push(i);
            continue;
        }
        if (ch === ')' && stack.length > 0) {
            const start = stack.pop() as number;
            if (stack.length === 0) {
                lastPair = { start, end: i };
            }
        }
    }

    if (!lastPair) {
        return { base: source.trim(), annotation: '' };
    }
    const tail = trimmed.slice(lastPair.end + 1).trim();
    if (tail) {
        return { base: source.trim(), annotation: '' };
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
    return type
        .replace(/\s+</g, '<')
        .replace(/<\s+/g, '<')
        .replace(/\s+>/g, '>')
        .replace(/>\s*/g, '>')
        .replace(/\s*,\s*/g, ',');
}

/**
 * 基于 AST 构建结构体字段描述。
 * @param line 原始行文本
 * @param field AST 字段节点
 * @returns 结构体字段信息
 */
export function buildStructFieldFromAst(line: string, field: nodes.Field): StructField | null {
    const { code, comment } = splitLineComment(line);
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

    const qualifier = field.requiredness || '';
    const type = normalizeType(field.fieldType || '');
    const name = field.name || '';
    let suffix = '';
    if (field.defaultValue) {
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
 * 从文本解析结构体字段信息。
 * @param text 字段文本
 * @returns 字段信息
 */
export function parseStructFieldText(text: string): StructField | null {
    if (!text) {
        return null;
    }
    const { code, comment } = splitLineComment(text);
    let remainder = code.trim();

    const prefixMatch = remainder.match(/^\s*(\d+:\s*(?:required|optional)?\s*)(.*)$/);
    if (!prefixMatch) {
        return null;
    }
    const prefix = prefixMatch[1];
    remainder = prefixMatch[2];

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
    const { code, comment } = splitLineComment(line);
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
    if (!value) {
        const match = remainder.match(/=\s*([^,;]+)\s*$/);
        if (match) {
            value = match[1].trim();
        }
    }
    if (!member.name) {
        return null;
    }

    return {
        line: line.trim(),
        name: member.name,
        value: value || '',
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
    const { code, comment } = splitLineComment(text);
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
