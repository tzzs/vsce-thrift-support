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

/**
 * AST 节点基础结构。
 */
export interface ThriftNodeBase {
    type: ThriftNodeType;
    range: vscode.Range;
    nameRange?: vscode.Range;
    parent?: ThriftNode;
    children?: ThriftNode[];
    name?: string;
}

/**
 * AST 节点联合类型。
 */
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

/**
 * 文档根节点。
 */
export interface ThriftDocument extends ThriftNodeBase {
    type: ThriftNodeType.Document;
    body: ThriftNode[];
}

/**
 * namespace 节点。
 */
export interface Namespace extends ThriftNodeBase {
    type: ThriftNodeType.Namespace;
    scope: string; // e.g., 'go', 'java'
    namespace: string; // e.g., 'com.example' // Renamed from name to avoid conflict/confusion, though base has name
}

/**
 * include 节点。
 */
export interface Include extends ThriftNodeBase {
    type: ThriftNodeType.Include;
    path: string;
}

/**
 * const 节点。
 */
export interface Const extends ThriftNodeBase {
    type: ThriftNodeType.Const;
    valueType: string;
    valueTypeRange?: vscode.Range;
    value: string;
}

/**
 * typedef 节点。
 */
export interface Typedef extends ThriftNodeBase {
    type: ThriftNodeType.Typedef;
    aliasType: string;
    aliasTypeRange?: vscode.Range;
}

/**
 * enum 节点。
 */
export interface Enum extends ThriftNodeBase {
    type: ThriftNodeType.Enum;
    members: EnumMember[];
    isSenum?: boolean;
}

/**
 * enum 成员节点。
 */
export interface EnumMember extends ThriftNodeBase {
    type: ThriftNodeType.EnumMember;
    initializer?: string;
}

/**
 * struct/union/exception 节点。
 */
export interface Struct extends ThriftNodeBase {
    type: ThriftNodeType.Struct | ThriftNodeType.Union | ThriftNodeType.Exception;
    fields: Field[];
}

/**
 * 字段节点。
 */
export interface Field extends ThriftNodeBase {
    type: ThriftNodeType.Field;
    id: number;
    requiredness?: 'required' | 'optional';
    fieldType: string;
    typeRange?: vscode.Range;
    defaultValue?: string;
}

/**
 * service 节点。
 */
export interface Service extends ThriftNodeBase {
    type: ThriftNodeType.Service;
    extends?: string;
    functions: ThriftFunction[];
}

/**
 * 函数节点。
 */
export interface ThriftFunction extends ThriftNodeBase {
    type: ThriftNodeType.Function;
    returnType: string;
    returnTypeRange?: vscode.Range;
    oneway: boolean;
    arguments: Field[];
    throws: Field[];
}

// Helper functions for type checking
/**
 * 判断是否为 Service 节点。
 */
export function isServiceNode(node: ThriftNode): node is Service {
    return node.type === ThriftNodeType.Service;
}

/**
 * 判断是否为结构体相关节点。
 */
export function isStructNode(node: ThriftNode): node is Struct {
    return node.type === ThriftNodeType.Struct ||
        node.type === ThriftNodeType.Union ||
        node.type === ThriftNodeType.Exception;
}

/**
 * 判断是否为 Enum 节点。
 */
export function isEnumNode(node: ThriftNode): node is Enum {
    return node.type === ThriftNodeType.Enum;
}

/**
 * 判断是否为 Field 节点。
 */
export function isFieldNode(node: ThriftNode): node is Field {
    return node.type === ThriftNodeType.Field;
}
