// Unit test for formatting functionality based on debug-formatter.js

const assert = require('assert');
require('./simple-test-framework');

function run() {
    console.log('\n📝 Testing formatting functionality...');
    
    return describe('ThriftFormattingFunctionality', function() {
        let formatter;

        before(function() {
            try {
                // Mock VSCode API
                const Module = require('module');
                const vscode = {
                    workspace: {
                        getConfiguration: () => ({
                            get: (key, defaultValue) => {
                                const configs = {
                                    'trailingComma': 'preserve',
                                    'alignTypes': true,
                                    'alignFieldNames': true,
                                    'alignComments': true,
                                    'indentSize': 2,
                                    'maxLineLength': 100
                                };
                                return configs[key] !== undefined ? configs[key] : defaultValue;
                            }
                        })
                    },
                    Range: class Range {
                        constructor(start, end) {
                            this.start = start;
                            this.end = end;
                        }
                    },
                    Position: class Position {
                        constructor(line, character) {
                            this.line = line;
                            this.character = character;
                        }
                    },
                    TextEdit: {
                        replace: (range, newText) => ({
                            range,
                            newText
                        })
                    }
                };

                // Mock require for vscode module
                const originalRequire = Module.prototype.require;
                Module.prototype.require = function (id) {
                    if (id === 'vscode') {
                        return vscode;
                    }
                    return originalRequire.apply(this, arguments);
                };

                const {ThriftFormattingProvider} = require('../out/src/formattingProvider.js');
                formatter = new ThriftFormattingProvider();
                
                // 恢复原始require
                Module.prototype.require = originalRequire;
            } catch (error) {
                throw new Error(`Failed to load formatting provider: ${error.message}`);
            }
        });

        describe('provideDocumentFormattingEdits', function() {
            it('should format struct with proper alignment', function() {
                const testCode = `struct User {
    1: required UserId id,
    2: required string name,
    3: optional Email email,
    4: optional i32 age,
    5: optional Status status = Status.ACTIVE,
    6: optional list<string> tags,
    7: optional map<string, string> metadata,
}`;

                // Mock document with proper VSCode API
                const mockDocument = {
                    getText: function(range) {
                        if (!range) return testCode;
                        // Return the full text if no range specified
                        return testCode;
                    },
                    positionAt: function(offset) {
                        // Simple implementation - return position at end of document
                        const lines = testCode.split('\n');
                        return { line: lines.length - 1, character: lines[lines.length - 1].length };
                    },
                    uri: { path: 'test.thrift' },
                    lineCount: testCode.split('\n').length
                };

                const mockOptions = {
                    insertSpaces: true,
                    tabSize: 2,
                    indentSize: 2
                };

                const edits = formatter.provideDocumentFormattingEdits(mockDocument, mockOptions, null);
                
                assert(Array.isArray(edits), 'Should return an array of edits');
                assert(edits.length > 0, 'Should return at least one edit');
                
                const edit = edits[0];
                assert(edit.newText, 'Edit should have newText');
                assert(edit.range, 'Edit should have range');
                
                // Debug output to see what's happening
                console.log('Original text:', JSON.stringify(testCode));
                console.log('Formatted text:', JSON.stringify(edit.newText));
                
                // 验证格式化后的结果包含预期的结构
                assert(edit.newText.includes('struct User'), 'Should contain struct definition');
                assert(edit.newText.includes('1:'), 'Should contain field IDs');
                assert(edit.newText.includes('required'), 'Should contain field qualifiers');
            });

            it('should format enum with proper alignment', function() {
                const testCode = `enum Status {
    ACTIVE = 1,
    INACTIVE = 2,
    PENDING = 3,
}`;

                const mockDocument = {
                    getText: function(range) {
                        if (!range) return testCode;
                        return testCode;
                    },
                    positionAt: function(offset) {
                        const lines = testCode.split('\n');
                        return { line: lines.length - 1, character: lines[lines.length - 1].length };
                    },
                    uri: { path: 'test.thrift' },
                    lineCount: testCode.split('\n').length
                };

                const mockOptions = {
                    insertSpaces: true,
                    tabSize: 2,
                    indentSize: 2
                };

                const edits = formatter.provideDocumentFormattingEdits(mockDocument, mockOptions, null);
                
                assert(Array.isArray(edits), 'Should return an array of edits');
                assert(edits.length > 0, 'Should return at least one edit');
                
                const edit = edits[0];
                assert(edit.newText.includes('enum Status'), 'Should contain enum definition');
                assert(edit.newText.includes('ACTIVE'), 'Should contain enum values');
            });

            it('should handle empty document', function() {
                const testCode = '';

                const mockDocument = {
                    getText: function(range) {
                        if (!range) return testCode;
                        return testCode;
                    },
                    positionAt: function(offset) {
                        return { line: 0, character: 0 };
                    },
                    uri: { path: 'test.thrift' },
                    lineCount: 1
                };

                const mockOptions = {
                    insertSpaces: true,
                    tabSize: 2,
                    indentSize: 2
                };

                const edits = formatter.provideDocumentFormattingEdits(mockDocument, mockOptions, null);
                
                assert(Array.isArray(edits), 'Should return an array of edits');
                assert(edits.length === 1, 'Should return exactly one edit for empty document');
                
                const edit = edits[0];
                assert(edit.newText === '', 'Should return empty text for empty document');
            });
        });

        describe('provideDocumentRangeFormattingEdits', function() {
            it('should format specific range within document', function() {
                const testCode = `namespace java com.example

struct User {
    1: required UserId id,
    2: required string name,
}

enum Status {
    ACTIVE = 1,
    INACTIVE = 2,
}`;

                const mockDocument = {
                    getText: function(range) {
                        if (!range) return testCode;
                        const lines = testCode.split('\n');
                        const startLine = range.start.line;
                        const endLine = range.end.line;
                        return lines.slice(startLine, endLine + 1).join('\n');
                    },
                    positionAt: function(offset) {
                        const lines = testCode.split('\n');
                        return { line: lines.length - 1, character: lines[lines.length - 1].length };
                    },
                    uri: { path: 'test.thrift' },
                    lineCount: testCode.split('\n').length
                };

                // Create range for struct section
                const mockRange = {
                    start: { line: 2, character: 0 },
                    end: { line: 5, character: 0 }
                };

                const mockOptions = {
                    insertSpaces: true,
                    tabSize: 2,
                    indentSize: 2
                };

                const edits = formatter.provideDocumentRangeFormattingEdits(
                    mockDocument, mockRange, mockOptions, null
                );
                
                assert(Array.isArray(edits), 'Should return an array of edits');
                assert(edits.length > 0, 'Should return at least one edit');
                
                const edit = edits[0];
                assert(edit.newText, 'Edit should have newText');
                assert(edit.range, 'Edit should have range');
            });
        });
    });
}

// 运行测试
if (require.main === module) {
    run();
}

module.exports = { run };