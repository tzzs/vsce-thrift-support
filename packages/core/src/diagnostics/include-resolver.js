"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.collectTypesFromAst = void 0;
const nodes = __importStar(require("../ast/nodes.types"));
function collectTypesFromAst(ast) {
    const typeKind = new Map();
    for (const node of ast.body) {
        switch (node.type) {
            case nodes.ThriftNodeType.Typedef:
                if (typeof node.name === 'string' && node.name.length > 0) {
                    typeKind.set(node.name, 'typedef');
                }
                break;
            case nodes.ThriftNodeType.Enum:
                if (typeof node.name === 'string' && node.name.length > 0) {
                    typeKind.set(node.name, node.isSenum === true ? 'senum' : 'enum');
                }
                break;
            case nodes.ThriftNodeType.Struct:
                if (typeof node.name === 'string' && node.name.length > 0) {
                    typeKind.set(node.name, 'struct');
                }
                break;
            case nodes.ThriftNodeType.Union:
                if (typeof node.name === 'string' && node.name.length > 0) {
                    typeKind.set(node.name, 'union');
                }
                break;
            case nodes.ThriftNodeType.Exception:
                if (typeof node.name === 'string' && node.name.length > 0) {
                    typeKind.set(node.name, 'exception');
                }
                break;
            case nodes.ThriftNodeType.Service:
                if (typeof node.name === 'string' && node.name.length > 0) {
                    typeKind.set(node.name, 'service');
                }
                break;
            case nodes.ThriftNodeType.Interaction:
                if (typeof node.name === 'string' && node.name.length > 0) {
                    typeKind.set(node.name, 'interaction');
                }
                break;
            default:
                break;
        }
    }
    return typeKind;
}
exports.collectTypesFromAst = collectTypesFromAst;
//# sourceMappingURL=include-resolver.js.map