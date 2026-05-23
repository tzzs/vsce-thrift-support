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
exports.buildAstIndex = void 0;
const nodes = __importStar(require("../ast/nodes.types"));
function buildAstIndex(ast) {
    const structStarts = new Map();
    const structFieldIndex = new Map();
    const enumStarts = new Map();
    const enumMemberIndex = new Map();
    const serviceStarts = new Map();
    const serviceFunctionIndex = new Map();
    const interactionStarts = new Map();
    const constStarts = new Map();
    const constEnds = new Map();
    const visit = (node) => {
        switch (node.type) {
            case nodes.ThriftNodeType.Struct:
            case nodes.ThriftNodeType.Union:
            case nodes.ThriftNodeType.Exception: {
                const structNode = node;
                structStarts.set(structNode.range.start.line, structNode);
                structNode.fields.forEach(field => {
                    structFieldIndex.set(field.range.start.line, field);
                });
                break;
            }
            case nodes.ThriftNodeType.Enum: {
                const enumNode = node;
                enumStarts.set(enumNode.range.start.line, enumNode);
                enumNode.members.forEach(member => {
                    enumMemberIndex.set(member.range.start.line, member);
                });
                break;
            }
            case nodes.ThriftNodeType.Service: {
                const serviceNode = node;
                serviceStarts.set(serviceNode.range.start.line, serviceNode);
                serviceNode.functions.forEach(fn => {
                    serviceFunctionIndex.set(fn.range.start.line, fn);
                });
                break;
            }
            case nodes.ThriftNodeType.Interaction: {
                const interactionNode = node;
                interactionStarts.set(interactionNode.range.start.line, interactionNode);
                break;
            }
            case nodes.ThriftNodeType.Const: {
                const constNode = node;
                constStarts.set(constNode.range.start.line, constNode);
                constEnds.set(constNode.range.start.line, constNode.range.end.line);
                break;
            }
            default:
                break;
        }
    };
    ast.body.forEach(visit);
    return {
        structStarts,
        structFieldIndex,
        enumStarts,
        enumMemberIndex,
        serviceStarts,
        serviceFunctionIndex,
        interactionStarts,
        constStarts,
        constEnds
    };
}
exports.buildAstIndex = buildAstIndex;
//# sourceMappingURL=ast-index.js.map