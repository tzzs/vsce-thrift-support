const fs = require('fs');
const path = require('path');

// Use the mock vscode module
const {Position, Range, Uri, workspace: baseWorkspace} = require('./mock-vscode');

// Extend the base workspace from mock-vscode
const workspace = {
    ...baseWorkspace,
    findFiles: async (pattern, exclude) => {
        // Mock implementation - return some test thrift files
        const patternStr = typeof pattern === 'string' ? pattern : (pattern.pattern || '');
        if (patternStr.includes('*.thrift')) {
            return [
                {fsPath: path.join(__dirname, '..', 'test-files', 'example.thrift')},
                {fsPath: path.join(__dirname, '..', 'test-files', 'shared.thrift')}
            ];
        }
        return [];
    }
};

// Hook require('vscode')
const Module = require('module');
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
    if (request === 'vscode') {
        return {
            CompletionItem: class {
                constructor(label, kind) {
                    this.label = label;
                    this.kind = kind;
                }
            },
            CompletionItemKind: {
                Keyword: 0,
                TypeParameter: 1,
                Class: 2,
                EnumMember: 3,
                Method: 4,
                File: 5,
                Folder: 6
            },
            SnippetString: class {
                constructor(value) {
                    this.value = value;
                }
            },
            Position,
            Range,
            Uri,
            workspace,
            RelativePattern: class {
                constructor(base, pattern) {
                    this.base = base;
                    this.pattern = pattern;
                }
            }
        };
    }
    return originalLoad.apply(this, arguments);
};

const {ThriftCompletionProvider} = require('../out/completionProvider.js');

function createMockDocument(text, fileName = 'test.thrift') {
    const lines = text.split('\n');
    return {
        uri: {fsPath: path.join(__dirname, 'test-files', fileName)},
        getText: () => text,
        lineAt: (line) => ({text: lines[line] || ''}),
        offsetAt: (position) => {
            let offset = 0;
            for (let i = 0; i < position.line; i++) {
                offset += lines[i].length + 1; // +1 for newline
            }
            return offset + position.character;
        }
    };
}

function createMockPosition(line, character) {
    return new Position(line, character);
}

function createMockCancellationToken() {
    return {isCancellationRequested: false};
}

function createMockCompletionContext() {
    return {triggerKind: 0}; // Invoke
}

async function debugEnumValueCompletion() {
    console.log('=== Debugging Enum Value Completion ===');

    const provider = new ThriftCompletionProvider();
    const text = `enum Status {
  ACTIVE = 1,
  INACTIVE = 2
}

struct User {
  1: required Status status = `;
    const document = createMockDocument(text);
    const position = createMockPosition(6, 32); // After "= "

    // Debug: check what the line looks like
    const lines = text.split('\n');
    const currentLine = lines[position.line];
    const beforeCursor = currentLine.substring(0, position.character);

    console.log('Full text:');
    console.log(text);
    console.log('\nPosition info:');
    console.log('Line at position:', JSON.stringify(currentLine));
    console.log('Position character:', position.character);
    console.log('Line substring up to position:', JSON.stringify(beforeCursor));

    // Let's also check what the parser sees
    const {ThriftParser} = require('../out/ast/parser.js');
    const parser = new ThriftParser(document);
    const thriftDoc = parser.parse();

    console.log('\nParsed document structure:');
    console.log('Document has', thriftDoc.body.length, 'top-level nodes');
    thriftDoc.body.forEach((node, i) => {
        console.log(`Node ${i}: type=${node.type}, name=${node.name}, range=${JSON.stringify(node.range)}`);
        if (node.members) {
            console.log(`  Members:`, node.members.map(m => ({name: m.name, value: m.value})));
        }
    });

    // Test the enum assignment detection logic
    const {nodes} = require('../out/ast/nodes.js');
    console.log('\nTesting enum assignment detection:');
    console.log('Before cursor:', JSON.stringify(beforeCursor));
    console.log('Is in enum assignment context:', provider['isInEnumAssignmentContext'](currentLine, position.character, thriftDoc));

    // Check each node to see if any are enums
    console.log('\nChecking for enum nodes:');
    thriftDoc.body.forEach((node, i) => {
        console.log(`Node ${i}: isEnum=${nodes.isEnumNode(node)}, name=${node.name}`);
    });

    // Test the completion
    const completions = await provider.provideCompletionItems(
        document,
        position,
        createMockCancellationToken(),
        createMockCompletionContext()
    );

    console.log('\nCompletion results:');
    console.log('Number of completions:', completions.length);
    console.log('Completions:', completions.map(item => ({label: item.label, kind: item.kind, detail: item.detail})));

    // Check if we have enum values
    const hasActive = completions.some(item => item.label === 'ACTIVE');
    const hasInactive = completions.some(item => item.label === 'INACTIVE');

    console.log('\nEnum value check:');
    console.log('Has ACTIVE:', hasActive);
    console.log('Has INACTIVE:', hasInactive);
}

debugEnumValueCompletion().catch(console.error);