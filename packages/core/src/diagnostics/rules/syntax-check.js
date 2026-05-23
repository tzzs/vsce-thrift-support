"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkSyntax = void 0;
const types_1 = require("../../types");
function checkSyntax(codeLines, issues) {
    const stack = [];
    for (let lineNo = 0; lineNo < codeLines.length; lineNo++) {
        const line = codeLines[lineNo];
        let inS = false, inD = false, escaped = false;
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
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
            if (ch === '{' || ch === '(' || ch === '<') {
                stack.push({ ch, line: lineNo, char: i });
            }
            else if (ch === '}' || ch === ')' || ch === '>') {
                if (ch === '>') {
                    const top = stack[stack.length - 1];
                    if (top !== undefined && top.ch === '<') {
                        stack.pop();
                    }
                    continue;
                }
                const open = stack.pop();
                if (!open) {
                    issues.push({
                        message: `Unmatched closing '${ch}'`,
                        range: new types_1.Range(lineNo, i, lineNo, i + 1),
                        severity: types_1.DiagnosticSeverity.Error,
                        code: 'syntax.unmatchedCloser'
                    });
                }
                else {
                    const pair = { '}': '{', ')': '(' };
                    if (open.ch !== pair[ch]) {
                        issues.push({
                            message: `Mismatched '${open.ch}' and '${ch}'`,
                            range: new types_1.Range(lineNo, i, lineNo, i + 1),
                            severity: types_1.DiagnosticSeverity.Error,
                            code: 'syntax.mismatched'
                        });
                    }
                }
            }
        }
    }
    for (const open of stack) {
        issues.push({
            message: `Unclosed '${open.ch}'`,
            range: new types_1.Range(open.line, open.char, open.line, open.char + 1),
            severity: types_1.DiagnosticSeverity.Error,
            code: 'syntax.unclosed'
        });
    }
}
exports.checkSyntax = checkSyntax;
//# sourceMappingURL=syntax-check.js.map