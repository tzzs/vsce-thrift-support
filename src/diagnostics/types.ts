import * as vscode from 'vscode';
import { LineRange } from '../utils/line-range';
import { LruCache } from '../utils/lru-cache';

export type ThriftIssue = {
    message: string;
    range: vscode.Range;
    severity: vscode.DiagnosticSeverity;
    code?: string;
};

export type BlockCacheValue = { hash: number; issues: ThriftIssue[] };
export type MemberCacheValue = { range: LineRange; hash: number; issues: ThriftIssue[] };
export type BlockCache = LruCache<string, BlockCacheValue>;
export type MemberCache = LruCache<string, MemberCacheValue>;
export type MemberCacheByBlock = LruCache<string, MemberCache>;
