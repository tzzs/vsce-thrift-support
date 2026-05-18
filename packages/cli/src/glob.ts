/**
 * 文件展开：目录递归 + glob 模式匹配 + .thrift 后缀过滤。
 * 零依赖，不使用 glob 库。支持基本 glob 模式：
 *   - *    匹配路径段内任意字符
 *   - **   递归匹配任意子目录
 *   - ?    匹配单个字符
 */
import * as fs from 'fs';
import * as path from 'path';

/**
 * 将 CLI 传入的文件路径/模式列表展开为实际文件列表。
 * - 如果路径是文件，直接加入
 * - 如果路径是目录，递归查找 *.thrift 文件
 * - 如果路径包含 glob 字符（* ?），执行模式匹配
 */
export function expandFiles(patterns: string[]): string[] {
    const files: string[] = [];

    for (const pattern of patterns) {
        if (isGlobPattern(pattern)) {
            expandGlob(pattern, files);
        } else {
            const resolved = path.resolve(pattern);

            if (!fs.existsSync(resolved)) {
                process.stderr.write(`Warning: "${pattern}" does not exist, skipping.\n`);
                continue;
            }

            const stat = fs.statSync(resolved);
            if (stat.isFile()) {
                files.push(resolved);
            } else if (stat.isDirectory()) {
                collectThriftFiles(resolved, files);
            }
        }
    }

    return [...new Set(files)]; // deduplicate
}

function isGlobPattern(p: string): boolean {
    return p.includes('*') || p.includes('?');
}

/**
 * 展开 glob 模式。
 * 将模式拆分为固定前缀（不含通配符的最长路径）和 glob 后缀，
 * 然后从前缀目录递归匹配。
 */
function expandGlob(pattern: string, result: string[]): void {
    const normalized = pattern.replace(/\\/g, '/');
    const parts = normalized.split('/');

    // Find the first segment with a glob character
    let prefixEnd = 0;
    while (prefixEnd < parts.length && !isGlobPattern(parts[prefixEnd])) {
        prefixEnd++;
    }

    const prefixParts = parts.slice(0, prefixEnd);
    const globParts = parts.slice(prefixEnd);

    const baseDir = path.resolve(prefixParts.length > 0 ? prefixParts.join('/') : '.');

    if (!fs.existsSync(baseDir) || !fs.statSync(baseDir).isDirectory()) {
        return;
    }

    matchGlob(baseDir, globParts, 0, result);
}

function matchGlob(dir: string, globParts: string[], partIndex: number, result: string[]): void {
    if (partIndex >= globParts.length) {
        return;
    }

    const segment = globParts[partIndex];
    const isLast = partIndex === globParts.length - 1;

    if (segment === '**') {
        // ** matches zero or more directories
        // Try matching the rest from current directory (zero dirs matched)
        if (partIndex + 1 < globParts.length) {
            matchGlob(dir, globParts, partIndex + 1, result);
        }

        // Recurse into subdirectories
        let entries: fs.Dirent[];
        try {
            entries = fs.readdirSync(dir, {withFileTypes: true});
        } catch {
            return;
        }

        for (const entry of entries) {
            if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                // Continue matching ** from this subdirectory
                matchGlob(fullPath, globParts, partIndex, result);
            } else if (entry.isFile() && isLast) {
                // ** as last segment matches files too
                result.push(fullPath);
            }
        }
    } else {
        // Normal segment with possible * or ? wildcards
        const regex = globSegmentToRegex(segment);

        let entries: fs.Dirent[];
        try {
            entries = fs.readdirSync(dir, {withFileTypes: true});
        } catch {
            return;
        }

        for (const entry of entries) {
            if (!regex.test(entry.name)) continue;
            const fullPath = path.join(dir, entry.name);

            if (isLast) {
                if (entry.isFile()) {
                    result.push(fullPath);
                } else if (entry.isDirectory()) {
                    // Pattern ended with a directory match — collect .thrift files
                    collectThriftFiles(fullPath, result);
                }
            } else {
                if (entry.isDirectory()) {
                    matchGlob(fullPath, globParts, partIndex + 1, result);
                }
            }
        }
    }
}

/**
 * Convert a glob segment (e.g. "*.thrift") to a regex.
 * * → [^/]* (any chars except path separator)
 * ? → [^/]  (single char)
 */
function globSegmentToRegex(segment: string): RegExp {
    let regex = '^';
    for (const ch of segment) {
        if (ch === '*') {
            regex += '[^/]*';
        } else if (ch === '?') {
            regex += '[^/]';
        } else if ('.+^${}()|[]\\'.includes(ch)) {
            regex += '\\' + ch;
        } else {
            regex += ch;
        }
    }
    regex += '$';
    return new RegExp(regex);
}

function collectThriftFiles(dir: string, result: string[]): void {
    let entries: fs.Dirent[];
    try {
        entries = fs.readdirSync(dir, {withFileTypes: true});
    } catch {
        return; // skip unreadable directories
    }

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            // Skip hidden dirs and node_modules
            if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
            collectThriftFiles(fullPath, result);
        } else if (entry.isFile() && entry.name.endsWith('.thrift')) {
            result.push(fullPath);
        }
    }
}
