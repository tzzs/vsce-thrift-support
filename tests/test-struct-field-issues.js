// Test struct field formatting issues
const vscode = {
    TextEdit: {
        replace: (range, newText) => ({ range, newText })
    },
    Range: function (startLine, startChar, endLine, endChar) {
        return { start: { line: startLine, character: startChar }, end: { line: endLine, character: endChar } };
    },
    workspace: {
        getConfiguration: (_section) => ({
            get: (key) => {
                const defaults = {
                    trailingComma: 'preserve',
                    alignTypes: true,
                    alignFieldNames: true,
                    alignComments: true,
                    alignAnnotations: true,
                    alignStructDefaults: true,
                    indentSize: 4,
                    maxLineLength: 100
                };
                return key in defaults ? defaults[key] : undefined;
            }
        })
    }
};

const Module = require('module');
const originalRequire = Module.prototype.require;
Module.prototype.require = function (id) {
    if (id === 'vscode') {
        return vscode;
    }
    return originalRequire.apply(this, arguments);
};

const { ThriftFormattingProvider } = require('../out/formattingProvider.js');
Module.prototype.require = originalRequire;

console.log('\n=== Test: Struct field formatting issues ===\n');

const input = `struct User {
  1: required UserId id , // 用户唯一标识
  2:  required string    name              (go.tag    ='json:"name"'),  // 用户姓名
  3:  optional Email email                 (go.tag    ="xx:\\"len($)>0\\""), // 邮箱地址
  4:  optional i32                 age               ,                  // 年龄
  5:  optional Status                      status     = Status.ACTIVE,  // 用户状态，默认为活跃
  6:  optional list<string>tags                      ,                  // 用户标签列表
  7:  optional map<string, string>metadata           ,                  // 用户元数据
  8:  optional bool                        isVerified = false,          // 是否已验证，默认未验证
  9:  optional double                      score      = 0.0,            // 用户评分，默认0.0
  10: optional binary              avatar            ,                  // 用户头像二进制数据
}`;

const formatter = new ThriftFormattingProvider();
const mockDocument = {
    getText: () => input,
    lineAt: (i) => ({ text: input.split('\n')[i] })
};
const mockRange = new vscode.Range(0, 0, input.split('\n').length - 1, input.split('\n')[input.split('\n').length - 1].length);
const mockOptions = { insertSpaces: true, tabSize: 4 };

const edits = formatter.provideDocumentRangeFormattingEdits(mockDocument, mockRange, mockOptions);
const output = edits && edits.length > 0 ? edits[0].newText : input;

console.log('--- Formatted Output ---');
console.log(output);
console.log

    ('\n--- Checking Issues ---');

const lines = output.split('\n');
const fieldLines = lines.slice(1, -1); // Exclude 'struct User {' and '}'

// Issue 1: Check for spaces between type and field name
console.log('\n1. Type-name spacing:');
fieldLines.forEach((line, idx) => {
    if (line.includes('list<string>tags') || line.includes('map<string, string>metadata')) {
        console.log(`   Line ${idx + 2}: ${line}`);
        console.log(`   ✗ Missing space between type and field name`);
    }
});

// Issue 2: Check field name alignment
console.log('\n2. Field name alignment:');
const namePositions = fieldLines.map(line => {
    const match = line.match(/\s+(\w+)\s*[,=(]/);
    if (match) {
        return line.indexOf(match[1]);
    }
    return -1;
}).filter(pos => pos >= 0);
const aligned = namePositions.every(pos => pos === namePositions[0]);
console.log(`   Name positions: [${namePositions.join(', ')}]`);
console.log(`   ${aligned ? '✓' : '✗'} Field names ${aligned ? 'are' : 'are NOT'} aligned`);

// Issue 3: Check annotation alignment
console.log('\n3. Annotation alignment:');
const annoPositions = fieldLines.map(line => line.indexOf('(go.tag')).filter(pos => pos >= 0);
const annoAligned = annoPositions.length === 0 || annoPositions.every(pos => pos === annoPositions[0]);
console.log(`   Annotation positions: [${annoPositions.join(', ')}]`);
console.log(`   ${annoAligned ? '✓' : '✗'} Annotations ${annoAligned ? 'are' : 'are NOT'} aligned`);

// Issue 4: Check comma spacing
console.log('\n4. Comma spacing:');
let commaIssues = 0;
fieldLines.forEach((line, idx) => {
    if (/\s+,/.test(line)) {
        console.log(`   Line ${idx + 2}: ✗ Space before comma: "${line.trim()}"`);
        commaIssues++;
    }
});
if (commaIssues === 0) {
    console.log('   ✓ No spaces before commas');
}

// Issue 5: Check comment alignment
console.log('\n5. Comment alignment:');
const commentPositions = fieldLines.map(line => line.indexOf('//')).filter(pos => pos >= 0);
const commentAligned = commentPositions.every(pos => pos === commentPositions[0]);
console.log(`   Comment positions: [${commentPositions.join(', ')}]`);
console.log(`   ${commentAligned ? '✓' : '✗'} Comments ${commentAligned ? 'are' : 'are NOT'} aligned`);

// Overall result
const allPassed = namePositions.every(pos => pos === namePositions[0]) &&
    annoAligned &&
    commaIssues === 0 &&
    commentAligned &&
    !output.includes('list<string>tags') &&
    !output.includes('map<string, string>metadata');

console.log(`\n${allPassed ? '✓' : '✗'} All issues ${allPassed ? 'resolved' : 'still present'}`);

if (!allPassed) {
    process.exitCode = 1;
}
