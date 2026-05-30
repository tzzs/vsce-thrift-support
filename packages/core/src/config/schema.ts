import type {DiagnosticsRuleOptions} from '../diagnostics/rules/registry';
import type {ThriftFormattingOptions} from '../interfaces.types';

type SharedConfigType = 'boolean' | 'number' | 'string' | 'object';

interface SharedConfigEntry<T = unknown> {
    type: SharedConfigType;
    default?: T;
    enum?: readonly T[];
    min?: number;
    max?: number;
}

type SharedConfigSection = Record<string, SharedConfigEntry>;

export interface SharedConfigSchema {
    format: SharedConfigSection;
    lint: SharedConfigSection;
    diagnostics: SharedConfigSection;
}

export interface SharedConfigValidationResult {
    valid: boolean;
    error?: string;
}

export interface SharedThriftConfig {
    format?: Partial<ThriftFormattingOptions> & {
        alignNames?: boolean;
        alignAssignments?: boolean;
        alignFieldNames?: boolean;
        alignEnumNames?: boolean;
        alignEnumEquals?: boolean;
        alignEnumValues?: boolean;
        alignStructAnnotations?: boolean;
    };
    lint?: {
        severity?: 'error' | 'warning' | 'all';
    };
    diagnostics?: DiagnosticsRuleOptions;
}

export const DEFAULT_FORMAT_CONFIG: ThriftFormattingOptions = {
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
    tabSize: 4
};

export const SHARED_CONFIG_SCHEMA: SharedConfigSchema = {
    format: {
        trailingComma: {type: 'string', default: 'preserve', enum: ['preserve', 'add', 'remove']},
        alignTypes: {type: 'boolean', default: true},
        alignNames: {type: 'boolean', default: true},
        alignAssignments: {type: 'boolean', default: true},
        alignFieldNames: {type: 'boolean', default: true},
        alignStructDefaults: {type: 'boolean', default: false},
        alignAnnotations: {type: 'boolean', default: true},
        alignStructAnnotations: {type: 'boolean', default: true},
        alignComments: {type: 'boolean', default: true},
        alignEnumNames: {type: 'boolean', default: true},
        alignEnumEquals: {type: 'boolean', default: true},
        alignEnumValues: {type: 'boolean', default: true},
        indentSize: {type: 'number', default: 4, min: 1, max: 8},
        maxLineLength: {type: 'number', default: 100, min: 40, max: 200},
        collectionStyle: {type: 'string', default: 'preserve', enum: ['preserve', 'multiline', 'auto']}
    },
    lint: {
        severity: {type: 'string', default: 'all', enum: ['error', 'warning', 'all']}
    },
    diagnostics: {
        debug: {type: 'boolean', default: false},
        rules: {type: 'object', default: {}}
    }
};

export function findUnknownConfigKeys(config: SharedThriftConfig | Record<string, unknown>): string[] {
    const unknown: string[] = [];
    const record = config as Record<string, unknown>;
    collectUnknownSectionKeys(record, 'format', unknown);
    collectUnknownSectionKeys(record, 'lint', unknown);
    collectUnknownSectionKeys(record, 'diagnostics', unknown);
    for (const key of Object.keys(record)) {
        if (!(key in SHARED_CONFIG_SCHEMA)) {
            unknown.push(key);
        }
    }
    return unknown;
}

export function validateSharedConfigValue(key: string, value: unknown): SharedConfigValidationResult {
    const entry = getSchemaEntry(key);
    if (entry === undefined) {
        return {valid: true};
    }
    if (entry.type === 'object') {
        if (typeof value !== 'object' || value === null || Array.isArray(value)) {
            return {valid: false, error: `${key} must be an object`};
        }
        return {valid: true};
    }
    if (typeof value !== entry.type) {
        return {valid: false, error: `${key} must be a ${entry.type}`};
    }
    if (typeof value === 'number') {
        if (typeof entry.min === 'number' && value < entry.min) {
            return {valid: false, error: `${key} must be at least ${entry.min}`};
        }
        if (typeof entry.max === 'number' && value > entry.max) {
            return {valid: false, error: `${key} must be at most ${entry.max}`};
        }
    }
    if (entry.enum !== undefined && !entry.enum.includes(value)) {
        return {valid: false, error: `${key} must be one of: ${entry.enum.join(', ')}`};
    }
    return {valid: true};
}

function collectUnknownSectionKeys(record: Record<string, unknown>, section: keyof SharedConfigSchema, unknown: string[]): void {
    const value = record[section];
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return;
    }
    const sectionSchema = SHARED_CONFIG_SCHEMA[section];
    for (const key of Object.keys(value)) {
        if (!(key in sectionSchema)) {
            unknown.push(`${section}.${key}`);
        }
    }
}

function getSchemaEntry(key: string): SharedConfigEntry | undefined {
    const [section, setting, ...rest] = key.split('.');
    if (rest.length > 0 || setting === undefined) {
        return undefined;
    }
    if (section !== 'format' && section !== 'lint' && section !== 'diagnostics') {
        return undefined;
    }
    return SHARED_CONFIG_SCHEMA[section][setting];
}
