/**
 * 配置文件查找与解析。
 * 支持 .thriftrc.json 向上查找，与 VS Code thrift.format.* 设置一致。
 */
import * as fs from 'fs';
import * as path from 'path';
import type {DiagnosticsRuleOptions, ThriftFormattingOptions} from '@tanzz/thrift-core';

const CONFIG_FILENAME = '.thriftrc.json';
const TOP_LEVEL_KEYS = new Set(['format', 'lint', 'diagnostics']);
const FORMAT_KEYS = new Set([
    'indentSize',
    'maxLineLength',
    'trailingComma',
    'collectionStyle',
    'alignTypes',
    'alignNames',
    'alignAssignments',
    'alignStructDefaults',
    'alignAnnotations',
    'alignComments'
]);
const LINT_KEYS = new Set(['severity']);
const DIAGNOSTICS_KEYS = new Set(['rules']);

export interface ThriftCliConfig {
    format?: Partial<ThriftFormattingOptions>;
    lint?: {
        severity?: 'error' | 'warning' | 'all';
    };
    diagnostics?: DiagnosticsRuleOptions;
}

/**
 * 从指定目录向上查找 .thriftrc.json
 */
export function findConfigFile(startDir: string): string | null {
    let dir = path.resolve(startDir);
    const root = path.parse(dir).root;

    while (true) {
        const candidate = path.join(dir, CONFIG_FILENAME);
        if (fs.existsSync(candidate)) {
            return candidate;
        }
        const parent = path.dirname(dir);
        if (parent === dir || dir === root) {
            return null;
        }
        dir = parent;
    }
}

/**
 * 读取并解析配置文件
 */
export function loadConfig(configPath: string): ThriftCliConfig {
    try {
        const content = fs.readFileSync(configPath, 'utf-8');
        const parsed = JSON.parse(content) as ThriftCliConfig;
        warnUnknownConfigKeys(parsed, configPath);
        return parsed;
    } catch (error) {
        process.stderr.write(`Warning: Failed to read config file ${configPath}: ${error instanceof Error ? error.message : String(error)}\n`);
        return {};
    }
}

function warnUnknownConfigKeys(config: ThriftCliConfig, configPath: string): void {
    warnUnknownKeys(Object.keys(config), TOP_LEVEL_KEYS, configPath);
    warnUnknownKeys(Object.keys(config.format ?? {}), FORMAT_KEYS, configPath, 'format');
    warnUnknownKeys(Object.keys(config.lint ?? {}), LINT_KEYS, configPath, 'lint');
    warnUnknownKeys(Object.keys(config.diagnostics ?? {}), DIAGNOSTICS_KEYS, configPath, 'diagnostics');
}

function warnUnknownKeys(keys: string[], knownKeys: Set<string>, configPath: string, section?: string): void {
    for (const key of keys) {
        if (knownKeys.has(key)) {
            continue;
        }
        const fullKey = section === undefined ? key : `${section}.${key}`;
        process.stderr.write(`Warning: Unknown config key "${fullKey}" in ${configPath}\n`);
    }
}

/**
 * 解析配置文件中的 format 选项为 ThriftFormattingOptions
 */
export function resolveFormatOptions(
    config: ThriftCliConfig,
    overrides: {
        indentSize?: number;
        maxLineLength?: number;
        trailingComma?: 'preserve' | 'add' | 'remove';
        collectionStyle?: 'preserve' | 'multiline' | 'auto';
    }
): Partial<ThriftFormattingOptions> {
    const base = config.format ?? {};
    const result: Partial<ThriftFormattingOptions> = {...base};

    // CLI flags override config file
    if (overrides.indentSize !== undefined) {result.indentSize = overrides.indentSize;}
    if (overrides.maxLineLength !== undefined) {result.maxLineLength = overrides.maxLineLength;}
    if (overrides.trailingComma !== undefined) {result.trailingComma = overrides.trailingComma;}
    if (overrides.collectionStyle !== undefined) {result.collectionStyle = overrides.collectionStyle;}

    return result;
}
