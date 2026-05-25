import * as path from 'path';

/**
 * 安全解析 include 路径，确保 resolved 路径不会逃逸出 boundaryDir。
 * @param includePath - include 指令中的路径（可能包含 .. 遍历）
 * @param resolveFrom - 解析相对路径的基准目录（通常是 include 文件的所在目录）
 * @param boundaryDir - 边界检查目录，resolved 路径必须在此目录内（默认与 resolveFrom 相同）
 * @returns 安全解析后的绝对路径，若路径逃逸则返回 undefined
 */
export function safeResolveIncludePath(
    includePath: string,
    resolveFrom: string,
    boundaryDir: string = resolveFrom
): string | undefined {
    if (path.isAbsolute(includePath)) {
        const resolved = path.normalize(includePath);
        if (!isWithinDir(resolved, boundaryDir)) {
            return undefined;
        }
        return resolved;
    }
    const resolved = path.normalize(path.resolve(resolveFrom, includePath));
    if (!isWithinDir(resolved, boundaryDir)) {
        return undefined;
    }
    return resolved;
}

function isWithinDir(target: string, dir: string): boolean {
    const normalizedDir = path.normalize(dir) + path.sep;
    return target.startsWith(normalizedDir) || target === path.normalize(dir);
}
