const {createVscodeMock, getWordRangeAtPositionFromText} = require('../test-helpers/vscode-mock');

module.exports = createVscodeMock({
    workspace: {
        textDocuments: []
    },
    getWordRangeAtPositionFromText
});
