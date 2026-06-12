#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const DEFAULT_TARGETS = [
    'packages',
    'syntaxes',
    'language-configuration.json',
    'package.json',
    '.github',
    'scripts'
];
const DEFAULT_ALLOWED_PATHS = ['tests/fixtures/security/invisible-unicode'];
const DEFAULT_IGNORED_DIRS = new Set(['node_modules', 'out', 'dist', 'coverage', 'tmp', '.git']);

const INVISIBLE_CONTROL_NAMES = new Map([
    [0x200B, 'ZERO WIDTH SPACE'],
    [0x200C, 'ZERO WIDTH NON-JOINER'],
    [0x200D, 'ZERO WIDTH JOINER'],
    [0x200E, 'LEFT-TO-RIGHT MARK'],
    [0x200F, 'RIGHT-TO-LEFT MARK'],
    [0x202A, 'LEFT-TO-RIGHT EMBEDDING'],
    [0x202B, 'RIGHT-TO-LEFT EMBEDDING'],
    [0x202C, 'POP DIRECTIONAL FORMATTING'],
    [0x202D, 'LEFT-TO-RIGHT OVERRIDE'],
    [0x202E, 'RIGHT-TO-LEFT OVERRIDE'],
    [0x2066, 'LEFT-TO-RIGHT ISOLATE'],
    [0x2067, 'RIGHT-TO-LEFT ISOLATE'],
    [0x2068, 'FIRST STRONG ISOLATE'],
    [0x2069, 'POP DIRECTIONAL ISOLATE'],
    [0xFEFF, 'ZERO WIDTH NO-BREAK SPACE']
]);

function toCodePoint(value) {
    return `U+${value.toString(16).toUpperCase().padStart(4, '0')}`;
}

function normalizePath(filePath) {
    return filePath.split(path.sep).join('/');
}

function isAllowed(filePath, root, allowedPaths = DEFAULT_ALLOWED_PATHS) {
    const relativePath = normalizePath(path.relative(root, filePath));

    return allowedPaths.some((allowedPath) => {
        const normalizedAllowedPath = normalizePath(allowedPath).replace(/\/+$/, '');
        return relativePath === normalizedAllowedPath || relativePath.startsWith(`${normalizedAllowedPath}/`);
    });
}

function scanText(text, file = '<text>') {
    const findings = [];
    let line = 1;
    let column = 1;

    for (const char of text) {
        const codePointValue = char.codePointAt(0);

        if (INVISIBLE_CONTROL_NAMES.has(codePointValue)) {
            findings.push({
                file,
                line,
                column,
                codePoint: toCodePoint(codePointValue),
                name: INVISIBLE_CONTROL_NAMES.get(codePointValue)
            });
        }

        if (char === '\n') {
            line += 1;
            column = 1;
        } else {
            column += 1;
        }
    }

    return findings;
}

function collectFiles(targetPath, files = []) {
    if (!fs.existsSync(targetPath)) {
        return files;
    }

    const stat = fs.statSync(targetPath);
    if (stat.isDirectory()) {
        if (DEFAULT_IGNORED_DIRS.has(path.basename(targetPath))) {
            return files;
        }

        for (const entry of fs.readdirSync(targetPath)) {
            collectFiles(path.join(targetPath, entry), files);
        }
        return files;
    }

    if (stat.isFile()) {
        files.push(targetPath);
    }

    return files;
}

function scanRepository(options = {}) {
    const root = options.root || path.resolve(__dirname, '..');
    const targets = options.targets || DEFAULT_TARGETS;
    const allowedPaths = options.allowedPaths || DEFAULT_ALLOWED_PATHS;
    const findings = [];

    for (const target of targets) {
        const targetPath = path.resolve(root, target);
        for (const filePath of collectFiles(targetPath)) {
            if (isAllowed(filePath, root, allowedPaths)) {
                continue;
            }

            const text = fs.readFileSync(filePath, 'utf8');
            findings.push(...scanText(text, filePath));
        }
    }

    return findings;
}

function formatFinding(finding, root = path.resolve(__dirname, '..')) {
    const relativeFile = path.relative(root, finding.file) || finding.file;
    return `${relativeFile}:${finding.line}:${finding.column} ${finding.codePoint} ${finding.name}`;
}

function runFromCli() {
    const root = path.resolve(__dirname, '..');
    const findings = scanRepository({root});

    if (findings.length > 0) {
        console.error('Invisible Unicode control characters found:');
        for (const finding of findings) {
            console.error(`- ${formatFinding(finding, root)}`);
        }
        process.exitCode = 1;
        return;
    }

    console.log('No invisible Unicode control characters found.');
}

if (require.main === module) {
    runFromCli();
}

module.exports = {
    DEFAULT_ALLOWED_PATHS,
    DEFAULT_TARGETS,
    INVISIBLE_CONTROL_NAMES,
    formatFinding,
    scanRepository,
    scanText
};
