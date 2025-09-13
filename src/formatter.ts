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
        const text = document.getText(range);
        const formattedText = this.formatThriftCode(text, {
            trailingComma: config.get('trailingComma', 'preserve'),
            alignTypes: config.get('alignTypes', true),
            alignFieldNames: config.get('alignFieldNames', true),
            alignComments: config.get('alignComments', true),
            alignEnumNames: config.get('alignEnumNames', true),
            alignEnumEquals: config.get('alignEnumEquals', true),
            alignEnumValues: config.get('alignEnumValues', true),
            indentSize: config.get('indentSize', 4),
            maxLineLength: config.get('maxLineLength', 100),
            collectionStyle: config.get('collectionStyle', 'preserve'),
            insertSpaces: options.insertSpaces,
            tabSize: options.tabSize
        });

        return [vscode.TextEdit.replace(range, formattedText)];
    }

    private formatThriftCode(text: string, options: any): string {

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
                if (line.includes('enum')) {
                    inEnum = true;
                    enumFields = [];

                } else {
                    inStruct = true;
                    structFields = [];

                }
                continue;
            }

            // Handle closing braces
            if (line === '}' || line === '},') {

                if (inStruct && structFields.length > 0) {
                    // Format accumulated struct fields

                    const formattedFields = this.formatStructFields(structFields, options, indentLevel);
                    formattedLines.push(...formattedFields);
                    structFields = [];
                } else if (inEnum && enumFields.length > 0) {
                    // Format accumulated enum fields

                    const formattedFields = this.formatEnumFields(enumFields, options, indentLevel);
                    formattedLines.push(...formattedFields);
                    enumFields = [];
                }
                // Ensure indentLevel doesn't go below 0
                indentLevel = Math.max(0, indentLevel - 1);
                inStruct = false;
                inEnum = false;
                formattedLines.push(this.getIndent(indentLevel, options) + line);
                continue;
            }

            // Handle struct fields - use original line to preserve indentation for parsing
            if (inStruct && this.isStructField(originalLine)) {
                const fieldInfo = this.parseStructField(originalLine);
                if (fieldInfo) {
                    structFields.push(fieldInfo);
                    continue;
                }
            }

            // Handle enum fields - use original line to preserve indentation for parsing
            if (inEnum && this.isEnumField(originalLine)) {
                const fieldInfo = this.parseEnumField(originalLine);
                if (fieldInfo) {
                    enumFields.push(fieldInfo);
                    continue;
                }
            }



            // Regular lines
            formattedLines.push(this.getIndent(indentLevel, options) + line);
        }

        // Handle any remaining struct fields
        if (structFields.length > 0) {
            const formattedFields = this.formatStructFields(structFields, options, indentLevel);
            formattedLines.push(...formattedFields);
        }

        // Handle any remaining enum fields
        if (enumFields.length > 0) {
            const formattedFields = this.formatEnumFields(enumFields, options, indentLevel);
            formattedLines.push(...formattedFields);
        }

        // Handle any remaining const fields
        if (constFields.length > 0) {
            const formattedFields = this.formatConstFields(constFields, options, indentLevel);
            formattedLines.push(...formattedFields);
        }

        return formattedLines.join('\n');
    }

    private isStructStart(line: string): boolean {
        const result = /^(struct|union|exception|service|enum)\s+\w+\s*\{?$/.test(line) ||
               /^(struct|union|exception|service|enum)\s+\w+.*\{$/.test(line);

        return result;
    }

    private isConstField(line: string): boolean {
        // Match single-line const definitions like: const i32 MAX_USERS = 10000
        // Also match single-line collection definitions that are complete on one line
        const noComment = line.replace(/\/\/.*$/, '').trim();
        const isConst = /^const\s+\w+(<[^>]+>)?(\[\])?\s+\w+\s*=\s*.+$/.test(noComment);
        const isCollectionType = /^const\s+(map|list|set)</.test(noComment);
        const hasInlineBraces = noComment.includes('{') && noComment.includes('}');
        const hasInlineBrackets = noComment.includes('[') && noComment.includes(']');
        const endsWithOpenBrace = noComment.endsWith('{');
        const endsWithOpenBracket = noComment.endsWith('[');
        
        // If it's a collection type that ends with an opening brace/bracket (incomplete), treat as multiline const start
        if (isConst && isCollectionType && (endsWithOpenBrace || endsWithOpenBracket)) {
            return false; // Will be handled by isConstStart
        }
        
        return isConst;
    }

    private isConstStart(line: string): boolean {
        // Match const definitions like: const map<string, i32> ERROR_CODES = {
        // Only match incomplete collection definitions that end with opening brace/bracket
        const noComment = line.replace(/\/\/.*$/, '').trim();
        const isMultilineStart = /^const\s+.+\s*=\s*\{$/.test(noComment) || /^const\s+.+\s*=\s*\[$/.test(noComment);
        const isCollectionType = /^const\s+(map|list|set)</.test(noComment);
        const endsWithOpenBrace = noComment.endsWith('{');
        const endsWithOpenBracket = noComment.endsWith('[');
        
        return isMultilineStart || (isCollectionType && (endsWithOpenBrace || endsWithOpenBracket));
    }

    private parseConstField(line: string, options: any = null, indentLevel: number = 0): {line: string, type: string, name: string, value: string, comment: string} | null {
        // Parse const field: const i32 MAX_USERS = 10000 // comment
        // Also handles multiline const definitions and expands single-line collections
        let remainder = line.trim();
        
        // For multiline const, extract comment from the first line only
        let comment = '';
        const firstLine = remainder.split('\n')[0];
        const commentMatch = firstLine.match(/^(.*?)(\/\/.*)$/);
        if (commentMatch) {
            comment = commentMatch[2];
            // Remove comment from the entire remainder
            remainder = remainder.replace(commentMatch[2], '').trim();
        }
        
        // Parse the main content: const type name = value
        // For multiline, the value part might span multiple lines
        const constMatch = remainder.match(/^const\s+(\w+(?:<[^>]+>)?(?:\[\])?)\s+(\w+)\s*=\s*([\s\S]+)$/);
        if (!constMatch) return null;
        
        const type = constMatch[1].trim();
        const name = constMatch[2];
        let value = constMatch[3].trim();
        
        // Check if this is a single-line collection that may need to be expanded
        const isCollectionType = /^(map|list|set)</.test(type);
        const isInlineCollection = (value.startsWith('{') && value.endsWith('}')) || (value.startsWith('[') && value.endsWith(']'));
        if (isCollectionType && isInlineCollection) {
            if (options && options.collectionStyle === 'multiline') {
                value = this.expandInlineCollection(value, type, options, indentLevel + 1);
            } else if (options && options.collectionStyle === 'auto') {
                // Auto mode: expand only when the estimated single-line exceeds maxLineLength
                const indent = this.getIndent(indentLevel, options);
                const singleLineBase = `${indent}const ${type} ${name} = ${value}`;
                const commentPart = comment ? ` ${comment}` : '';
                const estimatedLen = singleLineBase.length + commentPart.length;
                const maxLen = (options && typeof options.maxLineLength === 'number') ? options.maxLineLength : 100;
                if (estimatedLen > maxLen) {
                    value = this.expandInlineCollection(value, type, options, indentLevel + 1);
                }
            } // else preserve single-line as-is
        }
        
        return {
            line: line,
            type: type,
            name: name,
            value: value,
            comment: comment
        };
    }

    private expandInlineCollection(value: string, type: string, options: any = null, indentLevel: number = 1): string {
        // Expand single-line collections to multi-line format
        const itemIndent = options ? this.getIndent(indentLevel, options) : '    '.repeat(indentLevel);
        
        if (value.startsWith('{') && value.endsWith('}')) {
            // Handle map: {"key1": value1, "key2": value2}
            const content = value.slice(1, -1).trim();
            if (!content) return '{\n}';
            
            const items = this.parseMapItems(content);
            if (items.length === 0) return '{\n}';
            
            return '{\n' + items.map(item => `${itemIndent}${item}`).join(',\n') + '\n}';
        } else if (value.startsWith('[') && value.endsWith(']')) {
            // Handle list/set: ["item1", "item2"]
            const content = value.slice(1, -1).trim();
            if (!content) return '[\n]';
            
            const items = this.parseListItems(content);
            if (items.length === 0) return '[\n]';
            
            return '[\n' + items.map(item => `${itemIndent}${item}`).join(',\n') + '\n]';
        }
        
        return value;
    }

    private parseMapItems(content: string): string[] {
        const items: string[] = [];
        let current = '';
        let depth = 0;
        let inString = false;
        let escapeNext = false;
        
        for (let i = 0; i < content.length; i++) {
            const char = content[i];
            
            if (escapeNext) {
                current += char;
                escapeNext = false;
                continue;
            }
            
            if (char === '\\') {
                current += char;
                escapeNext = true;
                continue;
            }
            
            if (char === '"' && !escapeNext) {
                inString = !inString;
                current += char;
                continue;
            }
            
            if (!inString) {
                if (char === '{' || char === '[') {
                    depth++;
                } else if (char === '}' || char === ']') {
                    depth--;
                } else if (char === ',' && depth === 0) {
                    items.push(current.trim());
                    current = '';
                    continue;
                }
            }
            
            current += char;
        }
        
        if (current.trim()) {
            items.push(current.trim());
        }
        
        return items;
    }

    private parseListItems(content: string): string[] {
        const items: string[] = [];
        let current = '';
        let depth = 0;
        let inString = false;
        let escapeNext = false;
        
        for (let i = 0; i < content.length; i++) {
            const char = content[i];
            
            if (escapeNext) {
                current += char;
                escapeNext = false;
                continue;
            }
            
            if (char === '\\') {
                current += char;
                escapeNext = true;
                continue;
            }
            
            if (char === '"' && !escapeNext) {
                inString = !inString;
                current += char;
                continue;
            }
            
            if (!inString) {
                if (char === '{' || char === '[') {
                    depth++;
                } else if (char === '}' || char === ']') {
                    depth--;
                } else if (char === ',' && depth === 0) {
                    items.push(current.trim());
                    current = '';
                    continue;
                }
            }
            
            current += char;
        }
        
        if (current.trim()) {
            items.push(current.trim());
        }
        
        return items;
    }

    private formatConstFields(
        fields: Array<{line: string, type: string, name: string, value: string, comment: string}>,
        options: any,
        indentLevel: number
    ): string[] {
        if (fields.length === 0) return [];
        
        // Calculate max widths for alignment
        const maxTypeWidth = Math.max(...fields.map(f => f.type.length));
        const maxNameWidth = Math.max(...fields.map(f => f.name.length));
        
        const indent = this.getIndent(indentLevel, options);
        const valueIndent = this.getIndent(indentLevel + 1, options);
        const alignComments = options && options.alignComments !== false;

        // Pre-compute max base length for aligning comments on the first line of each const
        let maxFirstLineBaseLen = 0;
        for (const f of fields) {
            if (!f.comment) continue;
            const firstLineValue = f.value.includes('\n') ? f.value.split('\n')[0] : f.value;
            const base = `const ${f.type.padEnd(maxTypeWidth)} ${f.name.padEnd(maxNameWidth)} = ${firstLineValue}`;
            if (base.length > maxFirstLineBaseLen) maxFirstLineBaseLen = base.length;
        }
        
        return fields.map(field => {
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
        const commentMatch = suffixAndComment.match(/^([^/]*)(\/.*)$/);
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
                    contentWidth += maxNameWidth + field.suffix.length;
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
            if (field.suffix.includes(',') || options.trailingComma === 'add') {
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
                    // If there's a default value, pad the field name for alignment
                    formattedLine += field.name.padEnd(maxNameWidth);
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
        const needsAlignment = options.alignEnumNames || options.alignEnumEquals || options.alignEnumValues || options.alignComments;
        if (!needsAlignment && options.trailingComma === 'preserve') {
            return fields.map(f => this.getIndent(indentLevel, options) + f.line);
        }

        // Calculate max widths for alignment
        let maxNameWidth = 0;
        let maxValueWidth = 0;
        let maxContentWidth = 0; // For comment alignment

        const parsedFields = fields.map(field => {
            const name = field.name;
            const value = field.value;
            
            // Extract suffix and comment from the remainder of the line
            const afterValue = field.line.substring(field.line.indexOf(field.value) + field.value.length);
            const commentMatch = afterValue.match(/^([^/]*)(\/.*)$/);
            const suffix = commentMatch ? commentMatch[1].trim() : afterValue.trim();
            const comment = field.comment || (commentMatch ? commentMatch[2] : '');
            
            maxNameWidth = Math.max(maxNameWidth, name.length);
            maxValueWidth = Math.max(maxValueWidth, value.length);
            
            // Calculate content width for comment alignment (name + = + value + suffix)
            let contentWidth = name.length + 3 + value.length; // +3 for " = "
            if (suffix) {
                contentWidth += suffix.length;
            }
            maxContentWidth = Math.max(maxContentWidth, contentWidth);
            
            return { name, value, suffix, comment };
        });

        // Format fields with alignment
        return parsedFields.map(field => {
            if (!field) {return '';}
            
            let formattedLine = this.getIndent(indentLevel, options);
            
            if (options.alignEnumNames) {
                formattedLine += field.name.padEnd(maxNameWidth);
            } else {
                formattedLine += field.name;
            }
            
            if (options.alignEnumEquals) {
                formattedLine += ' = ';
            } else {
                formattedLine += ' = ';
            }
            
            if (options.alignEnumValues) {
                formattedLine += field.value.padStart(maxValueWidth);
            } else {
                formattedLine += field.value;
            }
            
            // Handle trailing comma based on configuration
            let cleanSuffix = field.suffix;
            const hasComma = cleanSuffix.includes(',');
            const hasSemicolon = cleanSuffix.includes(';');
            

            
            if (options.trailingComma === 'add' && !hasComma && !hasSemicolon) {
                // Add comma if not present
                cleanSuffix = ',' + cleanSuffix;

            } else if (options.trailingComma === 'remove' && hasComma && !hasSemicolon) {
                // Remove comma if present
                cleanSuffix = cleanSuffix.replace(/,.*$/, '');

            }
            // For 'preserve', keep the original comma state
            
            // Add suffix (including comma) directly to the line
            if (cleanSuffix) {
                formattedLine += cleanSuffix;
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

    private getIndent(level: number, options: any): string {
        const indentSize = options.indentSize || 4;
        // Ensure level is not negative to avoid String.repeat() error
        const safeLevel = Math.max(0, level);
        if (options.insertSpaces) {
            return ' '.repeat(safeLevel * indentSize);
        } else {
            return '\t'.repeat(safeLevel);
        }
    }
}