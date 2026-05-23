"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatStructFields = void 0;
function calculateAnnotationStartPosition(field, options, maxFieldIdWidth, maxQualifierWidth, maxTypeWidth, maxNameWidth) {
    let w = 0;
    w += maxFieldIdWidth + 2;
    if (options.alignTypes) {
        w += maxQualifierWidth;
        if (maxQualifierWidth > 0) {
            w += 1;
        }
    }
    else {
        w += field.qualifier.length;
        if (field.qualifier.length > 0) {
            w += 1;
        }
    }
    w += (options.alignTypes ? maxTypeWidth : field.type.length);
    w += 1;
    if (options.alignFieldNames && (field.suffix || (field.annotation !== undefined && field.annotation !== ''))) {
        w += maxNameWidth;
        if (field.suffix) {
            let s = field.suffix;
            if (/,\s*$/.test(s)) {
                s = s.replace(/,\s*$/, '');
            }
            if (s.includes('=')) {
                s = s.replace(/\s*=\s*/, ' = ');
            }
            w += s.length;
        }
    }
    else {
        w += field.name.length;
        if (field.suffix) {
            let s = field.suffix;
            if (/,\s*$/.test(s)) {
                s = s.replace(/,\s*$/, '');
            }
            if (s.includes('=')) {
                s = s.replace(/\s*=\s*/, ' = ');
            }
            w += s.length;
        }
    }
    return w;
}
function formatStructFields(fields, options, indentLevel, deps) {
    const sortedFields = fields;
    const needsAlignment = options.alignTypes || options.alignFieldNames || options.alignComments || options.alignAnnotations;
    if (!needsAlignment && options.trailingComma === 'preserve') {
        return sortedFields.map(f => deps.getIndent(indentLevel, options) + f.line);
    }
    let maxFieldIdWidth = 0;
    let maxQualifierWidth = 0;
    let maxTypeWidth = 0;
    let maxNameWidth = 0;
    let maxAnnotationWidth = 0;
    let maxContentWidth = 0;
    const parsedFields = sortedFields.map(field => {
        maxFieldIdWidth = Math.max(maxFieldIdWidth, field.id.length);
        maxQualifierWidth = Math.max(maxQualifierWidth, field.qualifier.length);
        maxTypeWidth = Math.max(maxTypeWidth, field.type.length);
        maxNameWidth = Math.max(maxNameWidth, field.name.length);
        if (options.alignAnnotations && field.annotation !== undefined && field.annotation !== '') {
            maxAnnotationWidth = Math.max(maxAnnotationWidth, field.annotation.length);
        }
        return field;
    });
    parsedFields.forEach(field => {
        let contentWidth = 0;
        contentWidth += maxFieldIdWidth + 2;
        if (options.alignTypes) {
            contentWidth += maxQualifierWidth;
            if (maxQualifierWidth > 0) {
                contentWidth += 1;
            }
        }
        else {
            contentWidth += field.qualifier.length;
            if (field.qualifier.length > 0) {
                contentWidth += 1;
            }
        }
        if (options.alignTypes) {
            contentWidth += maxTypeWidth;
        }
        else {
            contentWidth += field.type.length;
        }
        contentWidth += 1;
        let cleanSuffixForWidth = field.suffix || '';
        const hasCommaForWidth = field.suffix ? /,\s*$/.test(field.suffix) : false;
        cleanSuffixForWidth = cleanSuffixForWidth.replace(/\s+$/, '');
        if (hasCommaForWidth) {
            cleanSuffixForWidth = cleanSuffixForWidth.replace(/,\s*$/, '');
        }
        if (cleanSuffixForWidth && cleanSuffixForWidth.includes('=')) {
            cleanSuffixForWidth = cleanSuffixForWidth.replace(/\s*=\s*/, ' = ');
        }
        if (options.alignFieldNames && (cleanSuffixForWidth || (field.annotation !== undefined && field.annotation !== ''))) {
            contentWidth += maxNameWidth;
            if (cleanSuffixForWidth) {
                contentWidth += cleanSuffixForWidth.length;
            }
        }
        else {
            contentWidth += field.name.length;
            if (cleanSuffixForWidth) {
                contentWidth += cleanSuffixForWidth.length;
            }
        }
        if (options.alignAnnotations && field.annotation !== undefined && field.annotation !== '') {
            contentWidth += 1;
            contentWidth += maxAnnotationWidth;
        }
        else if (field.annotation !== undefined && field.annotation !== '') {
            contentWidth += 1 + field.annotation.length;
        }
        if (options.trailingComma === 'preserve' && hasCommaForWidth) {
            contentWidth += 1;
        }
        else if (options.trailingComma === 'add' && !/;/.test(field.suffix || '')) {
            contentWidth += 1;
        }
        maxContentWidth = Math.max(maxContentWidth, contentWidth);
    });
    const targetAnnoStart = (() => {
        if (!options.alignAnnotations) {
            return 0;
        }
        let max = 0;
        parsedFields.forEach(f => {
            if (f === undefined || f.annotation === undefined || f.annotation === '') {
                return;
            }
            const w = calculateAnnotationStartPosition(f, options, maxFieldIdWidth, maxQualifierWidth, maxTypeWidth, maxNameWidth);
            if (w > max) {
                max = w;
            }
        });
        return max;
    })();
    const commentCount = parsedFields.reduce((acc, f) => acc + ((f !== undefined && f.comment) ? 1 : 0), 0);
    return parsedFields.map(field => {
        let formattedLine = deps.getIndent(indentLevel, options);
        const fieldIdWithColon = field.id + ':';
        formattedLine += fieldIdWithColon.padEnd(maxFieldIdWidth + 1) + ' ';
        if (options.alignTypes) {
            formattedLine += field.qualifier.padEnd(maxQualifierWidth);
            if (maxQualifierWidth > 0) {
                formattedLine += ' ';
            }
        }
        else {
            formattedLine += field.qualifier;
            if (field.qualifier.length > 0) {
                formattedLine += ' ';
            }
        }
        if (options.alignTypes) {
            formattedLine += field.type.padEnd(maxTypeWidth);
        }
        else {
            formattedLine += field.type;
        }
        formattedLine += ' ';
        let cleanSuffix = field.suffix || '';
        let hasComma = cleanSuffix ? /,\s*$/.test(cleanSuffix) : false;
        const hasSemicolon = cleanSuffix ? /;/.test(cleanSuffix) : false;
        cleanSuffix = cleanSuffix.replace(/\s+$/, '');
        if (hasComma) {
            cleanSuffix = cleanSuffix.replace(/,\s*$/, '');
        }
        if (hasSemicolon) {
            cleanSuffix = cleanSuffix.replace(/;/g, '');
        }
        if (cleanSuffix && cleanSuffix.includes('=')) {
            cleanSuffix = cleanSuffix.replace(/\s*=\s*/, ' = ');
        }
        if (options.trailingComma === 'add' && !hasComma && !hasSemicolon) {
            hasComma = true;
        }
        else if (options.trailingComma === 'remove' && hasComma && !hasSemicolon) {
            hasComma = false;
        }
        const hasContentAfterName = (cleanSuffix && cleanSuffix.length > 0) || (field.annotation !== undefined && field.annotation !== '');
        if (options.alignFieldNames && hasContentAfterName) {
            formattedLine += field.name.padEnd(maxNameWidth);
            if (cleanSuffix) {
                formattedLine += cleanSuffix;
            }
        }
        else {
            formattedLine += field.name;
            if (cleanSuffix) {
                formattedLine += cleanSuffix;
            }
        }
        if (field.annotation !== undefined && field.annotation !== '') {
            if (options.alignAnnotations) {
                const currentWidth = formattedLine.length - deps.getIndent(indentLevel, options).length;
                const spaces = targetAnnoStart - currentWidth + 1;
                formattedLine += ' '.repeat(Math.max(0, spaces)) + field.annotation;
            }
            else {
                formattedLine += ' ' + field.annotation;
            }
        }
        if (hasSemicolon) {
            formattedLine += ';';
        }
        else if (hasComma) {
            formattedLine += ',';
        }
        if (field.comment) {
            if (options.alignComments) {
                const currentWidth = formattedLine.length - deps.getIndent(indentLevel, options).length;
                const diff = maxContentWidth - currentWidth;
                const basePad = Math.max(1, diff + 1);
                const padSpaces = commentCount > 1 ? basePad : 1;
                formattedLine += ' '.repeat(padSpaces) + field.comment;
            }
            else {
                formattedLine += ' ' + field.comment;
            }
        }
        return formattedLine;
    });
}
exports.formatStructFields = formatStructFields;
//# sourceMappingURL=struct-format.js.map