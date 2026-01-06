/**
 * Split a single-line body into top-level parts, ignoring nested generics/collections and strings.
 * @param content - Inline body text to split.
 * @returns Top-level parts with surrounding whitespace trimmed.
 */
export function splitTopLevelParts(content: string): string[] {
    const parts: string[] = [];
    let buf = '';
    let depthAngle = 0;
    let depthParen = 0;
    let depthBrace = 0;
    let depthBracket = 0;
    let inS = false;
    let inD = false;
    let escaped = false;

    for (let i = 0; i < content.length; i++) {
        const ch = content[i];
        const next = i + 1 < content.length ? content[i + 1] : '';

        if (escaped) {
            buf += ch;
            escaped = false;
            continue;
        }
        if (inS) {
            if (ch === '\\') {
                escaped = true;
            } else if (ch === '\'') {
                inS = false;
            }
            buf += ch;
            continue;
        }
        if (inD) {
            if (ch === '\\') {
                escaped = true;
            } else if (ch === '"') {
                inD = false;
            }
            buf += ch;
            continue;
        }

        if (ch === '\'') {
            inS = true;
            buf += ch;
            continue;
        }
        if (ch === '"') {
            inD = true;
            buf += ch;
            continue;
        }

        if (ch === '<') {
            depthAngle++;
        } else if (ch === '>') {
            depthAngle = Math.max(0, depthAngle - 1);
        } else if (ch === '(') {
            depthParen++;
        } else if (ch === ')') {
            depthParen = Math.max(0, depthParen - 1);
        } else if (ch === '{') {
            depthBrace++;
        } else if (ch === '}') {
            depthBrace = Math.max(0, depthBrace - 1);
        } else if (ch === '[') {
            depthBracket++;
        } else if (ch === ']') {
            depthBracket = Math.max(0, depthBracket - 1);
        }

        const atTop = depthAngle === 0 && depthParen === 0 && depthBrace === 0 && depthBracket === 0;
        if (atTop && (ch === ';' || ch === ',')) {
            if (buf.trim()) {
                parts.push(buf.trim());
            }
            buf = '';
            if (next === ' ' || next === '\t') {
                continue;
            }
            continue;
        }

        buf += ch;
    }

    if (buf.trim()) {
        parts.push(buf.trim());
    }
    return parts;
}

/**
 * Normalize generics spacing within a Thrift signature line, keeping any trailing comment.
 * @param text - Signature line to normalize.
 * @returns Normalized signature with preserved trailing comment.
 */
export function normalizeGenericsInSignature(text: string): string {
    if (!text) {
        return text;
    }
    let code = text;
    let comment = '';
    const cm = code.match(/^(.*?)(\/\/.*)$/);
    if (cm) {
        code = cm[1].trimEnd();
        comment = cm[2];
    }
    const res: string[] = [];
    let depthAngle = 0;
    let inS = false;
    let inD = false;
    const n = code.length;
    for (let i = 0; i < n; i++) {
        const ch = code[i];

        if (inD) {
            if (ch === '\\' && i + 1 < n) {
                res.push(ch);
                res.push(code[++i]);
                continue;
            }
            res.push(ch);
            if (ch === '"') {
                inD = false;
            }
            continue;
        }
        if (inS) {
            if (ch === '\\' && i + 1 < n) {
                res.push(ch);
                res.push(code[++i]);
                continue;
            }
            res.push(ch);
            if (ch === "'") {
                inS = false;
            }
            continue;
        }

        if (ch === '"') {
            inD = true;
            res.push(ch);
            continue;
        }
        if (ch === "'") {
            inS = true;
            res.push(ch);
            continue;
        }
        if (ch === '<') {
            while (res.length > 0 && res[res.length - 1] === ' ') {
                res.pop();
            }
            res.push('<');
            depthAngle++;
            while (i + 1 < n && code[i + 1] === ' ') {
                i++;
            }
            continue;
        }
        if (ch === ',' && depthAngle > 0) {
            while (res.length > 0 && res[res.length - 1] === ' ') {
                res.pop();
            }
            res.push(',');
            while (i + 1 < n && code[i + 1] === ' ') {
                i++;
            }
            continue;
        }
        if (ch === '>') {
            if (depthAngle > 0) {
                while (res.length > 0 && res[res.length - 1] === ' ') {
                    res.pop();
                }
                res.push('>');
                depthAngle = Math.max(0, depthAngle - 1);
                let k = i + 1;
                while (k < n && code[k] === ' ') {
                    k++;
                }
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
