import * as vscode from 'vscode';
import * as nodes from './nodes';

/**
 * 收集 include 节点。
 */
export function collectIncludes(doc: nodes.ThriftDocument): nodes.Include[] {
    return doc.body.filter((node): node is nodes.Include => node.type === nodes.ThriftNodeType.Include);
}

/**
 * 收集 namespace 节点。
 */
export function collectNamespaces(doc: nodes.ThriftDocument): nodes.Namespace[] {
    return doc.body.filter((node): node is nodes.Namespace => node.type === nodes.ThriftNodeType.Namespace);
}

/**
 * 收集顶层类型节点。
 */
export function collectTopLevelTypes(doc: nodes.ThriftDocument): nodes.ThriftNode[] {
    return doc.body.filter(node =>
        node.type === nodes.ThriftNodeType.Struct ||
        node.type === nodes.ThriftNodeType.Union ||
        node.type === nodes.ThriftNodeType.Exception ||
        node.type === nodes.ThriftNodeType.Enum ||
        node.type === nodes.ThriftNodeType.Service ||
        node.type === nodes.ThriftNodeType.Typedef ||
        node.type === nodes.ThriftNodeType.Const
    );
}

/**
 * 深度遍历 AST。
 */
export function walkNodes(node: nodes.ThriftNode, cb: (node: nodes.ThriftNode) => void): void {
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

/**
 * 判断位置是否在 range 内。
 */
export function positionInRange(range: vscode.Range, position: vscode.Position): boolean {
    const {start, end} = range;
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

/**
 * 计算 range 的排序权重（越小越精确）。
 */
export function rangeSize(range: vscode.Range): number {
    const lineSpan = range.end.line - range.start.line;
    const charSpan = range.end.character - range.start.character;
    return lineSpan * 100000 + charSpan;
}

/**
 * 查找包含指定位置的最小节点。
 */
export function findSmallestNodeAtPosition(doc: nodes.ThriftDocument, position: vscode.Position): nodes.ThriftNode | undefined {
    let best: nodes.ThriftNode | undefined;
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

/**
 * 从叶子节点向上构建节点路径。
 */
export function nodePathFromLeaf(node: nodes.ThriftNode | undefined): nodes.ThriftNode[] {
    const path: nodes.ThriftNode[] = [];
    let current: nodes.ThriftNode | undefined = node;
    while (current) {
        path.push(current);
        current = current.parent;
    }
    return path;
}
