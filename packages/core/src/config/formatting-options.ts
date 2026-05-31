import type {ThriftFormattingOptions} from '../interfaces.types';

export type ThriftFormattingConfigInput = Partial<ThriftFormattingOptions> & {
    alignNames?: boolean;
    alignAssignments?: boolean;
    alignStructAnnotations?: boolean;
};

export interface FormattingSettingDefinition {
    type: 'boolean' | 'number' | 'string';
    default: boolean | number | string;
    description: string;
    enum?: readonly string[];
}

export interface FormattingConfigurationProperty {
    type: 'boolean' | 'number' | 'string';
    default: boolean | number | string;
    description: string;
    enum?: readonly string[];
}

export const DEFAULT_THRIFT_FORMATTING_OPTIONS: ThriftFormattingOptions = {
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

export const THRIFT_FORMATTING_SETTING_DEFINITIONS = {
    trailingComma: {
        type: 'string',
        enum: ['preserve', 'add', 'remove'],
        default: DEFAULT_THRIFT_FORMATTING_OPTIONS.trailingComma,
        description: 'Control trailing comma behavior: preserve (keep existing), add (always add), remove (always remove)'
    },
    alignTypes: {
        type: 'boolean',
        default: DEFAULT_THRIFT_FORMATTING_OPTIONS.alignTypes,
        description: 'Align field types in structs/unions/exceptions'
    },
    alignNames: {
        type: 'boolean',
        default: DEFAULT_THRIFT_FORMATTING_OPTIONS.alignFieldNames,
        description: 'Align names for struct fields and enum members (unified control for field and enum names). Fine-grained keys like alignFieldNames/alignEnumNames are not exposed; they are internally tied to this switch for simplicity.'
    },
    alignAssignments: {
        type: 'boolean',
        default: DEFAULT_THRIFT_FORMATTING_OPTIONS.alignEnumEquals,
        description: 'Master switch to align \'=\' signs and values for both struct fields and enum members. When set, it overrides per-kind equals/values alignment; if not set explicitly, struct and enum fall back to their own defaults. Note: This does not affect struct default value alignment; use \'thrift.format.alignStructDefaults\' for that.'
    },
    alignStructDefaults: {
        type: 'boolean',
        default: DEFAULT_THRIFT_FORMATTING_OPTIONS.alignStructDefaults,
        description: 'Align \'=\' signs for struct field default values (e.g., \'field = defaultValue\'). Independent from the global \'thrift.format.alignAssignments\' switch; this option exclusively controls default value alignment for struct fields.'
    },
    alignAnnotations: {
        type: 'boolean',
        default: DEFAULT_THRIFT_FORMATTING_OPTIONS.alignAnnotations,
        description: 'Align inline annotations (e.g., (go.tag=\'json:...\')) for struct fields and enum members (unified control).'
    },
    alignComments: {
        type: 'boolean',
        default: DEFAULT_THRIFT_FORMATTING_OPTIONS.alignComments,
        description: 'Align inline comments'
    },
    indentSize: {
        type: 'number',
        default: DEFAULT_THRIFT_FORMATTING_OPTIONS.indentSize,
        description: 'Number of spaces for indentation'
    },
    maxLineLength: {
        type: 'number',
        default: DEFAULT_THRIFT_FORMATTING_OPTIONS.maxLineLength,
        description: 'Maximum line length for formatting'
    },
    collectionStyle: {
        type: 'string',
        enum: ['preserve', 'multiline', 'auto'],
        default: DEFAULT_THRIFT_FORMATTING_OPTIONS.collectionStyle,
        description: 'How to format collection values in const declarations: preserve (keep inline), multiline (always expand), auto (expand if line exceeds maxLineLength)'
    }
} as const satisfies Record<string, FormattingSettingDefinition>;

export const THRIFT_FORMATTING_CONFIG_KEYS = [
    ...Object.keys(THRIFT_FORMATTING_SETTING_DEFINITIONS),
    'alignFieldNames',
    'alignEnumNames',
    'alignEnumEquals',
    'alignEnumValues',
    'alignStructAnnotations'
] as const;

export function createFormattingConfigurationProperties(
    prefix = 'thrift.format.'
): Record<string, FormattingConfigurationProperty> {
    return Object.fromEntries(
        Object.entries(THRIFT_FORMATTING_SETTING_DEFINITIONS).map(([key, definition]) => {
            const property: FormattingConfigurationProperty = {
                type: definition.type,
                default: definition.default,
                description: definition.description
            };

            if ('enum' in definition) {
                property.enum = definition.enum;
            }

            return [`${prefix}${key}`, property];
        })
    );
}

export function normalizeFormattingOptions(input: ThriftFormattingConfigInput = {}): ThriftFormattingOptions {
    const alignNames = input.alignNames
        ?? input.alignFieldNames
        ?? input.alignEnumNames
        ?? DEFAULT_THRIFT_FORMATTING_OPTIONS.alignFieldNames;
    const alignAssignments = input.alignAssignments;

    return {
        trailingComma: input.trailingComma ?? DEFAULT_THRIFT_FORMATTING_OPTIONS.trailingComma,
        alignTypes: input.alignTypes ?? DEFAULT_THRIFT_FORMATTING_OPTIONS.alignTypes,
        alignFieldNames: alignNames,
        alignStructDefaults: input.alignStructDefaults ?? DEFAULT_THRIFT_FORMATTING_OPTIONS.alignStructDefaults,
        alignAnnotations: input.alignAnnotations
            ?? input.alignStructAnnotations
            ?? DEFAULT_THRIFT_FORMATTING_OPTIONS.alignAnnotations,
        alignComments: input.alignComments ?? DEFAULT_THRIFT_FORMATTING_OPTIONS.alignComments,
        alignEnumNames: alignNames,
        alignEnumEquals: input.alignEnumEquals
            ?? alignAssignments
            ?? DEFAULT_THRIFT_FORMATTING_OPTIONS.alignEnumEquals,
        alignEnumValues: input.alignEnumValues
            ?? alignAssignments
            ?? DEFAULT_THRIFT_FORMATTING_OPTIONS.alignEnumValues,
        indentSize: input.indentSize ?? DEFAULT_THRIFT_FORMATTING_OPTIONS.indentSize,
        maxLineLength: input.maxLineLength ?? DEFAULT_THRIFT_FORMATTING_OPTIONS.maxLineLength,
        collectionStyle: input.collectionStyle ?? DEFAULT_THRIFT_FORMATTING_OPTIONS.collectionStyle,
        insertSpaces: input.insertSpaces ?? DEFAULT_THRIFT_FORMATTING_OPTIONS.insertSpaces,
        tabSize: input.tabSize ?? DEFAULT_THRIFT_FORMATTING_OPTIONS.tabSize,
        initialContext: input.initialContext,
        incrementalFormattingEnabled: input.incrementalFormattingEnabled
    };
}
