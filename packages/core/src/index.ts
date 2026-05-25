// Core types (structurally compatible with vscode.*)
export {Position, Range, Uri, Location, TextEdit, DocumentSymbol, SymbolKind, DiagnosticSeverity, SelectionRange} from './types';

// Shared interfaces
export type {ThriftFormattingOptions, StructField, EnumField, ConstField} from './interfaces.types';

// AST
export {ThriftParser} from './ast/parser';
export type {IncrementalParseResult} from './ast/parser';
export * as nodes from './ast/nodes.types';
export {createField, createDocument, createStructBlock, createEnumBlock, createServiceBlock, createInteractionBlock} from './ast/factory';
export {sliceTextByRange} from './ast/text-utils';
export {positionInRange, rangeSize, findSmallestNodeAtPosition, collectIncludes, collectTopLevelTypes, nodePathFromLeaf, walkNodes} from './ast/utils';

// Formatter
export {ThriftFormatter} from './formatter/index';
export {formatThriftContent} from './formatter/formatter-core';

// Diagnostics
export {analyzeThriftAst, analyzeThriftText} from './diagnostics/rules/analyzer';
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
