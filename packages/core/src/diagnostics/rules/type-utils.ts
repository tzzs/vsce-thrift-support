import {QuoteTracker} from '../../utils/quote-tracker';

const PRIMITIVES = new Set<string>([
    'void', 'bool', 'byte', 'i8', 'i16', 'i32', 'i64', 'double', 'string', 'binary', 'uuid'
]);

// Thrift extended-syntax keyword types valid as reference<> arguments
const KEYWORD_TYPES = new Set<string>(['interaction', 'service']);

const integerTypes = new Set<string>(['byte', 'i8', 'i16', 'i32', 'i64']);
const uuidRegex = /^[0-9a-fA-F]{8}-([0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}$/;

/**
 * 获取 Thrift 内置基础类型集合。
 * @returns 基础类型集合
 */
export function getPrimitiveTypes(): Set<string> {
    return PRIMITIVES;
}

const CONTAINER_KEYWORDS = new Set(['list', 'set', 'map', 'stream', 'sink', 'interaction', 'reference']);

export interface ContainerTypeInfo {
    keyword: string;
    typeArgs: string[];
}

/**
 * Parse a container type using angle-bracket depth tracking instead of regex.
 * Handles nested generics like list<map<string, i32>> correctly.
 * @returns Container info or null if the type is not a valid container.
 */
export function parseContainerTypeInfo(typeText: string): ContainerTypeInfo | null {
    const cleaned = typeText.trim();
    // Find the keyword before the first '<'
    let keywordEnd = -1;
    for (let i = 0; i < cleaned.length; i++) {
        const ch = cleaned[i];
        if (ch === '<') {
            keywordEnd = i;
            break;
        }
        if (ch === ' ' || ch === '\t') {
            if (keywordEnd === -1) {
                keywordEnd = i;
            }
            // Continue scanning — there could be spaces before '<'
            continue;
        }
        keywordEnd = -1;
    }
    if (keywordEnd <= 0) { return null; }

    const keyword = cleaned.slice(0, keywordEnd).trim();
    if (!CONTAINER_KEYWORDS.has(keyword)) { return null; }

    // Find the matching '>' using depth tracking
    const openPos = cleaned.indexOf('<', keywordEnd);
    if (openPos === -1) { return null; }

    let depth = 0;
    let closePos = -1;
    for (let i = openPos; i < cleaned.length; i++) {
        if (cleaned[i] === '<') { depth++; }
        if (cleaned[i] === '>') {
            depth--;
            if (depth === 0) { closePos = i; break; }
        }
    }
    if (closePos === -1) { return null; }

    // Check nothing follows except whitespace/annotations
    const tail = cleaned.slice(closePos + 1).trim();
    if (tail.length > 0 && !tail.startsWith('(')) { return null; }

    const inner = cleaned.slice(openPos + 1, closePos).trim();
    if (inner.length === 0) { return null; }

    const typeArgs = splitTopLevelAngles(inner);
    if (keyword === 'map' && typeArgs.length !== 2) { return null; }
    if (keyword !== 'map' && typeArgs.length !== 1) { return null; }

    return {keyword, typeArgs};
}

/**
 * Strip trailing annotations from a type string for structural analysis.
 * Uses paren depth tracking to handle nested annotations like (range={min:0, max:100}).
 */
function stripAnnotationsForType(typeText: string): string {
    let depth = 0;
    let cutStart = -1;
    const qt = new QuoteTracker();
    for (let i = 0; i < typeText.length; i++) {
        const ch = typeText[i];
        if (qt.inside()) { qt.feed(ch); continue; }
        if (ch === '\'' || ch === '"') { qt.feed(ch); continue; }
        if (ch === '(') {
            if (depth === 0) { cutStart = i; }
            depth++;
        }
        if (ch === ')') {
            depth--;
            if (depth === 0 && cutStart !== -1) {
                // Check nothing follows except whitespace
                const tail = typeText.slice(i + 1).trim();
                if (tail.length === 0) {
                    return typeText.slice(0, cutStart).trim();
                }
                cutStart = -1;
            }
        }
    }
    return typeText.trim();
}

function parseContainerType(typeText: string): boolean {
    return parseContainerTypeInfo(stripAnnotationsForType(typeText)) !== null;
}

/**
 * 按顶层泛型深度拆分类型参数列表。
 * @param typeInner 类型参数列表文本
 * @returns 拆分后的参数数组
 */
function splitTopLevelAngles(typeInner: string): string[] {
    const parts: string[] = [];
    let buf = '';
    let depth = 0;
    for (let i = 0; i < typeInner.length; i++) {
        const ch = typeInner[i];
        if (ch === '<') {
            depth++;
        }
        if (ch === '>') {
            depth = Math.max(0, depth - 1);
        }
        if (ch === ',' && depth === 0) {
            parts.push(buf);
            buf = '';
        } else {
            buf += ch;
        }
    }
    if (buf) {
        parts.push(buf);
    }
    return parts.map(s => s.trim()).filter(Boolean);
}

/**
 * 移除类型注解（如 `(go.tag="...")`）并保留类型主体。
 * @param typeText 类型文本
 * @returns 去除注解后的类型文本
 */
function stripTypeAnnotations(typeText: string): string {
    let out = '';
    let parenDepth = 0;
    const qt = new QuoteTracker();

    for (let i = 0; i < typeText.length; i++) {
        const ch = typeText[i];

        if (parenDepth > 0) {
            qt.feed(ch);
            if (!qt.inside() && ch === ')') {
                parenDepth--;
            }
            continue;
        }

        if (!qt.inside()) {
            if (ch === '(') {
                parenDepth++;
                continue;
            }
        }

        out += ch;
        qt.feed(ch);
    }

    return out.trim();
}

/**
 * 判断类型是否已定义或属于基础类型（含容器/命名空间类型）。
 * @param typeName 类型名称
 * @param definedTypes 已定义类型集合
 * @param includeAliases include 别名集合
 * @returns 是否为已知类型
 */
/**
 * Detect whether a default value string has unclosed brackets/braces/parens
 * indicating it was truncated by single-line parsing.
 */
function hasUnclosedDelimiters(value: string): boolean {
    let depthBracket = 0, depthBrace = 0, depthParen = 0;
    const qt = new QuoteTracker();
    for (let i = 0; i < value.length; i++) {
        const ch = value[i];
        if (qt.inside()) { qt.feed(ch); continue; }
        if (ch === '\'' || ch === '"') { qt.feed(ch); continue; }
        if (ch === '[') { depthBracket++; }
        if (ch === ']') { depthBracket = Math.max(0, depthBracket - 1); }
        if (ch === '{') { depthBrace++; }
        if (ch === '}') { depthBrace = Math.max(0, depthBrace - 1); }
        if (ch === '(') { depthParen++; }
        if (ch === ')') { depthParen = Math.max(0, depthParen - 1); }
    }
    return depthBracket > 0 || depthBrace > 0 || depthParen > 0;
}

/**
 * Read subsequent lines to build the complete multi-line default value.
 * Used by diagnostics to properly validate multi-line collection defaults.
 */
export function resolveMultilineDefaultFromLines(
    lines: string[],
    startLine: number,
    initialValue: string
): string | null {
    if (!hasUnclosedDelimiters(initialValue)) {
        return null;
    }

    let depthBracket = 0, depthBrace = 0, depthParen = 0;
    const qt = new QuoteTracker();
    for (let i = 0; i < initialValue.length; i++) {
        const ch = initialValue[i];
        if (qt.inside()) { qt.feed(ch); continue; }
        if (ch === '\'' || ch === '"') { qt.feed(ch); continue; }
        if (ch === '[') { depthBracket++; }
        if (ch === ']') { depthBracket = Math.max(0, depthBracket - 1); }
        if (ch === '{') { depthBrace++; }
        if (ch === '}') { depthBrace = Math.max(0, depthBrace - 1); }
        if (ch === '(') { depthParen++; }
        if (ch === ')') { depthParen = Math.max(0, depthParen - 1); }
    }

    const parts: string[] = [initialValue];
    let endLine = startLine;
    const maxLine = Math.min(startLine + 50, lines.length - 1);

    while ((depthBracket > 0 || depthBrace > 0 || depthParen > 0) && endLine < maxLine) {
        endLine++;
        const nextLine = lines[endLine];
        for (let i = 0; i < nextLine.length; i++) {
            const ch = nextLine[i];
            if (qt.inside()) { qt.feed(ch); continue; }
            if (ch === '\'' || ch === '"') { qt.feed(ch); continue; }
            if (ch === '[') { depthBracket++; }
            if (ch === ']') { depthBracket = Math.max(0, depthBracket - 1); }
            if (ch === '{') { depthBrace++; }
            if (ch === '}') { depthBrace = Math.max(0, depthBrace - 1); }
            if (ch === '(') { depthParen++; }
            if (ch === ')') { depthParen = Math.max(0, depthParen - 1); }
        }
        parts.push(nextLine);
    }

    const fullValue = parts.join('\n');
    // Strip trailing comma/semicolon, then annotations (with nested paren support)
    const withoutComma = fullValue.replace(/[,;]\s*$/, '');
    return stripAnnotationsForType(withoutComma).trimEnd();
}

/**
 * Resolve a multi-line string default value that uses Thrift's backslash
 * line-continuation syntax. E.g.:
 *   "Hello \
 *   World"
 * becomes "Hello World".
 */
export function resolveMultilineStringDefault(
    lines: string[],
    startLine: number,
    initialValue: string
): string | null {
    const trimmed = initialValue.trimEnd();
    const quote = trimmed[0];
    if (quote !== '"' && quote !== '\'') { return null; }

    // Already properly closed on the same line — no resolution needed
    if (trimmed.endsWith(quote) && trimmed.length >= 2) { return null; }

    if (!trimmed.endsWith('\\')) { return null; }

    // first part: strip the trailing continuation backslash
    const parts: string[] = [trimmed.slice(0, -1)];
    let endLine = startLine;
    const maxLine = Math.min(startLine + 50, lines.length - 1);

    while (endLine < maxLine) {
        endLine++;
        const rawLine = lines[endLine] ?? '';
        const stripped = stripCodeLineComments(rawLine);
        if (stripped.trimEnd().endsWith('\\')) {
            parts.push(stripped.slice(0, -1));
        } else {
            parts.push(stripped);
            break;
        }
    }

    const fullValue = parts.join('');
    const withoutComma = fullValue.replace(/[,;]\s*$/, '');
    return stripAnnotationsForType(withoutComma).trimEnd();
}

/**
 * Strip // line comment from a code line, respecting quote context.
 */
function stripCodeLineComments(line: string): string {
    let inS = false, inD = false, escaped = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inS) {
            if (!escaped && ch === '\\') { escaped = true; continue; }
            if (!escaped && ch === '\'') { inS = false; }
            escaped = false;
            continue;
        }
        if (inD) {
            if (!escaped && ch === '\\') { escaped = true; continue; }
            if (!escaped && ch === '"') { inD = false; }
            escaped = false;
            continue;
        }
        if (ch === '\'') { inS = true; continue; }
        if (ch === '"') { inD = true; continue; }
        if (ch === '/' && i + 1 < line.length && line[i + 1] === '/') {
            return line.slice(0, i);
        }
    }
    return line;
}

