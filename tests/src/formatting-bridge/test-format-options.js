const assert = require('assert');
const vscode = require('vscode');

const {resolveFormattingOptions} = require('../../../out/formatting-bridge/options.js');

describe('format-options', () => {
    let vscode;
    let originalGetConfiguration;

    before(() => {
        vscode = require('vscode');
        originalGetConfiguration = vscode.workspace.getConfiguration;
    });

    afterEach(() => {
        vscode.workspace.getConfiguration = originalGetConfiguration;
    });

    it('should resolve formatting options correctly', () => {
        const configValues = {
            'thrift.format': {
                trailingComma: 'add',
                alignNames: false,
                alignAssignments: true
            },
            'thrift-support.formatting': {}
        };

        vscode.workspace.getConfiguration = (section) => ({
            get: (key, def) => {
                const sectionConfig = configValues[section] || {};
                return Object.prototype.hasOwnProperty.call(sectionConfig, key) ? sectionConfig[key] : def;
            }
        });

        const doc = {
            uri: {fsPath: '/test.thrift'},
            getText: () => 'struct User { 1: i32 id }',
            lineAt: () => ({text: 'struct User { 1: i32 id }'})
        };

        const range = {
            start: {line: 1, character: 0},
            end: {line: 1, character: 10}
        };

        const options = {insertSpaces: true, tabSize: 4, indentSize: 2};

        const resolved = resolveFormattingOptions(doc, range, options, false, {
            computeInitialContext: () => ({indentLevel: 1, inStruct: true, inEnum: false, inService: false})
        });

        assert.strictEqual(resolved.trailingComma, 'add');
        assert.strictEqual(resolved.alignFieldNames, false);
        assert.strictEqual(resolved.alignEnumNames, false);
        assert.strictEqual(resolved.alignEnumEquals, true);
        assert.strictEqual(resolved.alignEnumValues, true);
        assert.ok(resolved.initialContext && resolved.initialContext.inStruct);
    });
});
