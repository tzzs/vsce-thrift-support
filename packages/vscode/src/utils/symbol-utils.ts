import * as vscode from 'vscode';
import {nodes} from '@tanzz/thrift-core';

/**
 * Map a `ThriftNodeType` to the corresponding `vscode.SymbolKind`.
 *
 * This function is shared across document-symbol, workspace-symbol, and
 * call/type-hierarchy providers to keep the mapping consistent.
 */
export function nodeTypeToSymbolKind(type: nodes.ThriftNodeType): vscode.SymbolKind {
    switch (type) {
        case nodes.ThriftNodeType.Struct:
        case nodes.ThriftNodeType.Union:
            return vscode.SymbolKind.Struct;
        case nodes.ThriftNodeType.Exception:
            return vscode.SymbolKind.Class;
        case nodes.ThriftNodeType.Enum:
            return vscode.SymbolKind.Enum;
        case nodes.ThriftNodeType.Service:
        case nodes.ThriftNodeType.Interaction:
            return vscode.SymbolKind.Interface;
        case nodes.ThriftNodeType.Typedef:
            return vscode.SymbolKind.TypeParameter;
        case nodes.ThriftNodeType.Const:
            return vscode.SymbolKind.Constant;
        case nodes.ThriftNodeType.Namespace:
            return vscode.SymbolKind.Namespace;
        case nodes.ThriftNodeType.Include:
            return vscode.SymbolKind.File;
        case nodes.ThriftNodeType.Field:
            return vscode.SymbolKind.Field;
        case nodes.ThriftNodeType.EnumMember:
            return vscode.SymbolKind.EnumMember;
        case nodes.ThriftNodeType.Function:
            return vscode.SymbolKind.Method;
        default:
            return vscode.SymbolKind.Variable;
    }
}
