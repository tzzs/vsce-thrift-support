const fs = require('fs');
const path = require('path');
const vscode = require('vscode');

const {ThriftSelectionRangeProvider} = require('../../../out/selection-range-provider.js');

function createMockDocument(text, fileName = 'test.thrift') {
    const lines = text.split('\n');
    return {
        uri: {fsPath: path.join(__dirname, '..', '..', 'test-files', fileName)},
        getText: () => text,
        lineAt: (line) => ({text: lines[line] || ''}),
        getWordRangeAtPosition: (position) => {
            const lineText = lines[position.line] || '';
            const wordRegex = /[A-Za-z_][A-Za-z0-9_]*/g;
            let match;
            while ((match = wordRegex.exec(lineText)) !== null) {
                if (position.character >= match.index && position.character <= match.index + match[0].length) {
                    return new vscode.Range(position.line, match.index, position.line, match.index + match[0].length);
                }
            }
            return null;
        }
    };
}

function createMockPosition(line, character) {
    return new vscode.Position(line, character);
}

function createMockCancellationToken() {
    return {isCancellationRequested: false};
}

function getRangeText(text, range) {
    const lines = text.split('\n');
    if (range.start.line === range.end.line) {
        return lines[range.start.line].substring(range.start.character, range.end.character);
    }
    // Multi-line range
    let result = lines[range.start.line].substring(range.start.character);
    for (let i = range.start.line + 1; i < range.end.line; i++) {
        result += '\n' + lines[i];
    }
    result += '\n' + lines[range.end.line].substring(0, range.end.character);
    return result;
}

function countSelectionRanges(selectionRange) {
    let count = 1;
    let current = selectionRange;
    while (current.parent) {
        count++;
        current = current.parent;
    }
    return count;
}

async function testWordSelection() {

    const provider = new ThriftSelectionRangeProvider();
    const text = `struct User {
  1: required i32 id
}`;
    const document = createMockDocument(text);
    const position = createMockPosition(0, 7); // On "User"

    const selectionRanges = await provider.provideSelectionRanges(
        document,
        [position],
        createMockCancellationToken()
    );

    if (!Array.isArray(selectionRanges)) {
        throw new Error('Selection ranges not returned as array');
    }

    if (selectionRanges.length !== 1) {
        throw new Error(`Expected 1 selection range, got ${selectionRanges.length}`);
    }

    const firstRange = selectionRanges[0];
    if (!firstRange.range) {
        throw new Error('Selection range missing range property');
    }

    // First range should be the word "User"
    const selectedText = getRangeText(text, firstRange.range);
    if (selectedText !== 'User') {
        throw new Error(`Expected 'User', got '${selectedText}'`);
    }

}

async function testTypeReferenceSelection() {

    const provider = new ThriftSelectionRangeProvider();
    const text = `struct User {
  1: required i32 id,
  2: optional string name
}`;
    const document = createMockDocument(text);
    const position = createMockPosition(1, 13); // On "i32"

    const selectionRanges = await provider.provideSelectionRanges(
        document,
        [position],
        createMockCancellationToken()
    );

    if (!Array.isArray(selectionRanges)) {
        throw new Error('Selection ranges not returned as array');
    }

    const firstRange = selectionRanges[0];
    const selectedText = getRangeText(text, firstRange.range);

    // Should select the type "i32"
    if (selectedText !== 'i32') {
        throw new Error(`Expected 'i32', got '${selectedText}'`);
    }

}

async function testFieldDefinitionSelection() {

    const provider = new ThriftSelectionRangeProvider();
    const text = `struct User {
  1: required i32 id,
  2: optional string name,
  3: required bool active
}`;
    const document = createMockDocument(text);
    const position = createMockPosition(1, 18); // On "id"

    const selectionRanges = await provider.provideSelectionRanges(
        document,
        [position],
        createMockCancellationToken()
    );

    if (!Array.isArray(selectionRanges)) {
        throw new Error('Selection ranges not returned as array');
    }

    const firstRange = selectionRanges[0];
    const selectedText = getRangeText(text, firstRange.range);

    // Should select the field name "id"
    if (selectedText !== 'id') {
        throw new Error(`Expected 'id', got '${selectedText}'`);
    }

    // Should have parent ranges for the full field definition
    let currentRange = firstRange;
    let hasFieldDefinition = false;

    while (currentRange.parent) {
        currentRange = currentRange.parent;
        const parentText = getRangeText(text, currentRange.range);
        if (parentText.includes('1: required i32 id')) {
            hasFieldDefinition = true;
            break;
        }
    }

    if (!hasFieldDefinition) {
        throw new Error('Expected parent range for full field definition');
    }

}

