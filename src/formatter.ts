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
            trailingComma: config.get('trailingComma', true),
            alignTypes: config.get('alignTypes', true),
            alignFieldNames: config.get('alignFieldNames', true),
            alignComments: config.get('alignComments', true),
            indentSize: config.get('indentSize', 2),
            maxLineLength: config.get('maxLineLength', 100),
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
        let structFields: Array<{line: string, type: string, name: string, comment: string}> = [];

        for (let i = 0; i < lines.length; i++) {
            let originalLine = lines[i];
            let line = originalLine.trim();
            
            // Skip empty lines and comments
            if (!line || line.startsWith('//') || line.startsWith('#') || line.startsWith('/*')) {
                formattedLines.push(this.getIndent(indentLevel, options) + line);
                continue;
            }

            // Handle struct/union/exception/service definitions
            if (this.isStructStart(line)) {
                formattedLines.push(this.getIndent(indentLevel, options) + line);
                indentLevel++;
                inStruct = true;
                structFields = [];
                continue;
            }

            // Handle closing braces
            if (line === '}' || line === '},') {
                if (inStruct && structFields.length > 0) {
                    // Format accumulated struct fields
                    const formattedFields = this.formatStructFields(structFields, options, indentLevel);
                    formattedLines.push(...formattedFields);
                    structFields = [];
                }
                // Ensure indentLevel doesn't go below 0
                indentLevel = Math.max(0, indentLevel - 1);
                inStruct = false;
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

            // Regular lines
            formattedLines.push(this.getIndent(indentLevel, options) + line);
        }

        // Handle any remaining struct fields
        if (structFields.length > 0) {
            const formattedFields = this.formatStructFields(structFields, options, indentLevel);
            formattedLines.push(...formattedFields);
        }

        return formattedLines.join('\n');
    }

    private isStructStart(line: string): boolean {
        return /^(struct|union|exception|service|enum)\s+\w+\s*\{?$/.test(line) ||
               /^(struct|union|exception|service|enum)\s+\w+.*\{$/.test(line);
    }

    private isStructField(line: string): boolean {
        // Match field definitions like: 1: required string name, or 1: string name,
        return /^\s*\d+:\s*(required|optional)?\s*\w+\s+\w+/.test(line);
    }

    private parseStructField(line: string): {line: string, type: string, name: string, comment: string} | null {
        // Parse field: 1: required string name, // comment
        // Handle complex types like list<string>, map<string, string>
        const match = line.match(/^\s*(\d+:\s*(?:required|optional)?\s*)([\w<>,\s]+?)\s+(\w+)(.*)$/);
        if (match) {
            const prefix = match[1];
            const type = match[2].trim();
            const name = match[3];
            const suffix = match[4].trim();
            const commentMatch = suffix.match(/^([^/]*)(\/.*)$/);
            const fieldSuffix = commentMatch ? commentMatch[1].trim() : suffix;
            const comment = commentMatch ? commentMatch[2] : '';
            
            return {
                line: line,
                type: type,
                name: name,
                comment: comment
            };
        }
        return null;
    }

    private formatStructFields(
        fields: Array<{line: string, type: string, name: string, comment: string}>,
        options: any,
        indentLevel: number
    ): string[] {
        if (!options.alignTypes && !options.alignFieldNames && !options.alignComments) {
            return fields.map(f => this.getIndent(indentLevel, options) + f.line);
        }

        // Calculate max widths for alignment
        let maxTypeWidth = 0;
        let maxNameWidth = 0;

        const parsedFields = fields.map(field => {
            const match = field.line.match(/^\s*(\d+:\s*(?:required|optional)?\s*)(\w+)\s+(\w+)(.*)$/);
            if (match) {
                const prefix = match[1];
                const type = match[2];
                const name = match[3];
                const remainder = match[4].trim();
                
                // Parse suffix and comment
                const commentMatch = remainder.match(/^([^/]*)(\/.*)$/);
                const suffix = commentMatch ? commentMatch[1].trim() : remainder;
                const comment = commentMatch ? commentMatch[2] : '';
                
                maxTypeWidth = Math.max(maxTypeWidth, type.length);
                maxNameWidth = Math.max(maxNameWidth, name.length);
                
                return { prefix, type, name, suffix, comment };
            }
            return null;
        }).filter(f => f !== null);

        // Format fields with alignment
        return parsedFields.map(field => {
            if (!field) {return '';}
            
            let formattedLine = this.getIndent(indentLevel, options) + field.prefix;
            
            if (options.alignTypes) {
                formattedLine += field.type.padEnd(maxTypeWidth);
            } else {
                formattedLine += field.type;
            }
            
            formattedLine += ' ';
            
            if (options.alignFieldNames) {
                formattedLine += field.name.padEnd(maxNameWidth);
            } else {
                formattedLine += field.name;
            }
            
            // Fix spacing around equals sign in suffix before adding to line
            let cleanSuffix = field.suffix;
            if (cleanSuffix.includes('=')) {
                cleanSuffix = cleanSuffix.replace(/\s*=\s*/, ' = ');
            }
            
            formattedLine += cleanSuffix;
            
            // Add trailing comma if configured
            if (options.trailingComma && !cleanSuffix.includes(',') && !cleanSuffix.includes(';')) {
                formattedLine += ',';
            }
            
            if (field.comment && options.alignComments) {
                // Align comments
                const targetLength = 60; // Target column for comments
                const currentLength = formattedLine.length;
                if (currentLength < targetLength) {
                    formattedLine += ' '.repeat(targetLength - currentLength);
                } else {
                    formattedLine += ' ';
                }
                formattedLine += field.comment;
            } else if (field.comment) {
                formattedLine += ' ' + field.comment;
            }
            
            return formattedLine;
        });
    }

    private getIndent(level: number, options: any): string {
        const indentSize = options.indentSize || 2;
        // Ensure level is not negative to avoid String.repeat() error
        const safeLevel = Math.max(0, level);
        if (options.insertSpaces) {
            return ' '.repeat(safeLevel * indentSize);
        } else {
            return '\t'.repeat(safeLevel);
        }
    }
}