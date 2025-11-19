import * as vscode from 'vscode';
import { parseAnnotations, extractAnnotationsFromField } from './annotationParser';
import { AnnotationNode } from './astTypes';

/**
 * Parsed field information for formatting
 */
interface ParsedField {
    fieldId: string;
    qualifier: string;
    type: string;
    name: string;
    suffix: string;
    comment: string;
    annotation?: string;
    annotationNodes?: AnnotationNode[];
}

export class ThriftFormattingProvider implements vscode.DocumentFormattingEditProvider, vscode.DocumentRangeFormattingEditProvider {
    // Precompiled regexes reused in hot paths and referenced by helpers
    private reStructField = /^\s*\d+:\s*(?:required|optional)?\s*.+$/;
    private reEnumField = /^\s*\w+\s*=\s*\d+/;
    private reSpaceBeforeLt = /\s+</g;
    private reSpaceAfterLt = /<\s+/g;
    // Remove spaces around '>'
    private reSpaceBeforeGt = /\s+>/g;
    private reSpaceGt = />\s*/g;
    private reSpaceComma = /\s*,\s*/g;
    // Detect a service method signature line (optionally oneway, return type with optional generics, name, params, optional throws)
    private reServiceMethod = /^\s*(oneway\s+)?[A-Za-z_][A-Za-z0-9_]*(?:\s*<[^>]*>)?\s+[A-Za-z_][A-Za-z0-9_]*\s*\([^)]*\)(\s*throws\s*\([^)]*\))?\s*[;,]?$/;

    provideDocumentFormattingEdits(
        document: vscode.TextDocument,
        options: vscode.FormattingOptions,
        token: vscode.CancellationToken
    ): vscode.TextEdit[] {
        const fullRange = new vscode.Range(
            document.positionAt(0),
            document.positionAt(document.getText().length)
        );
        return this.formatRange(document, fullRange, options);
    }

    provideDocumentRangeFormattingEdits(
        document: vscode.TextDocument,
        range: vscode.Range,
        options: vscode.FormattingOptions,
        token: vscode.CancellationToken
    ): vscode.TextEdit[] {
        return this.formatRange(document, range, options);
    }

    private formatRange(
        document: vscode.TextDocument,
        range: vscode.Range,
        options: vscode.FormattingOptions
    ): vscode.TextEdit[] {
        const config = vscode.workspace.getConfiguration('thrift.format');
        // Backward-compat: also read legacy test namespace if present
        const legacyConfig = vscode.workspace.getConfiguration('thrift-support.formatting');
        const getOpt = (key: string, def: any) => {
            const v = config.get(key);
            return (v !== undefined && v !== null) ? v : legacyConfig.get(key, def);
        };
        const text = document.getText(range);
        // Compute initial context from the content before the selection to make range formatting context-aware
        let initialContext: { indentLevel: number; inStruct: boolean; inEnum: boolean } | undefined;
        if (!(range.start.line === 0 && range.start.character === 0)) {
            initialContext = this.computeInitialContext(document, range.start);
        }
        // Unified control with backward-compatible fallback to fine-grained legacy keys
        const cfgAlignNames = getOpt('alignNames', undefined);
        const alignNames = (typeof cfgAlignNames !== 'undefined')
            ? cfgAlignNames
            : (getOpt('alignFieldNames', undefined) ?? getOpt('alignEnumNames', undefined) ?? true);
        // Global master switch for assignments alignment (option B)
        const alignAssignments = getOpt('alignAssignments', undefined);
        // Read per-kind (keep undefined when not set, to allow fallback to alignAssignments and preserve defaults)
        const cfgAlignStructDefaults = getOpt('alignStructDefaults', undefined);
        const cfgAlignEnumEquals = getOpt('alignEnumEquals', undefined);
        const cfgAlignEnumValues = getOpt('alignEnumValues', undefined);
        // New unified annotations switch with backward compatibility
        const cfgAlignAnnotations = getOpt('alignAnnotations', undefined);
        const resolvedAlignAnnotations = (typeof cfgAlignAnnotations !== 'undefined')
            ? cfgAlignAnnotations
            : getOpt('alignStructAnnotations', true);

        // explicit per-kind > global alignAssignments > kind default (struct=false, enum=true)
        const resolvedAlignStructDefaults = (typeof cfgAlignStructDefaults !== 'undefined')
            ? cfgAlignStructDefaults
            : false; // Default to false for struct default values
        const resolvedAlignEnumEquals = (typeof cfgAlignEnumEquals !== 'undefined')
            ? cfgAlignEnumEquals
            : (typeof alignAssignments === 'boolean')
                ? alignAssignments
                : true;
        const resolvedAlignEnumValues = (typeof cfgAlignEnumValues !== 'undefined')
            ? cfgAlignEnumValues
            : (typeof alignAssignments === 'boolean')
                ? alignAssignments
                : true;

        const fmtOptions = {
            trailingComma: getOpt('trailingComma', 'preserve'),
            alignTypes: getOpt('alignTypes', true),
            // unify by alignNames only
            alignFieldNames: alignNames,
            alignStructDefaults: resolvedAlignStructDefaults,
            // Use unified annotations setting (fallback to legacy)
            alignAnnotations: resolvedAlignAnnotations,
            alignComments: getOpt('alignComments', true),
            // unify by alignNames only
            alignEnumNames: alignNames,
            alignEnumEquals: resolvedAlignEnumEquals,
            alignEnumValues: resolvedAlignEnumValues,
            indentSize: getOpt('indentSize', 4),
            maxLineLength: getOpt('maxLineLength', 100),
            collectionStyle: getOpt('collectionStyle', 'preserve'),
        } as const;

        const formattedText = this.formatThriftCode(text, {
            ...fmtOptions,
            insertSpaces: options.insertSpaces,
            tabSize: options.tabSize,
            initialContext
        });

        return [vscode.TextEdit.replace(range, formattedText)];
    }

    private formatThriftCode(text: string, options: any): string {

        const lines = text.split('\n');
        const formattedLines: string[] = [];
        let indentLevel = (options && options.initialContext && typeof options.initialContext.indentLevel === 'number')
            ? options.initialContext.indentLevel : 0;
        let inStruct = !!(options && options.initialContext && options.initialContext.inStruct);
        let inEnum = !!(options && options.initialContext && options.initialContext.inEnum);
        let structFields: Array<{ line: string, type: string, name: string, suffix: string, comment: string, annotation?: string, annotationNodes?: AnnotationNode[] }> = [];
        let enumFields: Array<{ line: string, name: string, value: string, suffix: string, comment: string }> = [];
        let constFields: Array<{ line: string, type: string, name: string, value: string, comment: string }> = [];
        let inConstBlock = false;
        let inBlockComment = false;
        // Track the indent level where the current const block started, so flushing uses the correct base indent
        let constBlockIndentLevel: number | null = null;

        for (let i = 0; i < lines.length; i++) {
            let originalLine = lines[i];
            let line = originalLine.trim();

            // Flush accumulated struct fields before non-field separators/comments inside struct
            // This preserves original blank lines and comments positions between struct fields
            if (inStruct && structFields.length > 0 && !this.isStructField(line) && !line.startsWith('}')) {
                const formattedFields = this.formatStructFields(structFields, options, indentLevel);
                formattedLines.push(...formattedFields);
                structFields = [];
                // fall through to handle current line (blank/comment/other) normally
            }

            // Handle block comments: re-indent to current code indent and align '*' columns
            if (line.startsWith('/*')) {
                const commentLines: string[] = [originalLine];
                let j = i + 1;
                let closed = line.includes('*/');
                while (!closed && j < lines.length) {
                    commentLines.push(lines[j]);
                    if (lines[j].includes('*/')) { closed = true; }
                    j++;
                }

                const indentStr = this.getIndent(indentLevel, options);

                // Single-line block comment
                if (commentLines.length === 1) {
                    formattedLines.push(indentStr + line);
                    continue;
                }

                // Opening line (preserve /** vs /* and any trailing text)
                const openTrim = commentLines[0].trim();
                const openIsDoc = openTrim.startsWith('/**');
                const openToken = openIsDoc ? '/**' : '/*';
                const openRest = openTrim.slice(openToken.length); // keep any trailing content as-is
                formattedLines.push(indentStr + openToken + openRest);

                // Middle lines: normalize to `indent + ' *' + (space + content if any)`
                for (let k = 1; k < commentLines.length - 1; k++) {
                    let mid = commentLines[k].trim();
                    // Strip leading '*' and spaces
                    if (mid.startsWith('*')) { mid = mid.slice(1); }
                    mid = mid.replace(/^\s*/, '');
                    if (mid.length > 0) {
                        formattedLines.push(indentStr + ' * ' + mid);
                    } else {
                        formattedLines.push(indentStr + ' *');
                    }
                }

                // Closing line: place `*/` aligned with opening
                formattedLines.push(indentStr + ' */');

                // Skip consumed lines
                i = j - 1;
                continue;
            }

            // If we were in a const block and current line is not a const, flush the const block first (preserve order)
            if (inConstBlock && constFields.length > 0 && !this.isConstField(line) && !this.isConstStart(line)) {
                // 使用constBlockIndentLevel来保持const声明的缩进级别
                const formattedFields = this.formatConstFields(constFields, options, constBlockIndentLevel || 0);
                formattedLines.push(...formattedFields);
                constFields = [];
                inConstBlock = false;
                constBlockIndentLevel = null;
                // fall through to handle current line
            }

            // Skip empty lines and line comments, but only if they're not part of a const block
            if (!line || line.startsWith('//') || line.startsWith('#')) {
                // Check if this comment is before a const block
                let isBeforeConstBlock = false;
                if (i < lines.length - 1) {
                    const nextLine = lines[i + 1];
                    if (this.isConstStart(nextLine) || this.isConstField(nextLine)) {
                        isBeforeConstBlock = true;
                    }
                }

                // Only add the comment if it's not before a const block
                if (!isBeforeConstBlock) {
                    formattedLines.push(this.getIndent(indentLevel, options) + line);
                } else {
                    // If it's before a const block, add it with the same indentation as the const block
                    const commentIndent = this.getIndent(indentLevel, options);
                    formattedLines.push(commentIndent + line.trim());
                }
                continue;
            }

            // Handle const fields for alignment - check before other processing
            if (this.isConstStart(line)) {
                // Handle multiline const definitions (map, set, list with {})
                let constValue = originalLine; // Use original line with indentation
                let j = i + 1;

                // Check if it's a multiline start
                const openBrace = line.includes('{');
                const closeBrace = line.includes('}');
                const openBracket = line.includes('[');
                const closeBracket = line.includes(']');

                const isMultiline = (openBrace && !closeBrace) || (openBracket && !closeBracket);

                if (isMultiline) {
                    while (j < lines.length) {
                        const nextLine = lines[j];
                        constValue += '\n' + nextLine;
                        // Check if this line closes the block
                        // We check trim() to ignore indentation
                        if ((openBrace && nextLine.trim().endsWith('}')) ||
                            (openBracket && nextLine.trim().endsWith(']'))) {
                            j++; // Consume the closing line
                            break;
                        }
                        j++;
                    }
                    // Update i to skip consumed lines
                    i = j - 1;
                }

                // Parse the complete multiline const
                const fieldInfo = this.parseConstField(constValue, options, indentLevel);
                if (fieldInfo) {
                    // 保存当前缩进级别，用于格式化const块
                    if (constFields.length === 0) { constBlockIndentLevel = indentLevel; }
                    constFields.push(fieldInfo);
                    inConstBlock = true;
                }
                continue;
            } else if (this.isConstField(line)) {
                const fieldInfo = this.parseConstField(line, options, indentLevel);
                if (fieldInfo) {
                    // 保存当前缩进级别，用于格式化const块
                    if (constFields.length === 0) { constBlockIndentLevel = indentLevel; }
                    constFields.push(fieldInfo);
                    inConstBlock = true;
                    continue;
                }
            } else if (inConstBlock && constFields.length > 0 && !this.isConstField(line) && !this.isConstStart(line)) {
                // End of const block only if current line is not a const definition
                // (Flushed earlier above before handling comments/empty lines)
                // No-op here to avoid double flush
            }

            // Typedef: normalize generics spacing
            if (/^\s*typedef\b/.test(line)) {
                const normalized = this.normalizeGenericsInSignature(line);
                formattedLines.push(this.getIndent(indentLevel, options) + normalized);
                continue;
            }

            // Handle struct/union/exception/service definitions
            if (this.isStructStart(line)) {
                // If inline single-line block like: struct EmptyStruct {}
                if (line.includes('{') && line.includes('}')) {
                    formattedLines.push(this.getIndent(indentLevel, options) + line);
                    continue;
                }
                formattedLines.push(this.getIndent(indentLevel, options) + line);
                indentLevel++;
                inStruct = true;
                continue;
            }
            if (inStruct) {
                if (line.startsWith('}')) {
                    // End of struct/union/exception/service
                    if (structFields.length > 0) {
                        const formattedFields = this.formatStructFields(structFields, options, indentLevel);
                        formattedLines.push(...formattedFields);
                        structFields = [];
                    }
                    indentLevel--;
                    formattedLines.push(this.getIndent(indentLevel, options) + line);
                    inStruct = false;
                    continue;
                }

                // Normalize generics spacing for service method signatures (including throws)
                if (this.reServiceMethod.test(line)) {
                    const normalized = this.normalizeGenericsInSignature(line);
                    formattedLines.push(this.getIndent(indentLevel, options) + normalized);
                    continue;
                }

                if (this.isStructField(line)) {
                    const fieldInfo = this.parseStructField(line);
                    if (fieldInfo) {
                        structFields.push(fieldInfo);
                        continue;
                    }
                }
            }

            if (this.isEnumStart(line)) {
                // Inline enum block on a single line: enum X { A = 1 }
                if (line.includes('{') && line.includes('}')) {
                    formattedLines.push(this.getIndent(indentLevel, options) + line);
                    continue;
                }
                formattedLines.push(this.getIndent(indentLevel, options) + line);
                indentLevel++;
                inEnum = true;
                continue;
            }
            if (inEnum) {
                if (line.startsWith('}')) {
                    if (enumFields.length > 0) {
                        const formattedFields = this.formatEnumFields(enumFields, options, indentLevel);
                        formattedLines.push(...formattedFields);
                        enumFields = [];
                    }
                    indentLevel--;
                    formattedLines.push(this.getIndent(indentLevel, options) + line);
                    inEnum = false;
                    continue;
                }

                if (this.isEnumField(line)) {
                    const fieldInfo = this.parseEnumField(line);
                    if (fieldInfo) {
                        enumFields.push(fieldInfo);
                        continue;
                    }
                }
            }

            // If line is a standalone opening brace, align it with the declaration line (no extra indent)
            if (line === '{') {
                const level = Math.max(indentLevel - 1, 0);
                formattedLines.push(this.getIndent(level, options) + line);
                continue;
            }

            // Default: keep the line as-is with proper indentation
            formattedLines.push(this.getIndent(indentLevel, options) + line);
        }

        // Flush any remaining blocks
        if (constFields.length > 0) {
            // 使用保存的constBlockIndentLevel来保持const声明的缩进级别
            const formattedFields = this.formatConstFields(constFields, options, constBlockIndentLevel || 0);
            formattedLines.push(...formattedFields);
        }
        if (structFields.length > 0) {
            const formattedFields = this.formatStructFields(structFields, options, indentLevel);
            formattedLines.push(...formattedFields);
        }
        if (enumFields.length > 0) {
            const formattedFields = this.formatEnumFields(enumFields, options, indentLevel);
            formattedLines.push(...formattedFields);
        }

        // Trim trailing whitespace from each line (including spaces on empty lines)
        const cleaned = formattedLines.map(l => {
            // 保持const行的缩进，只修剪尾随空格
            if (l.trim().startsWith('const')) {
                return l.replace(/\s+$/g, ''); // 只修剪尾随空格，保持前导缩进
            }
            return l.replace(/\s+$/g, ''); // 只修剪尾随空格
        });
        return cleaned.join('\n');
    }

    private isConstStart(line: string): boolean {
        return /^\s*const\s+/.test(line);
    }

    private isConstField(line: string): boolean {
        // A const field inside a block doesn't start with const
        // It looks like: type name = value
        // But we need to distinguish it from other things.
        // In a const block, everything that looks like an assignment is a field?
        // Regex: ^\s*[A-Za-z0-9_<>, ]+\s+[A-Za-z0-9_]+\s*=\s*.+
        // But type can be complex.
        // Let's assume if we are in a const block, and it has `=`, it's a field.
        return /^\s*[a-zA-Z0-9_<>, ]+\s+[a-zA-Z0-9_]+\s*=\s*.+/.test(line);
    }

    private formatConstFields(fields: Array<{ line: string, type: string, name: string, value: string, comment: string }>, options: vscode.FormattingOptions, indentLevel: number): string[] {
        // Calculate max widths for alignment
        let maxTypeWidth = 0;
        let maxNameWidth = 0;

        fields.forEach(f => {
            maxTypeWidth = Math.max(maxTypeWidth, f.type.length);
            maxNameWidth = Math.max(maxNameWidth, f.name.length);
        });

        // Use the passed indentLevel (which captures the level where the const block started)
        const baseIndent = this.getIndent(indentLevel, options);
        const valueIndent = this.getIndent(indentLevel + 1, options);

        return fields.map(f => {
            let line = baseIndent;

            // If it's a standalone const line (starts with const), we need to preserve 'const ' prefix
            // But `parseConstField` strips 'const'.
            // We need to know if the original line had 'const'.
            // `f.line` is the original line.
            const isConstDecl = /^\s*const\s+/.test(f.line);
            if (isConstDecl) {
                line += 'const ';
            }

            if (options.alignTypes) {
                line += f.type.padEnd(maxTypeWidth);
            } else {
                line += f.type;
            }

            line += ' ';

            if (options.alignFieldNames) {
                line += f.name.padEnd(maxNameWidth);
            } else {
                line += f.name;
            }

            line += ' = ';

            // Value handling for multiline
            if (f.value.includes('\n')) {
                const lines = f.value.split('\n');
                line += lines[0].trim();
                for (let i = 1; i < lines.length; i++) {
                    const valLine = lines[i].trim();
                    if (valLine === '}' || valLine === ']') {
                        line += '\n' + baseIndent + valLine;
                    } else {
                        line += '\n' + valueIndent + valLine;
                    }
                }
            } else {
                line += f.value;
            }

            if (f.comment) {
                line += ' ' + f.comment;
            }

            return line;
        });
    }

    private isStructField(line: string): boolean {
        return this.reStructField.test(line);
    }

    private isEnumField(line: string): boolean {
        return this.reEnumField.test(line);
    }

    private parseEnumField(line: string): { line: string, name: string, value: string, suffix: string, comment: string } | null {
        // Name = Value [,;] // Comment
        const match = line.match(/^\s*(\w+)\s*=\s*(\d+)(.*)$/);
        if (!match) { return null; }
        const name = match[1];
        const value = match[2];
        let rest = match[3];

        // Extract comment
        let comment = '';
        const commentIdx = rest.indexOf('//');
        const hashIdx = rest.indexOf('#');
        let idx = -1;
        if (commentIdx !== -1 && hashIdx !== -1) { idx = Math.min(commentIdx, hashIdx); }
        else if (commentIdx !== -1) { idx = commentIdx; }
        else { idx = hashIdx; }

        if (idx !== -1) {
            comment = rest.substring(idx).trim();
            rest = rest.substring(0, idx);
        }

        const suffix = rest.trim(); // comma or semicolon
        return { line, name, value, suffix, comment };
    }

    private parseStructField(line: string): { line: string, type: string, name: string, suffix: string, comment: string, annotation?: string, annotationNodes?: AnnotationNode[] } | null {
        // 1: optional string name = "default" // comment
        // Regex: ^\s*(\d+):\s*(?:(required|optional)\s+)?(.+)\s+([A-Za-z0-9_]+)\s*(?:=\s*(.*))?$
        // This regex is too simple for complex types.
        // Let's use a more robust parsing strategy.

        const colonIdx = line.indexOf(':');
        if (colonIdx === -1) { return null; }

        const idPart = line.substring(0, colonIdx).trim();
        // Check if ID is number
        if (!/^\d+$/.test(idPart)) { return null; }

        let rest = line.substring(colonIdx + 1).trim();

        // Optional qualifier
        let qualifier = '';
        if (rest.startsWith('required')) {
            qualifier = 'required';
            rest = rest.substring(8).trim();
        } else if (rest.startsWith('optional')) {
            qualifier = 'optional';
            rest = rest.substring(8).trim();
        }

        // Type and Name
        // Type can contain spaces (map<K, V>).
        // Name is the last word before `=` or end of line (ignoring comments/annotations).

        // Extract comment first
        let comment = '';
        const commentIdx = rest.indexOf('//');
        const hashIdx = rest.indexOf('#');
        let idx = -1;
        if (commentIdx !== -1 && hashIdx !== -1) { idx = Math.min(commentIdx, hashIdx); }
        else if (commentIdx !== -1) { idx = commentIdx; }
        else { idx = hashIdx; }

        if (idx !== -1) {
            comment = rest.substring(idx).trim();
            rest = rest.substring(0, idx).trim();
        }

        // Extract default value (suffix)
        // It starts with `=`.
        // But wait, type definition might contain `=`? No.
        // But annotations might be `(foo="bar")`.
        // And default value might be complex.
        // Let's look for the LAST `=` that is NOT inside braces/parentheses/quotes?
        // Or simpler: Look for name.
        // Name is an identifier.
        // It is followed by optional `=` and value, and optional annotations.
        // Annotations are `(...)`.

        // Let's split by `=` if present.
        // But `=` can be in default value.
        // Strategy: Find the Name.
        // The Name is preceded by Type.
        // The Name is followed by `=` or `(` (annotation) or nothing.

        // We can iterate from the end of `rest` (excluding comment).
        // But default value is at the end.

        // Let's try to find the split between Type and Name.
        // Name is a single word. Type ends before Name.
        // But we don't know where Type ends.
        // However, Type cannot contain unclosed brackets.
        // Let's iterate from start, skipping balanced brackets.
        // Actually, simpler: The Name is the identifier before `=` (if exists) or before `(` (if exists) or at end.

        // Let's extract suffix (default value + annotations).
        // If there is an `=`, the default value starts there.
        // But annotations can be before or after default value?
        // Thrift grammar: FieldID: FieldReq? FieldType Identifier ('=' ConstValue)? XsdFieldOptions? TypeAnnotations?
        // So Name is followed by optional Default Value, then optional Annotations.

        let suffixRaw = '';
        let nameEnd = rest.length;

        // Check for default value
        const equalsIdx = rest.indexOf('=');
        if (equalsIdx !== -1) {
            // Verify it's not inside type (e.g. no unclosed < before it)
            // But types don't have =.
            // So first = is likely the default value assignment.
            nameEnd = equalsIdx;
            suffixRaw = rest.substring(equalsIdx); // includes =
        } else {
            // Check for annotations `(`
            const parenIdx = rest.indexOf('(');
            if (parenIdx !== -1) {
                nameEnd = parenIdx;
                suffixRaw = rest.substring(parenIdx);
            }
        }

        const typeAndName = rest.substring(0, nameEnd).trim();
        // Split Type and Name
        const lastSpace = typeAndName.lastIndexOf(' ');
        if (lastSpace === -1) { return null; } // Should have type and name

        const name = typeAndName.substring(lastSpace + 1);
        const type = typeAndName.substring(0, lastSpace).trim();

        // Parse annotations and default value from suffixRaw
        // suffixRaw might be `= "val" (anno="v")` or `(anno="v")`
        // We need to separate default value and annotations.
        // Annotations are always in `(...)` at the end?
        // Yes, TypeAnnotations.

        // Use annotationParser
        const { annotations, fieldLine } = extractAnnotationsFromField(suffixRaw);
        const annotation = annotations.length > 0 ? annotations.map(a => a.rawText).join(' ') : undefined;
        const suffix = fieldLine.trim();

        return {
            line,
            type: (qualifier ? qualifier + ' ' : '') + type,
            name,
            suffix,
            comment,
            annotation,
            annotationNodes: annotations
        };
    }

    private parseConstField(line: string, options: vscode.FormattingOptions, indentLevel: number): { line: string, type: string, name: string, value: string, comment: string } | null {
        const match = line.match(/^\s*const\s+([\s\S]+)/);
        if (!match) { return null; }
        let rest = match[1];

        // Extract Type
        let typeEnd = 0;
        let angleDepth = 0;
        for (let i = 0; i < rest.length; i++) {
            if (rest[i] === '<') { angleDepth++; }
            else if (rest[i] === '>') { angleDepth--; }
            else if (rest[i] === ' ' && angleDepth === 0) {
                typeEnd = i;
                break;
            }
        }
        if (typeEnd === 0) { return null; }

        let type = rest.substring(0, typeEnd).trim();
        rest = rest.substring(typeEnd).trim();

        // Fix comma spacing in type (e.g. map<string,i32> -> map<string, i32>)
        type = type.replace(this.reSpaceComma, ', ');

        // Extract Name
        const nameMatch = rest.match(/^([A-Za-z0-9_]+)\s*=\s*([\s\S]+)$/);
        if (!nameMatch) { return null; }
        const name = nameMatch[1];
        let valueRaw = nameMatch[2];

        let comment = '';
        if (!valueRaw.includes('\n')) {
            const commentIdx = valueRaw.indexOf('//');
            const hashIdx = valueRaw.indexOf('#');
            let idx = -1;
            if (commentIdx !== -1 && hashIdx !== -1) { idx = Math.min(commentIdx, hashIdx); }
            else if (commentIdx !== -1) { idx = commentIdx; }
            else { idx = hashIdx; }

            if (idx !== -1) {
                comment = valueRaw.substring(idx).trim();
                valueRaw = valueRaw.substring(0, idx).trim();
            }
        }

        return { line, type, name, value: valueRaw, comment };
    }

    private formatStructFields(fields: Array<{ line: string, type: string, name: string, suffix: string, comment: string, annotation?: string, annotationNodes?: AnnotationNode[] }>, options: vscode.FormattingOptions, indentLevel: number): string[] {
        if (fields.length === 0) { return []; }

        const parsedFields: ParsedField[] = fields.map(f => {
            const colonIdx = f.type.indexOf(':');
            const fieldId = f.type.substring(0, colonIdx).trim();
            let rest = f.type.substring(colonIdx + 1).trim();
            let qualifier = '';
            if (rest.startsWith('required')) {
                qualifier = 'required ';
                rest = rest.substring(8).trim();
            } else if (rest.startsWith('optional')) {
                qualifier = 'optional ';
                rest = rest.substring(8).trim();
            }
            return {
                fieldId,
                qualifier,
                type: rest,
                name: f.name,
                suffix: f.suffix,
                comment: f.comment,
                annotation: f.annotation
            };
        });

        let maxFieldIdWidth = 0;
        let maxTypeWidth = 0;
        let maxNameWidth = 0;
        let maxContentWidth = 0;

        parsedFields.forEach(f => {
            maxFieldIdWidth = Math.max(maxFieldIdWidth, f.fieldId.length + 1);
            maxTypeWidth = Math.max(maxTypeWidth, f.type.length);
            maxNameWidth = Math.max(maxNameWidth, f.name.length);
        });

        const baseIndent = this.getIndent(indentLevel, options);

        parsedFields.forEach(f => {
            let len = baseIndent.length;
            len += f.fieldId.length + 1 + 1;
            len += f.qualifier.length;
            len += (options.alignTypes ? maxTypeWidth : f.type.length);
            len += 1 + f.name.length;
            if (f.suffix) {
                len += 3 + f.suffix.length;
            }
            if (f.annotation) {
                len += 1 + f.annotation.length;
            }
            maxContentWidth = Math.max(maxContentWidth, len);
        });

        return parsedFields.map(f => {
            if (f.suffix.includes('\n')) {
                return this.formatMultiLineStructField(f, options, indentLevel, maxFieldIdWidth, maxTypeWidth, maxNameWidth, 0, maxContentWidth, 0);
            } else {
                return this.formatSingleLineStructField(f, options, indentLevel, maxFieldIdWidth, maxTypeWidth, maxNameWidth, 0, maxContentWidth, 0);
            }
        });
    }

    private formatSingleLineStructField(
        field: ParsedField,
        options: vscode.FormattingOptions,
        indentLevel: number,
        maxFieldIdWidth: number,
        maxTypeWidth: number,
        maxNameWidth: number,
        targetAnnoStart: number,
        maxContentWidth: number,
        commentCount: number
    ): string {
        const baseIndent = this.getIndent(indentLevel, options);
        let line = baseIndent;

        line += field.fieldId + ':';
        line = line.padEnd(baseIndent.length + maxFieldIdWidth, ' ');
        line += ' ';

        line += field.qualifier;
        if (options.alignTypes) {
            line += field.type.padEnd(maxTypeWidth);
        } else {
            line += field.type;
        }
        line += ' ';

        if (options.alignFieldNames) {
            line += field.name.padEnd(maxNameWidth);
        } else {
            line += field.name;
        }

        if (field.suffix) {
            line += ' ' + field.suffix;
        }

        if (field.annotation) {
            line += ' ' + field.annotation;
        }

        if (field.comment) {
            if (options.alignComments) {
                const currentLen = line.length;
                const pad = Math.max(1, maxContentWidth - currentLen + 1);
                line += ' '.repeat(pad) + field.comment;
            } else {
                line += ' ' + field.comment;
            }
        }

        return line;
    }

    private formatMultiLineStructField(
        field: ParsedField,
        options: vscode.FormattingOptions,
        indentLevel: number,
        maxFieldIdWidth: number,
        maxTypeWidth: number,
        maxNameWidth: number,
        targetAnnoStart: number,
        maxContentWidth: number,
        commentCount: number
    ): string {
        const baseIndent = this.getIndent(indentLevel, options);
        let line = baseIndent;

        line += field.fieldId + ':';
        line = line.padEnd(baseIndent.length + maxFieldIdWidth, ' ');
        line += ' ';

        line += field.qualifier;
        if (options.alignTypes) {
            line += field.type.padEnd(maxTypeWidth);
        } else {
            line += field.type;
        }
        line += ' ';

        line += field.name;

        if (field.suffix) {
            line += ' ' + field.suffix;
        }

        if (field.annotation) {
            line += ' ' + field.annotation;
        }

        if (field.comment) {
            line += ' ' + field.comment;
        }

        return line;
    }

    private formatEnumFields(fields: Array<{ line: string, name: string, value: string, suffix: string, comment: string }>, options: vscode.FormattingOptions, indentLevel: number): string[] {
        let maxNameWidth = 0;
        let maxValueWidth = 0;
        let maxContentWidth = 0;

        fields.forEach(f => {
            maxNameWidth = Math.max(maxNameWidth, f.name.length);
            maxValueWidth = Math.max(maxValueWidth, f.value.length);
        });

        const baseIndent = this.getIndent(indentLevel, options);

        fields.forEach(f => {
            let len = baseIndent.length;
            if (options.alignEnumNames) { len += maxNameWidth; }
            else { len += f.name.length; }

            len += 3;

            if (options.alignEnumValues) { len += maxValueWidth; }
            else { len += f.value.length; }

            if (f.suffix) { len += f.suffix.length; }
            else { len += 1; }

            maxContentWidth = Math.max(maxContentWidth, len);
        });

        return fields.map(f => {
            let line = baseIndent;
            if (options.alignEnumNames) {
                line += f.name.padEnd(maxNameWidth);
            } else {
                line += f.name;
            }

            line += ' = ';

            if (options.alignEnumValues) {
                line += f.value.padEnd(maxValueWidth);
            } else {
                line += f.value;
            }

            if (f.suffix) {
                line += f.suffix;
            } else {
                line += ',';
            }

            if (f.comment) {
                if (options.alignComments) {
                    const currentLen = line.length;
                    const pad = Math.max(1, maxContentWidth - currentLen + 1);
                    line += ' '.repeat(pad) + f.comment;
                } else {
                    line += ' ' + f.comment;
                }
            }
            return line;
        });
    }

    private getIndent(level: number, options: vscode.FormattingOptions): string {
        if (options.insertSpaces) {
            return ' '.repeat(level * options.tabSize);
        }
        return '\t'.repeat(level);
    }

    private normalizeGenericsInSignature(line: string): string {
        return line.replace(/\s*<\s*/g, '<').replace(/\s*>\s*/g, '>').replace(/\s*,\s*/g, ', ');
    }

    private isStructStart(line: string): boolean {
        return /^\s*(struct|union|exception|service)\s+/.test(line);
    }

    private isEnumStart(line: string): boolean {
        return /^\s*enum\s+/.test(line);
    }

    private computeInitialContext(document: vscode.TextDocument, position: vscode.Position): { indentLevel: number; inStruct: boolean; inEnum: boolean } {
        let indentLevel = 0;
        let inStruct = false;
        let inEnum = false;
        for (let i = 0; i < position.line; i++) {
            const line = document.lineAt(i).text;
            if (this.isStructStart(line) && !line.includes('}')) {
                indentLevel++;
                inStruct = true;
            } else if (this.isEnumStart(line) && !line.includes('}')) {
                indentLevel++;
                inEnum = true;
            } else if (line.trim().startsWith('}')) {
                indentLevel = Math.max(0, indentLevel - 1);
                inStruct = false;
                inEnum = false;
            }
        }
        return { indentLevel, inStruct, inEnum };
    }
}