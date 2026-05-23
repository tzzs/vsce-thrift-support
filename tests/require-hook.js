const path = require('path');
const Module = require('module');

const originalResolveFilename = Module._resolveFilename;
const originalLoad = Module._load;
const testsDir = __dirname;
const repoRoot = path.join(testsDir, '..');
const coreOutRoot = path.join(repoRoot, 'packages', 'core', 'out');
const vsceOutRoot = path.join(repoRoot, 'out');
const mockVscodePath = path.join(testsDir, 'mock_vscode.js');

// Modules that live in packages/core/out/ after Phase 5 migration.
// Everything else stays in out/ (vscode package).
const CORE_PATH_PREFIXES = [
    'ast/',
    'formatter/',
    'interfaces.types',
    'config/index',
    'config/cache-config',
    'diagnostics/types',
    'diagnostics/utils',
    'diagnostics/rules/',
    'utils/cache-manager',
    'utils/cache-expiry',
    'utils/cache-keys',
    'utils/error-handler',
    'utils/memory-monitor',
    'utils/optimized-lru-cache',
    'utils/report-builder',
];

function normalizeRequest(request) {
    if (typeof request !== 'string') {
        return request;
    }
    return request.replace(/\\/g, '/');
}

/**
 * Map out/ paths to either packages/core/out/ or out/ (vscode).
 * Uses an explicit list of core-only module prefixes.
 */
function mapOutPath(request) {
    const normalized = normalizeRequest(request);
    const match = normalized.match(/^(?:\.{1,2}\/)+out\/(.+?)(?:\.js)?$/);
    if (!match) {
        return null;
    }
    const relativePath = match[1];

    const isCore = CORE_PATH_PREFIXES.some(prefix => relativePath === prefix.replace(/\/$/, '') || relativePath.startsWith(prefix));
    const rootDir = isCore ? coreOutRoot : vsceOutRoot;
    return path.join(rootDir, relativePath);
}

function mapMockVscode(request) {
    const normalized = normalizeRequest(request);
    if (
        normalized === './mock-vscode' ||
        normalized === './mock-vscode.js' ||
        normalized === './mock_vscode' ||
        normalized === './mock_vscode.js'
    ) {
        return mockVscodePath;
    }
    return null;
}

Module._resolveFilename = function (request, parent, isMain, options) {
    const mapped = mapOutPath(request) || mapMockVscode(request);
    if (mapped) {
        return originalResolveFilename.call(this, mapped, parent, isMain, options);
    }
    return originalResolveFilename.call(this, request, parent, isMain, options);
};

// 提前将 vscode mock 暴露到全局，兼容直接使用 global.vscode / Module 等旧脚本
const vscodeMock = require(mockVscodePath);
global.vscode = vscodeMock;
global.Module = Module;
global.originalRequire = Module.prototype.require;

// Mock vscode for all tests (out 和源码均会 require)
Module._load = function (request, parent, isMain) {
    if (request === 'vscode') {
        return vscodeMock;
    }
    const mapped = mapOutPath(request) || mapMockVscode(request);
    if (mapped) {
        return originalLoad.call(this, mapped, parent, isMain);
    }
    return originalLoad.call(this, request, parent, isMain);
};
