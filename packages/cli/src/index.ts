/**
 * thrift-support CLI 入口点。
 * 统一命令行工具：format / lint / parse / symbols
 */
import * as path from 'path';
import {parseArgs} from './args';
import {findConfigFile, loadConfig, resolveFormatOptions} from './config';
import {expandFiles} from './glob';
import {runFormat} from './commands/format';
import {runLint} from './commands/lint';
import {runParse} from './commands/parse';
import {runSymbols} from './commands/symbols';

declare const CLI_VERSION: string;
const VERSION = typeof CLI_VERSION !== 'undefined' ? CLI_VERSION : '0.0.0';
const HELP_TEXT = `
thrift-support v${VERSION}
CLI tool for Apache Thrift IDL: format, lint, parse, symbols

Usage:
  thrift-support <command> [options] <files...>

Commands:
  format    Format Thrift IDL files
  lint      Run diagnostic rules (syntax + semantic checks)
  parse     Parse and output AST (JSON)
  symbols   List defined symbols

Global Options:
  --help, -h       Show help
  --version, -v    Show version
  --config <path>  Specify config file path

Format Options:
  --check                 Check mode: exit 1 if unformatted files found
  --write, -w             Write formatted output back to files
  --stdin                 Read from stdin, output to stdout
  --stdin-filepath <p>    Used with --stdin for config file lookup
  --indent-size <n>       Indent size (default: 4)
  --max-line-length <n>   Max line length (default: 100)
  --trailing-comma <m>    preserve | add | remove
  --collection-style <m>  preserve | multiline | auto

Lint Options:
  --severity <level>      error | warning | all (default: all)
  --json                  JSON output
  --include-path <dir>    Include search path (can be repeated)
  --quiet, -q             Only output when issues found

Parse Options:
  --stdin                 Read from stdin

Symbols Options:
  --json                  JSON output
  --flat                  Flat output (no nesting)

Examples:
  thrift-support format --check src/**/*.thrift
  thrift-support format --write src/
  thrift-support lint --severity error src/**/*.thrift
  thrift-support parse service.thrift | jq '.body[0]'
  thrift-support symbols --json service.thrift

Exit Codes:
  0  Success
  1  Lint errors / format --check found unformatted files
  2  Usage error (invalid arguments, missing files)
  3  Internal error (parse failure, I/O error)
`.trim();

function main(): void {
    const args = parseArgs(process.argv);

    if (args.version) {
        process.stdout.write(`thrift-support v${VERSION}\n`);
        process.exit(0);
    }

    if (args.help) {
        process.stdout.write(HELP_TEXT + '\n');
        process.exit(0);
    }

    // Load config
    const configPath = args.configPath ?? findConfigFile(
        args.files.length > 0
            ? path.dirname(path.resolve(args.files[0]))
            : process.cwd()
    );
    const config = configPath ? loadConfig(configPath) : {};

    // Expand file patterns
    const files = args.stdin ? [] : expandFiles(args.files);

    let exitCode: number;

    switch (args.command) {
        case 'format': {
            const formatOpts = resolveFormatOptions(config, {
                indentSize: args.indentSize,
                maxLineLength: args.maxLineLength,
                trailingComma: args.trailingComma,
                collectionStyle: args.collectionStyle,
            });
            exitCode = runFormat(files, args, formatOpts);
            break;
        }
        case 'lint':
            exitCode = runLint(files, args);
            break;
        case 'parse':
            exitCode = runParse(files, args);
            break;
        case 'symbols':
            exitCode = runSymbols(files, args);
            break;
        default:
            process.stderr.write(HELP_TEXT + '\n');
            exitCode = 2;
    }

    process.exit(exitCode);
}

main();
