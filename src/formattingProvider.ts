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
    hasTrailingComma: boolean; // Whether the original field had a trailing comma
}

export class ThriftFormattingProvider implements vscode.DocumentFormattingEditProvider, vscode.DocumentRangeFormattingEditProvider {
    // Precompiled regexes reused in hot paths and referenced by helpers
    private reStructField = /^\s*\d+:\s*(?:required|optional)?\s*.+$/;
    private reEnumField = /^\s*\w+\s*=\s*\d+/;
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
        let structFields: Array<{ line: string, type: string, name: string, suffix: string, comment: string, annotation?: string, annotationNodes?: AnnotationNode[], hasTrailingComma: boolean }> = [];
        let enumFields: Array<{ line: string, name: string, value: string, suffix: string, comment: string, hasTrailingComma: boolean }> = [];
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
        if (fields.length === 0) { return []; }

        // Calculate max widths for alignment
        let maxTypeWidth = 0;
        let maxNameWidth = 0;

        fields.forEach(f => {
            maxTypeWidth = Math.max(maxTypeWidth, f.type.length);
            maxNameWidth = Math.max(maxNameWidth, f.name.length);
        });

        const baseIndent = this.getIndent(indentLevel, options);
        const valueIndent = this.getIndent(indentLevel + 1, options);
        const collectionStyle = options.collectionStyle || 'preserve';
        const maxLineLen = options.maxLineLength || 100;

        // Pre-process each field: detect expansion needs, parse items, extract comments
        interface ProcessedConst {
            line: string;
            type: string;
            name: string;
            value: string;
            comment: string;
            isConstDecl: boolean;
            isExpanded: boolean;
            expandedFirstPart: string; // e.g. "[ // comment" or "{"
            expandedItems: Array<{ content: string; comment: string }>;
            expandedClosing: string; // "]" or "}"
            singleLineValue: string;
            singleLineComment: string;
        }

        const processed: ProcessedConst[] = fields.map(f => {
            const isConstDecl = /^\s*const\s+/.test(f.line);
            let value = f.value;
            let isExpanded = value.includes('\n');
            let expandedFirstPart = '';
            let expandedItems: Array<{ content: string; comment: string }> = [];
            let expandedClosing = '';
            let singleLineValue = value;
            let singleLineComment = f.comment;

            if (isExpanded) {
                // Already multiline: parse into structured form for comment alignment
                const valLines = value.split('\n');
                expandedFirstPart = valLines[0].trim();
                const closingBrace = expandedFirstPart.startsWith('{') ? '}' : expandedFirstPart.startsWith('[') ? ']' : '';
                for (let i = 1; i < valLines.length; i++) {
                    const trimmed = valLines[i].trim();
                    if (trimmed === closingBrace || trimmed === '}') {
                        expandedClosing = closingBrace || '}';
                    } else {
                        let itemContent = trimmed;
                        let itemComment = '';
                        const hashIdx = itemContent.indexOf('#');
                        const slashIdx = itemContent.indexOf('//');
                        let commentStart = -1;
                        if (hashIdx !== -1 && slashIdx !== -1) { commentStart = Math.min(hashIdx, slashIdx); }
                        else if (hashIdx !== -1) { commentStart = hashIdx; }
                        else if (slashIdx !== -1) { commentStart = slashIdx; }
                        if (commentStart !== -1) {
                            itemComment = itemContent.substring(commentStart).trim();
                            itemContent = itemContent.substring(0, commentStart).trim();
                        }
                        expandedItems.push({ content: itemContent, comment: itemComment });
                    }
                }
            } else {
                // Single-line: check if we should expand
                // Extract inline comment from value
                let inlineComment = '';
                const hashIdx = value.indexOf('#');
                const slashIdx = value.indexOf('//');
                let commentStart = -1;
                if (hashIdx !== -1 && slashIdx !== -1) { commentStart = Math.min(hashIdx, slashIdx); }
                else if (hashIdx !== -1) { commentStart = hashIdx; }
                else if (slashIdx !== -1) { commentStart = slashIdx; }
                if (commentStart !== -1) {
                    inlineComment = value.substring(commentStart).trim();
                    value = value.substring(0, commentStart).trim();
                }
                // Merge: inline comment from value takes precedence, else use field-level comment
                if (inlineComment) { singleLineComment = inlineComment; }

                const openingBrace = value.startsWith('[') ? '[' : value.startsWith('{') ? '{' : null;
                if (openingBrace) {
                    const closingBrace = openingBrace === '[' ? ']' : '}';
                    const inner = value.substring(1, value.length - 1).trim();
                    const items = this.parseCollectionItems(inner, openingBrace === '{');

                    // Determine if expansion is needed
                    let shouldExpand = false;
                    if (collectionStyle === 'multiline') {
                        shouldExpand = true;
                    } else if (collectionStyle === 'auto') {
                        // Compute total line length including the prefix
                        let prefixLen = baseIndent.length;
                        if (isConstDecl) { prefixLen += 6; } // 'const '
                        prefixLen += f.type.length + 1 + f.name.length + 3; // type + space + name + ' = '
                        const totalLen = prefixLen + value.length + (singleLineComment ? 1 + singleLineComment.length : 0);
                        shouldExpand = totalLen > maxLineLen;
                    }
                    if (shouldExpand) {
                        isExpanded = true;
                        expandedFirstPart = openingBrace + (singleLineComment ? ' ' + singleLineComment : '');
                        expandedClosing = closingBrace;
                        singleLineComment = ''; // comment moved to expandedFirstPart
                        expandedItems = items.map((item, idx) => ({
                            content: item + (idx < items.length - 1 ? ',' : ''),
                            comment: ''
                        }));
                    }
                }
                singleLineValue = value;
            }

            return {
                line: f.line,
                type: f.type,
                name: f.name,
                value: f.value,
                comment: f.comment,
                isConstDecl,
                isExpanded,
                expandedFirstPart,
                expandedItems,
                expandedClosing,
                singleLineValue,
                singleLineComment
            };
        });

