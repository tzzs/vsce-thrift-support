export interface LineRangeKey {
    startLine: number;
    endLine: number;
}

export function makeLineRangeKey(range: LineRangeKey): string {
    return `${range.startLine}-${range.endLine}`;
}

export function makeUriRangeKey(uri: string, range: LineRangeKey): string {
    return `${uri}:${makeLineRangeKey(range)}`;
}

/**
 * 计算内容哈希（简单的非加密哈希）
 * @param content 要哈希的内容
 * @returns 哈希值（32位整数）
 */
export function hashContent(content: string): number {
    let hash = 0;
    if (content.length === 0) return hash;

    for (let i = 0; i < content.length; i++) {
        const char = content.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return hash;
}

/**
 * 生成带内容哈希的 URI 键
 * 格式: uri@hash:version（如果提供）
 * @param uri 文档 URI
 * @param content 文档内容
 * @param version 版本号（可选）
 * @returns 缓存键
 */
export function makeUriContentKey(uri: string, content: string, version?: number): string {
    const hash = hashContent(content);
    return version !== undefined ? `${uri}@${hash}:${version}` : `${uri}@${hash}`;
}
