const fs = require('fs');

try {
    const Module = require('module');
    const originalRequire = Module.prototype.require;

    // Intercept require('vscode') to return our mock
    Module.prototype.require = function (id) {
        if (id === 'vscode') {
            return require('../../mock_vscode.js');
        }
        return originalRequire.apply(this, arguments);
    };

    const {analyzeThriftText} = require('../out/diagnostics');

    console.log('Running specific repro test...');

    const text = `
struct Test {
    3: optional i32    f3 = 0, #())
}
`;

    const issues = analyzeThriftText(text);
    const hasMismatched = issues.some(i => i.message && i.message.includes("Mismatched"));

    let result = '';
    if (hasMismatched) {
        result = 'FAIL: Found Mismatched error. Fix NOT working.\nIssues: ' + JSON.stringify(issues, null, 2);
    } else {
        result = 'PASS: No Mismatched error found. Fix verified.\nIssues: ' + JSON.stringify(issues, null, 2);
    }

    fs.writeFileSync('repro_result.txt', result);

} catch (err) {
    fs.writeFileSync('repro_error.txt', err.stack);
}
