/**
 * parse 命令：解析 Thrift 文件并输出 AST（JSON 格式）。
 */
import * as fs from 'fs';
import {ThriftParser} from '@tanzz/thrift-core';
import type {ParsedArgs} from '../args';

export function runParse(files: string[], args: ParsedArgs): number {
    // --stdin mode
    if (args.stdin) {
        return parseStdin();
    }

    if (files.length === 0) {
        process.stderr.write('Error: No files specified.\n');
        return 2;
    }

    const results: object[] = [];

    for (const filePath of files) {
        let content: string;
        try {
            content = fs.readFileSync(filePath, 'utf-8');
        } catch (error) {
            process.stderr.write(`Error: Cannot read "${filePath}": ${error instanceof Error ? error.message : String(error)}\n`);
            return 3;
        }

        try {
            const ast = new ThriftParser(content).parse();
            if (files.length === 1) {
                process.stdout.write(JSON.stringify(ast, astReplacer, 2) + '\n');
            } else {
                results.push({file: filePath, ast: JSON.parse(JSON.stringify(ast, astReplacer))});
            }
        } catch (error) {
            process.stderr.write(`Error: Parse failed for "${filePath}": ${error instanceof Error ? error.message : String(error)}\n`);
            return 3;
        }
    }

    if (files.length > 1) {
        process.stdout.write(JSON.stringify(results, null, 2) + '\n');
    }

    return 0;
}

function parseStdin(): number {
    const chunks: Buffer[] = [];
    const fd = fs.openSync('/dev/stdin', 'r');
    const buf = Buffer.alloc(65536);
    let bytesRead: number;
    while ((bytesRead = fs.readSync(fd, buf, 0, buf.length, null)) > 0) {
        chunks.push(buf.subarray(0, bytesRead));
    }
    fs.closeSync(fd);

    const content = Buffer.concat(chunks).toString('utf-8');
    try {
        const ast = new ThriftParser(content).parse();
        process.stdout.write(JSON.stringify(ast, astReplacer, 2) + '\n');
        return 0;
    } catch (error) {
        process.stderr.write(`Error: Parse failed: ${error instanceof Error ? error.message : String(error)}\n`);
        return 3;
    }
}

/**
 * JSON replacer that removes circular `parent` references from AST nodes.
 */
function astReplacer(key: string, value: unknown): unknown {
    if (key === 'parent') return undefined;
    return value;
}
