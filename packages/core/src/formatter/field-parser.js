"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseConstFieldText = exports.isEnumFieldText = exports.parseEnumFieldText = exports.buildEnumFieldFromAst = exports.isStructFieldText = exports.parseStructFieldText = exports.buildStructFieldFromAst = exports.normalizeType = exports.splitTrailingAnnotation = exports.splitLineComment = void 0;
function splitLineComment(line) {
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
exports.splitLineComment = splitLineComment;
function splitTrailingAnnotation(source) {
    const trimmed = source.trimEnd();
    if (!trimmed.endsWith(')')) {
        return { base: source.trim(), annotation: '' };
    }
    let inS = false;
    let inD = false;
    let escaped = false;
    const stack = [];
    let lastPair = null;
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
            const start = stack.pop();
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
exports.splitTrailingAnnotation = splitTrailingAnnotation;
function normalizeType(type) {
    return type
        .replace(/\s+</g, '<')
        .replace(/<\s+/g, '<')
        .replace(/\s+>/g, '>')
        .replace(/>\s*/g, '>')
        .replace(/\s*,\s*/g, ',');
}
exports.normalizeType = normalizeType;
function buildStructFieldFromAst(line, field) {
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
exports.buildStructFieldFromAst = buildStructFieldFromAst;
function parseStructFieldText(text) {
    if (!text || text.length > 4000) {
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
exports.parseStructFieldText = parseStructFieldText;
function isStructFieldText(line) {
    const t = line.trimStart();
    const c = t.charCodeAt(0);
    if (!(c >= 48 && c <= 57)) {
        return false;
    }
    return /^\s*\d+:\s*(?:required|optional)?\s*.+$/.test(line);
}
exports.isStructFieldText = isStructFieldText;
function buildEnumFieldFromAst(line, member) {
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
exports.buildEnumFieldFromAst = buildEnumFieldFromAst;
function parseEnumFieldText(text) {
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
exports.parseEnumFieldText = parseEnumFieldText;
function isEnumFieldText(line) {
    const t = line.trimStart();
    const cc = t.charCodeAt(0);
    const isLetter = (cc >= 65 && cc <= 90) || (cc >= 97 && cc <= 122) || cc === 95;
    if (!isLetter) {
        return false;
    }
    return /^\s*[a-zA-Z_][a-zA-Z0-9_]*\s*=\s*[-+]?(?:\d+|0x[0-9a-fA-F]+)/i.test(line);
}
exports.isEnumFieldText = isEnumFieldText;
function parseConstFieldText(source) {
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
exports.parseConstFieldText = parseConstFieldText;
//# sourceMappingURL=field-parser.js.map