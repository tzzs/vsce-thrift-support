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
