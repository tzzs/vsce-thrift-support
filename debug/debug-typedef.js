// Minimal vscode mock to satisfy diagnostics module
const Module = require('module');
const originalRequire = Module.prototype.require;

const vscode = {
    DiagnosticSeverity: {
        Error: 0,
        Warning: 1,
        Information: 2,
        Hint: 3,
    },
    Position: function (line, character) {
        return {line, character};
    },
    Range: function (startLine, startChar, endLine, endChar) {
        return {start: {line: startLine, character: startChar}, end: {line: endLine, character: endChar}};
    },
};

Module.prototype.require = function (id) {
    if (id === 'vscode') return vscode;
    return originalRequire.apply(this, arguments);
};

const {analyzeThriftText} = require('./out/diagnostics');
Module.prototype.require = originalRequire;

const text = `typedef string ValidTypedef
typedef UnknownType InvalidTypedef
typedef list<UnknownInner> InvalidContainer`;

console.log('Testing typedef validation...');
console.log('Input text:');
console.log(text);
console.log('\n---\n');

const issues = analyzeThriftText(text);
console.log('Issues found:', issues.length);
issues.forEach((issue, i) => {
    console.log(`Issue ${i + 1}: ${issue.code} - ${issue.message}`);
});

// Check specifically for typedef.unknownBase
const typedefIssues = issues.filter(issue => issue.code === 'typedef.unknownBase');
console.log('\ntypedef.unknownBase issues:', typedefIssues.length);
typedefIssues.forEach((issue, i) => {
    console.log(`  ${i + 1}: ${issue.message}`);
});