async function testMethodSignatureSelection() {

    const provider = new ThriftSelectionRangeProvider();
    const text = `service UserService {
  User getUser(1: i32 userId, 2: string name),
  void createUser(1: User user)
}`;
    const document = createMockDocument(text);
    const position = createMockPosition(1, 6); // On "getUser"

    const selectionRanges = await provider.provideSelectionRanges(
        document,
        [position],
        createMockCancellationToken()
    );

    if (!Array.isArray(selectionRanges)) {
        throw new Error('Selection ranges not returned as array');
    }

    const firstRange = selectionRanges[0];
    const selectedText = getRangeText(text, firstRange.range);

    // Should select the method name "getUser"
    if (selectedText !== 'getUser') {
        throw new Error(`Expected 'getUser', got '${selectedText}'`);
    }

    // Should have parent ranges for the method signature
    let currentRange = firstRange;
    let hasMethodSignature = false;

    while (currentRange.parent) {
        currentRange = currentRange.parent;
        const parentText = getRangeText(text, currentRange.range);
        if (parentText.includes('User getUser(') && parentText.includes('userId')) {
            hasMethodSignature = true;
            break;
        }
    }

    if (!hasMethodSignature) {
        throw new Error('Expected parent range for method signature');
    }

}

async function testNamespaceSelection() {

    const provider = new ThriftSelectionRangeProvider();
    const text = `namespace java com.example.thrift
namespace cpp example.thrift`;
    const document = createMockDocument(text);
    const position = createMockPosition(0, 10); // On "java"

    const selectionRanges = await provider.provideSelectionRanges(
        document,
        [position],
        createMockCancellationToken()
    );

    if (!Array.isArray(selectionRanges)) {
        throw new Error('Selection ranges not returned as array');
    }

    const firstRange = selectionRanges[0];
    const selectedText = getRangeText(text, firstRange.range);

    // Should select "java"
    if (selectedText !== 'java') {
        throw new Error(`Expected 'java', got '${selectedText}'`);
    }

    // Should have parent range for full namespace line
    let currentRange = firstRange;
    let hasNamespaceLine = false;

    while (currentRange.parent) {
        currentRange = currentRange.parent;
        const parentText = getRangeText(text, currentRange.range);
        if (parentText.includes('namespace java com.example.thrift')) {
            hasNamespaceLine = true;
            break;
        }
    }

    if (!hasNamespaceLine) {
        throw new Error('Expected parent range for full namespace line');
    }

}

async function testIncludeSelection() {

    const provider = new ThriftSelectionRangeProvider();
    const text = `include "shared.thrift"
include "common/types.thrift"`;
    const document = createMockDocument(text);
    const position = createMockPosition(0, 10); // On "shared.thrift"

    const selectionRanges = await provider.provideSelectionRanges(
        document,
        [position],
        createMockCancellationToken()
    );

    if (!Array.isArray(selectionRanges)) {
        throw new Error('Selection ranges not returned as array');
    }

    const firstRange = selectionRanges[0];
    const selectedText = getRangeText(text, firstRange.range);

    // Should select "shared.thrift"
    if (selectedText !== 'shared.thrift') {
        throw new Error(`Expected 'shared.thrift', got '${selectedText}'`);
    }

    // Should have parent range for full include line
    let currentRange = firstRange;
    let hasIncludeLine = false;

    while (currentRange.parent) {
        currentRange = currentRange.parent;
        const parentText = getRangeText(text, currentRange.range);
        if (parentText.includes('include "shared.thrift"')) {
            hasIncludeLine = true;
            break;
        }
    }

    if (!hasIncludeLine) {
        throw new Error('Expected parent range for full include line');
    }

}

