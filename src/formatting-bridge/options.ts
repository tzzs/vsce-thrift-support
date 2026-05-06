import * as vscode from 'vscode';
import {ThriftFormattingOptions} from '../interfaces.types';
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
        return (v !== undefined && v !== null) ? v : legacyConfig.get<T>(key, def);
    };
    let initialContext: FormattingContext | undefined;
    if (!(range.start.line === 0 && range.start.character === 0)) {
        initialContext = deps.computeInitialContext(document, range.start, useMinimalPatch);
    }

    const cfgAlignNames = getOpt<boolean | undefined>('alignNames', undefined);
    const alignNames = (typeof cfgAlignNames !== 'undefined')
        ? cfgAlignNames
        : (getOpt('alignFieldNames', undefined) ?? getOpt('alignEnumNames', undefined) ?? true);
    const alignAssignments = getOpt<boolean | undefined>('alignAssignments', undefined);
    const cfgAlignStructDefaults = getOpt<boolean | undefined>('alignStructDefaults', undefined);
    const cfgAlignEnumEquals = getOpt<boolean | undefined>('alignEnumEquals', undefined);
    const cfgAlignEnumValues = getOpt<boolean | undefined>('alignEnumValues', undefined);
    const cfgAlignAnnotations = getOpt<boolean | undefined>('alignAnnotations', undefined);
    const resolvedAlignAnnotations = (typeof cfgAlignAnnotations !== 'undefined')
        ? cfgAlignAnnotations
        : getOpt('alignStructAnnotations', true);

    const resolvedAlignStructDefaults = (typeof cfgAlignStructDefaults !== 'undefined')
        ? cfgAlignStructDefaults
        : false;
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

    const indentSize = typeof options.indentSize === 'number'
        ? options.indentSize
        : getOpt('indentSize', 4);

    return {
        trailingComma: getOpt('trailingComma', 'preserve'),
        alignTypes: getOpt('alignTypes', true),
        alignFieldNames: alignNames,
        alignStructDefaults: resolvedAlignStructDefaults,
        alignAnnotations: resolvedAlignAnnotations,
        alignComments: getOpt('alignComments', true),
        alignEnumNames: alignNames,
        alignEnumEquals: resolvedAlignEnumEquals,
        alignEnumValues: resolvedAlignEnumValues,
        indentSize,
        maxLineLength: getOpt('maxLineLength', 100),
        collectionStyle: getOpt('collectionStyle', 'preserve'),
        insertSpaces: options.insertSpaces,
        tabSize: options.tabSize,
        initialContext
    };
}
