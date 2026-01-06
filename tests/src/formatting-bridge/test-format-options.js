const vscode = require('../../mock_vscode');
const { createTextDocument, createVscodeMock, installVscodeMock, Position, Range } = vscode;

const configValues = {
    'thrift.format': {
        trailingComma: 'add',
        alignNames: false,
        alignAssignments: true
    },
    'thrift-support.formatting': {}
};

const mock = createVscodeMock({
    workspace: {
        getConfiguration: (section) => ({
            get: (key, def) => {
                const sectionConfig = configValues[section] || {};
                return Object.prototype.hasOwnProperty.call(sectionConfig, key) ? sectionConfig[key] : def;
            }
        })
    }
});
installVscodeMock(mock);

const { resolveFormattingOptions } = require('../../../out/formatting-bridge/options.js');

function run() {
    console.log('\nRunning formatting options tests...');

    const doc = createTextDocument('struct User { 1: i32 id }', mock.Uri.file('file:///test.thrift'));
    const range = new Range(new Position(1, 0), new Position(1, 10));
    const options = { insertSpaces: true, tabSize: 4, indentSize: 2 };

    const resolved = resolveFormattingOptions(doc, range, options, false, {
        computeInitialContext: () => ({ indentLevel: 1, inStruct: true, inEnum: false, inService: false })
    });

    if (resolved.trailingComma !== 'add') {
        throw new Error(`Expected trailingComma add, got ${resolved.trailingComma}`);
    }
    if (resolved.alignFieldNames !== false || resolved.alignEnumNames !== false) {
        throw new Error('Expected alignNames override to be false');
    }
    if (resolved.alignEnumEquals !== true || resolved.alignEnumValues !== true) {
        throw new Error('Expected alignAssignments to apply to enum alignment');
    }
    if (!resolved.initialContext || !resolved.initialContext.inStruct) {
        throw new Error('Expected initialContext to be set');
    }

    console.log('✅ Formatting options tests passed!');
}

try {
    run();
} catch (error) {
    console.error('❌ Formatting options tests failed:', error.message);
    process.exit(1);
}
