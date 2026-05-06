const {createVscodeMock, getWordRangeAtPositionFromText} = require('../../mock_vscode.js');

module.exports = createVscodeMock({
    workspace: {
        textDocuments: []
    },
    getWordRangeAtPositionFromText
});
