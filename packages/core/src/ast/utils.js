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
exports.nodePathFromLeaf = exports.findSmallestNodeAtPosition = exports.rangeSize = exports.positionInRange = exports.walkNodes = exports.collectTopLevelTypes = exports.collectIncludes = void 0;
const nodes = __importStar(require("./nodes.types"));
function collectIncludes(doc) {
    return doc.body.filter((node) => node.type === nodes.ThriftNodeType.Include);
}
exports.collectIncludes = collectIncludes;
function collectTopLevelTypes(doc) {
    return doc.body.filter(node => node.type === nodes.ThriftNodeType.Struct ||
        node.type === nodes.ThriftNodeType.Union ||
        node.type === nodes.ThriftNodeType.Exception ||
        node.type === nodes.ThriftNodeType.Enum ||
        node.type === nodes.ThriftNodeType.Service ||
        node.type === nodes.ThriftNodeType.Typedef ||
        node.type === nodes.ThriftNodeType.Const);
}
exports.collectTopLevelTypes = collectTopLevelTypes;
function walkNodes(node, cb) {
    cb(node);
    if (node.type === nodes.ThriftNodeType.Document) {
        node.body.forEach(child => walkNodes(child, cb));
        return;
    }
    if (node.type === nodes.ThriftNodeType.Struct ||
        node.type === nodes.ThriftNodeType.Union ||
        node.type === nodes.ThriftNodeType.Exception) {
        node.fields.forEach(field => walkNodes(field, cb));
        return;
    }
    if (node.type === nodes.ThriftNodeType.Enum) {
        node.members.forEach(member => walkNodes(member, cb));
        return;
    }
    if (node.type === nodes.ThriftNodeType.Service) {
        node.functions.forEach(fn => walkNodes(fn, cb));
        return;
    }
    if (node.type === nodes.ThriftNodeType.Function) {
        node.arguments.forEach(arg => walkNodes(arg, cb));
        node.throws.forEach(thr => walkNodes(thr, cb));
    }
}
exports.walkNodes = walkNodes;
function positionInRange(range, position) {
    const { start, end } = range;
    if (position.line < start.line || position.line > end.line) {
        return false;
    }
    if (position.line === start.line && position.character < start.character) {
        return false;
    }
    if (position.line === end.line && position.character > end.character) {
        return false;
    }
    return true;
}
exports.positionInRange = positionInRange;
function rangeSize(range) {
    const lineSpan = range.end.line - range.start.line;
    const charSpan = range.end.character - range.start.character;
    return lineSpan * 100000 + charSpan;
}
exports.rangeSize = rangeSize;
function findSmallestNodeAtPosition(doc, position) {
    let best;
    walkNodes(doc, node => {
        if (!positionInRange(node.range, position)) {
            return;
        }
        if (!best) {
            best = node;
            return;
        }
        if (rangeSize(node.range) < rangeSize(best.range)) {
            best = node;
        }
    });
    return best;
}
exports.findSmallestNodeAtPosition = findSmallestNodeAtPosition;
function nodePathFromLeaf(node) {
    const path = [];
    let current = node;
    while (current) {
        path.push(current);
        current = current.parent;
    }
    return path;
}
exports.nodePathFromLeaf = nodePathFromLeaf;
//# sourceMappingURL=utils.js.map