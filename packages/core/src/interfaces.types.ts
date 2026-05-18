/**
 * 格式化选项。
 */
export interface ThriftFormattingOptions {
    trailingComma: 'preserve' | 'add' | 'remove';
    alignTypes: boolean;
    alignFieldNames: boolean;
    alignStructDefaults: boolean;
    alignAnnotations: boolean;
    alignComments: boolean;
    alignEnumNames: boolean;
    alignEnumEquals: boolean;
    alignEnumValues: boolean;
    indentSize: number;
    maxLineLength: number;
    collectionStyle: 'preserve' | 'multiline' | 'auto';
    insertSpaces: boolean;
    tabSize: number;
    initialContext?: {indentLevel: number; inStruct: boolean; inEnum: boolean; inService?: boolean; inInteraction?: boolean};
    /** 启用增量格式化（仅重新格式化脏区），配合 IncrementalTracker 使用。默认 false 为全量格式化 */
    incrementalFormattingEnabled?: boolean;
}

/**
 * 结构体字段的解析结果。
 */
export interface StructField {
    line: string;
    id: string; // The field ID (e.g. "1")
    qualifier: string; // The qualifier (e.g. "required " or "optional " or empty)
    type: string;
    name: string;
    suffix: string;
    comment: string;
    annotation?: string;
}

/**
 * 枚举字段的解析结果。
 */
export interface EnumField {
    line: string;
    name: string;
    value: string;
    suffix: string;
    comment: string;
    annotation?: string;
}

/**
 * 常量字段的解析结果。
 */
export interface ConstField {
    line: string;
    type: string;
    name: string;
    value: string;
    comment: string;
}
