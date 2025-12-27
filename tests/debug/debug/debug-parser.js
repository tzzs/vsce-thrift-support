const { ThriftParser } = require('../out/src/thriftParser');

const parser = new ThriftParser();

// Test cases from our debug formatter
const testCases = [
    "struct User{1:i32 id;2:string name;}",
    "struct User {\n  1: i32 id\n  2: string name\n}",
    "struct User {\n    1: required i32 id,\n    2: optional string name\n}",
    "struct User {\n    1: i32 id = 0,\n    2: string name = \"\"\n}",
    "struct User {\n    1: i32 id, // user ID\n    2: string name // user name\n}"
];

console.log('=== Testing Parser Struct Field Recognition ===\n');

testCases.forEach((testCase, index) => {
    console.log(`Test Case ${index + 1}: "${testCase}"`);
    
    const lines = testCase.split(/\r?\n/);
    console.log(`Split into ${lines.length} lines:`);
    
    lines.forEach((line, lineIndex) => {
        console.log(`  Line ${lineIndex}: "${line}"`);
        console.log(`    isStructField: ${parser.isStructField(line)}`);
        
        if (parser.isStructField(line)) {
            const parsed = parser.parseStructField(line);
            console.log(`    Parsed:`, JSON.stringify(parsed, null, 2));
        }
    });
    
    console.log('');
});

console.log('=== Testing Individual Struct Field Patterns ===\n');

const fieldExamples = [
    "1: i32 id",
    "1: i32 id;",
    "1: i32 id,",
    "1: required i32 id",
    "1: optional string name",
    "1: i32 id = 0",
    "1: i32 id = 0,",
    "1: i32 id // comment",
    "1: i32 id, // comment"
];

fieldExamples.forEach((field, index) => {
    console.log(`Field ${index + 1}: "${field}"`);
    console.log(`  isStructField: ${parser.isStructField(field)}`);
    
    if (parser.isStructField(field)) {
        const parsed = parser.parseStructField(field);
        console.log(`  Parsed:`, JSON.stringify(parsed, null, 2));
    }
    console.log('');
});