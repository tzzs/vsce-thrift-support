"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatEnumFields = void 0;
function formatEnumFields(fields, options, indentLevel, deps) {
    const needsAlignment = options.alignEnumNames || options.alignEnumEquals || options.alignEnumValues || options.alignComments || options.trailingComma !== 'preserve';
    if (!needsAlignment) {
        return fields.map(f => deps.getIndent(indentLevel, options) + f.line);
    }
    const indent = deps.getIndent(indentLevel, options);
    const fieldsWithValues = fields.filter(f => f.value);
    const maxNameWidth = fieldsWithValues.length > 0
        ? Math.max(...fieldsWithValues.map(f => f.name.length), 0)
        : 0;
    let maxContentWidth = 0;
    let maxAnnoStart = 0;
    const interim = [];
    for (const f of fields) {
        let hasComma = f.suffix ? /,/.test(f.suffix) : false;
        const hasSemicolon = f.suffix ? /;/.test(f.suffix) : false;
        if (!hasSemicolon) {
            if (options.trailingComma === 'add') {
                hasComma = true;
            }
            else if (options.trailingComma === 'remove') {
                hasComma = false;
            }
        }
        let base = indent;
        if (f.value) {
            if (options.alignEnumEquals) {
                base += f.name.padEnd(maxNameWidth) + ' = ';
            }
            else {
                const namePart = options.alignEnumNames ? f.name.padEnd(maxNameWidth) : f.name;
                base += namePart + ' = ';
            }
            base += '' + f.value;
        }
        else {
            base += f.name;
        }
        const baseWidth = base.length - indent.length;
        if (options.alignAnnotations && f.annotation !== undefined) {
            maxAnnoStart = Math.max(maxAnnoStart, baseWidth);
        }
        interim.push({
            base,
            comment: f.comment,
            hasComma,
            hasSemicolon,
            annotation: f.annotation ?? ''
        });
    }
    if (options.alignAnnotations) {
        interim.forEach(({ base, annotation, hasComma, hasSemicolon }) => {
            let line = base;
            if (annotation) {
                const currentWidth = base.length - indent.length;
                const spaces = maxAnnoStart - currentWidth + 1;
                line = base + ' '.repeat(Math.max(1, spaces)) + annotation;
            }
            let w = line.length - indent.length;
            if (hasSemicolon) {
                w += 1;
            }
            else if (hasComma) {
                w += 1;
            }
            maxContentWidth = Math.max(maxContentWidth, w);
        });
    }
    else {
        interim.forEach(({ base, annotation, hasComma, hasSemicolon }) => {
            let line = base;
            if (annotation) {
                line = base + ' ' + annotation;
            }
            let w = line.length - indent.length;
            if (hasSemicolon) {
                w += 1;
            }
            else if (hasComma) {
                w += 1;
            }
            maxContentWidth = Math.max(maxContentWidth, w);
        });
    }
    return interim.map(({ base, comment, hasComma, hasSemicolon, annotation }) => {
        let line = base;
        if (annotation) {
            if (options.alignAnnotations) {
                const currentWidth = line.length - indent.length;
                const spaces = maxAnnoStart - currentWidth + 1;
                line += ' '.repeat(Math.max(1, spaces)) + annotation;
            }
            else {
                line += ' ' + annotation;
            }
        }
        if (hasSemicolon) {
            line += ';';
        }
        else if (hasComma) {
            line += ',';
        }
        if (comment) {
            if (options.alignComments) {
                const currentWidth = line.length - indent.length;
                const pad = Math.max(1, maxContentWidth - currentWidth + 1);
                line += ' '.repeat(pad) + comment;
            }
            else {
                line += ' ' + comment;
            }
        }
        return line;
    });
}
exports.formatEnumFields = formatEnumFields;
//# sourceMappingURL=field-format.js.map