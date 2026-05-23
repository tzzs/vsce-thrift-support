"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isValidDefaultValue = exports.extractDefaultValue = exports.isIntegerLiteral = exports.resolveNamespacedBase = exports.isKnownType = exports.getPrimitiveTypes = void 0;
const PRIMITIVES = new Set([
    'void', 'bool', 'byte', 'i8', 'i16', 'i32', 'i64', 'double', 'string', 'binary', 'uuid'
]);
const KEYWORD_TYPES = new Set(['interaction', 'service']);
const integerTypes = new Set(['byte', 'i8', 'i16', 'i32', 'i64']);
const uuidRegex = /^[0-9a-fA-F]{8}-([0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}$/;
function getPrimitiveTypes() {
    return PRIMITIVES;
}
exports.getPrimitiveTypes = getPrimitiveTypes;
function parseContainerType(typeText) {
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
    if (/^stream<.*>$/.test(noSpace)) {
        const inner = typeText.slice(typeText.indexOf('<') + 1, typeText.lastIndexOf('>'));
        return inner.trim().length > 0;
    }
    if (/^sink<.*>$/.test(noSpace)) {
        const inner = typeText.slice(typeText.indexOf('<') + 1, typeText.lastIndexOf('>'));
        return inner.trim().length > 0;
    }
    if (/^interaction<.*>$/.test(noSpace)) {
        const inner = typeText.slice(typeText.indexOf('<') + 1, typeText.lastIndexOf('>'));
        return inner.trim().length > 0;
    }
    if (/^reference<.*>$/.test(noSpace)) {
        const inner = typeText.slice(typeText.indexOf('<') + 1, typeText.lastIndexOf('>'));
        return inner.trim().length > 0;
    }
    return false;
}
function splitTopLevelAngles(typeInner) {
    const parts = [];
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
        }
        else {
            buf += ch;
        }
    }
    if (buf) {
        parts.push(buf);
    }
    return parts.map(s => s.trim()).filter(Boolean);
}
function stripTypeAnnotations(typeText) {
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
            }
            else {
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
                }
                else if (ch === '\'' && !inDouble) {
                    inSingle = !inSingle;
                }
                out += ch;
            }
            else {
                out += ch;
                escaped = false;
            }
        }
    }
    return out.trim();
}
function isKnownType(typeName, definedTypes, includeAliases) {
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
        return parts.every(p => isKnownType(p, definedTypes, includeAliases));
    }
    return false;
}
exports.isKnownType = isKnownType;
function resolveNamespacedBase(typeName, includeAliases) {
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
exports.resolveNamespacedBase = resolveNamespacedBase;
function isIntegerLiteral(text) {
    const t = text.trim();
    return /^-?\d+$/.test(t) && !/^-?\d+\.\d+$/.test(t);
}
exports.isIntegerLiteral = isIntegerLiteral;
function isFloatLiteral(text) {
    const t = text.trim();
    return /^-?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(t);
}
function isQuotedString(text) {
    const t = text.trim();
    if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith('\'') && t.endsWith('\''))) {
        return t.length >= 2;
    }
    return false;
}
function extractDefaultValue(codeLine) {
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
        }
        else if (ch === '>') {
            depthAngle = Math.max(0, depthAngle - 1);
        }
        else if (ch === '[') {
            depthBracket++;
        }
        else if (ch === ']') {
            depthBracket = Math.max(0, depthBracket - 1);
        }
        else if (ch === '{') {
            depthBrace++;
        }
        else if (ch === '}') {
            depthBrace = Math.max(0, depthBrace - 1);
        }
        else if (ch === '(') {
            depthParen++;
        }
        else if (ch === ')') {
            depthParen = Math.max(0, depthParen - 1);
        }
        else if (ch === '=' && depthAngle === 0 && depthBracket === 0 && depthBrace === 0 && depthParen === 0) {
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
        }
        else if (ch === '>') {
            depthAngle = Math.max(0, depthAngle - 1);
        }
        else if (ch === '[') {
            depthBracket++;
        }
        else if (ch === ']') {
            depthBracket = Math.max(0, depthBracket - 1);
        }
        else if (ch === '{') {
            depthBrace++;
        }
        else if (ch === '}') {
            depthBrace = Math.max(0, depthBrace - 1);
        }
        else if (ch === '(' && depthAngle === 0 && depthBracket === 0 && depthBrace === 0 && depthParen === 0) {
            break;
        }
        else if (ch === '(') {
            depthParen++;
        }
        else if (ch === ')') {
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
exports.extractDefaultValue = extractDefaultValue;
function valueMatchesType(valueRaw, typeText) {
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
function isValidDefaultValue(typeText, valueText) {
    const value = valueText.trim();
    if (!value) {
        return true;
    }
    return valueMatchesType(value, typeText);
}
exports.isValidDefaultValue = isValidDefaultValue;
//# sourceMappingURL=type-utils.js.map