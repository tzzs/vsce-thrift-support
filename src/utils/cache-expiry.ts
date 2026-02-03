export function isExpired(timestamp: number, ttlMs: number, now: number = Date.now()): boolean {
    if (ttlMs <= 0) {
        return false;
    }
    return now - timestamp > ttlMs;
}

export function isFresh(timestamp: number, ttlMs: number, now: number = Date.now()): boolean {
    return !isExpired(timestamp, ttlMs, now);
}
