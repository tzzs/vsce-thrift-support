const PRIMITIVES = new Set<string>([
    'void', 'bool', 'byte', 'i8', 'i16', 'i32', 'i64', 'double', 'string', 'binary', 'uuid', 'slist'
]);

const integerTypes = new Set<string>(['byte', 'i8', 'i16', 'i32', 'i64']);
const uuidRegex = /^[0-9a-fA-F]{8}-([0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}$/;

/**
 * 获取 Thrift 内置基础类型集合。
 * @returns 基础类型集合
 */
export function getPrimitiveTypes(): Set<string> {
    return PRIMITIVES;
}

/**
 * 判断类型文本是否为有效的容器类型定义。
 * @param typeText 类型文本
 * @returns 是否为容器类型
 */
function parseContainerType(typeText: string): boolean {
    const noSpace = typeText.replace(/\s+/g, '');
    if (/^list<.*>$/.test(noSpace)) {
        const inner = typeText.slice(typeText.indexOf('<') + 1, typeText.lastIndexOf('>'));
        return inner.trim().length > 0;
    }
    if (/^set<.*>$/.test(noSpace)) {
        const inner = typeText.slice(typeText.indexOf('<') + 1, typeText.lastIndexOf('>'));
        return inner.trim().length > 0;
    }
    if (/^map<.*>$/.test(noSpace)) {
        const inner = typeText.slice(typeText.indexOf('<') + 1, typeText.lastIndexOf('>'));
        const parts = splitTopLevelAngles(inner);
        return parts.length === 2;
    }
    return false;
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
    let inSingle = false;
    let inDouble = false;
    let escaped = false;
    let parenDepth = 0;

    for (let i = 0; i < typeText.length; i++) {
        const ch = typeText[i];

        if (parenDepth > 0) {
            if (!escaped && ch === '\\') {
                escaped = true;
                continue;
            }
            if (!escaped) {
                if (ch === '"' && !inSingle) {
                    inDouble = !inDouble;
                    continue;
                }
                if (ch === '\'' && !inDouble) {
                    inSingle = !inSingle;
                    continue;
                }
            } else {
                escaped = false;
                continue;
            }
        }

        if (!inSingle && !inDouble) {
            if (ch === '(') {
                parenDepth++;
                continue;
            }
            if (ch === ')') {
                if (parenDepth > 0) {
                    parenDepth--;
                    continue;
                }
            }
        }

        if (parenDepth === 0) {
            if (!escaped && ch === '\\') {
                escaped = true;
                out += ch;
                continue;
            }
            if (!escaped) {
                if (ch === '"' && !inSingle) {
                    inDouble = !inDouble;
                } else if (ch === '\'' && !inDouble) {
                    inSingle = !inSingle;
                }
                out += ch;
            } else {
                out += ch;
                escaped = false;
            }
        }
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
export function isKnownType(typeName: string, definedTypes: Set<string>, includeAliases: Set<string>): boolean {
    if (!typeName) {
        return false;
    }
    const t = stripTypeAnnotations(typeName).trim();
    if (PRIMITIVES.has(t)) {
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
        return parts.every(p => isKnownType(p, definedTypes, includeAliases));
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
    if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
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
    let inS = false, inD = false, escaped = false;
    let eq = -1;
    for (let i = 0; i < codeLine.length; i++) {
        const ch = codeLine[i];
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
    if (eq === -1) {
        return null;
    }

    let i = eq + 1;
    depthAngle = depthBracket = depthBrace = depthParen = 0;
    inS = inD = false;
    escaped = false;
    let buf = '';
    const n = codeLine.length;
    while (i < n) {
        const ch = codeLine[i];
        if (inS) {
            buf += ch;
            if (!escaped && ch === '\\') {
                escaped = true;
                i++;
                continue;
            }
            if (!escaped && ch === '\'') {
                inS = false;
            }
            escaped = false;
            i++;
            continue;
        }
        if (inD) {
            buf += ch;
            if (!escaped && ch === '\\') {
                escaped = true;
                i++;
                continue;
            }
            if (!escaped && ch === '"') {
                inD = false;
            }
            escaped = false;
            i++;
            continue;
        }
        if (ch === '\'') {
            inS = true;
            buf += ch;
            i++;
            continue;
        }
        if (ch === '"') {
            inD = true;
            buf += ch;
            i++;
            continue;
        }

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

        buf += ch;
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
    if (/^list<.+>$/.test(t)) {
        if (!(v.startsWith('[') && v.endsWith(']'))) {
            return false;
        }
        const inner = v.slice(1, -1).trim();
        if (inner.length === 0) {
            return true;
        }
        return true;
    }
    if (/^set<.+>$/.test(t)) {
        return true;
    }
    if (/^map<.+>$/.test(t)) {
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
