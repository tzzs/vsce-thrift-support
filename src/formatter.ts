import * as vscode from 'vscode';

export class ThriftFormattingProvider implements vscode.DocumentFormattingEditProvider, vscode.DocumentRangeFormattingEditProvider {
    
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
        const formattedText = this.formatThriftCode(text, {
            trailingComma: getOpt('trailingComma', 'preserve'),
            alignTypes: getOpt('alignTypes', true),
            alignFieldNames: getOpt('alignFieldNames', true),
            alignStructEquals: getOpt('alignStructEquals', false),
            alignComments: getOpt('alignComments', true),
            alignEnumNames: getOpt('alignEnumNames', true),
            alignEnumEquals: getOpt('alignEnumEquals', true),
            alignEnumValues: getOpt('alignEnumValues', true),
            indentSize: getOpt('indentSize', 4),
            maxLineLength: getOpt('maxLineLength', 100),
            collectionStyle: getOpt('collectionStyle', 'preserve'),
            insertSpaces: options.insertSpaces,
            tabSize: options.tabSize
        });

        return [vscode.TextEdit.replace(range, formattedText)];
    }

    private formatThriftCode(text: string, options: any): string {

        // Backward compatibility for callers that don't pass the new option
        if (typeof options.alignStructEquals === 'undefined') {
            options.alignStructEquals = options.alignFieldNames;
        }

        const lines = text.split('\n');
        const formattedLines: string[] = [];
        let indentLevel = 0;
        let inStruct = false;
        let inEnum = false;
        let structFields: Array<{line: string, type: string, name: string, suffix: string, comment: string}> = [];
        let enumFields: Array<{line: string, name: string, value: string, suffix: string, comment: string}> = [];
        let constFields: Array<{line: string, type: string, name: string, value: string, comment: string}> = [];
        let inConstBlock = false;

        for (let i = 0; i < lines.length; i++) {
            let originalLine = lines[i];
            let line = originalLine.trim();
            
            // Skip empty lines and comments
            if (!line || line.startsWith('//') || line.startsWith('#') || line.startsWith('/*')) {
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
                    constFields.push(fieldInfo);
                    inConstBlock = true;
                }
                
                // Skip the processed lines
                i = j;
                continue;
            } else if (this.isConstField(line)) {
                const fieldInfo = this.parseConstField(line, options, indentLevel);
                if (fieldInfo) {
                    constFields.push(fieldInfo);
                    inConstBlock = true;
                    continue;
                }
            } else if (inConstBlock && constFields.length > 0 && !this.isConstField(line) && !this.isConstStart(line)) {
                // End of const block only if current line is not a const definition
                const formattedFields = this.formatConstFields(constFields, options, indentLevel);
                formattedLines.push(...formattedFields);
                constFields = [];
                inConstBlock = false;
                // Continue processing current line
            }

            // Handle struct/union/exception/service/enum definitions
            if (this.isStructStart(line)) {

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

            // Default: keep the line as-is with proper indentation
            formattedLines.push(this.getIndent(indentLevel, options) + line);
        }

        // Flush any remaining blocks
        if (constFields.length > 0) {
            const formattedFields = this.formatConstFields(constFields, options, indentLevel);
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

        return formattedLines.join('\n');
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
        if (fields.length === 0) return [];
        
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
                        if (current.trim()) items.push(current.trim());
                        current = '';
                    } else {
                        current += ch;
                    }
                }
                if (current.trim()) items.push(current.trim());

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
            if (!f.comment) continue;
            const firstLineValue = f.value.includes('\n') ? f.value.split('\n')[0] : f.value;
            const base = `const ${f.type.padEnd(maxTypeWidth)} ${f.name.padEnd(maxNameWidth)} = ${firstLineValue}`;
            if (base.length > maxFirstLineBaseLen) maxFirstLineBaseLen = base.length;
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
                        while (idx >= 0 && outLines[idx] === '') idx--;
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
                        if (!trimmed || trimmed === '}' || trimmed === ']') continue;
                        const m = l.match(/^(\s*)(.*?)(\s*)(\/\/.*)$/);
                        if (m) {
                            const leading = m[1] || '';
                            const content = (m[2] || '').replace(/\s+$/,'');
                            const len = leading.length + content.length;
                            if (len > maxContentLen) maxContentLen = len;
                            indices.push(idx);
                        }
                    }
                    if (indices.length > 0) {
                        for (const idx of indices) {
                            const l = outLines[idx];
                            const m = l.match(/^(\s*)(.*?)(\s*)(\/\/.*)$/);
                            if (!m) continue;
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
        // Match field definitions like: 1: required string name, or 1: string name,
        // Also match complex types like: 1: required list<string> names,
        return /^\s*\d+:\s*(required|optional)?\s*[\w<>,\s]+\s+\w+/.test(line);
    }

    private isEnumField(line: string): boolean {
        // Match enum field definitions like: ACTIVE = 1, or INACTIVE = 2,
        return /^\s*\w+\s*=\s*\d+/.test(line);
    }

    private parseStructField(line: string): {line: string, type: string, name: string, suffix: string, comment: string} | null {
        // Parse field: 1: required string name = defaultValue, // comment
        
        // First, extract the prefix (field number and optional required/optional)
        const prefixMatch = line.match(/^\s*(\d+:\s*(?:required|optional)?\s*)(.*)$/);
        if (!prefixMatch) return null;
        
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
        
        // Parse the main content: type fieldname [= defaultvalue]
        // Use a more careful regex that handles complex default values
        const fieldMatch = remainder.match(/^(.+?)\s+(\w+)(?:\s*=\s*(.+))?$/);
        if (!fieldMatch) return null;
        
        let type = fieldMatch[1].trim();
        const name = fieldMatch[2];
        const defaultValue = fieldMatch[3];
        
        // Clean up the type by removing extra spaces around < > and commas
        type = type.replace(/\s*<\s*/g, '<').replace(/\s*>\s*/g, '>');
        type = type.replace(/\s*,\s*/g, ',');
        
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
            comment: comment
        };
    }

    private parseEnumField(line: string): {line: string, name: string, value: string, suffix: string, comment: string} | null {
        // Parse enum field: ACTIVE = 1, // comment
        const match = line.match(/^\s*(\w+)\s*=\s*(\d+)\s*([,;]?\s*(?:\/\/.*)?\s*)$/);
        if (!match) return null;
        
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
        if (!source) return null;
        const lines = source.split('\n');
        const header = (lines[0] || '').trim();
        // Match: const <type> <name> = <value>[ // comment]
        const m = header.match(/^const\s+([\w<>,\s]+?)\s+(\w+)\s*=\s*(.*)$/);
        if (!m) return null;
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
        type = type.replace(/\s*<\s*/g, '<').replace(/\s*>\s*/g, '>').replace(/\s*,\s*/g, ',');

        return {
            line: header,
            type,
            name,
            value,
            comment
        };
    }

    private formatStructFields(
        fields: Array<{line: string, type: string, name: string, suffix: string, comment: string}>,
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
        const needsAlignment = options.alignTypes || options.alignFieldNames || options.alignComments;
        
        if (!needsAlignment && options.trailingComma === 'preserve') {
            return sortedFields.map(f => this.getIndent(indentLevel, options) + f.line);
        }

        // Calculate max widths for alignment
        let maxFieldIdWidth = 0;
        let maxTypeWidth = 0;
        let maxNameWidth = 0;
        let maxContentWidth = 0; // For comment alignment

        const parsedFields = sortedFields.map(field => {
            // Extract field ID and required/optional parts separately
            const fieldMatch = field.line.match(/^\s*(\d+):\s*((?:required|optional)?\s*)/);
            const fieldId = fieldMatch ? fieldMatch[1] : '';
            const qualifier = fieldMatch ? fieldMatch[2] : '';
            
            // Use the already parsed and cleaned type from field.type
            let type = field.type;
            // Clean up type formatting - remove spaces around < > and ,
            type = type.replace(/\s*<\s*/g, '<').replace(/\s*>\s*/g, '>').replace(/\s*,\s*/g, ',');
            
            const name = field.name;
            const suffix = field.suffix;
            const comment = field.comment;
            
            maxFieldIdWidth = Math.max(maxFieldIdWidth, fieldId.length);
            maxTypeWidth = Math.max(maxTypeWidth, type.length);
            maxNameWidth = Math.max(maxNameWidth, name.length);
            
            return { fieldId, qualifier, type, name, suffix, comment };
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
                    // If there's a default value
                    if (options.alignStructEquals) {
                        contentWidth += maxNameWidth + field.suffix.length;
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
            
            // Add comma if present or will be added
            if ((field.suffix && field.suffix.includes(',')) || options.trailingComma === 'add') {
                contentWidth += 1; // for comma
            }
            
            maxContentWidth = Math.max(maxContentWidth, contentWidth);
        });
        
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
            let cleanSuffix = field.suffix;
            let hasComma = cleanSuffix.includes(',');
            const hasSemicolon = cleanSuffix.includes(';');
            
            // Remove comma from suffix temporarily
            if (hasComma) {
                cleanSuffix = cleanSuffix.replace(/,\s*$/, '');
            }
            
            // Fix spacing around equals sign if present
            if (cleanSuffix.includes('=')) {
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
                    // If there's a default value, pad the field name only when aligning '=' is enabled
                    if (options.alignStructEquals) {
                        formattedLine += field.name.padEnd(maxNameWidth);
                    } else {
                        formattedLine += field.name;
                    }
                    formattedLine += cleanSuffix;
                } else {
                    // If no default value, don't pad to avoid extra spaces before comma
                    formattedLine += field.name;
                }
                // Add comma at the end if needed
                if (hasComma) {
                    formattedLine += ',';
                }
            } else {
                formattedLine += field.name;
                // Add suffix (default values) to the line
                if (cleanSuffix) {
                    formattedLine += cleanSuffix;
                }
                // Add comma at the end if not aligned and needed
                if (hasComma) {
                    formattedLine += ',';
                }
            }
            
            // Add comment with alignment if enabled
            if (field.comment) {
                if (options.alignComments) {
                    // Calculate current line width for alignment
                    const currentWidth = formattedLine.length - this.getIndent(indentLevel, options).length;
                    const paddingNeeded = Math.max(1, maxContentWidth - currentWidth + 2); // +2 for spacing
                    formattedLine += ' '.repeat(paddingNeeded) + field.comment;
                } else {
                    formattedLine += ' ' + field.comment;
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
        const interim: Array<{ base: string; comment: string } > = [];

        for (const f of fields) {
            let hasComma = f.suffix ? /,/.test(f.suffix) : false;
            const hasSemicolon = f.suffix ? /;/.test(f.suffix) : false;

            if (!hasSemicolon) {
                if (options.trailingComma === 'add') hasComma = true;
                else if (options.trailingComma === 'remove') hasComma = false;
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

            // Handle value alignment
            const valuePart = options.alignEnumValues ? String(f.value).padEnd(maxValueWidth) : String(f.value);
            base += valuePart;

            if (hasComma) base += ',';

            interim.push({ base, comment: f.comment || '' });
            const width = base.length - indent.length;
            if (width > maxContentWidth) maxContentWidth = width;
        }

        return interim.map(item => {
            let line = item.base;
            if (item.comment) {
                if (options.alignComments) {
                    const pad = Math.max(1, maxContentWidth - (line.length - indent.length) + 1);
                    line += ' '.repeat(pad) + item.comment;
                } else {
                    line += ' ' + item.comment;
                }
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
}