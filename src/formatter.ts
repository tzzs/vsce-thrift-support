import * as vscode from 'vscode';

export class ThriftFormattingProvider implements vscode.DocumentFormattingEditProvider, vscode.DocumentRangeFormattingEditProvider {
    // Precompiled regexes reused in hot paths and referenced by helpers
    private reStructField = /^\s*\d+:\s*(?:required|optional)?\s*.+$/;
    private reEnumField = /^\s*\w+\s*=\s*\d+/;
    private reSpaceLt = /\s*</g;
    private reSpaceGt = />\s*/g;
    private reSpaceComma = /\s*,\s*/g;

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
        let structFields: Array<{line: string, type: string, name: string, suffix: string, comment: string, annotation?: string}> = [];
        let enumFields: Array<{line: string, name: string, value: string, suffix: string, comment: string}> = [];
        let constFields: Array<{line: string, type: string, name: string, value: string, comment: string}> = [];
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
                    if (lines[j].includes('*/')) {closed = true;}
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
                    if (mid.startsWith('*')) {mid = mid.slice(1);} 
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
                const formattedFields = this.formatConstFields(constFields, options, constBlockIndentLevel ?? indentLevel);
                formattedLines.push(...formattedFields);
                constFields = [];
                inConstBlock = false;
                constBlockIndentLevel = null;
                // fall through to handle current line
            }

            // Skip empty lines and line comments
            if (!line || line.startsWith('//') || line.startsWith('#')) {
                formattedLines.push(this.getIndent(indentLevel, options) + line);
                continue;
            }

            // Handle const fields for alignment - check before other processing
            if (this.isConstStart(line)) {
                // Handle multiline const definitions (map, set, list with {})
                let constValue = line;
                let j = i + 1;
                
                // Collect all lines until the closing brace
                while (j < lines.length && !(lines[j].trim().endsWith('}') || lines[j].trim().endsWith(']'))) {
                    constValue += '\n' + lines[j].trim(); // Remove original indentation
                    j++;
                }
                
                // Add the closing brace/bracket line
                if (j < lines.length) {
                    constValue += '\n' + lines[j].trim(); // Remove original indentation
                }
                
                // Parse the complete multiline const
                const fieldInfo = this.parseConstField(constValue, options, indentLevel);
                if (fieldInfo) {
                    if (constFields.length === 0) { constBlockIndentLevel = indentLevel; }
                    constFields.push(fieldInfo);
                    inConstBlock = true;
                }
                
                // Skip the processed lines
                i = j;
                continue;
            } else if (this.isConstField(line)) {
                const fieldInfo = this.parseConstField(line, options, indentLevel);
                if (fieldInfo) {
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
            const formattedFields = this.formatConstFields(constFields, options, constBlockIndentLevel ?? indentLevel);
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
        const cleaned = formattedLines.map(l => l.replace(/\s+$/g, ''));
        return cleaned.join('\n');
    }

    private isConstStart(line: string): boolean {
        // Match the start of a const declaration that might span multiple lines
        return /^const\s+\w[\w<>,\s]*\s+\w+\s*=\s*[\[{]/.test(line);
    }

    private isConstField(line: string): boolean {
        // Match a single-line const declaration
        return /^const\s+\w[\w<>,\s]*\s+\w+\s*=/.test(line);
    }

    private formatConstFields(
        fields: Array<{line: string, type: string, name: string, value: string, comment: string}>,
        options: any,
        indentLevel: number
    ): string[] {
        if (fields.length === 0) {return [];}        
        
        const collectionStyle: 'preserve' | 'multiline' | 'auto' = (options && options.collectionStyle) || 'preserve';
        const maxLineLength: number = (options && options.maxLineLength) || 100;
        
        const indent = this.getIndent(indentLevel, options);
        const valueIndent = this.getIndent(indentLevel + 1, options);
        const alignComments = options && options.alignComments !== false;

        // Expand inline collections to multiline according to collectionStyle before measuring widths
        const adjFields = fields.map((f) => {
            let value = f.value;
            const isInlineCollection = !value.includes('\n') && ((/^\[.*\]$/.test(value)) || (/^\{.*\}$/.test(value)));

            let shouldExpand = false;
            if (isInlineCollection) {
                if (collectionStyle === 'multiline') {
                    shouldExpand = true;
                } else if (collectionStyle === 'auto') {
                    const inlineLine = `${indent}const ${f.type} ${f.name} = ${value}${f.comment ? ' ' + f.comment : ''}`;
                    if (inlineLine.length > maxLineLength) {
                        shouldExpand = true;
                    }
                }
            }

            if (shouldExpand) {
                const open = value[0];
                const close = value[value.length - 1];
                const inner = value.substring(1, value.length - 1).trim();

                const items: string[] = [];
                let current = '';
                let depth = 0;
                let inString = false;
                let stringChar = '';
                for (let i = 0; i < inner.length; i++) {
                    const ch = inner[i];
                    const prev = i > 0 ? inner[i - 1] : '';
                    if (inString) {
                        current += ch;
                        if (ch === stringChar && prev !== '\\') {
                            inString = false;
                        }
                        continue;
                    }
                    if (ch === '"' || ch === "'") {
                        inString = true;
                        stringChar = ch;
                        current += ch;
                        continue;
                    }
                    if (ch === '[' || ch === '{' || ch === '(') {
                        depth++;
                        current += ch;
                        continue;
                    }
                    if (ch === ']' || ch === '}' || ch === ')') {
                        depth--;
                        current += ch;
                        continue;
                    }
                    if (ch === ',' && depth === 0) {
                        if (current.trim()) {items.push(current.trim());}
                        current = '';
                    } else {
                        current += ch;
                    }
                }
                if (current.trim()) {items.push(current.trim());}

                const lines: string[] = [open];
                for (let idx = 0; idx < items.length; idx++) {
                    const comma = idx < items.length - 1 ? ',' : '';
                    lines.push(items[idx] + comma);
                }
                lines.push(close);
                value = lines.join('\n');
            }

            return { ...f, value };
        });
        
        // Calculate max widths for alignment (type and name)
        const maxTypeWidth = Math.max(...adjFields.map(f => f.type.length));
        const maxNameWidth = Math.max(...adjFields.map(f => f.name.length));

        // Pre-compute max base length for aligning comments on the first line of each const
        let maxFirstLineBaseLen = 0;
        for (const f of adjFields) {
            if (!f.comment) {continue;}
            const firstLineValue = f.value.includes('\n') ? f.value.split('\n')[0] : f.value;
            const base = `const ${f.type.padEnd(maxTypeWidth)} ${f.name.padEnd(maxNameWidth)} = ${firstLineValue}`;
            if (base.length > maxFirstLineBaseLen) {maxFirstLineBaseLen = base.length;}
        }
        
        return adjFields.map(field => {
            const paddedType = field.type.padEnd(maxTypeWidth);
            const paddedName = field.name.padEnd(maxNameWidth);
            
            // Check if value is multiline (contains newlines)
            if (field.value.includes('\n')) {
                // Handle multiline values - apply proper indentation
                const lines = field.value.split('\n');
                const firstLine = lines[0];
                const outLines: string[] = [];
                
                // First line content
                let first = `${indent}const ${paddedType} ${paddedName} = ${firstLine}`;
                if (field.comment) {
                    if (alignComments) {
                        const currentLen = first.length - indent.length; // exclude common indent
                        const pad = Math.max(1, maxFirstLineBaseLen - currentLen + 1);
                        first = first + ' '.repeat(pad) + field.comment;
                    } else {
                        first += ` ${field.comment}`;
                    }
                }
                outLines.push(first);
                
                // Add subsequent lines with proper indentation
                for (let i = 1; i < lines.length; i++) {
                    const raw = lines[i];
                    const line = raw.trim();
                    if (!line) {
                        outLines.push('');
                        continue;
                    }
                    
                    // Closing brace/bracket should align with const declaration
                    if (line === '}' || line === ']') {
                        outLines.push(indent + line);
                        continue;
                    }
                    
                    // If this line is a standalone comment, merge to previous content line
                    if (line.startsWith('//')) {
                        let idx = outLines.length - 1;
                        while (idx >= 0 && outLines[idx] === '') {idx--;}
                        if (idx >= 0) {
                            outLines[idx] += ` ${line}`;
                        } else {
                            outLines.push(indent + line);
                        }
                        continue;
                    }
                    
                    // Regular content line: indent one level deeper than the const
                    outLines.push(valueIndent + line);
                }

                // Align inline comments within multiline collection items
                if (alignComments) {
                    // Determine lines eligible for alignment (between first and last, excluding closing brace/bracket)
                    const indices: number[] = [];
                    let maxContentLen = 0;
                    for (let idx = 1; idx < outLines.length; idx++) {
                        const l = outLines[idx];
                        const trimmed = l.trim();
                        if (!trimmed || trimmed === '}' || trimmed === ']') {continue;}
                        const m = l.match(/^(\s*)(.*?)(\s*)(\/\/.*)$/);
                        if (m) {
                            const leading = m[1] || '';
                            const content = (m[2] || '').replace(/\s+$/,'');
                            const len = leading.length + content.length;
                            if (len > maxContentLen) {maxContentLen = len;}
                            indices.push(idx);
                        }
                    }
                    if (indices.length > 0) {
                        for (const idx of indices) {
                            const l = outLines[idx];
                            const m = l.match(/^(\s*)(.*?)(\s*)(\/\/.*)$/);
                            if (!m) {continue;}
                            const leading = m[1] || '';
                            const content = (m[2] || '').replace(/\s+$/,'');
                            const comment = (m[4] || '').replace(/^\s+/, '');
                            const currentLen = leading.length + content.length;
                            const pad = Math.max(1, maxContentLen - currentLen + 1);
                            outLines[idx] = leading + content + ' '.repeat(pad) + comment;
                        }
                    }
                }
                
                return outLines.join('\n');
            } else {
                // Handle single line values
                let base = `${indent}const ${paddedType} ${paddedName} = ${field.value}`;
                if (field.comment) {
                    if (alignComments) {
                        const currentLen = base.length - indent.length; // exclude common indent
                        const pad = Math.max(1, maxFirstLineBaseLen - currentLen + 1);
                        base = base + ' '.repeat(pad) + field.comment;
                    } else {
                        base += ` ${field.comment}`;
                    }
                }
                return base;
            }
        });
    }

    private isStructField(line: string): boolean {
        // Quick pre-check: first non-space must be a digit
        const t = line.trimStart();
        const c = t.charCodeAt(0);
        if (!(c >= 48 && c <= 57)) { return false; }
        // Match field definitions like: 1: required string name, or 1: string name,
        // Also match complex types like: 1: required list<string> names,
        return this.reStructField.test(line);
    }

    private isEnumField(line: string): boolean {
        // Quick pre-check: first non-space must be a letter or underscore
        const t = line.trimStart();
        const cc = t.charCodeAt(0);
        const isLetter = (cc >= 65 && cc <= 90) || (cc >= 97 && cc <= 122) || cc === 95; // A-Z a-z _
        if (!isLetter) { return false; }
        // Match enum field definitions like: ACTIVE = 1, or INACTIVE = 2,
        return this.reEnumField.test(line);
    }

    private parseStructField(line: string): {line: string, type: string, name: string, suffix: string, comment: string, annotation?: string} | null {
        // Parse field: 1: required string name = defaultValue, // comment
        
        // First, extract the prefix (field number and optional required/optional)
        const prefixMatch = line.match(/^\s*(\d+:\s*(?:required|optional)?\s*)(.*)$/);
        if (!prefixMatch) {return null;}
        
        const prefix = prefixMatch[1];
        let remainder = prefixMatch[2];
        
        // Extract comment first
        let comment = '';
        const commentMatch = remainder.match(/^(.*)(\/\/.*)$/);
        if (commentMatch) {
            remainder = commentMatch[1].trim();
            comment = commentMatch[2];
        }
        
        // Extract trailing comma/semicolon and preserve it
        let trailingComma = '';
        const suffixMatch = remainder.match(/^(.*?)([,;]\s*)$/);
        if (suffixMatch) {
            remainder = suffixMatch[1].trim();
            trailingComma = suffixMatch[2];
        }
        
        // Extract inline annotation parentheses at the end: ( ... ) possibly with spaces
        let annotation = '';
        const annMatch = remainder.match(/^(.*?)(\(.*\))\s*$/);
        if (annMatch) {
            remainder = annMatch[1].trim();
            annotation = annMatch[2];
        }
        
        // Parse the main content: type fieldname [= defaultvalue]
        const fieldMatch = remainder.match(/^(.+?)\s+(\w+)(?:\s*=\s*(.+))?$/);
        if (!fieldMatch) {return null;}
        
        let type = fieldMatch[1].trim();
        const name = fieldMatch[2];
        const defaultValue = fieldMatch[3];
        
        // Clean up the type by removing extra spaces around < > and commas
        type = type.replace(this.reSpaceLt, '<').replace(this.reSpaceGt, '>');
        type = type.replace(this.reSpaceComma, ',');
        
        // Build suffix with default value and trailing comma
        let suffix = '';
        if (defaultValue) {
            suffix = ` = ${defaultValue.trim()}`;
        }
        if (trailingComma) {
            suffix += trailingComma;
        }
        
        return {
            line: line,
            type: type,
            name: name,
            suffix: suffix,
            comment: comment,
            annotation: annotation
        };
    }

    private parseEnumField(line: string): {line: string, name: string, value: string, suffix: string, comment: string} | null {
        // Parse enum field: ACTIVE = 1, // comment
        const match = line.match(/^\s*(\w+)\s*=\s*(\d+)\s*([,;]?\s*(?:\/\/.*)?\s*)$/);
        if (!match) {return null;}
        
        const name = match[1];
        const value = match[2];
        const suffixAndComment = match[3] || '';
        
        // Separate suffix (comma/semicolon) from comment
        const commentMatch = suffixAndComment.match(/^([^/]*)(\/.+)$/);
        const suffix = commentMatch ? commentMatch[1].trim() : suffixAndComment.trim();
        const comment = commentMatch ? commentMatch[2] : '';
        
        return {
            line: line,
            name: name,
            value: value,
            suffix: suffix,
            comment: comment
        };
    }

    private parseConstField(
        source: string,
        options: any,
        indentLevel: number
    ): { line: string, type: string, name: string, value: string, comment: string } | null {
        if (!source) {return null;}
        const lines = source.split('\n');
        const header = (lines[0] || '').trim();
        // Match: const <type> <name> = <value>[ // comment]
        const m = header.match(/^const\s+([\w<>,\s]+?)\s+(\w+)\s*=\s*(.*)$/);
        if (!m) {return null;}
        let type = m[1].trim();
        const name = m[2].trim();
        let firstValuePart = (m[3] || '').trim();

        // Extract possible inline comment from the first line's value
        let comment = '';
        const commentIdx = firstValuePart.indexOf('//');
        if (commentIdx >= 0) {
            comment = firstValuePart.slice(commentIdx).trim();
            firstValuePart = firstValuePart.slice(0, commentIdx).trim();
        }

        // Build full value (may be multiline)
        let value = firstValuePart;
        if (lines.length > 1) {
            const rest = lines.slice(1).map(l => l.trim()).join('\n');
            value = (value ? value + '\n' : '') + rest;
        }

        // Normalize generic spacing in type
        type = type.replace(this.reSpaceLt, '<').replace(this.reSpaceGt, '>').replace(this.reSpaceComma, ',');

        return {
            line: header,
            type,
            name,
            value,
            comment
        };
    }

    private formatStructFields(
        fields: Array<{line: string, type: string, name: string, suffix: string, comment: string, annotation?: string}>,
        options: any,
        indentLevel: number
    ): string[] {
        // Sort fields by field ID (numeric order)
        const sortedFields = [...fields].sort((a, b) => {
            const aIdMatch = a.line.match(/^\s*(\d+):/);
            const bIdMatch = b.line.match(/^\s*(\d+):/);
            if (aIdMatch && bIdMatch) {
                return parseInt(aIdMatch[1]) - parseInt(bIdMatch[1]);
            }
            return 0;
        });
        
        // Always process fields for trailing comma handling, even if alignment is disabled
        const needsAlignment = options.alignTypes || options.alignFieldNames || options.alignComments || options.alignAnnotations;
        
        if (!needsAlignment && options.trailingComma === 'preserve') {
            return sortedFields.map(f => this.getIndent(indentLevel, options) + f.line);
        }

        // Calculate max widths for alignment
        let maxFieldIdWidth = 0;
        let maxTypeWidth = 0;
        let maxNameWidth = 0;
        let maxAnnotationWidth = 0;
        let maxContentWidth = 0;

        const parsedFields = sortedFields.map(field => {
            // Extract field ID and required/optional parts separately
            const fieldMatch = field.line.match(/^\s*(\d+):\s*((?:required|optional)?\s*)/);
            const fieldId = fieldMatch ? fieldMatch[1] : '';
            const qualifier = fieldMatch ? fieldMatch[2] : '';
            
            // Use the already parsed and cleaned type from field.type
            let type = field.type;
            // Clean up type formatting - remove spaces around < > and ,
            type = type.replace(this.reSpaceLt, '<').replace(this.reSpaceGt, '>').replace(this.reSpaceComma, ',');
            
            const name = field.name;
            const suffix = field.suffix;
            const comment = field.comment;
            const annotation = field.annotation || '';
            
            maxFieldIdWidth = Math.max(maxFieldIdWidth, fieldId.length);
            maxTypeWidth = Math.max(maxTypeWidth, type.length);
            maxNameWidth = Math.max(maxNameWidth, name.length);
            if (options.alignAnnotations) {
                maxAnnotationWidth = Math.max(maxAnnotationWidth, annotation.length);
            }
            
            return { fieldId, qualifier, type, name, suffix, comment, annotation };
        });
        
        // Determine max name width for fields that have default values (for aligning '=')
        const maxNameWidthWithDefault = parsedFields
            .filter(f => f.suffix && f.suffix.includes('='))
            .reduce((m, f) => Math.max(m, f.name.length), 0);

        // Calculate max content width after we know the alignment widths
        parsedFields.forEach(field => {
            // Calculate content width for comment alignment considering alignment
            let contentWidth = 0;
            
            // Field ID width (always aligned)
            contentWidth += maxFieldIdWidth + 2; // +2 for ": "
            
            // Qualifier width (required/optional)
            contentWidth += field.qualifier.length;
            
            if (options.alignTypes) {
                contentWidth += maxTypeWidth;
            } else {
                contentWidth += field.type.length;
            }
            
            contentWidth += 1; // space after type
            
            if (options.alignFieldNames) {
                if (field.suffix) {
                    // Use alignStructDefaults only when there's a default value ('=')
                    const hasDefaultValue = field.suffix.includes('=');
                    if (hasDefaultValue && options.alignStructDefaults) {
                        // normalize equals spacing for width
                        const normalized = field.suffix.replace(/\s*=\s*/, ' = ');
                        contentWidth += maxNameWidth + normalized.length;
                    } else {
                        contentWidth += field.name.length + field.suffix.length;
                    }
                } else {
                    contentWidth += field.name.length;
                }
            } else {
                contentWidth += field.name.length;
                if (field.suffix) {
                    contentWidth += field.suffix.length;
                }
            }
            
            // Add annotation width if enabled
            if (options.alignAnnotations && field.annotation) {
                contentWidth += 1; // space before annotation
                contentWidth += maxAnnotationWidth;
            } else if (field.annotation) {
                contentWidth += 1 + field.annotation.length;
            }
            
            // Add comma width only if it will appear before comments
            if (options.trailingComma === 'preserve') {
                if ((field.suffix && field.suffix.includes(','))) {
                    contentWidth += 1; // for comma before comments
                }
            }
            
            maxContentWidth = Math.max(maxContentWidth, contentWidth);
        });
        
        // Pre-compute the target column where annotations should start when alignment is enabled
        const targetAnnoStart = (() => {
            if (!options.alignAnnotations) return 0;
            let max = 0;
            parsedFields.forEach(f => {
                if (!f || !f.annotation) return;
                let w = 0;
                // id and colon+space
                w += maxFieldIdWidth + 2;
                // qualifier
                w += f.qualifier.length;
                // type (aligned or actual)
                w += (options.alignTypes ? maxTypeWidth : f.type.length);
                // space after type
                w += 1;
                if (options.alignFieldNames) {
                    if (f.suffix) {
                        let s = f.suffix;
                        if (/\,\s*$/.test(s)) {
                            s = s.replace(/,\s*$/, '');
                        }
                        const hasDefault = s.includes('=');
                        if (hasDefault) {
                            s = s.replace(/\s*=\s*/, ' = ');
                        }
                        if (hasDefault && options.alignStructDefaults) {
                            w += maxNameWidth + s.length;
                        } else {
                            w += f.name.length + s.length;
                        }
                    } else {
                        w += f.name.length;
                    }
                } else {
                    w += f.name.length;
                    if (f.suffix) {
                        let s = f.suffix;
                        if (/\,\s*$/.test(s)) {
                            s = s.replace(/,\s*$/, '');
                        }
                        if (s.includes('=')) {
                            s = s.replace(/\s*=\s*/, ' = ');
                        }
                        w += s.length;
                    }
                }
                if (w > max) max = w;
            });
            return max;
        })();

        // When only one field has an inline comment, avoid adding extra padding for alignment
        const commentCount = parsedFields.reduce((acc, f) => acc + ((f && f.comment) ? 1 : 0), 0);

         // Use parsedFields for formatting

         // Format fields with alignment
         return parsedFields.map(field => {
             if (!field) {return '';}            
             let formattedLine = this.getIndent(indentLevel, options);
             
             // Add field ID with colon, then pad to alignment
             const fieldIdWithColon = field.fieldId + ':';
             formattedLine += fieldIdWithColon.padEnd(maxFieldIdWidth + 1) + ' ';
             
             // Add qualifier (required/optional)
             formattedLine += field.qualifier;
             
             if (options.alignTypes) {
                 formattedLine += field.type.padEnd(maxTypeWidth);
             } else {
                 formattedLine += field.type;
             }
             
             formattedLine += ' ';
             
             // Separate comma from suffix for proper alignment
            let cleanSuffix = field.suffix || '';
            let hasComma = cleanSuffix ? /,\s*$/.test(cleanSuffix) : false;
            const hasSemicolon = cleanSuffix ? /;/.test(cleanSuffix) : false;
            let appendedComma = false;
             
             // Remove comma from suffix temporarily
             if (hasComma) {
                 cleanSuffix = cleanSuffix.replace(/,\s*$/, '');
             }
             
             // Fix spacing around equals sign if present
            if (cleanSuffix && cleanSuffix.includes('=')) {
                cleanSuffix = cleanSuffix.replace(/\s*=\s*/, ' = ');
            }
             
             // Handle trailing comma based on configuration
             if (options.trailingComma === 'add' && !hasComma && !hasSemicolon) {
                 hasComma = true;
             } else if (options.trailingComma === 'remove' && hasComma && !hasSemicolon) {
                 hasComma = false;
             }
             // For 'preserve', keep the original comma state
             
             // Add field name with proper alignment
             if (options.alignFieldNames) {
                 if (cleanSuffix) {
                     // Check if this is a default value assignment (contains '=')
                     const hasDefaultValue = cleanSuffix.includes('=');
                     
                     if (hasDefaultValue) {
                         // For default values, use alignStructDefaults configuration
                         if (options.alignStructDefaults) {
                             formattedLine += field.name.padEnd(maxNameWidth);
                         } else {
                             formattedLine += field.name;
                         }
                     } else {
                         // No default value: do not pad to equals column
                         formattedLine += field.name;
                     }
                     formattedLine += cleanSuffix;
                 } else {
                     // If no default value, don't pad to avoid extra spaces before comma
                     formattedLine += field.name;
                 }
                 // Add annotation aligned if enabled
                 if (field.annotation) {
                    if (options.alignAnnotations) {
                        const currentWidth = formattedLine.length - this.getIndent(indentLevel, options).length;
                        const spaces = targetAnnoStart - currentWidth + 1;
                        // Place annotation at target start, do not pad to width here; append comma immediately if needed
                        formattedLine += ' '.repeat(spaces) + field.annotation;
                        if (hasComma && options.trailingComma !== 'add') {
                            formattedLine += ',';
                            appendedComma = true;
                        }
                    } else {
                        formattedLine += ' ' + field.annotation;
                        // Append comma immediately after annotation for non-"add" modes
                        if (hasComma && options.trailingComma !== 'add') {
                            formattedLine += ',';
                            appendedComma = true;
                        }
                    }
                 }
                 // Add comma before comments for non-"add" modes
                 if (hasComma && options.trailingComma !== 'add' && !appendedComma) {
                     formattedLine += ',';
                     appendedComma = true;
                 }
                // Add inline comment, aligned if enabled
                if (field.comment) {
                    if (options.alignComments) {
                        const currentWidth = formattedLine.length - this.getIndent(indentLevel, options).length;
                        const diff = maxContentWidth - currentWidth;
                        const basePad = (options.alignAnnotations && hasComma && options.trailingComma !== 'add')
                            ? Math.max(1, diff)
                            : Math.max(1, diff + 1);
                        const padSpaces = commentCount > 1 ? basePad : 1;
                        formattedLine += ' '.repeat(padSpaces) + field.comment;
                    } else {
                        formattedLine += ' ' + field.comment;
                    }
                }
                // For trailingComma === 'add', append comma at the very end of the line (after comments)
                if (hasComma && options.trailingComma === 'add') {
                    formattedLine += ',';
                }
             } else {
                 formattedLine += field.name;
                 // Add suffix (default values) to the line
                 if (cleanSuffix) {
                     formattedLine += cleanSuffix;
                 }
                 // Add annotation
                 if (field.annotation) {
                    if (options.alignAnnotations) {
                        const currentWidth = formattedLine.length - this.getIndent(indentLevel, options).length;
                        const spaces = targetAnnoStart - currentWidth + 1;
                        // Place annotation at target start, do not pad to width here; append comma immediately if needed
                        formattedLine += ' '.repeat(spaces) + field.annotation;
                        if (hasComma && options.trailingComma !== 'add') {
                            formattedLine += ',';
                            appendedComma = true;
                        }
                    } else {
                        formattedLine += ' ' + field.annotation;
                    }
                 }
                 // Add comma before comments for non-"add" modes
                 if (hasComma && options.trailingComma !== 'add' && !appendedComma) {
                     formattedLine += ',';
                     appendedComma = true;
                 }
                // Add inline comment, aligned if enabled
                if (field.comment) {
                    if (options.alignComments) {
                        const currentWidth = formattedLine.length - this.getIndent(indentLevel, options).length;
                        const diff = maxContentWidth - currentWidth;
                        const basePad = (options.alignAnnotations && hasComma && options.trailingComma !== 'add')
                            ? Math.max(1, diff)
                            : Math.max(1, diff + 1);
                        const padSpaces = commentCount > 1 ? basePad : 1;
                        formattedLine += ' '.repeat(padSpaces) + field.comment;
                    } else {
                        formattedLine += ' ' + field.comment;
                    }
                }
                // For trailingComma === 'add', append comma at the very end of the line (after comments)
                if (hasComma && options.trailingComma === 'add') {
                    formattedLine += ',';
                }
             }

             return formattedLine;
         });
    }

    private formatEnumFields(
        fields: Array<{line: string, name: string, value: string, suffix: string, comment: string}>,
        options: any,
        indentLevel: number
    ): string[] {
        const needsAlignment = options.alignEnumNames || options.alignEnumEquals || options.alignEnumValues || options.alignComments || options.trailingComma !== 'preserve';
        if (!needsAlignment) {
            return fields.map(f => this.getIndent(indentLevel, options) + f.line);
        }

        const indent = this.getIndent(indentLevel, options);

        const maxNameWidth = Math.max(...fields.map(f => f.name.length), 0);
        const maxValueWidth = options.alignEnumValues ? Math.max(...fields.map(f => String(f.value).length)) : 0;

        let maxContentWidth = 0;
        const interim: Array<{ base: string; comment: string; hasComma: boolean; hasSemicolon: boolean } > = [];

        for (const f of fields) {
            let hasComma = f.suffix ? /,/.test(f.suffix) : false;
            const hasSemicolon = f.suffix ? /;/.test(f.suffix) : false;

            if (!hasSemicolon) {
                if (options.trailingComma === 'add') {hasComma = true;}
                else if (options.trailingComma === 'remove') {hasComma = false;}
            }

            // Handle name/equals alignment
            let base = indent;
            if (options.alignEnumEquals) {
                // Align '=' by padding name to max width regardless of alignEnumNames
                base += f.name.padEnd(maxNameWidth) + ' = ';
            } else {
                const namePart = options.alignEnumNames ? f.name.padEnd(maxNameWidth) : f.name;
                base += namePart + ' = ';
            }
            
            let valueStr = '' + f.value;
            if (options.alignEnumValues) {
                valueStr = valueStr.padEnd(maxValueWidth);
            }
            base += valueStr;

            // Only include comma in base for non-'add' modes; never append semicolon here (it goes at end of line)
            if (!hasSemicolon && options.trailingComma !== 'add' && hasComma) {
                base += ',';
            }

            interim.push({ base, comment: f.comment, hasComma, hasSemicolon });
            maxContentWidth = Math.max(maxContentWidth, base.length - indent.length);
        }
        return interim.map(({ base, comment, hasComma, hasSemicolon }) => {
            let line = base;
            if (comment) {
                if (options.alignComments) {
                    const currentWidth = base.length - indent.length;
                    const pad = Math.max(1, maxContentWidth - currentWidth + 1);
                    line = base + ' '.repeat(pad) + comment;
                } else {
                    line = base + ' ' + comment;
                }
            }
            // Append semicolon at end-of-line (after comments) when present
            if (hasSemicolon) {
                line += ';';
            }
            // In 'add' mode, append comma at the very end (after comments) when appropriate
            if (!hasSemicolon && hasComma && options.trailingComma === 'add') {
                line += ',';
            }
            return line;
        });
    }

    private getIndent(level: number, options: any): string {
        const indentSize = options.indentSize || 4;
        if (options.insertSpaces) {
            return ' '.repeat(level * indentSize);
        } else {
            return '\t'.repeat(level);
        }
    }

    private isStructStart(line: string): boolean {
        return /^(struct|union|exception|service)\b/.test(line);
    }

    private isEnumStart(line: string): boolean {
        return /^enum\b/.test(line);
    }

    // Compute initial context (indent level and whether inside struct/enum) from the content before the selection start
    private computeInitialContext(document: vscode.TextDocument, start: vscode.Position): { indentLevel: number; inStruct: boolean; inEnum: boolean } {
        try {
            const before = document.getText(new vscode.Range(new vscode.Position(0, 0), start));
            if (!before) {
                return { indentLevel: 0, inStruct: false, inEnum: false };
            }
            const lines = before.split('\n');
            let inBlockComment = false;
            const stack: Array<'struct' | 'enum'> = [];
            for (let raw of lines) {
                let line = raw;

                // Handle existing block comment state
                if (inBlockComment) {
                    const endIdx = line.indexOf('*/');
                    if (endIdx >= 0) {
                        line = line.slice(endIdx + 2);
                        inBlockComment = false;
                    } else {
                        continue; // entire line is inside block comment
                    }
                }

                // Strip inline block comments starting on this line
                const startIdx = line.indexOf('/*');
                if (startIdx >= 0) {
                    const endIdx = line.indexOf('*/', startIdx + 2);
                    if (endIdx >= 0) {
                        line = line.slice(0, startIdx) + line.slice(endIdx + 2);
                    } else {
                        line = line.slice(0, startIdx);
                        inBlockComment = true;
                    }
                }

                // Strip line comments
                const slIdx = line.indexOf('//');
                if (slIdx >= 0) {
                    line = line.slice(0, slIdx);
                }

                const trimmed = line.trim();
                if (!trimmed) { continue; }

                // Close brace reduces struct/enum depth
                if (trimmed.startsWith('}')) {
                    if (stack.length > 0) { stack.pop(); }
                    continue;
                }

                // Detect enum start
                if (this.isEnumStart(trimmed)) {
                    if (trimmed.includes('{') && trimmed.includes('}')) {
                        // single-line enum body, ignore
                    } else if (trimmed.includes('{')) {
                        stack.push('enum');
                    }
                    continue;
                }

                // Detect struct-like start
                if (this.isStructStart(trimmed)) {
                    if (trimmed.includes('{') && trimmed.includes('}')) {
                        // single-line body, ignore
                    } else if (trimmed.includes('{')) {
                        stack.push('struct');
                    }
                    continue;
                }
            }

            const top = stack.length > 0 ? stack[stack.length - 1] : undefined;
            return {
                indentLevel: stack.length,
                inStruct: top === 'struct',
                inEnum: top === 'enum'
            };
        } catch (e) {
            return { indentLevel: 0, inStruct: false, inEnum: false };
        }
    }
}