import * as vscode from 'vscode';

export enum ThriftNodeType {
    Document = 'Document',
    Namespace = 'Namespace',
    Include = 'Include',
    Const = 'Const',
    Typedef = 'Typedef',
    Enum = 'Enum',
    EnumMember = 'EnumMember',
    Struct = 'Struct',
    Union = 'Union',
    Exception = 'Exception',
    Service = 'Service',
    Function = 'Function',
    Field = 'Field',
    Comment = 'Comment'
}

export interface ThriftNodeBase {
    type: ThriftNodeType;
    range: vscode.Range;
    parent?: ThriftNode;
    children?: ThriftNode[];
    name?: string;
}

export type ThriftNode =
    ThriftDocument
    | Namespace
    | Include
    | Const
    | Typedef
    | Enum
    | EnumMember
    | Struct
    | Field
    | Service
    | ThriftFunction;

export interface ThriftDocument extends ThriftNodeBase {
    type: ThriftNodeType.Document;
    body: ThriftNode[];
}

export interface Namespace extends ThriftNodeBase {
    type: ThriftNodeType.Namespace;
    scope: string; // e.g., 'go', 'java'
    namespace: string; // e.g., 'com.example' // Renamed from name to avoid conflict/confusion, though base has name
}

export interface Include extends ThriftNodeBase {
    type: ThriftNodeType.Include;
    path: string;
}

export interface Const extends ThriftNodeBase {
    type: ThriftNodeType.Const;
    valueType: string;
    value: string;
}

export interface Typedef extends ThriftNodeBase {
    type: ThriftNodeType.Typedef;
    aliasType: string;
}

export interface Enum extends ThriftNodeBase {
    type: ThriftNodeType.Enum;
    members: EnumMember[];
    isSenum?: boolean;
}

export interface EnumMember extends ThriftNodeBase {
    type: ThriftNodeType.EnumMember;
    initializer?: string;
}

export interface Struct extends ThriftNodeBase {
    type: ThriftNodeType.Struct | ThriftNodeType.Union | ThriftNodeType.Exception;
    fields: Field[];
}

export interface Field extends ThriftNodeBase {
    type: ThriftNodeType.Field;
    id: number;
    requiredness?: 'required' | 'optional';
    fieldType: string;
    defaultValue?: string;
}

export interface Service extends ThriftNodeBase {
    type: ThriftNodeType.Service;
    extends?: string;
    functions: ThriftFunction[];
}

export interface ThriftFunction extends ThriftNodeBase {
    type: ThriftNodeType.Function;
    returnType: string;
    oneway: boolean;
    arguments: Field[];
    throws: Field[];
}

// Helper functions for type checking
export function isServiceNode(node: ThriftNode): node is Service {
    return node.type === ThriftNodeType.Service;
}

export function isStructNode(node: ThriftNode): node is Struct {
    return node.type === ThriftNodeType.Struct ||
        node.type === ThriftNodeType.Union ||
        node.type === ThriftNodeType.Exception;
}

export function isEnumNode(node: ThriftNode): node is Enum {
    return node.type === ThriftNodeType.Enum;
}

export function isFieldNode(node: ThriftNode): node is Field {
    return node.type === ThriftNodeType.Field;
}
