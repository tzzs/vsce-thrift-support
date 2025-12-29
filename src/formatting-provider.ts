import * as vscode from 'vscode';
import { ThriftFormatter } from './thrift-formatter';
import { ThriftParser } from './ast/parser';
import { ThriftFormattingOptions } from './interfaces.types';
import { config } from './config';
import { IncrementalTracker } from './utils/incremental-tracker';

/**
 * ThriftFormattingProvider：提供文档与选区格式化。
 */
export class ThriftFormattingProvider implements vscode.DocumentFormattingEditProvider, vscode.DocumentRangeFormattingEditProvider {
    private incrementalTracker = IncrementalTracker.getInstance();

    /**
     * 格式化整个文档。
     */
    provideDocumentFormattingEdits(
        document: vscode.TextDocument,
        options: vscode.FormattingOptions,
        _token: vscode.CancellationToken
    ): vscode.TextEdit[] {
        let targetRange: vscode.Range | undefined;

        // 增量格式化：在脏区范围内尝试最小化编辑
        if (config.incremental.formattingEnabled) {
            targetRange = this.incrementalTracker.consumeDirtyRange(document);
        }

        const fullRange = new vscode.Range(
            document.positionAt(0),
            document.positionAt(document.getText().length)
        );

        return this.formatRange(document, targetRange ?? fullRange, options);
    }

    /**
     * 格式化指定范围。
     */
    provideDocumentRangeFormattingEdits(
        document: vscode.TextDocument,
        range: vscode.Range,
        options: vscode.FormattingOptions,
        _token: vscode.CancellationToken
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
        let initialContext: { indentLevel: number; inStruct: boolean; inEnum: boolean; inService: boolean } | undefined;
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
        inEnum: boolean;
        inService: boolean;
    } {
        try {
            const before = document.getText(new vscode.Range(new vscode.Position(0, 0), start));
            if (!before) {
                return { indentLevel: 0, inStruct: false, inEnum: false, inService: false };
            }

            // Parse with AST parser using a synthetic cache key (avoid reliance on uri.with for mocks)
            const baseKey = document.uri && typeof document.uri.toString === 'function'
                ? document.uri.toString()
                : 'inmemory://range';
            const ast = ThriftParser.parseContentWithCache(`${baseKey}#range`, before);
            const beforeLines = before.split('\n');
            const boundaryLine = Math.max(0, beforeLines.length - 1);

            const hasValidRanges = ast.body.some((node: any) => {
                return node.range &&
                    typeof node.range.start?.line === 'number' &&
                    typeof node.range.end?.line === 'number';
            });

            if (!hasValidRanges) {
                // Fallback: simple brace-based scan when Range mocks don't expose line numbers
                const stack: Array<'struct' | 'enum' | 'service'> = [];
                for (const rawLine of beforeLines) {
                    const line = rawLine.replace(/\/\/.*$/, '').replace(/#.*$/, '').trim();
                    if (!line) {
                        continue;
                    }
                    const startMatch = line.match(/^(struct|union|exception|enum|senum|service)\b/);
                    if (startMatch && line.includes('{')) {
                        const type = startMatch[1];
                        if (type === 'enum' || type === 'senum') {
                            stack.push('enum');
                        } else if (type === 'service') {
                            stack.push('service');
                        } else {
                            stack.push('struct');
                        }
                    }
                    if (line.includes('}')) {
                        stack.pop();
                    }
                }
                const inStruct = stack.includes('struct');
                const inEnum = stack.includes('enum');
                const inService = stack.includes('service');
                return {
                    indentLevel: stack.length,
                    inStruct,
                    inEnum,
                    inService
                };
            }

            // Count open structs/enums
            let inStruct = false;
            let inEnum = false;
            let inService = false;
            let indentLevel = 0;

            const stack: Array<'struct' | 'enum' | 'service'> = [];

            // Traverse the AST to find open blocks
            const traverse = (node: any) => {
                if (node.range && node.range.start.line <= boundaryLine && node.range.end.line >= boundaryLine) {
                    // This node spans the boundary line, treat it as open context
                    if (node.type === 'Struct' || node.type === 'Union' || node.type === 'Exception') {
                        stack.push('struct');
                        inStruct = true;
                    } else if (node.type === 'Enum') {
                        stack.push('enum');
                        inEnum = true;
                    } else if (node.type === 'Service') {
                        stack.push('service');
                        inService = true;
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
                inEnum,
                inService
            };
        } catch (e) {
            return { indentLevel: 0, inStruct: false, inEnum: false, inService: false };
        }
    }
}
