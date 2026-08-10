/**
 * format 命令：格式化 Thrift IDL 文件。
 * 支持整文件与 --range 部分格式化。
 */
import * as fs from 'fs';
import {
    computeFormattingContext,
    normalizeFormattingOptions,
    ThriftFormatter,
    ThriftFormattingOptions
} from '@tanzz/thrift-core';
import type {ThriftFormattingConfigInput} from '@tanzz/thrift-core';
import type {ParsedArgs} from '../args';

export function runFormat(
    files: string[],
    args: ParsedArgs,
    formatOverrides: ThriftFormattingConfigInput
): number {
    const options = normalizeFormattingOptions(formatOverrides);
    const formatter = new ThriftFormatter();

    // --stdin mode
    if (args.stdin) {
        if (args.write) {
            process.stderr.write('Error: --write cannot be used with --stdin.\n');
            return 2;
        }
        return formatStdin(formatter, options, args);
    }

    if (files.length === 0) {
        process.stderr.write('Error: No files specified.\n');
        return 2;
    }

    let hasUnformatted = false;

    for (const filePath of files) {
        let content: string;
        try {
            content = fs.readFileSync(filePath, 'utf-8');
        } catch (error) {
            process.stderr.write(`Error: Cannot read "${filePath}": ${error instanceof Error ? error.message : String(error)}\n`);
            return 3;
        }

        let formatted: string;
        try {
            formatted = args.range !== undefined
                ? formatRange(formatter, content, options, args.range, filePath)
                : formatter.format(content, options);
        } catch (error) {
            process.stderr.write(`Error: Formatting failed for "${filePath}": ${error instanceof Error ? error.message : String(error)}\n`);
            return 3;
        }

        if (args.check) {
            // --check mode: exit 1 if any file needs formatting
            if (formatted !== content) {
                process.stdout.write(`${filePath}\n`);
                hasUnformatted = true;
            }
        } else if (args.write) {
            // --write mode: write back to file
            if (formatted !== content) {
                fs.writeFileSync(filePath, formatted, 'utf-8');
                process.stderr.write(`Formatted: ${filePath}\n`);
            }
        } else {
            // Default: output to stdout
            process.stdout.write(formatted);
            if (!formatted.endsWith('\n')) {
                process.stdout.write('\n');
            }
        }
    }

    return hasUnformatted ? 1 : 0;
}

/**
 * 部分格式化：只格式化 [startLine, endLine]（0-based，含两端）内的文本，
 * 其余内容原样保留。起始上下文由 range 之前的文本推导，与 VS Code
 * "Format Selection" 行为一致。
 */
function formatRange(
    formatter: ThriftFormatter,
    content: string,
    options: ThriftFormattingOptions,
    range: {startLine: number; endLine: number},
    filePath: string
): string {
    const lines = content.split(/\r?\n/);
    const lastLine = Math.max(0, lines.length - 1);

    // 请求的 range 完全超出文件范围时无操作，避免误格式化最后一行
    if (range.startLine > lastLine) {
        return content;
    }

    const startLine = Math.max(0, range.startLine);
    const endLine = Math.max(startLine, Math.min(range.endLine, lastLine));

    // 上下文推导：解析 range 起始行之前（不含该行）的文本，
    // 与 VS Code 非缓存路径（getText(0,0 → start)）语义一致
    const beforeContent = lines.slice(0, startLine).join('\n');
    const initialContext = computeFormattingContext(beforeContent, Math.max(0, startLine - 1), `file://${filePath}#range`);

    const rangeText = lines.slice(startLine, endLine + 1).join('\n');
    const formattedRange = formatter.format(rangeText, {...options, initialContext});

    const result = [
        ...lines.slice(0, startLine),
        ...formattedRange.split('\n'),
        ...lines.slice(endLine + 1)
    ];
    return result.join('\n');
}

function formatStdin(formatter: ThriftFormatter, options: ThriftFormattingOptions, args: ParsedArgs): number {
    const chunks: Buffer[] = [];
    const buf = Buffer.alloc(65536);
    let bytesRead: number;
    while ((bytesRead = fs.readSync(process.stdin.fd, buf, 0, buf.length, null)) > 0) {
        chunks.push(buf.subarray(0, bytesRead));
    }

    const content = Buffer.concat(chunks).toString('utf-8');
    try {
        const formatted = args.range !== undefined
            ? formatRange(formatter, content, options, args.range, args.stdinFilepath ?? '<stdin>')
            : formatter.format(content, options);
        if (args.check) {
            if (formatted !== content) {
                process.stderr.write('<stdin>: unformatted\n');
                return 1;
            }
            return 0;
        }
        process.stdout.write(formatted);
        return 0;
    } catch (error) {
        process.stderr.write(`Error: Formatting failed: ${error instanceof Error ? error.message : String(error)}\n`);
        return 3;
    }
}
