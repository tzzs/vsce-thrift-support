// Core types (structurally compatible with vscode.*)
export {Position, Range, Uri, Location, TextEdit, DocumentSymbol, SymbolKind, DiagnosticSeverity, SelectionRange} from './types';

// Shared interfaces
export type {ThriftFormattingOptions, StructField, EnumField, ConstField} from './interfaces.types';

// AST
export {ThriftParser} from './ast/parser';
export * as nodes from './ast/nodes.types';
export {createField, createDocument, createStructBlock, createEnumBlock, createServiceBlock, createInteractionBlock} from './ast/factory';
export {sliceTextByRange} from './ast/text-utils';
export {positionInRange, rangeSize, findSmallestNodeAtPosition} from './ast/utils';

// Formatter
export {ThriftFormatter} from './formatter/index';
export {formatThriftContent} from './formatter/formatter-core';

// Diagnostics
export {analyzeThriftAst, analyzeThriftText} from './diagnostics/rules/analyzer';
export {collectTypesFromAst} from './diagnostics/include-resolver';
export type {ThriftIssue} from './diagnostics/types';
export {AnalysisContext, collectIncludeAliasesFromAst, buildAnalysisContext} from './diagnostics/rules/analysis-context';

// Config defaults
export {config as defaultConfig, cacheConfig, memoryConfig} from './config/index';
export type {CacheConfig, CacheEntry, MemoryConfig} from './config/index';

// Utils
export {LineRange, createLineRange, normalizeLineRange, mergeLineRanges, collapseLineRanges, lineRangeLineCount, rangeIntersectsLineRange, rangeContainsLineRange, lineRangeFromChange} from './utils/line-range';
export {ErrorHandler} from './utils/error-handler';
export type {ErrorContext} from './utils/error-handler';
