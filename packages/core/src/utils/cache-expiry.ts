import * as crypto from 'crypto';

export function isExpired(timestamp: number, ttlMs: number, now: number = Date.now()): boolean {
    if (ttlMs <= 0) {
        return false;
    }
    return now - timestamp > ttlMs;
}

export function isFresh(timestamp: number, ttlMs: number, now: number = Date.now()): boolean {
    return !isExpired(timestamp, ttlMs, now);
}

/**
 * 生成内容哈希，用于验证缓存数据一致性
 * @param content 要哈希的内容
 * @param useCrypto 是否使用 crypto 模块（更安全但稍慢）
 * @returns 哈希值（十六进制字符串）
 */
export function hashContent(content: string, useCrypto: boolean = true): string {
    if (useCrypto) {
        // 使用 crypto 模块生成 SHA-256 哈希（更安全）
        try {
            return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
        } catch {
            // 如果 crypto 不可用，回退到简单哈希
        }
    }

    // 使用简单的字符串哈希算法（DJB2）作为回退
    let hash = 5381;
    for (let i = 0; i < content.length; i++) {
        hash = (hash * 33) ^ content.charCodeAt(i);
    }
    return (hash >>> 0).toString(16);
}