        // Compute comment alignment for single-line consts
        let maxSingleLineEnd = 0;
        processed.forEach(p => {
            if (!p.isExpanded) {
                let len = baseIndent.length;
                if (p.isConstDecl) { len += 6; } // 'const '
                len += (options.alignTypes ? maxTypeWidth : p.type.length);
                len += 1; // space
                len += (options.alignFieldNames ? maxNameWidth : p.name.length);
                len += 3; // ' = '
                len += p.singleLineValue.length;
                maxSingleLineEnd = Math.max(maxSingleLineEnd, len);
            }
        });

        // Compute comment alignment for multiline const items
        // Group expanded items across fields to compute max position
        let maxItemContentEnd = 0;
        processed.forEach(p => {
            if (p.isExpanded) {
                p.expandedItems.forEach(item => {
                    const len = valueIndent.length + item.content.length;
                    maxItemContentEnd = Math.max(maxItemContentEnd, len);
                });
            }
        });

        // Format each field
        return processed.map(p => {
            const lines: string[] = [];

            // Build the const declaration prefix
            let prefix = baseIndent;
            if (p.isConstDecl) { prefix += 'const '; }
            if (options.alignTypes) {
                prefix += p.type.padEnd(maxTypeWidth);
            } else {
                prefix += p.type;
            }
            prefix += ' ';
            if (options.alignFieldNames) {
                prefix += p.name.padEnd(maxNameWidth);
            } else {
                prefix += p.name;
            }
            prefix += ' = ';

            if (p.isExpanded) {
                // First line: prefix + opening brace + optional comment
                let firstLine = prefix + p.expandedFirstPart;
                lines.push(firstLine);

                // Item lines with aligned comments
                p.expandedItems.forEach(item => {
                    let itemLine = valueIndent + item.content;
                    if (item.comment && options.alignComments) {
                        const pad = Math.max(1, maxItemContentEnd - itemLine.length + 1);
                        itemLine += ' '.repeat(pad) + item.comment;
                    } else if (item.comment) {
                        itemLine += ' ' + item.comment;
                    }
                    lines.push(itemLine);
                });

                // Closing line
                lines.push(baseIndent + p.expandedClosing);
            } else {
                // Single-line const
                let line = prefix + p.singleLineValue;
                if (p.singleLineComment && options.alignComments) {
                    const pad = Math.max(1, maxSingleLineEnd - line.length + 1);
                    line += ' '.repeat(pad) + p.singleLineComment;
                } else if (p.singleLineComment) {
                    line += ' ' + p.singleLineComment;
                }
                lines.push(line);
            }

            return lines.join('\n');
        });
    }

    private parseCollectionItems(inner: string, isMap: boolean): string[] {
        if (!inner) { return []; }
        const items: string[] = [];
        let depth = 0;
        let inString = false;
        let stringChar = '';
        let start = 0;
        for (let i = 0; i < inner.length; i++) {
            const c = inner[i];
            if (inString) {
                if (c === '\\') { i++; continue; }
                if (c === stringChar) { inString = false; }
                continue;
            }
            if (c === '"' || c === "'") { inString = true; stringChar = c; continue; }
            if (c === '[' || c === '{' || c === '(') { depth++; continue; }
            if (c === ']' || c === '}' || c === ')') { depth--; continue; }
            if (c === ',' && depth === 0) {
                items.push(inner.substring(start, i).trim());
                start = i + 1;
            }
        }
        // Last item
        const last = inner.substring(start).trim();
        if (last) { items.push(last); }
        return items;
    }

    private isStructField(line: string): boolean {
        return this.reStructField.test(line);
    }

    private isEnumField(line: string): boolean {
        return this.reEnumField.test(line);
    }

    private parseEnumField(line: string): { line: string, name: string, value: string, suffix: string, comment: string, hasTrailingComma: boolean } | null {
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
        const hasTrailingComma = /\s*[;,]\s*(?:\/\/|#|$)/.test(line);
        return { line, name, value, suffix, comment, hasTrailingComma };
    }

    private parseStructField(line: string): { line: string, type: string, name: string, suffix: string, comment: string, annotation?: string, annotationNodes?: AnnotationNode[], hasTrailingComma: boolean } | null {
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

        // Remove trailing comma/semicolon and whitespace before splitting
        const cleanTypeAndName = rest.substring(0, nameEnd).replace(/[,;]\s*$/, '').trim();

        // Split Type and Name - improved logic to handle complex types correctly
        let lastSpace = -1;
        let bracketDepth = 0;

        // Find the last space that is not inside angle brackets (to handle generics like list<string>)
        for (let i = cleanTypeAndName.length - 1; i >= 0; i--) {
            const char = cleanTypeAndName[i];
            if (char === '>') {
                bracketDepth++;
            } else if (char === '<') {
                bracketDepth--;
            } else if (char === ' ' && bracketDepth === 0) {
                lastSpace = i;
                break;
            }
        }

        let name: string;
        let type: string;

        if (lastSpace === -1) {
            // No space found outside brackets - type and name are concatenated (e.g., list<string>tags)
            // Use regex to find the last identifier (variable name)
            const match = cleanTypeAndName.match(/^(.*?)([A-Za-z_][A-Za-z0-9_]*)$/);
            if (!match) { return null; }
            type = match[1];
            name = match[2];
        } else {
            name = cleanTypeAndName.substring(lastSpace + 1);
            type = cleanTypeAndName.substring(0, lastSpace).trim();
        }

        // Parse annotations and default value from suffixRaw
        // suffixRaw might be `= "val" (anno="v")` or `(anno="v")`
        // We need to separate default value and annotations.
        // Annotations are always in `(...)` at the end?
        // Yes, TypeAnnotations.

        // Check if original line had a trailing comma/semicolon before processing
        // This includes commas that might have been immediately after annotations
        const hasTrailingComma = /\s*[;,]\s*(?:\/\/|#).*?$|.*?\s*[;,]\s*$/.test(line);

        // Use annotationParser
        const { annotations, fieldLine } = extractAnnotationsFromField(suffixRaw);
        const annotation = annotations.length > 0 ? annotations.map(a => a.rawText).join(' ') : undefined;
        const suffix = fieldLine.trim();

        return {
            line,
            type: idPart + ': ' + (qualifier ? qualifier + ' ' : '') + type,
            name,
            suffix,
            comment,
            annotation,
            annotationNodes: annotations,
            hasTrailingComma
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

    private formatStructFields(fields: Array<{ line: string, type: string, name: string, suffix: string, comment: string, annotation?: string, annotationNodes?: AnnotationNode[], hasTrailingComma: boolean }>, options: vscode.FormattingOptions, indentLevel: number): string[] {
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
            // Normalize generics spacing (e.g. list < string > → list<string>)
            rest = rest.replace(/\s*<\s*/g, '<').replace(/\s*>\s*/g, '>').replace(/\s*,\s*/g, ', ');

            return {
                fieldId,
                qualifier,
                type: rest,
                name: f.name,
                suffix: f.suffix,
                comment: f.comment,
                annotation: f.annotation,
                hasTrailingComma: f.hasTrailingComma
            };
        });

        let maxFieldIdWidth = 0;
        let maxTypeWidth = 0;
        let maxNameWidth = 0;
        let maxTypeAndNameWidth = 0; // New: combined width of type and name
        let maxContentWidth = 0;
        let maxAnnotationStart = 0;

        parsedFields.forEach(f => {
            maxFieldIdWidth = Math.max(maxFieldIdWidth, f.fieldId.length + 1);
            maxTypeWidth = Math.max(maxTypeWidth, f.type.length);
            maxNameWidth = Math.max(maxNameWidth, f.name.length);
            // Calculate the combined width of type, space, and name for alignment
            if (options.alignTypes && options.alignFieldNames) {
                // If both are aligned, we align the combination of type + name
                maxTypeAndNameWidth = Math.max(maxTypeAndNameWidth, f.type.length + 1 + f.name.length);
            }
        });

        const baseIndent = this.getIndent(indentLevel, options);

        // Calculate annotation start position
        parsedFields.forEach(f => {
            let len = baseIndent.length;
            len += maxFieldIdWidth + 1; // field ID + colon + space
            len += f.qualifier.length;

            if (options.alignTypes && options.alignFieldNames) {
                // Use combined type+name alignment for better visual alignment
                len += (f.type.length + 1 + f.name.length); // actual type length + space + actual name length
                // But pad to max combined length to align everything after the name
                const typeAndNameLen = f.type.length + 1 + f.name.length;
                const paddingToMax = Math.max(0, maxTypeAndNameWidth - typeAndNameLen);
                len += paddingToMax;
            } else {
                // Use original alignment logic
                len += (options.alignTypes ? maxTypeWidth : f.type.length);
                len += 1; // space before name
                len += (options.alignFieldNames ? maxNameWidth : f.name.length);
            }

            // Add appropriate separator (comma, semicolon, or space) after the field name
            if (f.suffix) {
                const cleanSuffix = f.suffix.trim();
                if (cleanSuffix) {
                    if (cleanSuffix.startsWith(',') || cleanSuffix.startsWith(';')) {
                        // For suffixes that start with comma/semicolon, don't add extra space
                        len += cleanSuffix.length;
                    } else {
                        // For other suffixes, add space + suffix
                        len += 1 + cleanSuffix.length; // space + suffix

                        // If suffix doesn't end with comma/semicolon and we're adding commas, account for added comma
                        if (!cleanSuffix.endsWith(',') && !cleanSuffix.endsWith(';')) {
                            const trailingCommaSetting = options.trailingComma || 'preserve';
                            if (trailingCommaSetting === 'add') {
                                len += 1; // added comma length
                            } else if (trailingCommaSetting === 'preserve' && f.hasTrailingComma) {
                                len += 1; // preserved comma length
                            }
                        }
                    }
                }
            } else {
                // If no suffix, add comma based on trailingComma setting
                const trailingCommaSetting = options.trailingComma || 'preserve';
                if (trailingCommaSetting === 'add') {
                    len += 1 + 1; // space + comma
                } else if (trailingCommaSetting === 'preserve' && f.hasTrailingComma) {
                    len += 1 + 1; // space + preserved comma
                } else if (trailingCommaSetting !== 'remove') {
                    len += 1 + 1; // space + comma (for default behavior)
                } else {
                    len += 1; // just space
                }
            }
            maxAnnotationStart = Math.max(maxAnnotationStart, len);
        });

        // Calculate max content width (for comment alignment)
        parsedFields.forEach(f => {
            let len = maxAnnotationStart;
            if (f.annotation) {
                len += 1 + f.annotation.length; // space + annotation
            }
            maxContentWidth = Math.max(maxContentWidth, len);
        });

        return parsedFields.map(f => {
            if (f.suffix.includes('\n')) {
                return this.formatMultiLineStructField(f, options, indentLevel, maxFieldIdWidth, maxTypeWidth, maxNameWidth, maxAnnotationStart, maxContentWidth, maxTypeAndNameWidth, 0);
            } else {
                return this.formatSingleLineStructField(f, options, indentLevel, maxFieldIdWidth, maxTypeWidth, maxNameWidth, maxAnnotationStart, maxContentWidth, maxTypeAndNameWidth, 0);
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
        maxTypeAndNameWidth: number, // Added for combined type+name alignment
        commentCount: number
    ): string {
        const baseIndent = this.getIndent(indentLevel, options);
        let line = baseIndent;

        line += field.fieldId + ':';
        line = line.padEnd(baseIndent.length + maxFieldIdWidth, ' ');
        line += ' ';

        line += field.qualifier;

        if (options.alignTypes && options.alignFieldNames) {
            // Align type and name as a single unit for better visual alignment
            const typeAndName = field.type + ' ' + field.name;
            line += typeAndName.padEnd(maxTypeAndNameWidth);
        } else {
            // Use original alignment logic
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
        }

        // Add space before suffix/default value if they exist
        if (field.suffix) {
            const cleanSuffix = field.suffix.trim();
            if (cleanSuffix) {
                // For comma/semicolon, don't add extra space before them
                if (cleanSuffix.startsWith(',') || cleanSuffix.startsWith(';')) {
                    // In remove mode, we should remove the comma
                    const trailingCommaSetting = options.trailingComma || 'preserve';
                    if (trailingCommaSetting === 'remove') {
                        // Remove the comma by not including it
                        line += cleanSuffix.substring(1).trim(); // Remove first character (comma/semicolon) and trim
                    } else {
                        // Keep the comma if not in remove mode
                        line += cleanSuffix;
                    }
                } else {
                    // Check if the cleanSuffix already ends with a comma or semicolon
                    line += ' ' + cleanSuffix;

                    // Check if we need to add a comma based on trailingComma setting
                    const trailingCommaSetting = options.trailingComma || 'preserve';
                    // Only add comma if there wasn't already a comma/semicolon at the END of the suffix
                    if (!cleanSuffix.endsWith(',') && !cleanSuffix.endsWith(';')) {
                        if (trailingCommaSetting === 'add') {
                            line += ','; // Add comma in add mode
                        } else if (trailingCommaSetting === 'preserve' && field.hasTrailingComma) {
                            line += ','; // Keep original comma in preserve mode if it existed
                        }
                    }
                    // In 'remove' mode, we don't add a comma (it's already handled)
                }
            }
        } else {
            // No suffix - add comma based on trailingComma setting
            const trailingCommaSetting = options.trailingComma || 'preserve';
            if (trailingCommaSetting === 'add') {
                line += ','; // Only add comma in add mode
            } else if (trailingCommaSetting === 'preserve' && field.hasTrailingComma) {
                line += ','; // Keep original comma in preserve mode if it existed
            }
            // In 'remove' mode, don't add comma
        }

        // Align annotations if enabled and annotation exists
        if (field.annotation) {
            if (options.alignAnnotations && targetAnnoStart > 0) {
                const currentLen = line.length;
                const pad = Math.max(1, targetAnnoStart - currentLen);
                if (pad > 0) {
                    line += ' '.repeat(pad);
                }
                line += field.annotation;
            } else {
                line += ' ' + field.annotation; // Just add space + annotation without alignment
            }
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
        maxTypeAndNameWidth: number, // Added for combined type+name alignment
        commentCount: number
    ): string {
        const baseIndent = this.getIndent(indentLevel, options);
        let line = baseIndent;

        line += field.fieldId + ':';
        line = line.padEnd(baseIndent.length + maxFieldIdWidth, ' ');
        line += ' ';

        line += field.qualifier;

        if (options.alignTypes && options.alignFieldNames) {
            // Align type and name as a single unit for better visual alignment
            const typeAndName = field.type + ' ' + field.name;
            line += typeAndName.padEnd(maxTypeAndNameWidth);
        } else {
            // Use original alignment logic
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
        }

        // Add space before suffix/default value if they exist
        if (field.suffix) {
            const cleanSuffix = field.suffix.trim();
            if (cleanSuffix) {
                // For comma/semicolon, don't add extra space before them
                if (cleanSuffix.startsWith(',') || cleanSuffix.startsWith(';')) {
                    // In remove mode, we should remove the comma
                    const trailingCommaSetting = options.trailingComma || 'preserve';
                    if (trailingCommaSetting === 'remove') {
                        // Remove the comma by not including it
                        line += cleanSuffix.substring(1).trim(); // Remove first character (comma/semicolon) and trim
                    } else {
                        // Keep the comma if not in remove mode
                        line += cleanSuffix;
                    }
                } else {
                    // Check if the cleanSuffix already ends with a comma or semicolon
                    line += ' ' + cleanSuffix;

                    // Check if we need to add a comma based on trailingComma setting
                    const trailingCommaSetting = options.trailingComma || 'preserve';
                    // Only add comma if there wasn't already a comma/semicolon at the END of the suffix
                    if (!cleanSuffix.endsWith(',') && !cleanSuffix.endsWith(';')) {
                        if (trailingCommaSetting === 'add') {
                            line += ','; // Add comma in add mode
                        } else if (trailingCommaSetting === 'preserve' && field.hasTrailingComma) {
                            line += ','; // Keep original comma in preserve mode if it existed
                        }
                    }
                    // In 'remove' mode, we don't add a comma (it's already handled)
                }
            }
        } else {
            // No suffix - add comma based on trailingComma setting
            const trailingCommaSetting = options.trailingComma || 'preserve';
            if (trailingCommaSetting === 'add') {
                line += ','; // Only add comma in add mode
            } else if (trailingCommaSetting === 'preserve' && field.hasTrailingComma) {
                line += ','; // Keep original comma in preserve mode if it existed
            }
            // In 'remove' mode, don't add comma
        }

        // Align annotations if enabled and annotation exists
        if (field.annotation) {
            if (options.alignAnnotations && targetAnnoStart > 0) {
                const currentLen = line.length;
                const pad = Math.max(1, targetAnnoStart - currentLen);
                if (pad > 0) {
                    line += ' '.repeat(pad);
                }
                line += field.annotation;
            } else {
                line += ' ' + field.annotation; // Just add space + annotation without alignment
            }
        }

        if (field.comment) {
            line += ' ' + field.comment;
        }

        return line;
    }

    private formatEnumFields(fields: Array<{ line: string, name: string, value: string, suffix: string, comment: string, hasTrailingComma: boolean }>, options: vscode.FormattingOptions, indentLevel: number): string[] {
        let maxNameWidth = 0;
        let maxValueWidth = 0;
        let maxContentWidth = 0;

        const trailingCommaSetting = options.trailingComma || 'preserve';

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

            // Account for comma suffix based on trailingComma setting
            if (f.suffix) {
                if (trailingCommaSetting === 'remove') {
                    // Comma stripped, no suffix length added
                } else {
                    len += f.suffix.length;
                }
            } else {
                if (trailingCommaSetting === 'add') {
                    len += 1; // comma
                } else if (trailingCommaSetting === 'preserve' && f.hasTrailingComma) {
                    len += 1; // comma
                }
                // remove mode: no comma added
            }

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
                if (trailingCommaSetting === 'remove') {
                    // Strip leading comma/semicolon from suffix
                    line += f.suffix.trim().replace(/^[,;]/, '').trim();
                } else {
                    line += f.suffix;
                }
            } else {
                if (trailingCommaSetting === 'add') {
                    line += ',';
                } else if (trailingCommaSetting === 'preserve' && f.hasTrailingComma) {
                    line += ',';
                }
                // remove mode: do nothing
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