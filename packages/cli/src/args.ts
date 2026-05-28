/**
 * 手写 CLI 参数解析器 — 零依赖，约 150 行。
 */

export type Command = 'format' | 'lint' | 'parse' | 'symbols' | 'help' | 'version';

export interface ParsedArgs {
    command: Command;
    files: string[];
    // Global
    help: boolean;
    version: boolean;
    // Format
    check: boolean;
    write: boolean;
    stdin: boolean;
    stdinFilepath?: string;
    indentSize?: number;
    maxLineLength?: number;
    trailingComma?: 'preserve' | 'add' | 'remove';
    collectionStyle?: 'preserve' | 'multiline' | 'auto';
    // Lint
    severity?: 'error' | 'warning' | 'all';
    json: boolean;
    includePaths: string[];
    quiet: boolean;
    // Symbols
    flat: boolean;
    // Config
    configPath?: string;
}

const COMMANDS = new Set<string>(['format', 'lint', 'parse', 'symbols']);
const TRAILING_COMMA_VALUES = new Set(['preserve', 'add', 'remove']);
const COLLECTION_STYLE_VALUES = new Set(['preserve', 'multiline', 'auto']);
const SEVERITY_VALUES = new Set(['error', 'warning', 'all']);

function parseError(message: string): never {
    process.stderr.write(`Error: ${message}\n`);
    process.stderr.write('Run "thrift-support --help" for usage information.\n');
    process.exit(2);
}

function consumeNextArg(args: string[], i: number, flag: string): string {
    if (i + 1 >= args.length) {
        parseError(`${flag} requires a value`);
    }
    return args[i + 1];
}

export function parseArgs(argv: string[]): ParsedArgs {
    // Strip node + script path
    const args = argv.slice(2);

    const result: ParsedArgs = {
        command: 'help',
        files: [],
        help: false,
        version: false,
        check: false,
        write: false,
        stdin: false,
        json: false,
        quiet: false,
        flat: false,
        includePaths: [],
    };

    if (args.length === 0) {
        result.help = true;
        return result;
    }

    // Check for --help / --version before command
    if (args[0] === '--help' || args[0] === '-h') {
        result.help = true;
        return result;
    }
    if (args[0] === '--version' || args[0] === '-v' || args[0] === '-V') {
        result.command = 'version';
        result.version = true;
        return result;
    }

    // First non-flag arg is the command
    if (COMMANDS.has(args[0])) {
        result.command = args[0] as Command;
    } else if (args[0].startsWith('-')) {
        parseError(`Unknown flag "${args[0]}" before command`);
    } else {
        parseError(`Unknown command "${args[0]}". Available: format, lint, parse, symbols`);
    }

    let i = 1;
    while (i < args.length) {
        const arg = args[i];
        switch (arg) {
            case '--help':
            case '-h':
                result.help = true;
                break;
            case '--version':
            case '-v':
            case '-V':
                result.version = true;
                result.command = 'version';
                break;
            case '--check':
                result.check = true;
                break;
            case '--write':
            case '-w':
                result.write = true;
                break;
            case '--stdin':
                result.stdin = true;
                break;
            case '--stdin-filepath': {
                result.stdinFilepath = consumeNextArg(args, i, '--stdin-filepath');
                i++;
                break;
            }
            case '--indent-size': {
                const val = parseInt(consumeNextArg(args, i, '--indent-size'), 10);
                if (isNaN(val) || val < 1) {parseError('--indent-size must be a positive integer');}
                result.indentSize = val;
                i++;
                break;
            }
            case '--max-line-length': {
                const val = parseInt(consumeNextArg(args, i, '--max-line-length'), 10);
                if (isNaN(val) || val < 1) {parseError('--max-line-length must be a positive integer');}
                result.maxLineLength = val;
                i++;
                break;
            }
            case '--trailing-comma': {
                const val = consumeNextArg(args, i, '--trailing-comma');
                if (!TRAILING_COMMA_VALUES.has(val)) {parseError(`--trailing-comma must be one of: preserve, add, remove`);}
                result.trailingComma = val as 'preserve' | 'add' | 'remove';
                i++;
                break;
            }
            case '--collection-style': {
                const val = consumeNextArg(args, i, '--collection-style');
                if (!COLLECTION_STYLE_VALUES.has(val)) {parseError(`--collection-style must be one of: preserve, multiline, auto`);}
                result.collectionStyle = val as 'preserve' | 'multiline' | 'auto';
                i++;
                break;
            }
            case '--severity': {
                const val = consumeNextArg(args, i, '--severity');
                if (!SEVERITY_VALUES.has(val)) {parseError(`--severity must be one of: error, warning, all`);}
                result.severity = val as 'error' | 'warning' | 'all';
                i++;
                break;
            }
            case '--json':
                result.json = true;
                break;
            case '--include-path': {
                result.includePaths.push(consumeNextArg(args, i, '--include-path'));
                i++;
                break;
            }
            case '--quiet':
            case '-q':
                result.quiet = true;
                break;
            case '--flat':
                result.flat = true;
                break;
            case '--config': {
                result.configPath = consumeNextArg(args, i, '--config');
                i++;
                break;
            }
            default:
                if (arg.startsWith('-')) {
                    parseError(`Unknown option "${arg}" for command "${result.command}"`);
                }
                result.files.push(arg);
                break;
        }
        i++;
    }

    return result;
}
