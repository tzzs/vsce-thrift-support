const fs = require('fs');
const path = require('path');

// Mock VS Code APIs
const vscode = {
    Position: class Position {
        constructor(line, character) {
            this.line = line;
            this.character = character;
        }
    },
    Range: class Range {
        constructor(startLine, startChar, endLine, endChar) {
            this.start = {line: startLine, character: startChar};
            this.end = {line: endLine, character: endChar};
        }

        contains(position) {
            // Simplified contains logic for testing
            if (position.line < this.start.line || position.line > this.end.line) {
                return false;
            }

            if (position.line === this.start.line && position.character < this.start.character) {
                return false;
            }

            if (position.line === this.end.line && position.character > this.end.character) {
                return false;
            }

            return true;
        }
    }
};

// Mock the ThriftParser and nodes
class MockThriftParser {
    constructor(content) {
        this.content = content;
        this.lines = content.split('\n');
    }

    parse() {
        // Return a mock AST that represents our test case
        return {
            type: 'Document',
            range: new vscode.Range(0, 0, this.lines.length - 1, this.lines[this.lines.length - 1].length),
            body: [
                {
                    type: 'Service',
                    name: 'UserService',
                    range: new vscode.Range(0, 0, 4, 1),
                    functions: [
                        {
                            type: 'Function',
                            name: 'getUser',
                            returnType: 'User',
                            range: new vscode.Range(1, 2, 1, 33), // This is the problematic range
                            arguments: [
                                {
                                    type: 'Field',
                                    name: 'id',
                                    fieldType: 'i32',
                                    range: new vscode.Range(1, 20, 1, 26)
                                }
                            ]
                        }
                    ]
                }
            ]
        };
    }
}

// Copy the findNodeAtPosition logic from referencesProvider.ts
function findNodeAtPosition(doc, position) {
    // Find the deepest node that contains the position
    function findDeepestNode(nodesArray) {
        for (const node of nodesArray) {
            if (node.range.contains(position)) {
                // Check children first (generic children)
                if (node.children) {
                    const childResult = findDeepestNode(node.children);
                    if (childResult) {
                        return childResult;
                    }
                }

                // Check specific node type children
                if (node.type === 'Document') {
                    if (doc.body) {
                        const childResult = findDeepestNode(doc.body);
                        if (childResult) {
                            return childResult;
                        }
                    }
                } else if (node.type === 'Service') {
                    if (node.functions) {
                        const childResult = findDeepestNode(node.functions);
                        if (childResult) {
                            return childResult;
                        }
                    }
                } else if (node.type === 'Function') {
                    // Check function arguments
                    if (node.arguments) {
                        const childResult = findDeepestNode(node.arguments);
                        if (childResult) {
                            return childResult;
                        }
                    }
                }

                return node;
            }
        }
        return undefined;
    }

    return findDeepestNode(doc.body);
}

// Test case
console.log('=== Debugging Function Reference Analysis ===\n');

const testContent = `service UserService {
  User getUser(1:i32 id),
}`;

console.log('Test Content:');
console.log(testContent);
console.log('');

const parser = new MockThriftParser(testContent);
const ast = parser.parse();

console.log('Parsed AST:');
console.log(JSON.stringify(ast, null, 2));
console.log('');

// Test different positions
const testPositions = [
    {line: 1, character: 2},  // On 'User' return type
    {line: 1, character: 7},  // On 'getUser' function name
    {line: 1, character: 20}, // On 'i32' parameter type
    {line: 1, character: 23}, // On 'id' parameter name
];

testPositions.forEach((pos, index) => {
    console.log(`--- Test Position ${index + 1}: Line ${pos.line}, Character ${pos.character} ---`);
    const position = new vscode.Position(pos.line, pos.character);
    const foundNode = findNodeAtPosition(ast, position);

    if (foundNode) {
        console.log(`Found node: ${foundNode.type} - ${foundNode.name || foundNode.fieldType || 'unnamed'}`);
        console.log(`Node range: [${foundNode.range.start.line}:${foundNode.range.start.character}] to [${foundNode.range.end.line}:${foundNode.range.end.character}]`);
    } else {
        console.log('No node found');
    }
    console.log('');
});