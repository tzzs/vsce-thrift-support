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
    initialContext?: { indentLevel: number; inStruct: boolean; inEnum: boolean; inService?: boolean };
}

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

export interface EnumField {
    line: string;
    name: string;
    value: string;
    suffix: string;
    comment: string;
}

export interface ConstField {
    line: string;
    type: string;
    name: string;
    value: string;
    comment: string;
}
