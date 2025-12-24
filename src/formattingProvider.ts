import * as vscode from 'vscode';
import {ThriftFormatter} from './thriftFormatter';
import {ThriftParser} from './ast/parser'; // Changed to use AST parser
import {ThriftParser as OldThriftParser} from './thriftParser'; // Import old parser for fallback
import {ThriftFormattingOptions} from './interfaces';

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

        const fmtOptions: ThriftFormattingOptions = {
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
            indentSize: options.indentSize || getOpt('indentSize', 4),
            maxLineLength: getOpt('maxLineLength', 100),
            collectionStyle: getOpt('collectionStyle', 'preserve'),
            insertSpaces: options.insertSpaces,
            tabSize: options.tabSize,
            initialContext
        };

        const formatter = new ThriftFormatter();
        const formattedText = formatter.formatThriftCode(text, fmtOptions);

        return [vscode.TextEdit.replace(range, formattedText)];
    }

    // Compute initial context (indent level and whether inside struct/enum) from the content before the selection start
    private computeInitialContext(document: vscode.TextDocument, start: vscode.Position): {
        indentLevel: number;
        inStruct: boolean;
        inEnum: boolean
    } {
        try {
            const before = document.getText(new vscode.Range(new vscode.Position(0, 0), start));
            if (!before) {
                return {indentLevel: 0, inStruct: false, inEnum: false};
            }

            // Create a temporary document with only the text before the selection
            const tempUri = document.uri.with({path: document.uri.path + '.temp'});
            const tempDoc = {getText: () => before, uri: tempUri, lineCount: start.line} as vscode.TextDocument;

            // Parse with AST parser (使用缓存版本)
            const ast = ThriftParser.parseWithCache(tempDoc);

            // Count open structs/enums
            let inStruct = false;
            let inEnum = false;
            let indentLevel = 0;

            const stack: Array<'struct' | 'enum'> = [];

            // Traverse the AST to find open blocks
            const traverse = (node: any) => {
                if (node.range && node.range.end.line >= start.line) {
                    // This node ends after our position, check if it's an open block
                    if ((node.type === 'Struct' || node.type === 'Union' || node.type === 'Exception') &&
                        node.range.end.line > start.line) {
                        stack.push('struct');
                        inStruct = true;
                    } else if (node.type === 'Enum' && node.range.end.line > start.line) {
                        stack.push('enum');
                        inEnum = true;
                    }
                }

                // Check children
                if (node.body) {
                    node.body.forEach(traverse);
                } else if (node.fields) {
                    node.fields.forEach(traverse);
                } else if (node.members) {
                    node.members.forEach(traverse);
                } else if (node.functions) {
                    node.functions.forEach(traverse);
                }
            };

            ast.body.forEach(traverse);
            indentLevel = stack.length;

            return {
                indentLevel,
                inStruct,
                inEnum
            };
        } catch (e) {
            // Fallback to old method if AST parsing fails
            return this.computeInitialContextFallback(document, start);
        }
    }

    // Fallback method using the old regex-based approach
    private computeInitialContextFallback(document: vscode.TextDocument, start: vscode.Position): {
        indentLevel: number;
        inStruct: boolean;
        inEnum: boolean
    } {
        const parser = new OldThriftParser(); // Using the old ThriftParser from thriftParser.ts
        try {
            const before = document.getText(new vscode.Range(new vscode.Position(0, 0), start));
            if (!before) {
                return {indentLevel: 0, inStruct: false, inEnum: false};
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
                        inBlockComment = true;
                        line = line.slice(0, startIdx);
                    }
                }

                // Strip line comments
                const slIdx = line.indexOf('//');
                if (slIdx >= 0) {
                    line = line.slice(0, slIdx);
                }

                const trimmed = line.trim();
                if (!trimmed) {
                    continue;
                }

                // Close brace reduces struct/enum depth
                if (trimmed.startsWith('}')) {
                    if (stack.length > 0) {
                        stack.pop();
                    }
                    continue;
                }

                // Detect enum start
                if (parser.isEnumStart(trimmed)) {
                    if (trimmed.includes('{') && trimmed.includes('}')) {
                        // single-line enum body, ignore
                    } else if (trimmed.includes('{')) {
                        stack.push('enum');
                    }
                    continue;
                }

                // Detect struct-like start
                if (parser.isStructStart(trimmed)) {
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
            return {indentLevel: 0, inStruct: false, inEnum: false};
        }
    }
}