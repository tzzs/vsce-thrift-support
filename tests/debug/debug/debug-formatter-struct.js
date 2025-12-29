const { ThriftFormatter } = require('../out/thrift-formatter');
const formatter = new ThriftFormatter();

const testCases = [
    "struct User{1:i32 id;2:string name;}",
    "struct User {\n  1: i32 id\n  2: string name\n}",
    "struct User {\n    1: required i32 id,\n    2: optional string name\n}"
];

console.log('=== Testing Formatter Struct Detection ===\n');

testCases.forEach((testCase, index) => {
    console.log(`Test Case ${index + 1}: "${testCase}"`);
    
    const lines = testCase.split(/\r?\n/);
    console.log(`Split into ${lines.length} lines:`);
    
    lines.forEach((line, lineIndex) => {
        console.log(`  Line ${lineIndex}: "${line}"`);
        const isStructStart = /^(struct|union|exception)\b/.test(line.trim());
        console.log(`    isStructStart: ${isStructStart}`);
        if (isStructStart) {
            console.log(`    Contains {: ${line.includes('{')}`);
            console.log(`    Contains }: ${line.includes('}')}`);
            console.log(`    Both on same line: ${line.includes('{') && line.includes('}')}`);
        }
    });
    
    console.log('');
});

console.log('=== Testing Formatter Format Method ===\n');

testCases.forEach((testCase, index) => {
    console.log(`Test Case ${index + 1}: "${testCase}"`);
    
    const result = formatter.format(testCase, {
        trailingComma: 'preserve',
        alignTypes: true,
        alignFieldNames: true,
        alignStructDefaults: false,
        alignAnnotations: true,
        alignComments: true,
        alignEnumNames: true,
        alignEnumEquals: true,
        alignEnumValues: true,
        indentSize: 4,
        maxLineLength: 100,
        collectionStyle: 'preserve',
        insertSpaces: true,
        tabSize: 4
    });
    
    console.log(`Result: "${result}"`);
    console.log(`Changed: ${result !== testCase}`);
    console.log('');
});
