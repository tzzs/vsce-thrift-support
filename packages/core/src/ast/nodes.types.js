"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isFieldNode = exports.isEnumNode = exports.isStructNode = exports.isInteractionNode = exports.isServiceNode = exports.ThriftNodeType = void 0;
var ThriftNodeType;
(function (ThriftNodeType) {
    ThriftNodeType["Document"] = "Document";
    ThriftNodeType["Namespace"] = "Namespace";
    ThriftNodeType["Include"] = "Include";
    ThriftNodeType["Const"] = "Const";
    ThriftNodeType["Typedef"] = "Typedef";
    ThriftNodeType["Enum"] = "Enum";
    ThriftNodeType["EnumMember"] = "EnumMember";
    ThriftNodeType["Struct"] = "Struct";
    ThriftNodeType["Union"] = "Union";
    ThriftNodeType["Exception"] = "Exception";
    ThriftNodeType["Service"] = "Service";
    ThriftNodeType["Interaction"] = "Interaction";
    ThriftNodeType["Performs"] = "Performs";
    ThriftNodeType["Function"] = "Function";
    ThriftNodeType["Field"] = "Field";
    ThriftNodeType["Comment"] = "Comment";
    ThriftNodeType["Invalid"] = "Invalid";
})(ThriftNodeType = exports.ThriftNodeType || (exports.ThriftNodeType = {}));
function isServiceNode(node) {
    return node.type === ThriftNodeType.Service;
}
exports.isServiceNode = isServiceNode;
function isInteractionNode(node) {
    return node.type === ThriftNodeType.Interaction;
}
exports.isInteractionNode = isInteractionNode;
function isStructNode(node) {
    return node.type === ThriftNodeType.Struct ||
        node.type === ThriftNodeType.Union ||
        node.type === ThriftNodeType.Exception;
}
exports.isStructNode = isStructNode;
function isEnumNode(node) {
    return node.type === ThriftNodeType.Enum;
}
exports.isEnumNode = isEnumNode;
function isFieldNode(node) {
    return node.type === ThriftNodeType.Field;
}
exports.isFieldNode = isFieldNode;
//# sourceMappingURL=nodes.types.js.map