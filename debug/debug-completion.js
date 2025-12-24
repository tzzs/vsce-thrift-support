const fs = require('fs');
const path = require('path');

// Use the mock vscode module
const {Position, Range, Uri, workspace: baseWorkspace} = require('./tests/mock-vscode');

// Extend the base workspace from mock-vscode
const workspace = {
    ...baseWorkspace,
    findFiles: async (pattern, exclude) => {
        // Mock implementation - return some test thrift files
        const patternStr = typeof pattern === 'string' ? pattern : (pattern.pattern || '');
        if (patternStr.includes('*.thrift')) {
            return [
                {fsPath: path.join(__dirname, 'test-files', 'example.thrift')},
                {fsPath: path.join(__dirname, 'test-files', 'shared.thrift')}
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

const {ThriftCompletionProvider} = require('./out/src/completionProvider.js');

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
    console.log('Debugging enum value completion...');

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

    console.log('Line at position:', JSON.stringify(currentLine));
    console.log('Position character:', position.character);
    console.log('Line substring up to position:', JSON.stringify(beforeCursor));

    // Test the regex pattern
    const assignmentMatch = beforeCursor.match(/^\\s*(\\w+)\\s+(\\w+)\\s*=\\s*$/);
    console.log('Assignment match:', assignmentMatch);

    if (assignmentMatch) {
        const [, typeName, fieldName] = assignmentMatch;
        console.log('Type name:', typeName);
        console.log('Field name:', fieldName);
    }

    const completions = await provider.provideCompletionItems(
        document,
        position,
        createMockCancellationToken(),
        createMockCompletionContext()
    );

    if (!Array.isArray(completions)) {
        console.log('Completions not returned as array');
        return;
    }

    // Debug: print available completions
    console.log('Available completions:', completions.map(item => item.label));
    console.log('Total completions:', completions.length);

    // Should suggest enum values
    const hasActive = completions.some(item => item.label === 'ACTIVE');
    const hasInactive = completions.some(item => item.label === 'INACTIVE');

    console.log('Has ACTIVE:', hasActive);
    console.log('Has INACTIVE:', hasInactive);
}

debugEnumValueCompletion().catch(console.error);