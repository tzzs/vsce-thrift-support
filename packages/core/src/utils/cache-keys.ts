import {hashContent} from './cache-expiry';

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
 * 生成带内容哈希的 URI 键
 * 格式: uri@hash:version（如果提供）
 * @param uri 文档 URI
 * @param content 文档内容
 * @param version 版本号（可选）
 * @returns 缓存键
 */
export function makeUriContentKey(uri: string, content: string, version?: number): string {
    // 使用 crypto 哈希以提高安全性，避免哈希冲突
    const hash = hashContent(content, true);
    return version !== undefined ? `${uri}@${hash}:${version}` : `${uri}@${hash}`;
}
