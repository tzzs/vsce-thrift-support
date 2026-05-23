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
exports.createInteractionBlock = exports.createServiceBlock = exports.createEnumBlock = exports.createStructBlock = exports.createDocument = exports.createField = void 0;
const types_1 = require("../types");
const nodes = __importStar(require("./nodes.types"));
const PLACEHOLDER_RANGE = new types_1.Range(0, 0, 0, 0);
function createField(params) {
    return {
        type: nodes.ThriftNodeType.Field,
        range: params.range,
        nameRange: params.nameRange,
        typeRange: params.typeRange,
        parent: params.parent,
        id: params.id,
        requiredness: params.requiredness,
        fieldType: params.fieldType,
        name: params.name,
        defaultValue: params.defaultValue,
        defaultValueRange: params.defaultValueRange
    };
}
exports.createField = createField;
function createDocument(params) {
    return {
        type: nodes.ThriftNodeType.Document,
        range: params.range,
        body: params.body ?? [],
        parent: params.parent
    };
}
exports.createDocument = createDocument;
function createStructBlock(params) {
    return {
        type: params.type,
        name: params.name,
        range: PLACEHOLDER_RANGE,
        nameRange: params.nameRange,
        parent: params.parent,
        fields: []
    };
}
exports.createStructBlock = createStructBlock;
function createEnumBlock(params) {
    return {
        type: nodes.ThriftNodeType.Enum,
        name: params.name,
        range: PLACEHOLDER_RANGE,
        nameRange: params.nameRange,
        parent: params.parent,
        members: [],
        isSenum: params.isSenum
    };
}
exports.createEnumBlock = createEnumBlock;
function createServiceBlock(params) {
    return {
        type: nodes.ThriftNodeType.Service,
        name: params.name,
        extends: params.extends,
        range: PLACEHOLDER_RANGE,
        nameRange: params.nameRange,
        parent: params.parent,
        functions: []
    };
}
exports.createServiceBlock = createServiceBlock;
function createInteractionBlock(params) {
    return {
        type: nodes.ThriftNodeType.Interaction,
        name: params.name,
        range: PLACEHOLDER_RANGE,
        nameRange: params.nameRange,
        parent: params.parent,
        functions: []
    };
}
exports.createInteractionBlock = createInteractionBlock;
//# sourceMappingURL=factory.js.map