export function isKnownType(
    typeName: string,
    definedTypes: Set<string>,
    includeAliases: Set<string>,
    _depth = 0
): boolean {
    // Guard against pathological deeply-nested generic types (e.g. list<list<list<...>>>)
    // that could cause a stack overflow.
    if (_depth > 10) {
        return false;
    }
    if (!typeName) {
        return false;
    }
    const t = stripTypeAnnotations(typeName).trim();
    if (PRIMITIVES.has(t)) {
        return true;
    }
    if (KEYWORD_TYPES.has(t)) {
        return true;
    }
    if (definedTypes.has(t)) {
        return true;
    }
    const namespaced = t.match(/^([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)$/);
    if (namespaced) {
        const alias = namespaced[1];
        const base = namespaced[2];
        if (!includeAliases.has(alias)) {
            return false;
        }
        return PRIMITIVES.has(base) || definedTypes.has(base);
    }
    if (parseContainerType(t)) {
        const inner = t.slice(t.indexOf('<') + 1, t.lastIndexOf('>'));
        const parts = splitTopLevelAngles(inner);
        return parts.every(p => isKnownType(p, definedTypes, includeAliases, _depth + 1));
    }
    return false;
}

/**
 * 解析 `ns.Type` 形式的真实类型名，校验 include alias 合法性。
 * @param typeName 命名空间类型文本
 * @param includeAliases include 别名集合
 * @returns 解析后的基础类型名或 null
 */
export function resolveNamespacedBase(typeName: string, includeAliases: Set<string>): string | null {
    if (!typeName.includes('.')) {
        return typeName;
    }
    const parts = typeName.split('.');
    const alias = parts[0];
    if (!alias || !includeAliases.has(alias)) {
        return null;
    }
    return parts[parts.length - 1] || null;
}

/**
 * 判断字符串是否为合法整数文本。
 * @param text 待判断文本
 * @returns 是否为整数
 */
export function isIntegerLiteral(text: string): boolean {
    const t = text.trim();
    return /^-?\d+$/.test(t) && !/^-?\d+\.\d+$/.test(t);
}

/**
 * 判断字符串是否为合法浮点文本。
 * @param text 待判断文本
 * @returns 是否为浮点数
 */
function isFloatLiteral(text: string): boolean {
    const t = text.trim();
    return /^-?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(t);
}

/**
 * 判断字符串是否为引号包裹的字面量。
 * @param text 待判断文本
 * @returns 是否为引号字符串
 */
function isQuotedString(text: string): boolean {
    const t = text.trim();
    if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith('\'') && t.endsWith('\''))) {
        return t.length >= 2;
    }
    return false;
}

