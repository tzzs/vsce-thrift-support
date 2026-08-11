// Core types (structurally compatible with vscode.*)
export {Position, Range, Uri, Location, TextEdit, DocumentSymbol, SymbolKind, DiagnosticSeverity, SelectionRange} from './types';

// Shared interfaces
export type {ThriftFormattingOptions, StructField, EnumField, ConstField} from './interfaces.types';

// AST
export {ThriftParser} from './ast/parser';
export type {IncrementalParseResult} from './ast/parser';
export {ThriftTokenizer} from './ast/tokenizer';
export * as nodes from './ast/nodes.types';
export {createField, createDocument, createStructBlock, createEnumBlock, createServiceBlock, createInteractionBlock} from './ast/factory';
export {sliceTextByRange} from './ast/text-utils';
export {positionInRange, rangeSize, findSmallestNodeAtPosition, collectIncludes, collectTopLevelTypes, isThriftInclude, nodePathFromLeaf, walkNodes} from './ast/utils';

// Refactor helpers
export {inferExtractTypeTarget, buildExtractTypeEdits, inferMoveTypeTarget} from './refactor/type-refactor';
export type {ExtractTypeEdits, ExtractTypeTarget, MoveTypeTarget, PositionLike, RangeLike} from './refactor/type-refactor';

// Formatter
export {ThriftFormatter} from './formatter/index';
export {formatThriftContent} from './formatter/formatter-core';
export {computeFormattingContext, DEFAULT_FORMATTING_CONTEXT} from './formatter/format-context';
export type {FormattingContext} from './formatter/format-context';

// Diagnostics
export {DIAGNOSTIC_CODES, UNKNOWN_TYPE_DIAGNOSTIC_CODES} from './diagnostics/diagnostic-codes';
export type {DiagnosticCode} from './diagnostics/diagnostic-codes';
export {analyzeThriftAst, analyzeThriftText} from './diagnostics/rules/analyzer';
export {DIAGNOSTIC_RULES, getDiagnosticRule, applyDiagnosticRuleOptions} from './diagnostics/rules/registry';
export type {DiagnosticRuleMetadata, DiagnosticRuleOverride, DiagnosticRuleSeverityName, DiagnosticsRuleOptions} from './diagnostics/rules/registry';
export {collectTypesFromAst} from './diagnostics/include-resolver';
export type {ThriftIssue, BlockCacheValue, MemberCacheValue, BlockAstCacheEntry, BlockCache, MemberCache, MemberCacheByBlock} from './diagnostics/types';
export {AnalysisContext, collectIncludeAliasesFromAst, buildAnalysisContext} from './diagnostics/rules/analysis-context';
export {
    stripCommentsFromLine, sanitizeStructuralText, hasStructuralTokens, includesKeyword,
    diagnosticsTestUtils,
    findBestContainingRange, findBestContainingRangeForChanges,
    findBestContainingMemberRange, findBestContainingMemberRangeForChanges,
    findContainingNode, buildPartialLines, hashText, filterIssuesByLineRange
} from './diagnostics/utils';

// Config defaults
export {config, config as defaultConfig, cacheConfig, memoryConfig} from './config/index';
export type {CacheConfig, CacheEntry, MemoryConfig} from './config/index';
export {
    DEFAULT_THRIFT_FORMATTING_OPTIONS,
    THRIFT_FORMATTING_CONFIG_KEYS,
    THRIFT_FORMATTING_SETTING_DEFINITIONS,
    createFormattingConfigurationProperties,
    normalizeFormattingOptions
} from './config/formatting-options';
export type {
    FormattingConfigurationProperty,
    FormattingSettingDefinition,
    ThriftFormattingConfigInput
} from './config/formatting-options';
export {CACHE_CONFIGS, getAllCacheConfigs, updateCacheConfig, validateCacheConfig, registerAllCacheConfigs} from './config/cache-config';

// Utils - line range
export {LineRange, createLineRange, normalizeLineRange, mergeLineRanges, collapseLineRanges, lineRangeLineCount, rangeIntersectsLineRange, rangeContainsLineRange, lineRangeFromChange} from './utils/line-range';

// Utils - error handling
export {ErrorHandler} from './utils/error-handler';
export type {ErrorContext} from './utils/error-handler';

// Utils - cache management
export {CacheManager, MemoryAwareCacheManager} from './utils/cache-manager';
export type {CacheConfig as CacheManagerConfig} from './utils/cache-manager';
export {LruCache} from './utils/optimized-lru-cache';
export {makeLineRangeKey, makeUriRangeKey, makeUriContentKey} from './utils/cache-keys';
export type {LineRangeKey} from './utils/cache-keys';
export {isExpired, isFresh, hashContent} from './utils/cache-expiry';

// Utils - memory and reporting
export {MemoryMonitor} from './utils/memory-monitor';
export {ReportBuilder, formatMb} from './utils/report-builder';
export {safeResolveIncludePath} from './utils/safe-path';
export {QuoteTracker} from './utils/quote-tracker';
export {parseContainerTypeInfo} from './diagnostics/rules/type-utils';
export type {ContainerTypeInfo} from './diagnostics/rules/type-utils';
