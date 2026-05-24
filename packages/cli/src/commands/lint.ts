/**
 * lint 命令：运行诊断规则，检查语法和语义错误。
 */
import * as fs from 'fs';
import * as path from 'path';
import {ThriftParser, analyzeThriftAst, collectTypesFromAst, collectIncludes, DiagnosticSeverity} from '@tanzz/thrift-core';
import type {ThriftIssue} from '@tanzz/thrift-core';
import type {ParsedArgs} from '../args';
import type {ThriftCliConfig} from '../config';
import {formatIssuesText, formatIssuesJson} from '../output';

export function runLint(files: string[], args: ParsedArgs, config: ThriftCliConfig = {}): number {
    if (files.length === 0) {
        process.stderr.write('Error: No files specified.\n');
        return 2;
    }

    const severityFilter = args.severity ?? config.lint?.severity ?? 'all';
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
            const lines = content.split('\n');
            const ast = ThriftParser.parseContentWithCache(filePath, content);
            const includedTypes = resolveIncludeTypes(ast, filePath, args.includePaths);
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

        if (issues.length === 0) {continue;}
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
 * 从 AST include 节点中解析 include 文件的类型。
 * 使用 AST 而非原始正则，以避免匹配注释中的 include 指令。
 */
function resolveIncludeTypes(
    ast: ReturnType<typeof ThriftParser.parseContentWithCache>,
    filePath: string,
    includePaths: string[]
): Map<string, string> | undefined {
    const includedTypes = new Map<string, string>();
    const searchDirs = [path.dirname(filePath), ...includePaths];

    for (const includeNode of collectIncludes(ast)) {
        const includeName = includeNode.path;
        const alias = path.basename(includeName, '.thrift');

        for (const dir of searchDirs) {
            const resolvedPath = path.resolve(dir, includeName);
            if (fs.existsSync(resolvedPath)) {
                try {
                    const includeContent = fs.readFileSync(resolvedPath, 'utf-8');
                    const includeAst = ThriftParser.parseContentWithCache(resolvedPath, includeContent);
                    const types = collectTypesFromAst(includeAst);
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
