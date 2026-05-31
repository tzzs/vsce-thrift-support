import * as vscode from 'vscode';
import {normalizeFormattingOptions, ThriftFormattingConfigInput, ThriftFormattingOptions} from '@tanzz/thrift-core';
import {FormattingContext} from './context';

interface FormattingOptionDeps {
    computeInitialContext: (
        document: vscode.TextDocument,
        start: vscode.Position,
        useCachedAst: boolean
    ) => FormattingContext;
}

/**
 * Resolve formatting options from VS Code configuration.
 * @param document - Source document.
 * @param range - Formatting range.
 * @param options - VS Code formatting options.
 * @param useMinimalPatch - Whether range formatting is incremental.
 * @param deps - Dependency providers.
 * @returns Resolved formatting options.
 */
export function resolveFormattingOptions(
    document: vscode.TextDocument,
    range: vscode.Range,
    options: vscode.FormattingOptions,
    useMinimalPatch: boolean,
    deps: FormattingOptionDeps
): ThriftFormattingOptions {
    const config = vscode.workspace.getConfiguration('thrift.format');
    const legacyConfig = vscode.workspace.getConfiguration('thrift-support.formatting');
    const getOpt = <T>(key: string, def: T): T => {
        const v = config.get<T>(key);
        return v ?? legacyConfig.get<T>(key, def);
    };
    let initialContext: FormattingContext | undefined;
    if (!(range.start.line === 0 && range.start.character === 0)) {
        initialContext = deps.computeInitialContext(document, range.start, useMinimalPatch);
    }

    const indentSize = typeof options.indentSize === 'number'
        ? options.indentSize
        : getOpt('indentSize', 4);

    const rawOptions: ThriftFormattingConfigInput = {
        trailingComma: getOpt('trailingComma', 'preserve'),
        alignTypes: getOpt('alignTypes', true),
        alignNames: getOpt<boolean | undefined>('alignNames', undefined),
        alignFieldNames: getOpt<boolean | undefined>('alignFieldNames', undefined),
        alignEnumNames: getOpt<boolean | undefined>('alignEnumNames', undefined),
        alignAssignments: getOpt<boolean | undefined>('alignAssignments', undefined),
        alignStructDefaults: getOpt<boolean | undefined>('alignStructDefaults', undefined),
        alignAnnotations: getOpt<boolean | undefined>('alignAnnotations', undefined),
        alignStructAnnotations: getOpt<boolean | undefined>('alignStructAnnotations', undefined),
        alignComments: getOpt('alignComments', true),
        alignEnumEquals: getOpt<boolean | undefined>('alignEnumEquals', undefined),
        alignEnumValues: getOpt<boolean | undefined>('alignEnumValues', undefined),
        indentSize,
        maxLineLength: getOpt('maxLineLength', 100),
        collectionStyle: getOpt('collectionStyle', 'preserve'),
        insertSpaces: options.insertSpaces,
        tabSize: options.tabSize,
        initialContext
    };

    return normalizeFormattingOptions(rawOptions);
}
