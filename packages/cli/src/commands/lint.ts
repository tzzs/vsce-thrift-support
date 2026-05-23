/**
 * lint 命令：运行诊断规则，检查语法和语义错误。
 */
import * as fs from 'fs';
import * as path from 'path';
import {ThriftParser, analyzeThriftAst, collectTypesFromAst, DiagnosticSeverity} from '@tanzz/thrift-core';
import type {ThriftIssue} from '@tanzz/thrift-core';
import type {ParsedArgs} from '../args';
import {formatIssuesText, formatIssuesJson} from '../output';

export function runLint(files: string[], args: ParsedArgs): number {
    if (files.length === 0) {
        process.stderr.write('Error: No files specified.\n');
        return 2;
    }

    const severityFilter = args.severity ?? 'all';
    let totalIssues = 0;
    const allJsonIssues: object[] = [];

    for (const filePath of files) {
        let content: string;
        try {
            content = fs.readFileSync(filePath, 'utf-8');
        } catch (error) {
            process.stderr.write(`Error: Cannot read "${filePath}": ${error instanceof Error ? error.message : String(error)}\n`);
            return 3;
        }

        let issues: ThriftIssue[];
        try {
            // Resolve include types if include-path is specified
            const includedTypes = resolveIncludeTypes(content, filePath, args.includePaths);
            const lines = content.split('\n');
            const ast = ThriftParser.parseContentWithCache(filePath, content);
            issues = analyzeThriftAst(ast, lines, includedTypes);
        } catch (error) {
            process.stderr.write(`Error: Analysis failed for "${filePath}": ${error instanceof Error ? error.message : String(error)}\n`);
            return 3;
        }

        // Filter by severity
        if (severityFilter !== 'all') {
            const targetSeverity = severityFilter === 'error' ? DiagnosticSeverity.Error : DiagnosticSeverity.Warning;
            issues = issues.filter(issue => issue.severity <= targetSeverity);
        }

        if (issues.length === 0) continue;
        totalIssues += issues.length;

        if (args.json) {
            allJsonIssues.push(...formatIssuesJson(filePath, issues));
        } else if (!args.quiet) {
            process.stdout.write(formatIssuesText(filePath, issues) + '\n');
        }
    }

    if (args.json) {
        process.stdout.write(JSON.stringify(allJsonIssues, null, 2) + '\n');
    }

    if (!args.quiet && !args.json && totalIssues > 0) {
        process.stderr.write(`\n${totalIssues} issue(s) found.\n`);
    }

    return totalIssues > 0 ? 1 : 0;
}

/**
 * 从 include 搜索路径中解析 include 文件的类型。
 */
function resolveIncludeTypes(
    content: string,
    filePath: string,
    includePaths: string[]
): Map<string, string> | undefined {
    const includedTypes = new Map<string, string>();
    const includeRegex = /^\s*include\s+["']([^"']+)["']/gm;
    let match;

    while ((match = includeRegex.exec(content)) !== null) {
        const includeName = match[1];
        const alias = path.basename(includeName, '.thrift');

        // Search in include paths and current file's directory
        const searchDirs = [path.dirname(filePath), ...includePaths];
        for (const dir of searchDirs) {
            const resolvedPath = path.resolve(dir, includeName);
            if (fs.existsSync(resolvedPath)) {
                try {
                    const includeContent = fs.readFileSync(resolvedPath, 'utf-8');
                    const ast = ThriftParser.parseContentWithCache(resolvedPath, includeContent);
                    const types = collectTypesFromAst(ast);
                    for (const [name, kind] of types) {
                        includedTypes.set(`${alias}.${name}`, kind);
                    }
                } catch {
                    // Skip unreadable include files
                }
                break;
            }
        }
    }

    return includedTypes.size > 0 ? includedTypes : undefined;
}
