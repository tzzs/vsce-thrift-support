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
exports.analyzeThriftText = exports.analyzeThriftAst = void 0;
const parser_1 = require("../../ast/parser");
const nodes = __importStar(require("../../ast/nodes.types"));
const include_resolver_1 = require("../include-resolver");
const line_range_1 = require("../../utils/line-range");
const utils_1 = require("../utils");
const analysis_context_1 = require("./analysis-context");
const service_check_1 = require("./service-check");
const struct_check_1 = require("./struct-check");
const general_check_1 = require("./general-check");
const syntax_check_1 = require("./syntax-check");
function analyzeThriftAst(ast, lines, includedTypes, context, analysisScope) {
    const issues = [];
    const codeLines = [];
    const state = { inBlock: false };
    for (const raw of lines) {
        codeLines.push((0, utils_1.stripCommentsFromLine)(raw, state));
    }
    const includeAliases = context?.includeAliases ?? (0, analysis_context_1.collectIncludeAliasesFromAst)(ast);
    const typeKind = context?.typeKind
        ? new Map(context.typeKind)
        : (0, include_resolver_1.collectTypesFromAst)(ast);
    if (includedTypes) {
        for (const [name, kind] of includedTypes) {
            if (!typeKind.has(name)) {
                typeKind.set(name, kind);
            }
        }
    }
    const definedTypes = new Set([...typeKind.keys()]);
    for (const node of ast.body) {
        switch (node.type) {
            case nodes.ThriftNodeType.Service:
            case nodes.ThriftNodeType.Interaction:
                (0, service_check_1.checkService)(node, lines, definedTypes, includeAliases, typeKind, issues);
                break;
            case nodes.ThriftNodeType.Struct:
            case nodes.ThriftNodeType.Union:
            case nodes.ThriftNodeType.Exception:
                (0, struct_check_1.checkStruct)(node, definedTypes, includeAliases, issues);
                break;
            case nodes.ThriftNodeType.Typedef:
                (0, general_check_1.checkTypedef)(node, lines, definedTypes, includeAliases, issues);
                break;
            case nodes.ThriftNodeType.Const:
                (0, general_check_1.checkConst)(node, lines, definedTypes, includeAliases, issues);
                break;
            case nodes.ThriftNodeType.Enum:
                (0, general_check_1.checkEnum)(node, issues);
                break;
            default:
                break;
        }
    }
    (0, syntax_check_1.checkSyntax)(codeLines, issues);
    if (analysisScope) {
        const normalized = (0, line_range_1.normalizeLineRange)(analysisScope);
        if (normalized) {
            return issues.filter(issue => (0, line_range_1.rangeIntersectsLineRange)(issue.range, normalized));
        }
    }
    return issues;
}
exports.analyzeThriftAst = analyzeThriftAst;
function analyzeThriftText(text, uri, includedTypes) {
    const lines = text.split('\n');
    const ast = uri
        ? parser_1.ThriftParser.parseContentWithCache(uri.toString(), text)
        : new parser_1.ThriftParser(text).parse();
    return analyzeThriftAst(ast, lines, includedTypes);
}
exports.analyzeThriftText = analyzeThriftText;
//# sourceMappingURL=analyzer.js.map