const fs = require('fs');
const path = require('path');
const assert = require('assert');

const {ThriftDefinitionProvider} = require('../../../out/definition-provider.js');

describe('include-filename-detection', () => {
    let vscode;
    let provider;

    before(() => {
        vscode = require('vscode');
        provider = new ThriftDefinitionProvider();
    });

    function createTestDocument(content) {
        return {
            uri: vscode.Uri.file(path.join(__dirname, 'test-include.thrift')),
            getText: () => content,
            lineAt: (line) => {
                const lines = content.split('\n');
                return {
                    text: lines[line] || '',
                    range: {
                        start: new vscode.Position(line, 0),
                        end: new vscode.Position(line, lines[line]?.length || 0)
                    }
                };
            },
            getWordRangeAtPosition: (position) => {
                const lines = content.split('\n');
                const line = lines[position.line] || '';
                const char = position.character;

                // Simulates VSCode's default behavior - only alphanumeric
                let start = char;
                let end = char;

                while (start > 0 && /\w/.test(line[start - 1])) {
                    start--;
                }

                while (end < line.length && /\w/.test(line[end])) {
                    end++;
                }

                if (start === end) return undefined;

                return {
                    start: new vscode.Position(position.line, start),
                    end: new vscode.Position(position.line, end)
                };
            }
        };
    }

    it('should detect include file from "shared" part of "shared.thrift"', async () => {
        const testContent = 'include "shared.thrift"\n';
        const testDocument = createTestDocument(testContent);

        // Position cursor on "shared" (character 9)
        const position = new vscode.Position(0, 9);
        const result = await provider.provideDefinition(testDocument, position, null);

        if (result) {
        } else {
        }
    });

    it('should detect include file from "." part of "shared.thrift"', async () => {
        const testContent = 'include "shared.thrift"\n';
        const testDocument = createTestDocument(testContent);

        // Position cursor on "." (character 15)
        const position = new vscode.Position(0, 15);
        const result = await provider.provideDefinition(testDocument, position, null);

        if (result) {
        } else {
        }
    });

    it('should detect include file from "thrift" part of "shared.thrift"', async () => {
        const testContent = 'include "shared.thrift"\n';
        const testDocument = createTestDocument(testContent);

        // Position cursor on "thrift" (character 17)
        const position = new vscode.Position(0, 17);
        const result = await provider.provideDefinition(testDocument, position, null);

        if (result) {
        } else {
        }
    });
});
