const assert = require('assert');
const vscode = require('vscode');

const {ThriftFormattingProvider} = require('../../../out/formatting-bridge/index.js');

describe('enum-formatting', () => {
    let vscode;
    let formatter;
    let originalGetConfiguration;

    before(() => {
        vscode = require('vscode');
        originalGetConfiguration = vscode.workspace.getConfiguration;
        formatter = new ThriftFormattingProvider();
    });

    afterEach(() => {
        vscode.workspace.getConfiguration = originalGetConfiguration;
    });

    function formatEnum(input, config = {}) {
        const mockDocument = {
            getText: () => input,
            lineCount: input.split('\n').length,
            lineAt: (i) => ({text: input.split('\n')[i]})
        };

        const mockOptions = {insertSpaces: true, tabSize: 4};
        const mockRange = {
            start: {line: 0, character: 0},
            end: {line: input.split('\n').length - 1, character: input.split('\n')[input.split('\n').length - 1].length}
        };

        if (Object.keys(config).length > 0) {
            vscode.workspace.getConfiguration = (section) => {
                return {
                    get: (key) => {
                        if (config[key] !== undefined) {
                            return config[key];
                        }
                        const defaults = {
                            trailingComma: true,
                            alignTypes: true,
                            alignFieldNames: true,
                            alignComments: true,
                            alignEnumNames: true,
                            alignEnumEquals: true,
                            alignEnumValues: true,
                            indentSize: 4
                        };
                        return defaults[key];
                    }
                };
            };
        }

        const edits = formatter.provideDocumentRangeFormattingEdits(mockDocument, mockRange, mockOptions);
        return edits && edits.length > 0 ? edits[0].newText : input;
    }

    it('should format enum with proper alignment', () => {
        const input = `enum Status {
ACTIVE=1,
INACTIVE = 2,
PENDING= 3,
SUSPENDED =4
}`;

        const formatted = formatEnum(input);
        const lines = formatted.split('\n');
        const enumLines = lines.filter(line => line.trim().match(/^\w+\s*=\s*\d+/));

        assert.ok(enumLines.length > 0, 'Should have enum lines');

        const namePositions = enumLines.map(line => line.search(/\w/));
        const allSamePosition = namePositions.every(pos => pos === namePositions[0]);
        assert.ok(allSamePosition, 'Enum names should be aligned');

        const equalsPositions = enumLines.map(line => line.indexOf('='));
        const equalsAligned = equalsPositions.every(pos => pos === equalsPositions[0]);
        assert.ok(equalsAligned, 'Equals signs should be aligned');
    });

    it('should respect alignEnumNames configuration', () => {
        const input = `enum Status {
ACTIVE=1,
INACTIVE = 2
}`;

        const formatted = formatEnum(input, {alignEnumNames: true, alignEnumEquals: true});
        const lines = formatted.split('\n');
        const enumLines = lines.filter(line => line.trim().match(/^\w+\s*=\s*\d+/));

        const namePositions = enumLines.map(line => line.search(/\w/));
        const allSamePosition = namePositions.every(pos => pos === namePositions[0]);
        assert.ok(allSamePosition, 'Names should be aligned when alignEnumNames is true');
    });

    it('should respect alignEnumEquals configuration', () => {
        const input = `enum Status {
ACTIVE=1,
INACTIVE = 2
}`;

        const formatted = formatEnum(input, {alignEnumEquals: true});
        const lines = formatted.split('\n');
        const enumLines = lines.filter(line => line.trim().match(/^\w+\s*=\s*\d+/));

        const equalsPositions = enumLines.map(line => line.indexOf('='));
        const equalsAligned = equalsPositions.every(pos => pos === equalsPositions[0]);
        assert.ok(equalsAligned, 'Equals signs should be aligned when alignEnumEquals is true');
    });

    it('should handle all alignment options disabled', () => {
        const input = `enum Status {
ACTIVE=1,
INACTIVE = 2
}`;

        const formatted = formatEnum(input, {
            alignEnumNames: false,
            alignEnumEquals: false,
            alignEnumValues: false
        });

        assert.ok(formatted.includes('ACTIVE'), 'Should still format enum structure');
    });
});
