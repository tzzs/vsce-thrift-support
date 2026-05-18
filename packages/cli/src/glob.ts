/**
 * 文件展开：目录递归 + .thrift 后缀过滤。
 * 零依赖，不使用 glob 库。
 */
import * as fs from 'fs';
import * as path from 'path';

/**
 * 将 CLI 传入的文件路径列表展开为实际文件列表。
 * - 如果路径是文件，直接加入
 * - 如果路径是目录，递归查找 *.thrift 文件
 */
export function expandFiles(patterns: string[]): string[] {
    const files: string[] = [];

    for (const pattern of patterns) {
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

    return [...new Set(files)]; // deduplicate
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
