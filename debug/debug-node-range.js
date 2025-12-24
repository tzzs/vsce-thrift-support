const fs = require('fs');
const path = require('path');

// 模拟vscode.Range类
class Range {
    constructor(startLine, startChar, endLine, endChar) {
        this.start = {line: startLine, character: startChar};
        this.end = {line: endLine, character: endChar};
    }

    contains(position) {
        // 简化的包含检查
        return position.line >= this.start.line && position.line <= this.end.line;
    }
}

// 模拟vscode.Position类
class Position {
    constructor(line, character) {
        this.line = line;
        this.character = character;
    }
}

// 模拟节点结构
const nodes = {
    ThriftNodeType: {
        Document: 'Document',
        Namespace: 'Namespace',
        Include: 'Include',
        Const: 'Const',
        Typedef: 'Typedef',
        Enum: 'Enum',
        EnumMember: 'EnumMember',
        Struct: 'Struct',
        Union: 'Union',
        Exception: 'Exception',
        Service: 'Service',
        Function: 'Function',
        Field: 'Field',
        Comment: 'Comment'
    }
};

// 模拟解析器
class ThriftParser {
    constructor(content) {
        this.text = content;
        this.lines = content.split(/\r?\n/);
    }

    parse() {
        // 简化的解析实现
        const root = {
            type: nodes.ThriftNodeType.Document,
            range: new Range(0, 0, this.lines.length > 0 ? this.lines.length - 1 : 0,
                this.lines.length > 0 ? this.lines[this.lines.length - 1].length : 0),
            body: []
        };

        // 解析一些基本节点
        for (let i = 0; i < this.lines.length; i++) {
            const line = this.lines[i].trim();
            if (line.startsWith('struct')) {
                const match = line.match(/struct\s+(\w+)/);
                if (match) {
                    root.body.push({
                        type: nodes.ThriftNodeType.Struct,
                        name: match[1],
                        range: new Range(i, 0, i, line.length),
                        fields: []
                    });
                }
            } else if (line.startsWith('service')) {
                const match = line.match(/service\s+(\w+)/);
                if (match) {
                    root.body.push({
                        type: nodes.ThriftNodeType.Service,
                        name: match[1],
                        range: new Range(i, 0, i, line.length),
                        functions: []
                    });
                }
            }
        }

        return root;
    }
}

// 测试查找节点功能
function findNodeAtPosition(doc, position) {
    console.log('查找位置的节点:', position);

    // 查找包含该位置的最深层节点
    function findDeepestNode(nodesArray) {
        console.log('检查节点数组:', nodesArray.length);
        for (const node of nodesArray) {
            console.log('检查节点:', node.name, node.type);
            console.log('节点范围:', node.range);

            // 这里可能出错 - 如果node.range是undefined
            try {
                if (node.range && node.range.contains(position)) {
                    console.log('节点包含位置');
                    // 先检查子节点
                    if (node.children) {
                        const childResult = findDeepestNode(node.children);
                        if (childResult) {
                            return childResult;
                        }
                    }
                    return node;
                }
            } catch (error) {
                console.error('检查节点范围时出错:', error);
                console.log('节点:', node);
                return null;
            }
        }
        return undefined;
    }

    return findDeepestNode(doc.body);
}

// 读取测试文件
const mainThriftPath = path.join(__dirname, 'tests', 'test-files', 'main.thrift');
const sharedThriftPath = path.join(__dirname, 'tests', 'test-files', 'shared.thrift');

console.log('读取测试文件...');

try {
    const mainContent = fs.readFileSync(mainThriftPath, 'utf8');
    console.log('主文件内容:');
    console.log(mainContent);

    const parser = new ThriftParser(mainContent);
    const ast = parser.parse();

    console.log('\n解析后的AST:');
    console.log(JSON.stringify(ast, null, 2));

    // 测试查找节点
    const position = new Position(2, 7); // 应该在"User"这个词上
    console.log('\n测试查找节点...');
    const node = findNodeAtPosition(ast, position);
    console.log('找到的节点:', node);

} catch (error) {
    console.error('读取或解析文件时出错:', error);
}