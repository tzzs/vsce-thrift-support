"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseWithAstCache = exports.clearAstCacheForDocument = exports.clearExpiredAstCache = exports.setCachedAst = exports.clearAstRegionCacheForDocument = exports.setCachedAstRange = exports.getCachedAstRange = exports.getCachedAst = void 0;
const config_1 = require("../config");
const cache_manager_1 = require("../utils/cache-manager");
const cache_keys_1 = require("../utils/cache-keys");
const cache_expiry_1 = require("../utils/cache-expiry");
const cache_config_1 = require("../config/cache-config");
const cacheManager = cache_manager_1.CacheManager.getInstance();
cacheManager.registerCache('ast-full', cache_config_1.CACHE_CONFIGS['ast-full']);
cacheManager.registerCache('ast-region', cache_config_1.CACHE_CONFIGS['ast-region']);
const astCache = new Map();
const astRegionCache = new Map();
const CACHE_MAX_AGE = config_1.config.cache.astMaxAgeMs;
function getCachedAst(uri, content, version) {
    const now = Date.now();
    const cacheKey = (0, cache_keys_1.makeUriContentKey)(uri, content, version);
    const cached = astCache.get(cacheKey) ?? astCache.get(uri);
    if (cached && (0, cache_expiry_1.isFresh)(cached.timestamp, CACHE_MAX_AGE, now)) {
        const currentHash = (0, cache_expiry_1.hashContent)(content);
        if (cached.contentHash === currentHash && cached.content === content) {
            cacheManager.get('ast-full', cacheKey);
            return cached.ast;
        }
    }
    return null;
}
exports.getCachedAst = getCachedAst;
function getCachedAstRange(uri, range, content) {
    const now = Date.now();
    const uriCache = astRegionCache.get(uri);
    const cacheKey = (0, cache_keys_1.makeUriRangeKey)(uri, range);
    if (!uriCache) {
        cacheManager.get('ast-region', cacheKey);
        return null;
    }
    const cached = uriCache.find(entry => entry.range.startLine === range.startLine &&
        entry.range.endLine === range.endLine &&
        (0, cache_expiry_1.isFresh)(entry.timestamp, CACHE_MAX_AGE, now));
    if (cached) {
        const currentHash = (0, cache_expiry_1.hashContent)(content);
        if (cached.contentHash === currentHash && cached.content === content) {
            cacheManager.get('ast-region', cacheKey);
            return cached.regionAST;
        }
    }
    return null;
}
exports.getCachedAstRange = getCachedAstRange;
function setCachedAstRange(uri, range, content, ast) {
    if (!astRegionCache.has(uri)) {
        astRegionCache.set(uri, []);
    }
    let uriCache = astRegionCache.get(uri);
    if (!uriCache) {
        uriCache = [];
        astRegionCache.set(uri, uriCache);
    }
    const existingIndex = uriCache.findIndex(entry => entry.range.startLine === range.startLine &&
        entry.range.endLine === range.endLine);
    if (existingIndex !== -1) {
        uriCache.splice(existingIndex, 1);
    }
    uriCache.push({
        contentHash: (0, cache_expiry_1.hashContent)(content),
        content,
        regionAST: ast,
        range,
        timestamp: Date.now()
    });
    if (uriCache.length > 50) {
        uriCache.shift();
    }
    cacheManager.set('ast-region', (0, cache_keys_1.makeUriRangeKey)(uri, range), ast);
}
exports.setCachedAstRange = setCachedAstRange;
function clearAstRegionCacheForDocument(uri) {
    const entries = astRegionCache.get(uri);
    if (entries) {
        for (const entry of entries) {
            cacheManager.delete('ast-region', (0, cache_keys_1.makeUriRangeKey)(uri, entry.range));
        }
    }
    astRegionCache.delete(uri);
}
exports.clearAstRegionCacheForDocument = clearAstRegionCacheForDocument;
function setCachedAst(uri, content, ast, version) {
    const entry = {
        contentHash: (0, cache_expiry_1.hashContent)(content),
        content,
        ast,
        timestamp: Date.now()
    };
    const cacheKey = (0, cache_keys_1.makeUriContentKey)(uri, content, version);
    astCache.set(cacheKey, entry);
    cacheManager.set('ast-full', cacheKey, entry);
}
exports.setCachedAst = setCachedAst;
function clearExpiredAstCache() {
    const now = Date.now();
    for (const [uri, entry] of Array.from(astCache.entries())) {
        if ((0, cache_expiry_1.isExpired)(entry.timestamp, CACHE_MAX_AGE, now)) {
            astCache.delete(uri);
            cacheManager.delete('ast-full', uri);
        }
    }
    for (const [uri, entries] of Array.from(astRegionCache.entries())) {
        const freshEntries = entries.filter(entry => (0, cache_expiry_1.isFresh)(entry.timestamp, CACHE_MAX_AGE, now));
        const expiredEntries = entries.filter(entry => (0, cache_expiry_1.isExpired)(entry.timestamp, CACHE_MAX_AGE, now));
        for (const entry of expiredEntries) {
            cacheManager.delete('ast-region', (0, cache_keys_1.makeUriRangeKey)(uri, entry.range));
        }
        if (freshEntries.length === 0) {
            astRegionCache.delete(uri);
        }
        else if (freshEntries.length !== entries.length) {
            astRegionCache.set(uri, freshEntries);
        }
    }
}
exports.clearExpiredAstCache = clearExpiredAstCache;
function clearAstCacheForDocument(uri) {
    for (const key of astCache.keys()) {
        if (key.startsWith(uri)) {
            astCache.delete(key);
            cacheManager.delete('ast-full', key);
        }
    }
    clearAstRegionCacheForDocument(uri);
}
exports.clearAstCacheForDocument = clearAstCacheForDocument;
function parseWithAstCache(uri, content, parse, version) {
    const cached = getCachedAst(uri, content, version);
    if (cached) {
        return cached;
    }
    const ast = parse();
    setCachedAst(uri, content, ast, version);
    return ast;
}
exports.parseWithAstCache = parseWithAstCache;
//# sourceMappingURL=cache.js.map