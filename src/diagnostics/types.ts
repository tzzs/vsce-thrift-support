import * as vscode from 'vscode';
import {LineRange} from '../utils/line-range';
import {LruCache} from '../utils/optimized-lru-cache';
import * as nodes from '../ast/nodes.types';

export type ThriftIssue = {
    message: string;
    range: vscode.Range;
    severity: vscode.DiagnosticSeverity;
    code?: string;
};

export type BlockCacheValue = {hash: number; issues: ThriftIssue[]};
export type MemberCacheValue = {range: LineRange; hash: number; issues: ThriftIssue[]};
export type BlockAstCacheEntry = {hash: number; node: nodes.ThriftNode};
export type BlockCache = LruCache<string, BlockCacheValue>;
export type MemberCache = LruCache<string, MemberCacheValue>;
export type MemberCacheByBlock = LruCache<string, MemberCache>;