/**
 * 从注释剔除后的字段行中解析默认值表达式。
 * @param codeLine 字段代码行
 * @returns 默认值文本或 null
 */
export function extractDefaultValue(codeLine: string): string | null {
    let depthAngle = 0, depthBracket = 0, depthBrace = 0, depthParen = 0;
    const qt = new QuoteTracker();
    let eq = -1;
    for (let i = 0; i < codeLine.length; i++) {
        const ch = codeLine[i];
        if (!qt.inside()) {
            if (ch === '<') {
                depthAngle++;
            } else if (ch === '>') {
                depthAngle = Math.max(0, depthAngle - 1);
            } else if (ch === '[') {
                depthBracket++;
            } else if (ch === ']') {
                depthBracket = Math.max(0, depthBracket - 1);
            } else if (ch === '{') {
                depthBrace++;
            } else if (ch === '}') {
                depthBrace = Math.max(0, depthBrace - 1);
            } else if (ch === '(') {
                depthParen++;
            } else if (ch === ')') {
                depthParen = Math.max(0, depthParen - 1);
            } else if (ch === '=' && depthAngle === 0 && depthBracket === 0 && depthBrace === 0 && depthParen === 0) {
                eq = i;
                break;
            }
        }
        qt.feed(ch);
    }
    if (eq === -1) {
        return null;
    }

    let i = eq + 1;
    depthAngle = depthBracket = depthBrace = depthParen = 0;
    qt.reset();
    let buf = '';
    const n = codeLine.length;
    while (i < n) {
        const ch = codeLine[i];
        if (!qt.inside()) {
            if (ch === '<') {
                depthAngle++;
            } else if (ch === '>') {
                depthAngle = Math.max(0, depthAngle - 1);
            } else if (ch === '[') {
                depthBracket++;
            } else if (ch === ']') {
                depthBracket = Math.max(0, depthBracket - 1);
            } else if (ch === '{') {
                depthBrace++;
            } else if (ch === '}') {
                depthBrace = Math.max(0, depthBrace - 1);
            } else if (ch === '(' && depthAngle === 0 && depthBracket === 0 && depthBrace === 0 && depthParen === 0) {
                break;
            } else if (ch === '(') {
                depthParen++;
            } else if (ch === ')') {
                depthParen = Math.max(0, depthParen - 1);
            }

            if ((ch === ',' || ch === ';') && depthAngle === 0 && depthBracket === 0 && depthBrace === 0 && depthParen === 0) {
                break;
            }
        }

        buf += ch;
        qt.feed(ch);
        i++;
    }
    return buf.trim();
}