async function testHierarchicalExpansion() {

    const provider = new ThriftSelectionRangeProvider();
    const text = `struct User {
  1: required i32 id,
  2: optional string name
}`;
    const document = createMockDocument(text);
    const position = createMockPosition(1, 18); // On "id"

    const selectionRanges = await provider.provideSelectionRanges(
        document,
        [position],
        createMockCancellationToken()
    );

    if (!Array.isArray(selectionRanges)) {
        throw new Error('Selection ranges not returned as array');
    }

    const firstRange = selectionRanges[0];
    const rangeCount = countSelectionRanges(firstRange);


    // Should have multiple levels: word -> field -> struct
    if (rangeCount < 3) {
        throw new Error(`Expected at least 3 hierarchical ranges, got ${rangeCount}`);
    }

}

async function testMultiplePositions() {

    const provider = new ThriftSelectionRangeProvider();
    const text = `struct User {
  1: required i32 id,
  2: optional string name
}

enum Status {
  ACTIVE = 1,
  INACTIVE = 2
}`;
    const document = createMockDocument(text);

    const positions = [
        createMockPosition(1, 18), // On "id"
        createMockPosition(2, 20), // On "name"
        createMockPosition(6, 2)   // On "ACTIVE"
    ];

    const selectionRanges = await provider.provideSelectionRanges(
        document,
        positions,
        createMockCancellationToken()
    );

    if (!Array.isArray(selectionRanges)) {
        throw new Error('Selection ranges not returned as array');
    }

    if (selectionRanges.length !== 3) {
        throw new Error(`Expected 3 selection ranges, got ${selectionRanges.length}`);
    }

    // Check each range
    const idRange = selectionRanges[0];
    const nameRange = selectionRanges[1];
    const activeRange = selectionRanges[2];

    const idText = getRangeText(text, idRange.range);
    const nameText = getRangeText(text, nameRange.range);
    const activeText = getRangeText(text, activeRange.range);

    if (idText !== 'id') {
        throw new Error(`Expected 'id', got '${idText}'`);
    }

    if (nameText !== 'name') {
        throw new Error(`Expected 'name', got '${nameText}'`);
    }

    if (activeText !== 'ACTIVE') {
        throw new Error(`Expected 'ACTIVE', got '${activeText}'`);
    }

}

async function testLineSelection() {

    const provider = new ThriftSelectionRangeProvider();
    const text = `struct User {
  1: required i32 id,
  2: optional string name
}`;
    const document = createMockDocument(text);
    const position = createMockPosition(1, 10); // Middle of field line

    const selectionRanges = await provider.provideSelectionRanges(
        document,
        [position],
        createMockCancellationToken()
    );

    if (!Array.isArray(selectionRanges)) {
        throw new Error('Selection ranges not returned as array');
    }

    const firstRange = selectionRanges[0];

    // Should have parent ranges including the full line
    let currentRange = firstRange;
    let hasLineRange = false;

    while (currentRange.parent) {
        currentRange = currentRange.parent;
        const parentText = getRangeText(text, currentRange.range);
        if (parentText.includes('1: required i32 id')) {
            hasLineRange = true;
            break;
        }
    }

    if (!hasLineRange) {
        throw new Error('Expected parent range for full line');
    }

}

async function testBlockSelection() {

    const provider = new ThriftSelectionRangeProvider();
    const text = `service UserService {
  User getUser(1: i32 userId),
  void createUser(1: User user)
}`;
    const document = createMockDocument(text);
    position = createMockPosition(1, 6); // On "getUser"

    const selectionRanges = await provider.provideSelectionRanges(
        document,
        [position],
        createMockCancellationToken()
    );

    if (!Array.isArray(selectionRanges)) {
        throw new Error('Selection ranges not returned as array');
    }

    const firstRange = selectionRanges[0];

    // Should have parent ranges including the service block
    let currentRange = firstRange;
    let hasBlockRange = false;

    while (currentRange.parent) {
        currentRange = currentRange.parent;
        const parentText = getRangeText(text, currentRange.range);
        if (parentText.includes('service UserService')) {
            hasBlockRange = true;
            break;
        }
    }

    if (!hasBlockRange) {
        throw new Error('Expected parent range for service block');
    }

}

