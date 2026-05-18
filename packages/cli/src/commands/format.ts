/**
 * format 命令：格式化 Thrift IDL 文件。
 */
import * as fs from 'fs';
import {ThriftFormatter} from '@tanzz/thrift-core';
import type {ThriftFormattingOptions} from '@tanzz/thrift-core';
import type {ParsedArgs} from '../args';

const DEFAULT_OPTIONS: ThriftFormattingOptions = {
    trailingComma: 'preserve',
    alignTypes: true,
    alignFieldNames: true,
    alignStructDefaults: false,
    alignAnnotations: true,
    alignComments: true,
    alignEnumNames: true,
    alignEnumEquals: true,
    alignEnumValues: true,
    indentSize: 4,
    maxLineLength: 100,
    collectionStyle: 'preserve',
    insertSpaces: true,
    tabSize: 4,
};

export function runFormat(
    files: string[],
    args: ParsedArgs,
    formatOverrides: Partial<ThriftFormattingOptions>
): number {
    const options: ThriftFormattingOptions = {...DEFAULT_OPTIONS, ...formatOverrides};
    const formatter = new ThriftFormatter();

    // --stdin mode
    if (args.stdin) {
        return formatStdin(formatter, options);
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
            formatted = formatter.format(content, options);
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

function formatStdin(formatter: ThriftFormatter, options: ThriftFormattingOptions): number {
    const chunks: Buffer[] = [];
    const buf = Buffer.alloc(65536);
    let bytesRead: number;
    while ((bytesRead = fs.readSync(process.stdin.fd, buf, 0, buf.length, null)) > 0) {
        chunks.push(buf.subarray(0, bytesRead));
    }

    const content = Buffer.concat(chunks).toString('utf-8');
    try {
        const formatted = formatter.format(content, options);
        process.stdout.write(formatted);
        return 0;
    } catch (error) {
        process.stderr.write(`Error: Formatting failed: ${error instanceof Error ? error.message : String(error)}\n`);
        return 3;
    }
}