/**
 * 根据字段类型判断默认值文本是否合法。
 * @param valueRaw 默认值文本
 * @param typeText 字段类型
 * @returns 是否匹配
 */
function valueMatchesType(valueRaw: string, typeText: string): boolean {
    const t = stripTypeAnnotations(typeText).trim();
    const v = valueRaw.trim();

    if (integerTypes.has(t)) {
        return isIntegerLiteral(v);
    }
    if (t === 'double') {
        return isIntegerLiteral(v) || isFloatLiteral(v);
    }
    if (t === 'bool') {
        return v === 'true' || v === 'false';
    }
    if (t === 'string' || t === 'binary') {
        return isQuotedString(v);
    }
    if (t === 'uuid') {
        if (!isQuotedString(v)) {
            return false;
        }
        const inner = v.slice(1, -1);
        return uuidRegex.test(inner);
    }
    const containerInfo = parseContainerTypeInfo(t);
    if (containerInfo !== null) {
        if (containerInfo.keyword === 'list') {
            return v.startsWith('[') && v.endsWith(']');
        }
        if (containerInfo.keyword === 'set') {
            // set literals accept both [...] and {...} in Thrift IDL
            return (v.startsWith('[') && v.endsWith(']')) || (v.startsWith('{') && v.endsWith('}'));
        }
        if (containerInfo.keyword === 'map') {
            return v.startsWith('{') && v.endsWith('}');
        }
        // stream, sink, interaction, reference — accept any value
        return true;
    }

    return true;
}

/**
 * 检查默认值是否满足字段类型约束。
 * @param typeText 字段类型
 * @param valueText 默认值文本
 * @returns 是否合法
 */
export function isValidDefaultValue(typeText: string, valueText: string): boolean {
    const value = valueText.trim();
    if (!value) {
        return true;
    }
    return valueMatchesType(value, typeText);
}
