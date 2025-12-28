const path = require('path');
const Module = require('module');

const originalResolveFilename = Module._resolveFilename;
const originalLoad = Module._load;
const testsDir = __dirname;
const repoRoot = path.join(testsDir, '..');
const outSrcRoot = path.join(repoRoot, 'out', 'src');
const mockVscodePath = path.join(testsDir, 'mock_vscode.js');

function normalizeRequest(request) {
    if (typeof request !== 'string') {
        return request;
    }
    return request.replace(/\\/g, '/');
}

function mapOutSrc(request) {
    const normalized = normalizeRequest(request);
    const match = normalized.match(/^(?:\.{1,2}\/)+out\/src\/(.+)$/);
    if (!match) {
        return null;
    }
    return path.join(outSrcRoot, match[1]);
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
    const mapped = mapOutSrc(request) || mapMockVscode(request);
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
    const mapped = mapOutSrc(request) || mapMockVscode(request);
    if (mapped) {
        return originalLoad.call(this, mapped, parent, isMain);
    }
    return originalLoad.call(this, request, parent, isMain);
};