async function testComplexTypeSelection() {

    const provider = new ThriftSelectionRangeProvider();
    const text = `struct User {
  1: required list<string> tags,
  2: optional map<string, i32> scores
}`;
    const document = createMockDocument(text);
    const position = createMockPosition(1, 20); // On "list<string>"

    const selectionRanges = await provider.provideSelectionRanges(
        document,
        [position],
        createMockCancellationToken()
    );

    if (!Array.isArray(selectionRanges)) {
        throw new Error('Selection ranges not returned as array');
    }

    const firstRange = selectionRanges[0];
    const selectedText = getRangeText(text, firstRange.range);

    // Should select the complex type "list<string>"
    if (selectedText !== 'list<string>') {
        throw new Error(`Expected 'list<string>', got '${selectedText}'`);
    }

}

async function testEmptyDocument() {

    const provider = new ThriftSelectionRangeProvider();
    const text = ``;
    const document = createMockDocument(text);
    const position = createMockPosition(0, 0);

    const selectionRanges = await provider.provideSelectionRanges(
        document,
        [position],
        createMockCancellationToken()
    );

    if (!Array.isArray(selectionRanges)) {
        throw new Error('Selection ranges not returned as array for empty document');
    }

    if (selectionRanges.length !== 0) {
        throw new Error(`Expected 0 selection ranges for empty document, got ${selectionRanges.length}`);
    }

}

async function testInvalidPosition() {

    const provider = new ThriftSelectionRangeProvider();
    const text = `struct User {
  1: required i32 id
}`;
    const document = createMockDocument(text);
    const position = createMockPosition(10, 0); // Beyond document bounds

    const selectionRanges = await provider.provideSelectionRanges(
        document,
        [position],
        createMockCancellationToken()
    );

    if (!Array.isArray(selectionRanges)) {
        throw new Error('Selection ranges not returned as array for invalid position');
    }

    // Should handle gracefully

}

async function testCancellationToken() {

    const provider = new ThriftSelectionRangeProvider();
    const text = `struct User {
  1: required i32 id,
  2: optional string name
}`;
    const document = createMockDocument(text);
    const position = createMockPosition(1, 18); // On "id"

    // Test with cancelled token
    const cancelledToken = {isCancellationRequested: true};

    const selectionRanges = await provider.provideSelectionRanges(
        document,
        [position],
        cancelledToken
    );

    if (!Array.isArray(selectionRanges)) {
        throw new Error('Selection ranges not returned as array with cancelled token');
    }

    // Should handle cancellation gracefully

}

describe('selection-range-provider', () => {
    it('should pass testWordSelection', async () => {
        await testWordSelection();
    });
    it('should pass testTypeReferenceSelection', async () => {
        await testTypeReferenceSelection();
    });
    it('should pass testFieldDefinitionSelection', async () => {
        await testFieldDefinitionSelection();
    });
    it('should pass testMethodSignatureSelection', async () => {
        await testMethodSignatureSelection();
    });
    it('should pass testNamespaceSelection', async () => {
        await testNamespaceSelection();
    });
    it('should pass testIncludeSelection', async () => {
        await testIncludeSelection();
    });
    it('should pass testHierarchicalExpansion', async () => {
        await testHierarchicalExpansion();
    });
    it('should pass testMultiplePositions', async () => {
        await testMultiplePositions();
    });
    it('should pass testLineSelection', async () => {
        await testLineSelection();
    });
    it('should pass testBlockSelection', async () => {
        await testBlockSelection();
    });
    it('should pass testComplexTypeSelection', async () => {
        await testComplexTypeSelection();
    });
    it('should pass testEmptyDocument', async () => {
        await testEmptyDocument();
    });
    it('should pass testInvalidPosition', async () => {
        await testInvalidPosition();
    });
    it('should pass testCancellationToken', async () => {
        await testCancellationToken();
    });
});
