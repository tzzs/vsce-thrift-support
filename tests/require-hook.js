const path = require('path');
const fs = require('fs');
const Module = require('module');

const originalResolveFilename = Module._resolveFilename;
const originalLoad = Module._load;
const testsDir = __dirname;
const repoRoot = path.join(testsDir, '..');
const coreOutRoot = path.join(repoRoot, 'packages', 'core', 'out');
const vsceOutRoot = path.join(repoRoot, 'out');
const mockVscodePath = path.join(testsDir, 'mock_vscode.js');
const VSCE_OUT_PREFIXES = [
    'diagnostics/include-resolver',
    'utils/line-range',
];

function normalizeRequest(request) {
    if (typeof request !== 'string') {
        return request;
    }
    return request.replace(/\\/g, '/');
}

/**
 * Map out/ paths to either packages/core/out/ or out/ (vscode).
 * Prefer package/core when the compiled file exists there; otherwise fall back
 * to the root VS Code extension out directory.
 */
function mapOutPath(request) {
    const normalized = normalizeRequest(request);
    const match = normalized.match(/^(?:\.{1,2}\/)+out\/(.+?)(?:\.js)?$/);
    if (!match) {
        return null;
    }
    const relativePath = match[1];

    return resolveCompiledOutPath(relativePath);
}

function resolveCompiledOutPath(relativePath) {
    if (VSCE_OUT_PREFIXES.some(prefix => relativePath === prefix || relativePath.startsWith(`${prefix}/`))) {
        return path.join(vsceOutRoot, relativePath);
    }
    const coreCandidate = path.join(coreOutRoot, relativePath);
    if (compiledFileExists(coreCandidate)) {
        return coreCandidate;
    }
    return path.join(vsceOutRoot, relativePath);
}

function compiledFileExists(candidate) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return true;
    }
    if (fs.existsSync(`${candidate}.js`)) {
        return true;
    }
    return fs.existsSync(path.join(candidate, 'index.js'));
}

function mapCorePackage(request) {
    if (request === '@tanzz/thrift-core') {
        return path.join(coreOutRoot, 'index.js');
    }
    if (request.startsWith('@tanzz/thrift-core/')) {
        return resolveCompiledOutPath(request.slice('@tanzz/thrift-core/'.length));
    }
    return null;
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
    const mapped = mapCorePackage(request) || mapOutPath(request) || mapMockVscode(request);
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
    const mapped = mapCorePackage(request) || mapOutPath(request) || mapMockVscode(request);
    if (mapped) {
        return originalLoad.call(this, mapped, parent, isMain);
    }
    return originalLoad.call(this, request, parent, isMain);
};
